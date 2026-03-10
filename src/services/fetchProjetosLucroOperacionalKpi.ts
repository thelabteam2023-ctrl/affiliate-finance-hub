import { supabase } from "@/integrations/supabase/client";
import { agruparExtrasPorTipo, fetchProjetoExtras } from "@/services/fetchProjetoExtras";
import { getConsolidatedLucro } from "@/utils/consolidatedValues";
import { getOperationalDateRangeFromStrings } from "@/utils/dateUtils";

/** Breakdown de lucro por moeda original (dinâmico — suporta todas as moedas) */
type SaldoByMoeda = Record<string, number>;

interface LucroProjetoResumo {
  consolidado: number;
  porMoeda: SaldoByMoeda;
}

interface Params {
  projetoIds: string[];
  cotacaoUSD: number;
  /** Mapa de cotações adicionais (ex: { EUR: 6.2 }) para moedas além de USD/BRL.
   *  Cada valor representa quanto vale 1 unidade da moeda na moeda de consolidação. */
  cotacoes?: Record<string, number>;
  /** Filtro de data início (YYYY-MM-DD). Se omitido, sem limite inferior. */
  dataInicio?: string | null;
  /** Filtro de data fim (YYYY-MM-DD). Se omitido, sem limite superior. */
  dataFim?: string | null;
}

const isUsdLike = (moeda?: string | null) => {
  const m = (moeda || "BRL").toUpperCase();
  return m === "USD" || m === "USDT" || m === "USDC";
};

/** Moedas FIAT suportadas pelo sistema (inclui BRL para projetos com consolidação não-BRL) */
const ALL_FIAT_CURRENCIES = ["BRL", "EUR", "GBP", "MYR", "MXN", "ARS", "COP"] as const;

/**
 * Deriva um mapa de cotações para TODAS as moedas suportadas a partir de uma função de conversão.
 * Útil para callers que possuem uma convertFn mas precisam passar cotações ao KPI canônico.
 */
export function derivarCotacoesFromConvertFn(
  convertFn: (valor: number, moedaOrigem: string) => number
): Record<string, number> {
  const cotacoes: Record<string, number> = {};
  for (const moeda of ALL_FIAT_CURRENCIES) {
    const rate = convertFn(1, moeda);
    // Só incluir se a conversão retorna um valor diferente de 1 (identidade = sem conversão)
    if (Math.abs(rate - 1) > 0.001 && Math.abs(rate) > 0.001) {
      cotacoes[moeda] = rate;
    }
  }
  return cotacoes;
}

/** Normaliza moeda para bucket (stablecoins → USD) */
const normalizeMoeda = (moeda?: string | null): string => {
  const m = (moeda || "BRL").toUpperCase();
  if (m === "USDT" || m === "USDC") return "USD";
  return m;
};

const createEmpty = (): LucroProjetoResumo => ({
  consolidado: 0,
  porMoeda: {},
});

/**
 * Busca paginada para contornar o limite de 1000 linhas do Supabase.
 * Faz fetches de PAGE_SIZE em PAGE_SIZE e concatena os resultados.
 */
async function fetchAllRows<T>(
  buildQuery: () => any,
  pageSize = 1000
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await buildQuery()
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Erro em fetchAllRows:", error);
      break;
    }

    const rows = (data || []) as T[];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }
  }

  return allRows;
}

/**
 * Calcula os limites UTC para filtros de período no timezone operacional (São Paulo).
 * Retorna null se nenhum filtro deve ser aplicado.
 */
function getDateFilters(dataInicio?: string | null, dataFim?: string | null) {
  if (!dataInicio && !dataFim) return null;
  
  // Para queries com apenas início ou apenas fim, criamos um range amplo
  const startStr = dataInicio || "2020-01-01";
  const endStr = dataFim || "2099-12-31";
  
  const { startUTC, endUTC } = getOperationalDateRangeFromStrings(startStr, endStr);
  
  return {
    startUTC: dataInicio ? startUTC : null,
    endUTC: dataFim ? endUTC : null,
  };
}

/**
 * Aplica filtros de data a uma query do Supabase em um campo timestamp.
 */
function applyDateFilter(query: any, dateFilters: ReturnType<typeof getDateFilters>, field: string) {
  if (!dateFilters) return query;
  if (dateFilters.startUTC) query = query.gte(field, dateFilters.startUTC);
  if (dateFilters.endUTC) query = query.lte(field, dateFilters.endUTC);
  return query;
}

/**
 * Aplica filtros de data a uma query do Supabase em um campo date (YYYY-MM-DD, sem timezone).
 */
function applyDateFilterSimple(query: any, dataInicio?: string | null, dataFim?: string | null, field = "data_credito") {
  if (dataInicio) query = query.gte(field, dataInicio);
  if (dataFim) query = query.lte(field, dataFim);
  return query;
}

/**
 * Serviço KPI-compatível para cálculo do Lucro Operacional de múltiplos projetos.
 * 
 * PARIDADE GARANTIDA com useKpiBreakdowns:
 * - Apostas LIQUIDADAS (via getConsolidatedLucro)
 * - Cashback manual
 * - Giros grátis confirmados
 * - Bônus ganhos (exceto FREEBET)
 * - Perdas operacionais confirmadas
 * - Ajustes de conciliação
 * - Ajustes de saldo + Resultado cambial (via fetchProjetoExtras canônico)
 * 
 * PROTEÇÃO: Paginação automática para >1000 linhas (limite Supabase).
 * FILTROS: Suporta filtro de período opcional (dataInicio/dataFim) no timezone operacional.
 */
export async function fetchProjetosLucroOperacionalKpi({
  projetoIds,
  cotacaoUSD,
  cotacoes = {},
  dataInicio,
  dataFim,
}: Params): Promise<Record<string, LucroProjetoResumo>> {
  if (projetoIds.length === 0) return {};

  const convertToConsolidation = (valor: number, moedaOrigem: string) => {
    const m = (moedaOrigem || "BRL").toUpperCase();
    if (isUsdLike(m)) return valor * cotacaoUSD;
    // Checar mapa de cotações adicionais (EUR, GBP, etc.)
    if (cotacoes[m] != null) return valor * cotacoes[m];
    // BRL ou moeda desconhecida — retorna como está
    return valor;
  };

  const dateFilters = getDateFilters(dataInicio, dataFim);

  // Apostas: query paginada (pode exceder 1000 linhas em workspaces com muitos projetos)
  const apostasData = await fetchAllRows<any>(
    () => {
      let q = supabase
        .from("apostas_unificada")
        .select("projeto_id, lucro_prejuizo, pl_consolidado, lucro_prejuizo_brl_referencia, moeda_operacao, consolidation_currency, status")
        .in("projeto_id", projetoIds)
        .eq("status", "LIQUIDADA");
      q = applyDateFilter(q, dateFilters, "data_aposta");
      return q;
    }
  );

  // Demais queries: volume menor, busca direta
  const [
    cashbackResult,
    girosResult,
    bonusResult,
    perdasResult,
    ajustesResult,
  ] = await Promise.all([
    (() => {
      let q = supabase
        .from("cashback_manual")
        .select("projeto_id, valor, valor_brl_referencia, moeda_operacao")
        .in("projeto_id", projetoIds);
      q = applyDateFilterSimple(q, dataInicio, dataFim, "data_credito");
      return q;
    })(),
    (() => {
      let q = supabase
        .from("giros_gratis" as any)
        .select("projeto_id, valor_retorno, status, bookmaker_id")
        .in("projeto_id", projetoIds)
        .eq("status", "confirmado");
      q = applyDateFilter(q, dateFilters, "data_registro");
      return q;
    })(),
    (() => {
      let q = supabase
        .from("project_bookmaker_link_bonuses")
        .select("project_id, bonus_amount, currency, tipo_bonus")
        .in("project_id", projetoIds)
        .in("status", ["credited", "finalized"]);
      q = applyDateFilter(q, dateFilters, "created_at");
      return q;
    })(),
    (() => {
      let q = supabase
        .from("projeto_perdas")
        .select("projeto_id, valor, status, bookmaker_id")
        .in("projeto_id", projetoIds)
        .eq("status", "CONFIRMADA");
      q = applyDateFilter(q, dateFilters, "created_at");
      return q;
    })(),
    (() => {
      let q = supabase
        .from("bookmaker_balance_audit")
        .select("referencia_id, saldo_anterior, saldo_novo, bookmaker_id")
        .eq("origem", "CONCILIACAO_VINCULO")
        .eq("referencia_tipo", "projeto")
        .in("referencia_id", projetoIds);
      q = applyDateFilter(q, dateFilters, "created_at");
      return q;
    })(),
  ]);

  // Resolver moedas dos bookmakers referenciados
  const allBookmakerIds = new Set<string>();
  (girosResult.data || []).forEach((g: any) => g?.bookmaker_id && allBookmakerIds.add(g.bookmaker_id));
  (perdasResult.data || []).forEach((p: any) => p?.bookmaker_id && allBookmakerIds.add(p.bookmaker_id));
  (ajustesResult.data || []).forEach((a: any) => a?.bookmaker_id && allBookmakerIds.add(a.bookmaker_id));

  const bookmakerMoedas = new Map<string, string>();
  if (allBookmakerIds.size > 0) {
    const { data: bms } = await supabase
      .from("bookmakers")
      .select("id, moeda")
      .in("id", Array.from(allBookmakerIds));

    (bms || []).forEach((bm) => bookmakerMoedas.set(bm.id, bm.moeda || "BRL"));
  }

  // Inicializar resultado
  const result: Record<string, LucroProjetoResumo> = {};
  projetoIds.forEach((id) => {
    result[id] = createEmpty();
  });

  const addToMoeda = (target: SaldoByMoeda, moeda: string, valor: number) => {
    const key = normalizeMoeda(moeda);
    target[key] = (target[key] || 0) + valor;
  };

  // 1) Apostas LIQUIDADAS (mesma lógica getConsolidatedLucro do KPI)
  apostasData.forEach((ap: any) => {
    const projetoId = ap.projeto_id;
    if (!projetoId || !result[projetoId]) return;

    const moeda = (ap.moeda_operacao || "BRL").toUpperCase();
    const bruto = Number(ap.lucro_prejuizo || 0);
    addToMoeda(result[projetoId].porMoeda, moeda, bruto);

    const consolidado = getConsolidatedLucro(ap, convertToConsolidation, "BRL");
    result[projetoId].consolidado += consolidado;
  });

  // 2) Cashback manual
  (cashbackResult.data || []).forEach((cb: any) => {
    const projetoId = cb.projeto_id;
    if (!projetoId || !result[projetoId]) return;

    const moeda = (cb.moeda_operacao || "BRL").toUpperCase();
    const valor = Number(cb.valor || 0);
    addToMoeda(result[projetoId].porMoeda, moeda, valor);

    let consolidado = valor;
    if (moeda !== "BRL") {
      consolidado = cb.valor_brl_referencia != null
        ? Number(cb.valor_brl_referencia)
        : convertToConsolidation(valor, moeda);
    }
    result[projetoId].consolidado += consolidado;
  });

  // 3) Giros grátis confirmados
  (girosResult.data || []).forEach((gg: any) => {
    const projetoId = gg.projeto_id;
    if (!projetoId || !result[projetoId]) return;

    const valor = Math.max(0, Number(gg.valor_retorno || 0));
    const moeda = bookmakerMoedas.get(gg.bookmaker_id) || "BRL";

    addToMoeda(result[projetoId].porMoeda, moeda, valor);
    result[projetoId].consolidado += convertToConsolidation(valor, moeda);
  });

  // 4) Bônus ganhos (exclui FREEBET — lucro SNR já no P&L)
  (bonusResult.data || [])
    .filter((b: any) => b.tipo_bonus !== "FREEBET")
    .forEach((b: any) => {
      const projetoId = b.project_id;
      if (!projetoId || !result[projetoId]) return;

      const moeda = (b.currency || "BRL").toUpperCase();
      const valor = Number(b.bonus_amount || 0);

      addToMoeda(result[projetoId].porMoeda, moeda, valor);
      result[projetoId].consolidado += convertToConsolidation(valor, moeda);
    });

  // 5) Perdas operacionais confirmadas (subtrai)
  (perdasResult.data || []).forEach((p: any) => {
    const projetoId = p.projeto_id;
    if (!projetoId || !result[projetoId]) return;

    const valor = Number(p.valor || 0);
    const moeda = bookmakerMoedas.get(p.bookmaker_id) || "BRL";

    addToMoeda(result[projetoId].porMoeda, moeda, -valor);
    result[projetoId].consolidado -= convertToConsolidation(valor, moeda);
  });

  // 6) Ajustes de conciliação de vínculo
  (ajustesResult.data || []).forEach((a: any) => {
    const projetoId = a.referencia_id;
    if (!projetoId || !result[projetoId]) return;

    const delta = Number(a.saldo_novo || 0) - Number(a.saldo_anterior || 0);
    const moeda = bookmakerMoedas.get(a.bookmaker_id) || "BRL";

    addToMoeda(result[projetoId].porMoeda, moeda, delta);
    result[projetoId].consolidado += convertToConsolidation(delta, moeda);
  });

  // 7) Extras canônicos NÃO cobertos pelas seções 2-6:
  //    - ajuste_saldo (cash_ledger AJUSTE_SALDO + financial_events AJUSTE_POS_LIMITACAO)
  //    - resultado_cambial (cash_ledger GANHO/PERDA_CAMBIAL)
  //    - promocional (cash_ledger FREEBET_CONVERTIDA, CREDITO_PROMOCIONAL, GIRO_GRATIS_GANHO)
  //    - freebet (mapeado de FREEBET_CONVERTIDA)
  //
  // Tipos JÁ cobertos (seções 2-6): cashback, giro_gratis, bonus, perda_operacional, conciliacao
  const EXTRAS_JA_COBERTOS = new Set(['cashback', 'giro_gratis', 'bonus', 'perda_operacional', 'conciliacao']);

  const extrasByProjeto = await Promise.all(
    projetoIds.map(async (projetoId) => {
      let extras = await fetchProjetoExtras(projetoId);
      
      // Excluir tipos já cobertos pelas seções 2-6
      extras = extras.filter(e => !EXTRAS_JA_COBERTOS.has(e.tipo));
      
      // Filtrar extras por período quando há filtro de data ativo
      if (dataInicio || dataFim) {
        extras = extras.filter(e => {
          if (dataInicio && e.data < dataInicio) return false;
          if (dataFim && e.data > dataFim) return false;
          return true;
        });
      }
      
      const agrupados = agruparExtrasPorTipo(extras, convertToConsolidation, "BRL");
      return { projetoId, agrupados };
    })
  );

  extrasByProjeto.forEach(({ projetoId, agrupados }) => {
    const target = result[projetoId];
    if (!target) return;

    // Iterar TODOS os tipos restantes (ajuste_saldo, resultado_cambial, promocional, freebet)
    for (const [_tipo, grupo] of Object.entries(agrupados)) {
      if (!grupo) continue;
      target.consolidado += Number(grupo.total || 0);
      (grupo.porMoeda || []).forEach((item: { moeda: string; valor: number }) => {
        addToMoeda(target.porMoeda, item.moeda, Number(item.valor || 0));
      });
    }
  });

  return result;
}
