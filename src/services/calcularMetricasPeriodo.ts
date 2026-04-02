/**
 * SERVIÇO CANÔNICO DE MÉTRICAS FINANCEIRAS POR PERÍODO
 * 
 * FONTE ÚNICA DE VERDADE para cálculos de lucro/volume/ROI de ciclos e períodos.
 * 
 * ARQUITETURA: Este serviço DELEGA para os módulos canônicos existentes,
 * aplicando apenas filtros de data. NÃO reimplementa lógica já existente.
 * 
 * - Lucro Operacional → fetchProjetosLucroOperacionalKpi (com dataInicio/dataFim)
 * - Contagem + Volume  → mesma lógica do dashboard (apostas + pernas de arbitragem)
 * - Lucro Realizado    → cash_ledger (saques - depósitos) com filtro de período
 * - Perdas             → projeto_perdas com filtro de período
 */

import { supabase } from "@/integrations/supabase/client";
import { getOperationalDateRangeForQuery, getCivilDateRangeForQuery } from "@/utils/dateUtils";
import { derivarCotacoesFromConvertFn } from "@/services/fetchProjetosLucroOperacionalKpi";
import { parseISO } from "date-fns";

/** Função de conversão de moeda (valor, moedaOrigem) => valorConvertido */
export type ConvertToConsolidationFn = (valor: number, moedaOrigem: string) => number;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface MetricasPeriodo {
  /** Número total de operações no período (pernas para arbitragem) */
  qtdApostas: number;
  /** Volume total apostado (consolidado) */
  volume: number;
  /** Lucro bruto de apostas liquidadas (consolidado) */
  lucroApostas: number;
  /** Lucro de cashback recebido */
  lucroCashback: number;
  /** Lucro de giros grátis confirmados */
  lucroGiros: number;
  /** Lucro bruto total = apostas + cashback + giros */
  lucroBruto: number;
  /** Perdas confirmadas no período */
  perdasConfirmadas: number;
  /** Detalhes individuais das perdas */
  perdasDetalhes: PerdaDetalhe[];
  /** Lucro líquido operacional (delegado ao KPI canônico, com todos os extras) */
  lucroLiquido: number;
  /** Lucro realizado = Saques - Depósitos */
  lucroRealizado: number;
  /** Total de créditos extras no período */
  creditosExtras: number;
  /** Ticket médio (volume / qtdApostas) */
  ticketMedio: number;
  /** ROI = (lucroLiquido / volume) * 100 */
  roi: number;
  /** Lucro por aposta = lucroLiquido / qtdApostas */
  lucroPorAposta: number;
}

export interface PerdaDetalhe {
  id?: string;
  valor: number;
  categoria: string;
  status?: string;
  bookmaker_id?: string | null;
  bookmaker_nome?: string;
  descricao?: string | null;
  data_registro?: string | null;
}

export interface MetricasPeriodoInput {
  projetoId: string;
  /** Data de início no formato YYYY-MM-DD (data civil local) */
  dataInicio: string;
  /** Data de fim no formato YYYY-MM-DD (data civil local) */
  dataFim: string;
  /** Se true, inclui detalhes das perdas (mais lento) */
  incluirDetalhePerdas?: boolean;
  /** Função de conversão de moeda para projetos multimoedas. */
  convertToConsolidation?: ConvertToConsolidationFn;
  /** Moeda de consolidação do projeto (default: 'BRL') */
  moedaConsolidacao?: string;
}

// ─── Função Principal ───────────────────────────────────────────────────────

export async function calcularMetricasPeriodo({
  projetoId,
  dataInicio,
  dataFim,
  incluirDetalhePerdas = false,
  convertToConsolidation,
  moedaConsolidacao = 'BRL',
}: MetricasPeriodoInput): Promise<MetricasPeriodo> {
  const convert = convertToConsolidation || ((valor: number, _moeda: string) => valor);
  
  // Derivar cotações de TODAS as moedas suportadas a partir da função de conversão
  const cotacaoUSD = convert(1, 'USD');
  const cotacoes = derivarCotacoesFromConvertFn(convert);

  // Converter datas para UTC no timezone operacional (para apostas — timestamps reais)
  const dataInicioParsed = parseISO(dataInicio);
  const dataFimParsed = parseISO(dataFim);
  const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicioParsed, dataFimParsed);

  // Para cash_ledger: data_transacao é "data civil" (meia-noite UTC)
  // DEVE usar getCivilDateRangeForQuery para não excluir registros pelo offset de 3h
  const { startUTC: cashLedgerStart, endUTC: cashLedgerEnd } = getCivilDateRangeForQuery(dataInicio, dataFim);

  // ═══════════════════════════════════════════════════════════════════
  // BUSCAR TUDO EM PARALELO — delegando aos módulos canônicos
  // ═══════════════════════════════════════════════════════════════════
  const [
    // 1. Lucro Operacional (DELEGADO ao KPI canônico com filtro de data)
    lucroKpiResult,
    // 2. Apostas resumo via RPC (elimina truncamento de 1000 linhas)
    apostasRpcResult,
    // 3. Perdas (para detalhes na UI)
    perdasResult,
    // 4. Bookmakers (nomes para perdas)
    bookmakersResult,
    // 5. Saques no período
    saquesResult,
    // 6. Depósitos no período
    depositosResult,
  ] = await Promise.all([
    // DELEGAÇÃO: Mesmo serviço usado pelo dashboard financeiro
    fetchProjetosLucroOperacionalKpi({
      projetoIds: [projetoId],
      cotacaoUSD,
      cotacoes,
      moedaConsolidacao,
      dataInicio,
      dataFim,
    }),

    // RPC server-side: contagem + volume + resultados sem truncamento
    supabase.rpc('get_projeto_apostas_resumo', {
      p_projeto_id: projetoId,
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
    }),

    // Perdas (detalhes para UI)
    incluirDetalhePerdas
      ? supabase
          .from("projeto_perdas")
          .select("id, valor, status, categoria, bookmaker_id, descricao, data_registro")
          .eq("projeto_id", projetoId)
          .gte("data_registro", startUTC)
          .lte("data_registro", endUTC)
      : Promise.resolve({ data: null, error: null }),

    incluirDetalhePerdas
      ? supabase.from("bookmakers").select("id, nome").limit(10000)
      : Promise.resolve({ data: null, error: null }),

    // Saques confirmados no período (cash_ledger usa UTC midnight)
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", cashLedgerStart)
      .lte("data_transacao", cashLedgerEnd),

    // Depósitos confirmados no período (cash_ledger usa UTC midnight)
    supabase
      .from("cash_ledger")
      .select("valor, moeda")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", cashLedgerStart)
      .lte("data_transacao", cashLedgerEnd),
  ]);

  if (apostasRpcResult.error) console.error("[calcularMetricasPeriodo] Erro RPC apostas:", apostasRpcResult.error);

  const rpcData = (apostasRpcResult.data as any) || {};
  const bookmakerMap = new Map((bookmakersResult.data || []).map((b: any) => [b.id, b.nome]));

  // ═══════════════════════════════════════════════════════════════════
  // CONTAGEM DE APOSTAS (via RPC — sem truncamento)
  // ═══════════════════════════════════════════════════════════════════
  const qtdApostas = Number(rpcData.total_apostas || 0);

  // ═══════════════════════════════════════════════════════════════════
  // VOLUME (via RPC total_stake — sem truncamento)
  // ═══════════════════════════════════════════════════════════════════
  const volume = Number(rpcData.total_stake || 0);


  // ═══════════════════════════════════════════════════════════════════
  // LUCRO OPERACIONAL (DELEGADO ao KPI — já inclui TODOS os extras)
  // ═══════════════════════════════════════════════════════════════════
  const lucroLiquido = lucroKpiResult[projetoId]?.consolidado || 0;

  // Lucro bruto das apostas (via RPC — sem truncamento)
  const lucroApostas = Number(rpcData.lucro_apostas || 0);

  // Cashback e giros (via RPC — valores já consolidados, separados para exibição)
  const lucroCashback = Number(rpcData.lucro_cashback || 0);
  const lucroGiros = Number(rpcData.lucro_giros || 0);
  // FÓRMULA CANÔNICA: LUCRO_BRUTO = APOSTAS + CASHBACK + GIROS
  const lucroBruto = lucroApostas + lucroCashback + lucroGiros;
  // Créditos extras = tudo que não é apostas/cashback/giros (ajustes, FX, bônus, conciliações)
  const creditosExtras = lucroLiquido - lucroBruto;

  // ═══════════════════════════════════════════════════════════════════
  // PERDAS (detalhes para UI de ciclos)
  // ═══════════════════════════════════════════════════════════════════
  const perdas = perdasResult.data || [];
  const perdasConfirmadas = perdas
    .filter((p: any) => p.status === "CONFIRMADA")
    .reduce((acc, p: any) => acc + (p.valor || 0), 0);

  const perdasDetalhes: PerdaDetalhe[] = incluirDetalhePerdas
    ? perdas.map((p: any) => ({
        id: p.id,
        valor: p.valor,
        categoria: p.categoria,
        status: p.status,
        bookmaker_id: p.bookmaker_id,
        bookmaker_nome: p.bookmaker_id ? (bookmakerMap.get(p.bookmaker_id) as string | undefined) : undefined,
        descricao: p.descricao,
        data_registro: p.data_registro,
      }))
    : [];

  // ═══════════════════════════════════════════════════════════════════
  // LUCRO REALIZADO (Saques - Depósitos, com conversão de moeda)
  // ═══════════════════════════════════════════════════════════════════
  const normalizeMoeda = (moeda: string) => ['USDT', 'USDC'].includes(moeda) ? 'USD' : moeda;

  const totalSaques = (saquesResult.data || []).reduce((acc, s: any) => {
    const valor = Number(s.valor_confirmado ?? s.valor ?? 0);
    return acc + convert(valor, normalizeMoeda(s.moeda || 'BRL'));
  }, 0);

  const totalDepositos = (depositosResult.data || []).reduce((acc, d: any) => {
    return acc + convert(Number(d.valor ?? 0), normalizeMoeda(d.moeda || 'BRL'));
  }, 0);

  const lucroRealizado = totalSaques - totalDepositos;

  // ═══════════════════════════════════════════════════════════════════
  // MÉTRICAS DERIVADAS
  // ═══════════════════════════════════════════════════════════════════
  const ticketMedio = qtdApostas > 0 ? volume / qtdApostas : 0;
  const roi = volume > 0 ? (lucroLiquido / volume) * 100 : 0;
  const lucroPorAposta = qtdApostas > 0 ? lucroLiquido / qtdApostas : 0;

  return {
    qtdApostas,
    volume,
    lucroApostas,
    lucroCashback,
    lucroGiros,
    lucroBruto,
    perdasConfirmadas,
    perdasDetalhes,
    lucroLiquido,
    lucroRealizado,
    creditosExtras,
    ticketMedio,
    roi,
    lucroPorAposta,
  };
}
