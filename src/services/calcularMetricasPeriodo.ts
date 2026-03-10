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
 * Fórmula Canônica:
 *   LUCRO_BRUTO = LUCRO_APOSTAS + CASHBACK + GIROS_GRATIS
 *   LUCRO_LIQUIDO = LUCRO_BRUTO - PERDAS_CONFIRMADAS
 * 
 * Campos de consolidação (hierarquia de fallback):
 *   Lucro: pl_consolidado ?? lucro_prejuizo_brl_referencia ?? lucro_prejuizo
 *   Volume: stake_consolidado ?? stake/stake_total
 */

import { supabase } from "@/integrations/supabase/client";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
import { parseISO } from "date-fns";

/** Função de conversão de moeda (valor, moedaOrigem) => valorConvertido */
export type ConvertToConsolidationFn = (valor: number, moedaOrigem: string) => number;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface MetricasPeriodo {
  /** Número total de apostas no período */
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
  /** Lucro líquido operacional = bruto - perdas */
  lucroLiquido: number;
  /** Lucro realizado = Saques - (Depósitos + Créditos Extras) — fórmula canônica */
  lucroRealizado: number;
  /** Total de créditos extras no período (cashback, giros, bônus, ajustes, FX) */
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
  /** Função de conversão de moeda para projetos multimoedas. 
   *  Quando fornecida, converte valores não-consolidados para a moeda do projeto.
   *  CRÍTICO: Sem esta função, apostas sem campos consolidados usam valor nominal (possível divergência). */
  convertToConsolidation?: ConvertToConsolidationFn;
  /** Moeda de consolidação do projeto (default: 'BRL') */
  moedaConsolidacao?: string;
}

// ─── Função Principal ───────────────────────────────────────────────────────

/**
 * Calcula todas as métricas financeiras para um projeto em um período.
 * 
 * ESTA É A FONTE ÚNICA DE VERDADE. Use esta função em vez de
 * reimplementar a lógica de cálculo em cada componente.
 */
export async function calcularMetricasPeriodo({
  projetoId,
  dataInicio,
  dataFim,
  incluirDetalhePerdas = false,
  convertToConsolidation,
  moedaConsolidacao = 'BRL',
}: MetricasPeriodoInput): Promise<MetricasPeriodo> {
  // Função de conversão segura (identidade se não fornecida)
  const convert = convertToConsolidation || ((valor: number, _moeda: string) => valor);

  // CRÍTICO: Converter datas do ciclo para UTC usando timezone operacional (America/Sao_Paulo)
  const dataInicioParsed = parseISO(dataInicio);
  const dataFimParsed = parseISO(dataFim);
  const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicioParsed, dataFimParsed);

  // Buscar todos os dados em paralelo
  const [apostasResult, cashbackResult, girosResult, perdasResult, bookmakersResult, saquesResult, depositosResult, bonusResult, ajustesResult, fxResult] = await Promise.all([
    // 1. Apostas com campos consolidados + moeda para conversão
    supabase
      .from("apostas_unificada")
      .select("lucro_prejuizo, pl_consolidado, lucro_prejuizo_brl_referencia, stake, stake_total, stake_consolidado, status, forma_registro, moeda_operacao, consolidation_currency")
      .eq("projeto_id", projetoId)
      .gte("data_aposta", startUTC)
      .lte("data_aposta", endUTC),
    
    // 2. Cashback manual (usa date-only, não UTC)
    supabase
      .from("cashback_manual")
      .select("valor")
      .eq("projeto_id", projetoId)
      .gte("data_credito", dataInicio)
      .lte("data_credito", dataFim),
    
    // 3. Giros grátis confirmados
    supabase
      .from("giros_gratis")
      .select("valor_retorno")
      .eq("projeto_id", projetoId)
      .eq("status", "confirmado")
      .gte("data_registro", startUTC)
      .lte("data_registro", endUTC),
    
    // 4. Perdas
    supabase
      .from("projeto_perdas")
      .select("id, valor, status, categoria, bookmaker_id, descricao, data_registro")
      .eq("projeto_id", projetoId)
      .gte("data_registro", startUTC)
      .lte("data_registro", endUTC),
    
    // 5. Bookmakers (para nomes nas perdas)
    incluirDetalhePerdas
      ? supabase.from("bookmakers").select("id, nome")
      : Promise.resolve({ data: null, error: null }),
    
    // 6. Saques confirmados no período (por data_transacao, atribuído ao projeto)
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado")
      .eq("tipo_transacao", "SAQUE")
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", startUTC)
      .lte("data_transacao", endUTC),
    
    // 7. Depósitos confirmados no período (por data_transacao, atribuído ao projeto)
    supabase
      .from("cash_ledger")
      .select("valor")
      .eq("tipo_transacao", "DEPOSITO")
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", startUTC)
      .lte("data_transacao", endUTC),

    // 8. Bônus creditados no período (credited + finalized)
    supabase
      .from("project_bookmaker_link_bonuses")
      .select("bonus_amount, currency, status, projeto_id")
      .eq("projeto_id", projetoId)
      .in("status", ["credited", "finalized"])
      .gte("credited_at", startUTC)
      .lte("credited_at", endUTC),

    // 9. Ajustes de saldo no período (via cash_ledger)
    supabase
      .from("cash_ledger")
      .select("valor, ajuste_direcao")
      .in("tipo_transacao", ["AJUSTE_SALDO", "AJUSTE_RECONCILIACAO"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", startUTC)
      .lte("data_transacao", endUTC),

    // 10. Resultados cambiais no período (ganho e perda FX)
    supabase
      .from("cash_ledger")
      .select("valor, tipo_transacao")
      .in("tipo_transacao", ["GANHO_CAMBIAL", "PERDA_CAMBIAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .gte("data_transacao", startUTC)
      .lte("data_transacao", endUTC),
  ]);

  // Processar erros silenciosamente (melhor UX)
  if (apostasResult.error) console.error("[calcularMetricasPeriodo] Erro apostas:", apostasResult.error);

  const apostas = apostasResult.data || [];
  const cashbacks = cashbackResult.data || [];
  const giros = girosResult.data || [];
  const perdas = perdasResult.data || [];
  const bookmakerMap = new Map((bookmakersResult.data || []).map((b: any) => [b.id, b.nome]));

  // ─── Cálculos ─────────────────────────────────────────────────────

  // Volume: usar stake consolidado quando disponível, converter se necessário
  const volume = apostas.reduce((acc, a: any) => {
    // 1. Se já temos stake consolidado na moeda do projeto, usar
    if (a.stake_consolidado !== null && a.stake_consolidado !== undefined && a.consolidation_currency === moedaConsolidacao) {
      return acc + Number(a.stake_consolidado);
    }
    // 2. Fallback: valor original + conversão
    let valorOriginal: number;
    if (a.forma_registro === "ARBITRAGEM") {
      valorOriginal = Number(a.stake_total || 0);
    } else {
      valorOriginal = Number(a.stake || 0);
    }
    const moedaOrigem = a.moeda_operacao || 'BRL';
    return acc + convert(valorOriginal, moedaOrigem);
  }, 0);

  const qtdApostas = apostas.length;

  // Lucro de apostas: usar consolidado quando disponível, converter se necessário
  const lucroApostas = apostas
    .filter(a => a.status === "LIQUIDADA")
    .reduce((acc, a: any) => {
      // 1. Se já temos PL consolidado na moeda do projeto, usar
      if (a.pl_consolidado !== null && a.pl_consolidado !== undefined && a.consolidation_currency === moedaConsolidacao) {
        return acc + Number(a.pl_consolidado);
      }
      // 2. Fallback: valor original + conversão
      const valorOriginal = Number(a.lucro_prejuizo || 0);
      const moedaOrigem = a.moeda_operacao || 'BRL';
      return acc + convert(valorOriginal, moedaOrigem);
    }, 0);

  // Cashback: sempre >= 0, com conversão de moeda
  const lucroCashback = cashbacks.reduce((acc, cb: any) => {
    const valor = Math.max(0, Number(cb.valor || 0));
    return acc + valor;
  }, 0);

  // Giros grátis: sempre >= 0
  const lucroGiros = giros.reduce((acc, g) => acc + Math.max(0, (g as any).valor_retorno || 0), 0);

  // Perdas confirmadas
  const perdasConfirmadas = perdas
    .filter(p => p.status === "CONFIRMADA")
    .reduce((acc, p) => acc + (p.valor || 0), 0);

  // Detalhes das perdas (quando solicitado)
  const perdasDetalhes: PerdaDetalhe[] = incluirDetalhePerdas
    ? perdas.map(p => ({
        id: (p as any).id,
        valor: p.valor,
        categoria: p.categoria,
        status: p.status,
        bookmaker_id: p.bookmaker_id,
        bookmaker_nome: p.bookmaker_id ? (bookmakerMap.get(p.bookmaker_id) as string | undefined) : undefined,
        descricao: (p as any).descricao,
        data_registro: (p as any).data_registro,
      }))
    : [];

  // Fórmula canônica operacional
  const lucroBruto = lucroApostas + lucroCashback + lucroGiros;
  const lucroLiquido = lucroBruto - perdasConfirmadas;
  const ticketMedio = qtdApostas > 0 ? volume / qtdApostas : 0;
  const roi = volume > 0 ? (lucroLiquido / volume) * 100 : 0;
  const lucroPorAposta = qtdApostas > 0 ? lucroLiquido / qtdApostas : 0;

  // ─── Lucro Realizado (Fórmula Canônica) ───────────────────────────
  // Saques - (Depósitos + Créditos Extras)
  // Créditos Extras = Cashback + Giros + Bônus + Ajustes + FX

  const saques = saquesResult.data || [];
  const depositos = depositosResult.data || [];
  const totalSaques = saques.reduce((acc, s: any) => acc + Number(s.valor_confirmado ?? s.valor ?? 0), 0);
  const totalDepositos = depositos.reduce((acc, d: any) => acc + Number(d.valor ?? 0), 0);

  // Bônus creditados
  const totalBonus = (bonusResult.data || []).reduce((acc, b: any) => {
    return acc + Number(b.bonus_amount || 0);
  }, 0);

  // Ajustes de saldo (considerar direção)
  const totalAjustes = (ajustesResult.data || []).reduce((acc, a: any) => {
    const sinal = a.ajuste_direcao === 'SAIDA' ? -1 : 1;
    return acc + Number(a.valor || 0) * sinal;
  }, 0);

  // Resultados cambiais (ganho - perda)
  const totalFx = (fxResult.data || []).reduce((acc, fx: any) => {
    const sinal = fx.tipo_transacao === 'GANHO_CAMBIAL' ? 1 : -1;
    return acc + Number(fx.valor || 0) * sinal;
  }, 0);

  // Créditos Extras totais
  const creditosExtras = lucroCashback + lucroGiros + totalBonus + totalAjustes + totalFx;

  // Fórmula canônica: Saques - (Depósitos + Créditos Extras)
  const lucroRealizado = totalSaques - (totalDepositos + creditosExtras);

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
