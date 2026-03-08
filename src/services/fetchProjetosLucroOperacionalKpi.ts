import { supabase } from "@/integrations/supabase/client";
import { agruparExtrasPorTipo, fetchProjetoExtras } from "@/services/fetchProjetoExtras";
import { getConsolidatedLucro } from "@/utils/consolidatedValues";

interface SaldoByMoeda {
  BRL: number;
  USD: number;
}

interface LucroProjetoResumo {
  consolidado: number;
  porMoeda: SaldoByMoeda;
}

interface Params {
  projetoIds: string[];
  cotacaoUSD: number;
}

const isUsdLike = (moeda?: string | null) => {
  const m = (moeda || "BRL").toUpperCase();
  return m === "USD" || m === "USDT" || m === "USDC";
};

const toBucketMoeda = (moeda?: string | null): keyof SaldoByMoeda =>
  isUsdLike(moeda) ? "USD" : "BRL";

const createEmpty = (): LucroProjetoResumo => ({
  consolidado: 0,
  porMoeda: { BRL: 0, USD: 0 },
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
 */
export async function fetchProjetosLucroOperacionalKpi({
  projetoIds,
  cotacaoUSD,
}: Params): Promise<Record<string, LucroProjetoResumo>> {
  if (projetoIds.length === 0) return {};

  const convertToConsolidation = (valor: number, moedaOrigem: string) => {
    if (isUsdLike(moedaOrigem)) return valor * cotacaoUSD;
    return valor;
  };

  // Apostas: query paginada (pode exceder 1000 linhas em workspaces com muitos projetos)
  const apostasData = await fetchAllRows<any>(
    () => supabase
      .from("apostas_unificada")
      .select("projeto_id, lucro_prejuizo, pl_consolidado, lucro_prejuizo_brl_referencia, moeda_operacao, consolidation_currency, status")
      .in("projeto_id", projetoIds)
      .eq("status", "LIQUIDADA")
  );

  // Demais queries: volume menor, busca direta
  const [
    cashbackResult,
    girosResult,
    bonusResult,
    perdasResult,
    ajustesResult,
  ] = await Promise.all([
    supabase
      .from("cashback_manual")
      .select("projeto_id, valor, valor_brl_referencia, moeda_operacao")
      .in("projeto_id", projetoIds),
    supabase
      .from("giros_gratis" as any)
      .select("projeto_id, valor_retorno, status, bookmaker_id")
      .in("projeto_id", projetoIds)
      .eq("status", "confirmado"),
    supabase
      .from("project_bookmaker_link_bonuses")
      .select("project_id, bonus_amount, currency, tipo_bonus")
      .in("project_id", projetoIds)
      .in("status", ["credited", "finalized"]),
    supabase
      .from("projeto_perdas")
      .select("projeto_id, valor, status, bookmaker_id")
      .in("projeto_id", projetoIds)
      .eq("status", "CONFIRMADA"),
    supabase
      .from("bookmaker_balance_audit")
      .select("referencia_id, saldo_anterior, saldo_novo, bookmaker_id")
      .eq("origem", "CONCILIACAO_VINCULO")
      .eq("referencia_tipo", "projeto")
      .in("referencia_id", projetoIds),
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

  // 1) Apostas LIQUIDADAS (mesma lógica getConsolidatedLucro do KPI)
  apostasData.forEach((ap: any) => {
    const projetoId = ap.projeto_id;
    if (!projetoId || !result[projetoId]) return;

    const moeda = (ap.moeda_operacao || "BRL").toUpperCase();
    const bruto = Number(ap.lucro_prejuizo || 0);
    result[projetoId].porMoeda[toBucketMoeda(moeda)] += bruto;

    const consolidado = getConsolidatedLucro(ap, convertToConsolidation, "BRL");
    result[projetoId].consolidado += consolidado;
  });

  // 2) Cashback manual
  (cashbackResult.data || []).forEach((cb: any) => {
    const projetoId = cb.projeto_id;
    if (!projetoId || !result[projetoId]) return;

    const moeda = (cb.moeda_operacao || "BRL").toUpperCase();
    const valor = Number(cb.valor || 0);
    result[projetoId].porMoeda[toBucketMoeda(moeda)] += valor;

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

    result[projetoId].porMoeda[toBucketMoeda(moeda)] += valor;
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

      result[projetoId].porMoeda[toBucketMoeda(moeda)] += valor;
      result[projetoId].consolidado += convertToConsolidation(valor, moeda);
    });

  // 5) Perdas operacionais confirmadas (subtrai)
  (perdasResult.data || []).forEach((p: any) => {
    const projetoId = p.projeto_id;
    if (!projetoId || !result[projetoId]) return;

    const valor = Number(p.valor || 0);
    const moeda = bookmakerMoedas.get(p.bookmaker_id) || "BRL";

    result[projetoId].porMoeda[toBucketMoeda(moeda)] -= valor;
    result[projetoId].consolidado -= convertToConsolidation(valor, moeda);
  });

  // 6) Ajustes de conciliação de vínculo
  (ajustesResult.data || []).forEach((a: any) => {
    const projetoId = a.referencia_id;
    if (!projetoId || !result[projetoId]) return;

    const delta = Number(a.saldo_novo || 0) - Number(a.saldo_anterior || 0);
    const moeda = bookmakerMoedas.get(a.bookmaker_id) || "BRL";

    result[projetoId].porMoeda[toBucketMoeda(moeda)] += delta;
    result[projetoId].consolidado += convertToConsolidation(delta, moeda);
  });

  // 7) Extras canônicos (ajuste_saldo + resultado_cambial)
  const extrasByProjeto = await Promise.all(
    projetoIds.map(async (projetoId) => {
      const extras = await fetchProjetoExtras(projetoId);
      const agrupados = agruparExtrasPorTipo(extras, convertToConsolidation, "BRL");
      return { projetoId, agrupados };
    })
  );

  extrasByProjeto.forEach(({ projetoId, agrupados }) => {
    const target = result[projetoId];
    if (!target) return;

    const ajusteSaldo = agrupados.ajuste_saldo;
    const resultadoCambial = agrupados.resultado_cambial;

    if (ajusteSaldo) {
      target.consolidado += Number(ajusteSaldo.total || 0);
      (ajusteSaldo.porMoeda || []).forEach((item) => {
        target.porMoeda[toBucketMoeda(item.moeda)] += Number(item.valor || 0);
      });
    }

    if (resultadoCambial) {
      target.consolidado += Number(resultadoCambial.total || 0);
      (resultadoCambial.porMoeda || []).forEach((item) => {
        target.porMoeda[toBucketMoeda(item.moeda)] += Number(item.valor || 0);
      });
    }
  });

  return result;
}
