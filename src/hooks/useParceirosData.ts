import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { FIAT_CURRENCIES } from "@/types/currency";

const SUPPORTED_FIAT: string[] = FIAT_CURRENCIES.map(c => c.value);

type SaldosPorMoeda = Record<string, number>;

function createEmptySaldos(): SaldosPorMoeda {
  const saldos: SaldosPorMoeda = {};
  SUPPORTED_FIAT.forEach(moeda => { saldos[moeda] = 0; });
  return saldos;
}

export interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
  status: string;
  created_at: string;
  contas_bancarias: any[];
  wallets_crypto: any[];
}

export interface ParceiroROI {
  parceiro_id: string;
  depositado_por_moeda: SaldosPorMoeda;
  sacado_por_moeda: SaldosPorMoeda;
  saldo_por_moeda: SaldosPorMoeda;
  resultado_por_moeda: SaldosPorMoeda;
  moedas_utilizadas: string[];
  roi_percentual: number;
  num_bookmakers: number;
  num_bookmakers_limitadas: number;
}

export interface SaldoParceiro {
  parceiro_id: string;
  saldo_fiat: number;
  saldo_crypto_usd: number;
}

export interface SaldoCryptoRaw {
  parceiro_id: string;
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

export interface ParceriaStatus {
  parceiro_id: string;
  dias_restantes: number;
  pagamento_parceiro_realizado: boolean;
}

interface ParceirosQueryData {
  parceiros: Parceiro[];
  roiData: Map<string, ParceiroROI>;
  saldosData: Map<string, SaldoParceiro>;
  saldosCryptoRaw: SaldoCryptoRaw[];
  parceriasData: Map<string, ParceriaStatus>;
}

async function fetchParceirosData(workspaceId: string): Promise<ParceirosQueryData> {
  // Fetch parceiros + ROI data + saldos + parcerias in parallel
  const [parceirosResult, bookmakersResult, resultadosResult, saldosFiatResult, saldosCryptoResult, parceriasResult, pagamentosResult] = await Promise.all([
    supabase.from("parceiros").select("*, contas_bancarias(*), wallets_crypto(*)").eq("is_caixa_operacional", false).order("created_at", { ascending: false }).limit(10000),
    supabase.from("bookmakers").select("id, parceiro_id, saldo_atual, moeda, status").limit(10000),
    supabase.from("v_bookmaker_resultado_operacional").select("bookmaker_id, resultado_operacional_total").limit(10000),
    supabase.from("v_saldo_parceiro_contas").select("*").limit(10000),
    supabase.from("v_saldo_parceiro_wallets").select("*").limit(10000),
    supabase.from("parcerias").select("id, parceiro_id, data_fim_prevista, custo_aquisicao_isento, valor_parceiro").in("status", ["ATIVA", "EM_ENCERRAMENTO"]).limit(10000),
    supabase.from("movimentacoes_indicacao").select("parceria_id").eq("workspace_id", workspaceId).eq("tipo", "PAGTO_PARCEIRO").eq("status", "CONFIRMADO").limit(10000),
  ]);

  if (parceirosResult.error) throw parceirosResult.error;
  if (bookmakersResult.error) throw bookmakersResult.error;
  if (saldosFiatResult.error) console.warn("[useParceirosData] Erro ao buscar saldos FIAT:", saldosFiatResult.error);
  if (saldosCryptoResult.error) console.warn("[useParceirosData] Erro ao buscar saldos crypto:", saldosCryptoResult.error);

  const parceiros = parceirosResult.data || [];

  // Build ROI map
  const resultadoMap = new Map<string, number>();
  (resultadosResult.data || []).forEach((r: any) => {
    resultadoMap.set(r.bookmaker_id, Number(r.resultado_operacional_total) || 0);
  });

  const roiMap = new Map<string, ParceiroROI>();
  const parceiroAggregates = new Map<string, { count: number; countLimitadas: number; saldo: SaldosPorMoeda; resultado: SaldosPorMoeda }>();

  (bookmakersResult.data || []).forEach((bm: any) => {
    if (!bm.parceiro_id) return;
    const current = parceiroAggregates.get(bm.parceiro_id) || { count: 0, countLimitadas: 0, saldo: createEmptySaldos(), resultado: createEmptySaldos() };
    if (bm.status === "ativo") current.count += 1;
    else if (bm.status === "limitada") current.countLimitadas += 1;
    const moedaNativa = bm.moeda || "BRL";
    current.saldo[moedaNativa] = (current.saldo[moedaNativa] || 0) + (Number(bm.saldo_atual) || 0);
    current.resultado[moedaNativa] = (current.resultado[moedaNativa] || 0) + (resultadoMap.get(bm.id) || 0);
    parceiroAggregates.set(bm.parceiro_id, current);
  });

  parceiroAggregates.forEach((aggregates, parceiroId) => {
    const moedasUtilizadas = SUPPORTED_FIAT.filter(m => (aggregates.saldo[m] || 0) !== 0 || (aggregates.resultado[m] || 0) !== 0);
    roiMap.set(parceiroId, {
      parceiro_id: parceiroId,
      depositado_por_moeda: createEmptySaldos(),
      sacado_por_moeda: createEmptySaldos(),
      saldo_por_moeda: aggregates.saldo,
      resultado_por_moeda: aggregates.resultado,
      moedas_utilizadas: moedasUtilizadas,
      roi_percentual: 0,
      num_bookmakers: aggregates.count,
      num_bookmakers_limitadas: aggregates.countLimitadas,
    });
  });

  // Build saldos map
  const saldosMap = new Map<string, SaldoParceiro>();
  (saldosFiatResult.data || []).forEach((saldo: any) => {
    if (!saldo.parceiro_id) return;
    const current = saldosMap.get(saldo.parceiro_id) || { parceiro_id: saldo.parceiro_id, saldo_fiat: 0, saldo_crypto_usd: 0 };
    current.saldo_fiat += Number(saldo.saldo || 0);
    saldosMap.set(saldo.parceiro_id, current);
  });

  const cryptoRaw: SaldoCryptoRaw[] = (saldosCryptoResult.data || [])
    .filter((s: any) => s.parceiro_id && s.saldo_coin > 0)
    .map((s: any) => ({ parceiro_id: s.parceiro_id, coin: s.coin, saldo_coin: Number(s.saldo_coin || 0), saldo_usd: Number(s.saldo_usd || 0) }));

  cryptoRaw.forEach(saldo => {
    const current = saldosMap.get(saldo.parceiro_id) || { parceiro_id: saldo.parceiro_id, saldo_fiat: 0, saldo_crypto_usd: 0 };
    current.saldo_crypto_usd += saldo.saldo_usd;
    saldosMap.set(saldo.parceiro_id, current);
  });

  // Build parcerias status
  const pagamentosSet = new Set((pagamentosResult.data || []).map((p: any) => p.parceria_id));
  const parceriasMap = new Map<string, ParceriaStatus>();

  (parceriasResult.data || []).forEach((parceria: any) => {
    if (!parceria.parceiro_id || !parceria.data_fim_prevista) return;
    const dataFim = new Date(parceria.data_fim_prevista);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataFim.setHours(0, 0, 0, 0);
    const diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    const valorParceiro = Number(parceria.valor_parceiro) || 0;
    const isGratuita = parceria.custo_aquisicao_isento === true || valorParceiro <= 0;

    parceriasMap.set(parceria.parceiro_id, {
      parceiro_id: parceria.parceiro_id,
      dias_restantes: diasRestantes,
      pagamento_parceiro_realizado: isGratuita || pagamentosSet.has(parceria.id),
    });
  });

  return { parceiros, roiData: roiMap, saldosData: saldosMap, saldosCryptoRaw: cryptoRaw, parceriasData: parceriasMap };
}

const EMPTY: ParceirosQueryData = {
  parceiros: [],
  roiData: new Map(),
  saldosData: new Map(),
  saldosCryptoRaw: [],
  parceriasData: new Map(),
};

export function useParceirosData() {
  const { workspaceId } = useTabWorkspace();

  const query = useQuery({
    queryKey: ["parceiros-data", workspaceId],
    queryFn: () => fetchParceirosData(workspaceId!),
    enabled: !!workspaceId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  return {
    ...(query.data ?? EMPTY),
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
