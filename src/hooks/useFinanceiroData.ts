import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";

/**
 * Hook que encapsula TODAS as queries da página Financeiro em um único useQuery.
 * 
 * ANTES: 20 queries via useState/useEffect sem cache
 * DEPOIS: 1 useQuery com cache, deduplicação e staleTime
 * 
 * As 20 sub-queries são executadas em parallel via Promise.all internamente,
 * mas o React Query garante que não serão re-executadas enquanto o cache for válido.
 */

export interface FinanceiroData {
  caixaFiat: Array<{ moeda: string; saldo: number }>;
  caixaCrypto: Array<{ coin: string; saldo_coin: number; saldo_usd: number }>;
  despesas: any[];
  custos: any[];
  cashLedger: any[];
  despesasAdmin: any[];
  despesasAdminPendentes: any[];
  pagamentosOperador: any[];
  pagamentosOperadorPendentes: any[];
  movimentacoesIndicacao: any[];
  bookmakersSaldos: any[];
  bookmakersDetalhados: any[];
  apostasHistorico: any[];
  totalParceirosAtivos: number;
  contasParceiros: any[];
  contasDetalhadas: any[];
  walletsParceiros: any[];
  walletsDetalhadas: any[];
  participacoesPagas: any[];
  parceirosPendentes: { valorTotal: number; count: number };
  comissoesPendentes: { valorTotal: number; count: number };
  bonusPendentes: { valorTotal: number; count: number };
}

async function fetchFinanceiroData(workspaceId: string): Promise<FinanceiroData> {
  // STEP 1: Identify Caixa Operacional partner
  const { data: caixaParceiro } = await supabase
    .from("parceiros")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_caixa_operacional", true)
    .maybeSingle();

  const caixaParceiroId = caixaParceiro?.id || null;

  const [
    allMovIndicacaoResult,
    custosResult,
    ledgerResult,
    despesasAdminResult,
    despesasAdminPendentesResult,
    pagamentosOpResult,
    pagamentosOpPendentesResult,
    bookmakersResult,
    bookmakersDetalhadosResult,
    parceirosAtivosResult,
    parceriasParceiroResult,
    parceriasComissaoResult,
    acordosIndicadorResult,
    allContasSaldoResult,
    allWalletsSaldoResult,
    contasDetalhadasResult,
    walletsDetalhadasResult,
    participacoesResult,
    apostasHistoricoResult,
  ] = await Promise.all([
    // UNIFICADA: Uma única query com workspace_id (substitui Q1+Q2 que eram 2 full scans)
    supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao, parceria_id, indicador_id, status, indicadores_referral(nome)").eq("workspace_id", workspaceId).limit(10000),
    supabase.from("v_custos_aquisicao").select("custo_total, valor_indicador, valor_parceiro, valor_fornecedor, data_inicio, indicador_id, indicador_nome").limit(10000),
    supabase.from("cash_ledger").select("tipo_transacao, valor, data_transacao, moeda").eq("workspace_id", workspaceId).eq("status", "CONFIRMADO").limit(10000),
    supabase.from("despesas_administrativas").select("*, operadores(nome)").eq("workspace_id", workspaceId).eq("status", "CONFIRMADO").limit(10000),
    supabase.from("despesas_administrativas").select("*, operadores(nome)").eq("workspace_id", workspaceId).eq("status", "PENDENTE").limit(10000),
    supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status, operador_id, operadores(nome)").eq("workspace_id", workspaceId).eq("status", "CONFIRMADO").limit(10000),
    supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status, operador_id, operadores(nome)").eq("workspace_id", workspaceId).eq("status", "PENDENTE").limit(10000),
    supabase.from("bookmakers").select("saldo_atual, saldo_freebet, status, estado_conta, aguardando_saque_at, projeto_id, moeda").eq("workspace_id", workspaceId).in("status", ["ativo", "ATIVO", "EM_USO", "limitada", "LIMITADA", "AGUARDANDO_SAQUE"]).limit(10000),
    supabase.from("bookmakers").select("saldo_atual, projeto_id, moeda, projetos(nome)").eq("workspace_id", workspaceId).in("status", ["ativo", "ATIVO", "EM_USO", "limitada", "LIMITADA", "AGUARDANDO_SAQUE"]).limit(10000),
    supabase.from("parceiros").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "ativo"),
    supabase
      .from("parcerias")
      .select("id, valor_parceiro, origem_tipo, status, custo_aquisicao_isento")
      .eq("workspace_id", workspaceId)
      .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
      .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
      .gt("valor_parceiro", 0)
      .limit(10000),
    supabase
      .from("parcerias")
      .select("id, valor_comissao_indicador, comissao_paga")
      .eq("workspace_id", workspaceId)
      .eq("comissao_paga", false)
      .not("valor_comissao_indicador", "is", null)
      .gt("valor_comissao_indicador", 0)
      .limit(10000),
    supabase
      .from("indicador_acordos")
      .select("indicador_id, meta_parceiros, valor_bonus")
      .eq("workspace_id", workspaceId)
      .eq("ativo", true)
      .limit(10000),
    supabase.from("v_saldo_parceiro_contas").select("parceiro_id, conta_id, saldo, banco, parceiro_nome, moeda").limit(10000),
    supabase.from("v_saldo_parceiro_wallets").select("parceiro_id, wallet_id, coin, saldo_coin, saldo_usd, exchange").limit(10000),
    supabase.from("v_saldo_parceiro_contas").select("saldo, banco, parceiro_nome, moeda, parceiro_id").limit(10000),
    supabase.from("v_saldo_parceiro_wallets").select("saldo_usd, exchange, parceiro_id").limit(10000),
    supabase.from("participacao_ciclos").select("valor_participacao, data_pagamento").eq("workspace_id", workspaceId).eq("status", "PAGO").limit(10000),
    supabase.from("apostas_unificada").select("lucro_prejuizo, data_aposta").eq("workspace_id", workspaceId).not("resultado", "is", null).limit(10000),
  ]);

  // Throw on first error
  const results = [allMovIndicacaoResult, custosResult, ledgerResult, despesasAdminResult, despesasAdminPendentesResult, pagamentosOpResult, pagamentosOpPendentesResult, bookmakersResult];
  for (const r of results) {
    if (r.error) throw r.error;
  }

  // Derive confirmed-only and all movimentacoes from the unified query
  const allMovimentacoesRaw = allMovIndicacaoResult.data || [];
  const confirmedDespesas = allMovimentacoesRaw.filter((m: any) => m.status === "CONFIRMADO");

  const allContas = allContasSaldoResult.data || [];
  const allWallets = allWalletsSaldoResult.data || [];

  // Split contas/wallets into Caixa vs Parceiros
  const caixaFiatMap: Record<string, number> = {};
  allContas.forEach((row: any) => {
    if (caixaParceiroId && row.parceiro_id === caixaParceiroId) {
      const m = row.moeda || "BRL";
      caixaFiatMap[m] = (caixaFiatMap[m] || 0) + (row.saldo || 0);
    }
  });

  const caixaCryptoMap: Record<string, { saldo_coin: number; saldo_usd: number }> = {};
  allWallets.forEach((row: any) => {
    if (caixaParceiroId && row.parceiro_id === caixaParceiroId) {
      const c = row.coin || "USDT";
      if (!caixaCryptoMap[c]) caixaCryptoMap[c] = { saldo_coin: 0, saldo_usd: 0 };
      caixaCryptoMap[c].saldo_coin += (row.saldo_coin || 0);
      caixaCryptoMap[c].saldo_usd += (row.saldo_usd || 0);
    }
  });

  const parceirosContas = allContas.filter((row: any) => !caixaParceiroId || row.parceiro_id !== caixaParceiroId);
  const parceirosWallets = allWallets.filter((row: any) => !caixaParceiroId || row.parceiro_id !== caixaParceiroId);

  // Compromissos pendentes
  const allMovimentacoes = allMovimentacoesRaw;
  const parceriasPagas = allMovimentacoes
    .filter((m: any) => m.tipo === "PAGTO_PARCEIRO" && m.parceria_id)
    .map((m: any) => m.parceria_id);
  const parceirosPendentesCalc = (parceriasParceiroResult.data || [])
    .filter((p: any) => !parceriasPagas.includes(p.id));

  const comissoesPendentesCalc = parceriasComissaoResult.data || [];
  const custosData = custosResult.data || [];
  const acordosData = acordosIndicadorResult.data || [];

  const indicadorStats: Record<string, number> = {};
  custosData.forEach((c: any) => {
    if (c.indicador_id) {
      indicadorStats[c.indicador_id] = (indicadorStats[c.indicador_id] || 0) + 1;
    }
  });

  const bonusPagosPorIndicador: Record<string, number> = {};
  allMovimentacoes
    .filter((m: any) => m.tipo === "BONUS_INDICADOR" && m.indicador_id)
    .forEach((m: any) => {
      bonusPagosPorIndicador[m.indicador_id] = (bonusPagosPorIndicador[m.indicador_id] || 0) + 1;
    });

  let totalBonusPendente = 0;
  let countBonusPendente = 0;
  acordosData.forEach((acordo: any) => {
    const qtdParceiros = indicadorStats[acordo.indicador_id] || 0;
    if (acordo.meta_parceiros && acordo.meta_parceiros > 0) {
      const ciclosCompletos = Math.floor(qtdParceiros / acordo.meta_parceiros);
      const bonusJaPagos = bonusPagosPorIndicador[acordo.indicador_id] || 0;
      const ciclosPendentes = ciclosCompletos - bonusJaPagos;
      if (ciclosPendentes > 0) {
        totalBonusPendente += (acordo.valor_bonus || 0) * ciclosPendentes;
        countBonusPendente += ciclosPendentes;
      }
    }
  });

  return {
    caixaFiat: Object.entries(caixaFiatMap).map(([moeda, saldo]) => ({ moeda, saldo })),
    caixaCrypto: Object.entries(caixaCryptoMap).map(([coin, vals]) => ({ coin, ...vals })),
    despesas: confirmedDespesas,
    custos: custosData,
    cashLedger: ledgerResult.data || [],
    despesasAdmin: despesasAdminResult.data || [],
    despesasAdminPendentes: despesasAdminPendentesResult.data || [],
    pagamentosOperador: pagamentosOpResult.data || [],
    pagamentosOperadorPendentes: pagamentosOpPendentesResult.data || [],
    movimentacoesIndicacao: allMovimentacoesRaw,
    bookmakersSaldos: bookmakersResult.data || [],
    bookmakersDetalhados: bookmakersDetalhadosResult.data || [],
    apostasHistorico: apostasHistoricoResult.data || [],
    totalParceirosAtivos: parceirosAtivosResult.count || 0,
    contasParceiros: parceirosContas,
    contasDetalhadas: (allContasSaldoResult.data || []).map((c: any) => ({
      ...c,
      id: c.conta_id || c.id
    })),
    walletsParceiros: parceirosWallets,
    walletsDetalhadas: (allWalletsSaldoResult.data || []).map((w: any) => ({
      ...w,
      id: w.wallet_id || w.id
    })),
    participacoesPagas: participacoesResult.data || [],
    parceirosPendentes: {
      valorTotal: parceirosPendentesCalc.reduce((acc: number, p: any) => acc + (p.valor_parceiro || 0), 0),
      count: parceirosPendentesCalc.length,
    },
    comissoesPendentes: {
      valorTotal: comissoesPendentesCalc.reduce((acc: number, p: any) => acc + (p.valor_comissao_indicador || 0), 0),
      count: comissoesPendentesCalc.length,
    },
    bonusPendentes: {
      valorTotal: totalBonusPendente,
      count: countBonusPendente,
    },
  };
}

const EMPTY_DATA: FinanceiroData = {
  caixaFiat: [],
  caixaCrypto: [],
  despesas: [],
  custos: [],
  cashLedger: [],
  despesasAdmin: [],
  despesasAdminPendentes: [],
  pagamentosOperador: [],
  pagamentosOperadorPendentes: [],
  movimentacoesIndicacao: [],
  bookmakersSaldos: [],
  bookmakersDetalhados: [],
  apostasHistorico: [],
  totalParceirosAtivos: 0,
  contasParceiros: [],
  contasDetalhadas: [],
  walletsParceiros: [],
  walletsDetalhadas: [],
  participacoesPagas: [],
  parceirosPendentes: { valorTotal: 0, count: 0 },
  comissoesPendentes: { valorTotal: 0, count: 0 },
  bonusPendentes: { valorTotal: 0, count: 0 },
};

export function useFinanceiroData() {
  const { workspaceId } = useTabWorkspace();

  const query = useQuery({
    queryKey: ["financeiro-data", workspaceId],
    queryFn: () => fetchFinanceiroData(workspaceId!),
    enabled: !!workspaceId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  return {
    data: query.data ?? EMPTY_DATA,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
