/**
 * SERVIÇO CANÔNICO DE MÉTRICAS FINANCEIRAS POR PERÍODO
 * 
 * FONTE ÚNICA DE VERDADE para cálculos de lucro/volume/ROI de ciclos e períodos.
 * 
 * Toda aba, hook ou componente que precise calcular métricas financeiras
 * para um período (ciclo, mês, custom) DEVE usar esta função.
 * 
 * PROIBIDO: Reimplementar esta lógica manualmente em qualquer componente.
 * 
 * Fórmula Canônica (PARIDADE com fetchProjetosLucroOperacionalKpi):
 *   LUCRO_OPERACIONAL = 
 *     Σ apostas_liquidadas (P&L consolidado)
 *     + Σ extras (cashback, giros, bônus, ajustes, FX, conciliações, promocionais)
 *     - Σ perdas_operacionais
 * 
 * Contagem de Apostas (PARIDADE com dashboard):
 *   - Apostas simples/múltiplas: 1 por registro
 *   - Arbitragem (Surebet): 1 por perna (apostas_pernas)
 * 
 * Campos de consolidação (hierarquia de fallback):
 *   Lucro: pl_consolidado ?? lucro_prejuizo_brl_referencia ?? lucro_prejuizo
 *   Volume: stake_consolidado ?? stake/stake_total
 */

import { supabase } from "@/integrations/supabase/client";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
import { fetchProjetoExtras, agruparExtrasPorTipo } from "@/services/fetchProjetoExtras";
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
  /** Lucro de cashback recebido (sempre >= 0) */
  lucroCashback: number;
  /** Lucro de giros grátis confirmados (sempre >= 0) */
  lucroGiros: number;
  /** Lucro bruto total = apostas + cashback + giros */
  lucroBruto: number;
  /** Perdas confirmadas no período */
  perdasConfirmadas: number;
  /** Detalhes individuais das perdas */
  perdasDetalhes: PerdaDetalhe[];
  /** Lucro líquido operacional = apostas + ALL extras (bônus, cashback, giros, ajustes, FX, conciliações) - perdas */
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

  // Converter datas do ciclo para UTC usando timezone operacional
  const dataInicioParsed = parseISO(dataInicio);
  const dataFimParsed = parseISO(dataFim);
  const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicioParsed, dataFimParsed);

  // Buscar dados principais em paralelo
  const [apostasResult, extrasResult, perdasResult, bookmakersResult, saquesResult, depositosResult] = await Promise.all([
    // 1. Apostas com campos consolidados + moeda + forma_registro para contagem
    supabase
      .from("apostas_unificada")
      .select("id, lucro_prejuizo, pl_consolidado, lucro_prejuizo_brl_referencia, stake, stake_total, stake_consolidado, status, forma_registro, moeda_operacao, consolidation_currency")
      .eq("projeto_id", projetoId)
      .gte("data_aposta", startUTC)
      .lte("data_aposta", endUTC),
    
    // 2. Extras canônicos (cashback, giros, bônus, ajustes, FX, conciliações, perdas)
    fetchProjetoExtras(projetoId),
    
    // 3. Perdas (para detalhes na UI)
    incluirDetalhePerdas
      ? supabase
          .from("projeto_perdas")
          .select("id, valor, status, categoria, bookmaker_id, descricao, data_registro")
          .eq("projeto_id", projetoId)
          .gte("data_registro", startUTC)
          .lte("data_registro", endUTC)
      : Promise.resolve({ data: null, error: null }),
    
    // 4. Bookmakers (para nomes nas perdas)
    incluirDetalhePerdas
      ? supabase.from("bookmakers").select("id, nome")
      : Promise.resolve({ data: null, error: null }),
    
    // 5. Saques confirmados no período
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", startUTC)
      .lte("data_transacao", endUTC),
    
    // 6. Depósitos confirmados no período
    supabase
      .from("cash_ledger")
      .select("valor, moeda")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", startUTC)
      .lte("data_transacao", endUTC),
  ]);

  if (apostasResult.error) console.error("[calcularMetricasPeriodo] Erro apostas:", apostasResult.error);

  const apostas = apostasResult.data || [];
  const perdas = perdasResult.data || [];
  const bookmakerMap = new Map((bookmakersResult.data || []).map((b: any) => [b.id, b.nome]));

  // ─── Contagem de Apostas (PARIDADE com dashboard) ─────────────────
  // Apostas simples/múltiplas: 1 por registro
  // Arbitragem (Surebet): contar pernas individuais
  const arbitragemIds = apostas
    .filter(a => a.forma_registro === "ARBITRAGEM")
    .map(a => a.id);
  const apostasNaoArbitragem = apostas.filter(a => a.forma_registro !== "ARBITRAGEM").length;

  let pernasCount = 0;
  if (arbitragemIds.length > 0) {
    const { count } = await supabase
      .from("apostas_pernas")
      .select("*", { count: "exact", head: true })
      .in("aposta_id", arbitragemIds);
    pernasCount = count || 0;
  }
  const qtdApostas = apostasNaoArbitragem + pernasCount;

  // ─── Volume (consolidado) ─────────────────────────────────────────
  const volume = apostas.reduce((acc, a: any) => {
    if (a.stake_consolidado !== null && a.stake_consolidado !== undefined && a.consolidation_currency === moedaConsolidacao) {
      return acc + Number(a.stake_consolidado);
    }
    let valorOriginal: number;
    if (a.forma_registro === "ARBITRAGEM") {
      valorOriginal = Number(a.stake_total || 0);
    } else {
      valorOriginal = Number(a.stake || 0);
    }
    const moedaOrigem = a.moeda_operacao || 'BRL';
    return acc + convert(valorOriginal, moedaOrigem);
  }, 0);

  // ─── Lucro de apostas liquidadas ──────────────────────────────────
  const lucroApostas = apostas
    .filter(a => a.status === "LIQUIDADA")
    .reduce((acc, a: any) => {
      if (a.pl_consolidado !== null && a.pl_consolidado !== undefined && a.consolidation_currency === moedaConsolidacao) {
        return acc + Number(a.pl_consolidado);
      }
      const valorOriginal = Number(a.lucro_prejuizo || 0);
      const moedaOrigem = a.moeda_operacao || 'BRL';
      return acc + convert(valorOriginal, moedaOrigem);
    }, 0);

  // ─── Extras canônicos (com filtro de data do período) ─────────────
  const dataInicioParsedForFilter = parseISO(dataInicio);
  const dataFimParsedForFilter = parseISO(dataFim);
  // Extend fim by 1 day for inclusive filtering
  const dataFimExtended = new Date(dataFimParsedForFilter);
  dataFimExtended.setDate(dataFimExtended.getDate() + 1);

  const extrasAgrupados = agruparExtrasPorTipo(
    extrasResult,
    convert,
    moedaConsolidacao,
    { inicio: dataInicioParsedForFilter, fim: dataFimExtended }
  );

  // Extract individual extras for the period
  const lucroCashback = extrasAgrupados.cashback?.total || 0;
  const lucroGiros = extrasAgrupados.giro_gratis?.total || 0;
  const lucroBonus = extrasAgrupados.bonus?.total || 0;
  const lucroPromocional = extrasAgrupados.promocional?.total || 0;
  const lucroFreebet = extrasAgrupados.freebet?.total || 0;
  const lucroAjusteSaldo = extrasAgrupados.ajuste_saldo?.total || 0;
  const lucroResultadoCambial = extrasAgrupados.resultado_cambial?.total || 0;
  const lucroConciliacao = extrasAgrupados.conciliacao?.total || 0;
  const perdasOperacionais = Math.abs(extrasAgrupados.perda_operacional?.total || 0); // extras retorna negativo

  // Detalhes das perdas (quando solicitado - via query direta, não extras)
  const perdasDetalhes: PerdaDetalhe[] = incluirDetalhePerdas
    ? (perdas || []).map((p: any) => ({
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

  // Perdas confirmadas (do extras, que já filtra por data e status)
  const perdasConfirmadas = perdasOperacionais;

  // ─── Fórmula Canônica Operacional (PARIDADE com dashboard) ────────
  // Inclui TODOS os componentes: apostas + extras completos
  const lucroBruto = lucroApostas + lucroCashback + lucroGiros;
  const totalExtras = lucroBonus + lucroPromocional + lucroFreebet + lucroAjusteSaldo + lucroResultadoCambial + lucroConciliacao;
  const lucroLiquido = lucroApostas + lucroCashback + lucroGiros + totalExtras + (extrasAgrupados.perda_operacional?.total || 0);
  // Note: perda_operacional.total is already negative from fetchProjetoExtras

  const ticketMedio = qtdApostas > 0 ? volume / qtdApostas : 0;
  const roi = volume > 0 ? (lucroLiquido / volume) * 100 : 0;
  const lucroPorAposta = qtdApostas > 0 ? lucroLiquido / qtdApostas : 0;

  // ─── Lucro Realizado (Saques - Depósitos) ─────────────────────────
  const saques = saquesResult.data || [];
  const depositos = depositosResult.data || [];
  
  const totalSaques = saques.reduce((acc, s: any) => {
    const valor = Number(s.valor_confirmado ?? s.valor ?? 0);
    const moeda = s.moeda || 'BRL';
    const moedaNormalizada = ['USDT', 'USDC'].includes(moeda) ? 'USD' : moeda;
    return acc + convert(valor, moedaNormalizada);
  }, 0);
  
  const totalDepositos = depositos.reduce((acc, d: any) => {
    const valor = Number(d.valor ?? 0);
    const moeda = d.moeda || 'BRL';
    const moedaNormalizada = ['USDT', 'USDC'].includes(moeda) ? 'USD' : moeda;
    return acc + convert(valor, moedaNormalizada);
  }, 0);

  const creditosExtras = lucroCashback + lucroGiros + lucroBonus + lucroPromocional + lucroFreebet;
  const lucroRealizado = totalSaques - totalDepositos;

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
