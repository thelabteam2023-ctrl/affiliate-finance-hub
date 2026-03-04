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
  /** Lucro líquido = bruto - perdas */
  lucroLiquido: number;
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
}: MetricasPeriodoInput): Promise<MetricasPeriodo> {
  // CRÍTICO: Converter datas do ciclo para UTC usando timezone operacional (America/Sao_Paulo)
  const dataInicioParsed = parseISO(dataInicio);
  const dataFimParsed = parseISO(dataFim);
  const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicioParsed, dataFimParsed);

  // Buscar todos os dados em paralelo
  const [apostasResult, cashbackResult, girosResult, perdasResult, bookmakersResult] = await Promise.all([
    // 1. Apostas com campos consolidados
    supabase
      .from("apostas_unificada")
      .select("lucro_prejuizo, pl_consolidado, lucro_prejuizo_brl_referencia, stake, stake_total, stake_consolidado, status, forma_registro")
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
  ]);

  // Processar erros silenciosamente (melhor UX)
  if (apostasResult.error) console.error("[calcularMetricasPeriodo] Erro apostas:", apostasResult.error);

  const apostas = apostasResult.data || [];
  const cashbacks = cashbackResult.data || [];
  const giros = girosResult.data || [];
  const perdas = perdasResult.data || [];
  const bookmakerMap = new Map((bookmakersResult.data || []).map((b: any) => [b.id, b.nome]));

  // ─── Cálculos ─────────────────────────────────────────────────────

  // Volume: usar stake consolidado quando disponível
  const volume = apostas.reduce((acc, a) => {
    if (a.forma_registro === "ARBITRAGEM") {
      return acc + (a.stake_consolidado || a.stake_total || 0);
    }
    return acc + (a.stake_consolidado || a.stake || 0);
  }, 0);

  const qtdApostas = apostas.length;

  // Lucro de apostas: hierarquia de campos consolidados
  const lucroApostas = apostas
    .filter(a => a.status === "LIQUIDADA")
    .reduce((acc, a) => acc + (a.pl_consolidado ?? a.lucro_prejuizo_brl_referencia ?? a.lucro_prejuizo ?? 0), 0);

  // Cashback: sempre >= 0
  const lucroCashback = cashbacks.reduce((acc, cb) => acc + Math.max(0, cb.valor || 0), 0);

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

  // Fórmula canônica
  const lucroBruto = lucroApostas + lucroCashback + lucroGiros;
  const lucroLiquido = lucroBruto - perdasConfirmadas;
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
    ticketMedio,
    roi,
    lucroPorAposta,
  };
}
