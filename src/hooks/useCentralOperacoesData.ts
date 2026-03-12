import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";

/**
 * Hook que centraliza toda a busca de dados da CentralOperacoes.
 * 
 * ANTES: fetchData() com 17+ queries via useState/useEffect sem cache
 * DEPOIS: useQuery com cache de 5min, deduplicação, staleTime
 */

// Re-export types for consumers
export interface CasaPendenteConciliacao {
  bookmaker_id: string;
  bookmaker_nome: string;
  bookmaker_logo_url: string | null;
  moeda: string;
  saldo_atual: number;
  projeto_id: string | null;
  projeto_nome: string | null;
  parceiro_nome: string | null;
  qtd_transacoes_pendentes: number;
  valor_total_pendente: number;
}

export interface Alerta {
  tipo_alerta: string;
  entidade_tipo: string;
  entidade_id: string;
  user_id: string;
  titulo: string;
  descricao: string;
  valor: number | null;
  moeda: string;
  nivel_urgencia: string;
  ordem_urgencia: number;
  data_limite: string | null;
  created_at: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  status_anterior: string | null;
}

export interface EntregaPendente {
  id: string;
  numero_entrega: number;
  resultado_nominal: number;
  saldo_inicial: number;
  meta_valor: number | null;
  meta_percentual: number | null;
  tipo_gatilho: string;
  data_inicio: string;
  data_fim_prevista: string | null;
  status_conciliacao: string;
  nivel_urgencia: string;
  operador_nome: string;
  projeto_nome: string;
  modelo_pagamento: string;
  valor_fixo: number | null;
  percentual: number | null;
  operador_projeto_id: string;
  operador_id: string;
  projeto_id: string;
}

export interface PagamentoParceiroPendente {
  parceriaId: string;
  parceiroNome: string;
  valorParceiro: number;
  origemTipo: string;
  diasRestantes: number;
  parceiroId: string;
  workspaceId: string;
}

export interface PagamentoFornecedorPendente {
  parceriaId: string;
  parceiroNome: string;
  fornecedorNome: string;
  fornecedorId: string;
  valorFornecedor: number;
  valorPago: number;
  valorRestante: number;
  diasRestantes: number;
  workspaceId: string;
}

export interface BonusPendente {
  indicadorId: string;
  indicadorNome: string;
  valorBonus: number;
  qtdParceiros: number;
  meta: number;
  ciclosPendentes: number;
  totalBonusPendente: number;
}

export interface ComissaoPendente {
  parceriaId: string;
  parceiroNome: string;
  indicadorId: string;
  indicadorNome: string;
  valorComissao: number;
}

export interface PagamentoOperadorPendente {
  id: string;
  operador_id: string;
  operador_nome: string;
  tipo_pagamento: string;
  valor: number;
  data_pagamento: string;
  projeto_id?: string | null;
  projeto_nome?: string | null;
}

export interface ParceriaAlertaEncerramento {
  id: string;
  parceiro_id: string;
  parceiroNome: string;
  diasRestantes: number;
  dataFim: string;
  dataInicio: string;
  duracaoDias: number;
  valor_parceiro: number;
  valor_indicador: number;
  valor_fornecedor: number;
  origem_tipo: string;
  fornecedor_id: string | null;
  indicacao_id: string | null;
  elegivel_renovacao: boolean;
  observacoes: string | null;
  status: string;
}

export interface ParceiroSemParceria {
  id: string;
  nome: string;
  cpf: string;
  createdAt: string;
}

export interface SaquePendenteConfirmacao {
  id: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  destino_wallet_id: string | null;
  bookmaker_nome?: string;
  parceiro_nome?: string;
  banco_nome?: string;
  wallet_nome?: string;
  projeto_nome?: string;
  coin?: string;
  qtd_coin?: number;
  cotacao_original?: number;
  moeda_origem?: string;
  moeda_destino?: string;
  valor_origem?: number;
  valor_destino?: number;
  cotacao?: number;
  wallet_network?: string;
  wallet_exchange?: string;
  wallet_moedas?: string[];
  projeto_id_snapshot?: string | null;
}

export interface AlertaLucroParceiro {
  id: string;
  parceiro_id: string;
  parceiro_nome: string;
  marco_valor: number;
  lucro_atual: number;
  data_atingido: string;
}

export interface ParticipacaoPendente {
  id: string;
  projeto_id: string;
  ciclo_id: string;
  investidor_id: string;
  percentual_aplicado: number;
  base_calculo: string;
  lucro_base: number;
  valor_participacao: number;
  data_apuracao: string;
  investidor_nome?: string;
  projeto_nome?: string;
  ciclo_numero?: number;
}

export interface BookmakerDesvinculado {
  id: string;
  nome: string;
  status: string;
  saldo_atual: number;
  saldo_usd: number;
  saldo_freebet: number;
  moeda: string;
  workspace_id: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_efetivo: number;
  saldo_total: number;
}

export interface CentralOperacoesData {
  alertas: Alerta[];
  entregasPendentes: EntregaPendente[];
  pagamentosParceiros: PagamentoParceiroPendente[];
  pagamentosFornecedores: PagamentoFornecedorPendente[];
  bonusPendentes: BonusPendente[];
  comissoesPendentes: ComissaoPendente[];
  parceriasEncerramento: ParceriaAlertaEncerramento[];
  parceirosSemParceria: ParceiroSemParceria[];
  saquesPendentes: SaquePendenteConfirmacao[];
  alertasLucro: AlertaLucroParceiro[];
  pagamentosOperadorPendentes: PagamentoOperadorPendente[];
  participacoesPendentes: ParticipacaoPendente[];
  casasDesvinculadas: BookmakerDesvinculado[];
  casasPendentesConciliacao: CasaPendenteConciliacao[];
  propostasPagamentoCount: number;
}

const EMPTY_DATA: CentralOperacoesData = {
  alertas: [],
  entregasPendentes: [],
  pagamentosParceiros: [],
  pagamentosFornecedores: [],
  bonusPendentes: [],
  comissoesPendentes: [],
  parceriasEncerramento: [],
  parceirosSemParceria: [],
  saquesPendentes: [],
  alertasLucro: [],
  pagamentosOperadorPendentes: [],
  participacoesPendentes: [],
  casasDesvinculadas: [],
  casasPendentesConciliacao: [],
  propostasPagamentoCount: 0,
};

type EventDomain = 'project_event' | 'financial_event' | 'partner_event' | 'admin_event';

const ROLE_VISIBILITY: Record<string, EventDomain[]> = {
  owner: ['project_event', 'financial_event', 'partner_event', 'admin_event'],
  admin: ['project_event', 'financial_event', 'partner_event', 'admin_event'],
  finance: ['project_event', 'financial_event', 'partner_event'],
  operator: ['project_event'],
  viewer: [],
};

async function fetchCentralData(params: {
  userId: string;
  workspaceId: string;
  role: string;
  isOperator: boolean;
  allowedDomains: EventDomain[];
}): Promise<CentralOperacoesData> {
  const { userId, workspaceId, role, isOperator, allowedDomains } = params;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Operator project filtering
  let operatorProjectIds: string[] = [];
  let operadorId: string | null = null;

  if (isOperator) {
    const { data: operadorData } = await supabase
      .from("operadores")
      .select("id")
      .eq("auth_user_id", userId)
      .single();

    if (operadorData) {
      operadorId = operadorData.id;
      const { data: vinculos } = await supabase
        .from("operador_projetos")
        .select("projeto_id")
        .eq("operador_id", operadorData.id)
        .eq("status", "ATIVO");
      operatorProjectIds = (vinculos || []).map((v: any) => v.projeto_id);
    }
  }

  const canSeeFinancialData = allowedDomains.includes('financial_event');
  const canSeePartnerData = allowedDomains.includes('partner_event');

  // All parallel queries
  const [
    alertasResult, entregasResult, parceirosResult, movimentacoesResult,
    encerResult, todosParceirosResult, todasParceriasResult,
    saquesPendentesResult, alertasLucroResult, custosResult,
    acordosResult, comissoesResult, indicacoesResult, indicadoresResult,
    pagamentosOperadorResult, fornecedoresParceriasResult, fornecedoresNomesResult,
  ] = await Promise.all([
    canSeeFinancialData ? supabase.from("v_painel_operacional").select("*") : Promise.resolve({ data: [], error: null }),
    supabase.from("v_entregas_pendentes").select("*").in("status_conciliacao", ["PRONTA"]),
    canSeePartnerData ? supabase.from("parcerias").select("id, parceiro_id, valor_parceiro, origem_tipo, data_fim_prevista, custo_aquisicao_isento, workspace_id, parceiro:parceiros(nome)").in("status", ["ATIVA", "EM_ENCERRAMENTO"]).or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false").gt("valor_parceiro", 0).eq("pagamento_dispensado", false) : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("movimentacoes_indicacao").select("parceria_id, tipo, status, indicador_id, valor") : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("parcerias").select("id, parceiro_id, data_inicio, data_fim_prevista, duracao_dias, valor_parceiro, valor_indicador, valor_fornecedor, origem_tipo, fornecedor_id, indicacao_id, elegivel_renovacao, observacoes, status, parceiro:parceiros(nome)").in("status", ["ATIVA", "EM_ENCERRAMENTO"]).not("data_fim_prevista", "is", null) : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("parceiros").select("id, nome, cpf, created_at").eq("status", "ativo") : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("parcerias").select("parceiro_id").in("status", ["ATIVA", "EM_ENCERRAMENTO"]) : Promise.resolve({ data: [], error: null }),
    canSeeFinancialData ? supabase.from("cash_ledger").select("id, valor, moeda, data_transacao, descricao, origem_bookmaker_id, destino_parceiro_id, destino_conta_bancaria_id, destino_wallet_id, coin, qtd_coin, cotacao, moeda_origem, moeda_destino, valor_origem, valor_destino, projeto_id_snapshot").eq("tipo_transacao", "SAQUE").eq("status", "PENDENTE").order("data_transacao", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("parceiro_lucro_alertas").select("id, parceiro_id, marco_valor, lucro_atual, data_atingido, parceiro:parceiros(nome)").eq("notificado", false).order("data_atingido", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("v_custos_aquisicao").select("*") : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("indicador_acordos").select("*").eq("ativo", true) : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("parcerias").select("id, valor_comissao_indicador, comissao_paga, parceiro_id, parceiro:parceiros(nome)").eq("comissao_paga", false).not("valor_comissao_indicador", "is", null).gt("valor_comissao_indicador", 0) : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("indicacoes").select("parceiro_id, indicador_id") : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("indicadores_referral").select("id, nome") : Promise.resolve({ data: [], error: null }),
    supabase.from("pagamentos_operador").select("id, operador_id, tipo_pagamento, valor, data_pagamento, projeto_id, operador:operadores(nome), projeto:projetos(nome)").eq("status", "PENDENTE").order("data_pagamento", { ascending: false }),
    canSeePartnerData ? supabase.from("parcerias").select("id, parceiro_id, fornecedor_id, valor_fornecedor, data_fim_prevista, workspace_id, parceiro:parceiros(nome)").in("status", ["ATIVA", "EM_ENCERRAMENTO"]).eq("origem_tipo", "FORNECEDOR").gt("valor_fornecedor", 0).eq("pagamento_dispensado", false) : Promise.resolve({ data: [], error: null }),
    canSeePartnerData ? supabase.from("fornecedores").select("id, nome") : Promise.resolve({ data: [], error: null }),
  ]);

  const result: CentralOperacoesData = { ...EMPTY_DATA };

  // Alertas
  if (!alertasResult.error) result.alertas = alertasResult.data || [];

  // Entregas (filtered for operators)
  if (!entregasResult.error) {
    let entregasData = entregasResult.data || [];
    if (isOperator && operatorProjectIds.length > 0) {
      entregasData = entregasData.filter((e: any) => operatorProjectIds.includes(e.projeto_id));
    } else if (isOperator) {
      entregasData = [];
    }
    result.entregasPendentes = entregasData as EntregaPendente[];
  }

  // Alertas lucro
  if (!alertasLucroResult.error && alertasLucroResult.data) {
    result.alertasLucro = alertasLucroResult.data.map((a: any) => ({
      id: a.id, parceiro_id: a.parceiro_id, parceiro_nome: a.parceiro?.nome || "Parceiro",
      marco_valor: a.marco_valor, lucro_atual: a.lucro_atual, data_atingido: a.data_atingido,
    }));
  }

  // Pagamentos parceiros
  if (!parceirosResult.error && !movimentacoesResult.error) {
    const parceriasPagas = (movimentacoesResult.data || [])
      .filter((m: any) => m.tipo === "PAGTO_PARCEIRO" && m.status === "CONFIRMADO")
      .map((m: any) => m.parceria_id);
    result.pagamentosParceiros = (parceirosResult.data || [])
      .filter((p: any) => !parceriasPagas.includes(p.id))
      .map((p: any) => {
        const dataFim = p.data_fim_prevista ? new Date(p.data_fim_prevista) : null;
        let diasRestantes = 999;
        if (dataFim) { dataFim.setHours(0, 0, 0, 0); diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)); }
        return { parceriaId: p.id, parceiroNome: p.parceiro?.nome || "N/A", valorParceiro: p.valor_parceiro, origemTipo: p.origem_tipo || "INDICADOR", diasRestantes, parceiroId: p.parceiro_id, workspaceId: p.workspace_id };
      });
  }

  // Pagamentos fornecedores
  if (!fornecedoresParceriasResult.error && !movimentacoesResult.error) {
    const fornecedoresMap = new Map((fornecedoresNomesResult.data || []).map((f: any) => [f.id, f.nome]));
    const pagamentosPorParceria = new Map<string, number>();
    (movimentacoesResult.data || [])
      .filter((m: any) => m.tipo === "PAGTO_FORNECEDOR" && m.status === "CONFIRMADO")
      .forEach((m: any) => { pagamentosPorParceria.set(m.parceria_id, (pagamentosPorParceria.get(m.parceria_id) || 0) + (m.valor || 0)); });
    result.pagamentosFornecedores = (fornecedoresParceriasResult.data || [])
      .map((p: any) => {
        const dataFim = p.data_fim_prevista ? new Date(p.data_fim_prevista) : null;
        let diasRestantes = 999;
        if (dataFim) { dataFim.setHours(0, 0, 0, 0); diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)); }
        const valorTotal = p.valor_fornecedor || 0;
        const valorPago = pagamentosPorParceria.get(p.id) || 0;
        return { parceriaId: p.id, parceiroNome: p.parceiro?.nome || "N/A", fornecedorNome: fornecedoresMap.get(p.fornecedor_id) || "Fornecedor", fornecedorId: p.fornecedor_id, valorFornecedor: valorTotal, valorPago, valorRestante: Math.max(0, valorTotal - valorPago), diasRestantes, workspaceId: p.workspace_id };
      })
      .filter((p) => p.valorRestante > 0);
  }

  // Bonus pendentes
  if (custosResult.data && acordosResult.data && movimentacoesResult.data) {
    const indicadorStats: Record<string, { nome: string; qtd: number }> = {};
    custosResult.data.forEach((c: any) => { if (c.indicador_id && c.indicador_nome) { if (!indicadorStats[c.indicador_id]) indicadorStats[c.indicador_id] = { nome: c.indicador_nome, qtd: 0 }; indicadorStats[c.indicador_id].qtd += 1; } });
    const bonusPagosPorIndicador: Record<string, number> = {};
    (movimentacoesResult.data || []).filter((m: any) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO").forEach((m: any) => { if (m.indicador_id) bonusPagosPorIndicador[m.indicador_id] = (bonusPagosPorIndicador[m.indicador_id] || 0) + 1; });
    const pendentes: BonusPendente[] = [];
    acordosResult.data.forEach((acordo: any) => {
      const stats = indicadorStats[acordo.indicador_id];
      if (stats && acordo.meta_parceiros > 0) {
        const ciclosCompletos = Math.floor(stats.qtd / acordo.meta_parceiros);
        const ciclosPendentes = ciclosCompletos - (bonusPagosPorIndicador[acordo.indicador_id] || 0);
        if (ciclosPendentes > 0) pendentes.push({ indicadorId: acordo.indicador_id, indicadorNome: stats.nome, valorBonus: acordo.valor_bonus || 0, qtdParceiros: stats.qtd, meta: acordo.meta_parceiros, ciclosPendentes, totalBonusPendente: (acordo.valor_bonus || 0) * ciclosPendentes });
      }
    });
    result.bonusPendentes = pendentes;
  }

  // Comissões pendentes
  if (comissoesResult.data && indicacoesResult.data && indicadoresResult.data) {
    const indicadoresMap: Record<string, { id: string; nome: string }> = {};
    indicadoresResult.data.forEach((ind: any) => { if (ind.id) indicadoresMap[ind.id] = { id: ind.id, nome: ind.nome }; });
    const parceiroIndicadorMap: Record<string, { id: string; nome: string }> = {};
    indicacoesResult.data.forEach((ind: any) => { if (ind.parceiro_id && ind.indicador_id && indicadoresMap[ind.indicador_id]) parceiroIndicadorMap[ind.parceiro_id] = indicadoresMap[ind.indicador_id]; });
    result.comissoesPendentes = comissoesResult.data
      .filter((p: any) => p.parceiro_id && parceiroIndicadorMap[p.parceiro_id])
      .map((p: any) => { const ind = parceiroIndicadorMap[p.parceiro_id]; return { parceriaId: p.id, parceiroNome: p.parceiro?.nome || "N/A", indicadorId: ind.id, indicadorNome: ind.nome, valorComissao: p.valor_comissao_indicador || 0 }; });
  }

  // Parcerias encerrando
  if (!encerResult.error) {
    result.parceriasEncerramento = (encerResult.data || [])
      .map((p: any) => { const dataFim = new Date(p.data_fim_prevista); dataFim.setHours(0, 0, 0, 0); return { id: p.id, parceiro_id: p.parceiro_id, parceiroNome: p.parceiro?.nome || "N/A", diasRestantes: Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)), dataFim: p.data_fim_prevista, dataInicio: p.data_inicio, duracaoDias: p.duracao_dias, valor_parceiro: p.valor_parceiro || 0, valor_indicador: p.valor_indicador || 0, valor_fornecedor: p.valor_fornecedor || 0, origem_tipo: p.origem_tipo || "DIRETO", fornecedor_id: p.fornecedor_id, indicacao_id: p.indicacao_id, elegivel_renovacao: p.elegivel_renovacao ?? true, observacoes: p.observacoes, status: p.status }; })
      .filter((p) => p.diasRestantes <= 7)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }

  // Parceiros sem parceria
  if (!todosParceirosResult.error && !todasParceriasResult.error) {
    const parceirosComParceria = new Set((todasParceriasResult.data || []).map((p: any) => p.parceiro_id));
    result.parceirosSemParceria = (todosParceirosResult.data || [])
      .filter((p: any) => !parceirosComParceria.has(p.id))
      .map((p: any) => ({ id: p.id, nome: p.nome, cpf: p.cpf, createdAt: p.created_at }));
  }

  // Saques pendentes (enriched with bookmaker/parceiro names)
  if (!saquesPendentesResult.error && saquesPendentesResult.data && saquesPendentesResult.data.length > 0) {
    const bookmakersIds = saquesPendentesResult.data.map((s: any) => s.origem_bookmaker_id).filter(Boolean);
    const parceirosIds = saquesPendentesResult.data.map((s: any) => s.destino_parceiro_id).filter(Boolean);
    const contasIds = saquesPendentesResult.data.map((s: any) => s.destino_conta_bancaria_id).filter(Boolean);
    const walletsIds = saquesPendentesResult.data.map((s: any) => s.destino_wallet_id).filter(Boolean);

    const [bookmakersData, parceirosNomes, contasNomes, walletsNomes] = await Promise.all([
      bookmakersIds.length > 0 ? supabase.from("bookmakers").select("id, nome, projeto_id").in("id", bookmakersIds) : Promise.resolve({ data: [] }),
      parceirosIds.length > 0 ? supabase.from("parceiros").select("id, nome").in("id", parceirosIds) : Promise.resolve({ data: [] }),
      contasIds.length > 0 ? supabase.from("contas_bancarias").select("id, banco, titular").in("id", contasIds) : Promise.resolve({ data: [] }),
      walletsIds.length > 0 ? supabase.from("wallets_crypto").select("id, exchange, moeda, network").in("id", walletsIds) : Promise.resolve({ data: [] }),
    ]);

    const projetosIds = (bookmakersData.data || []).map((b: any) => b.projeto_id).filter(Boolean);
    const projetosNomes = projetosIds.length > 0 ? await supabase.from("projetos").select("id, nome").in("id", projetosIds) : { data: [] };

    const bookmakersMap = Object.fromEntries((bookmakersData.data || []).map((b: any) => [b.id, { nome: b.nome, projeto_id: b.projeto_id }]));
    const projetosMap = Object.fromEntries((projetosNomes.data || []).map((p: any) => [p.id, p.nome]));
    const parceirosMap = Object.fromEntries((parceirosNomes.data || []).map((p: any) => [p.id, p.nome]));
    const contasMap = Object.fromEntries((contasNomes.data || []).map((c: any) => [c.id, c.banco || "Conta Bancária"]));
    const walletsDataMap = Object.fromEntries(
      (walletsNomes.data || []).map((w: any) => {
        const moedas = Array.isArray(w.moeda) ? w.moeda : [];
        const exchange = w.exchange ? String(w.exchange).replace(/-/g, " ").toUpperCase() : "WALLET";
        const label = moedas.length > 0 ? `${exchange} (${moedas.join(", ")})` : exchange;
        return [w.id, { label, network: w.network, exchange, moedas }];
      })
    );

    result.saquesPendentes = saquesPendentesResult.data.map((s: any) => {
      const bkData = bookmakersMap[s.origem_bookmaker_id] || { nome: "Bookmaker", projeto_id: null };
      const walletData = s.destino_wallet_id ? walletsDataMap[s.destino_wallet_id] : null;
      return {
        ...s, bookmaker_nome: bkData.nome, parceiro_nome: parceirosMap[s.destino_parceiro_id] || "",
        banco_nome: s.destino_conta_bancaria_id ? contasMap[s.destino_conta_bancaria_id] : undefined,
        wallet_nome: walletData?.label, projeto_nome: bkData.projeto_id ? projetosMap[bkData.projeto_id] : undefined,
        coin: s.coin || undefined, qtd_coin: s.qtd_coin || undefined, cotacao_original: s.cotacao || undefined,
        moeda_origem: s.moeda_origem || undefined, valor_origem: s.valor_origem || undefined, moeda_destino: s.moeda_destino || undefined,
        valor_destino: s.valor_destino || undefined, cotacao_snapshot: s.cotacao_snapshot || s.cotacao || undefined,
        wallet_network: walletData?.network, wallet_exchange: walletData?.exchange, wallet_moedas: walletData?.moedas,
      };
    });
  }

  // Pagamentos operador
  if (!pagamentosOperadorResult.error && pagamentosOperadorResult.data) {
    let pagamentosOp = pagamentosOperadorResult.data.map((p: any) => ({
      id: p.id, operador_id: p.operador_id, operador_nome: p.operador?.nome || "N/A",
      tipo_pagamento: p.tipo_pagamento, valor: p.valor, data_pagamento: p.data_pagamento,
      projeto_id: p.projeto_id || null, projeto_nome: p.projeto?.nome || null,
    }));
    if (isOperator && operadorId) {
      pagamentosOp = pagamentosOp.filter(p => p.operador_id === operadorId);
    }
    result.pagamentosOperadorPendentes = pagamentosOp;
  }

  // Financial-only data
  if (canSeeFinancialData) {
    const [participacoesResult, casasResult, conciliacaoResult] = await Promise.all([
      supabase.from("participacao_ciclos").select("id, projeto_id, ciclo_id, investidor_id, percentual_aplicado, base_calculo, lucro_base, valor_participacao, data_apuracao, investidor:investidores(nome), projeto:projetos(nome), ciclo:projeto_ciclos(numero_ciclo)").eq("status", "A_PAGAR"),
      supabase.from("v_bookmakers_desvinculados").select("*"),
      supabase.rpc("get_bookmakers_pendentes_conciliacao", { p_workspace_id: workspaceId }),
    ]);

    if (!participacoesResult.error && participacoesResult.data) {
      result.participacoesPendentes = participacoesResult.data.map((p: any) => ({
        id: p.id, projeto_id: p.projeto_id, ciclo_id: p.ciclo_id, investidor_id: p.investidor_id,
        percentual_aplicado: p.percentual_aplicado, base_calculo: p.base_calculo, lucro_base: p.lucro_base,
        valor_participacao: p.valor_participacao, data_apuracao: p.data_apuracao,
        investidor_nome: p.investidor?.nome || "N/A", projeto_nome: p.projeto?.nome || "N/A",
        ciclo_numero: p.ciclo?.numero_ciclo || 0,
      }));
    }

    if (!casasResult.error && casasResult.data) {
      result.casasDesvinculadas = casasResult.data as BookmakerDesvinculado[];
    }

    if (!conciliacaoResult.error && conciliacaoResult.data) {
      result.casasPendentesConciliacao = conciliacaoResult.data as CasaPendenteConciliacao[];
    }
  }

  // Propostas count
  const propostasResult = await supabase.from("pagamentos_propostos").select("id", { count: "exact", head: true }).eq("status", "PENDENTE");
  result.propostasPagamentoCount = propostasResult.count || 0;

  return result;
}

export function useCentralOperacoesData() {
  const { user, workspaceId } = useAuth();
  const { role, isOperator } = useRole();

  const allowedDomains = ROLE_VISIBILITY[role || 'viewer'] || [];

  const query = useQuery({
    queryKey: ["central-operacoes-data", workspaceId, role],
    queryFn: () => fetchCentralData({
      userId: user!.id,
      workspaceId: workspaceId!,
      role: role || 'viewer',
      isOperator,
      allowedDomains,
    }),
    enabled: !!user && !!workspaceId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  return {
    data: query.data ?? EMPTY_DATA,
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    refetch: query.refetch,
    allowedDomains,
  };
}

export { ROLE_VISIBILITY };
export type { EventDomain };
