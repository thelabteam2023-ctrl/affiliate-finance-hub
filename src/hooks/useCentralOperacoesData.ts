import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";

/**
 * Hook que centraliza toda a busca de dados da CentralOperacoes.
 * 
 * ANTES: 17+ queries paralelas via Promise.all
 * DEPOIS: 1 RPC consolidada server-side (get_central_operacoes_data)
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
  bookmaker_logo_url: string | null;
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
  bookmaker_logo_url?: string | null;
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
   valor_usd?: number;
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

function enrichSaques(rawSaques: any[]): SaquePendenteConfirmacao[] {
  return rawSaques.map((s: any) => {
    const exchange = s.wallet_exchange
      ? String(s.wallet_exchange).replace(/-/g, " ").toUpperCase()
      : "WALLET";
    const moedas = Array.isArray(s.wallet_moedas) ? s.wallet_moedas : [];
    const walletLabel = s.destino_wallet_id
      ? moedas.length > 0 ? `${exchange} (${moedas.join(", ")})` : exchange
      : undefined;

    return {
      ...s,
      bookmaker_nome: s.bookmaker_nome || "Bookmaker",
      bookmaker_logo_url: s.bookmaker_logo_url || null,
      parceiro_nome: s.parceiro_nome || "",
      banco_nome: s.destino_conta_bancaria_id ? (s.banco_nome || "Conta Bancária") : undefined,
      wallet_nome: walletLabel,
      cotacao_original: s.cotacao || undefined,
    };
  });
}

async function fetchCentralData(params: {
  userId: string;
  workspaceId: string;
  role: string;
  isOperator: boolean;
  allowedDomains: EventDomain[];
}): Promise<CentralOperacoesData> {
  const { userId, workspaceId, isOperator, allowedDomains } = params;

  const canSeeFinancialData = allowedDomains.includes('financial_event');
  const canSeePartnerData = allowedDomains.includes('partner_event');

  const { data, error } = await (supabase.rpc as any)('get_central_operacoes_data', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_is_operator: isOperator,
    p_include_financial: canSeeFinancialData,
    p_include_partner: canSeePartnerData,
  });

  if (error) {
    console.error('Error fetching central operacoes data:', error);
    return EMPTY_DATA;
  }

  const d = data as Record<string, any>;

  return {
    alertas: d.alertas || [],
    entregasPendentes: d.entregas_pendentes || [],
    pagamentosParceiros: d.pagamentos_parceiros || [],
    pagamentosFornecedores: d.pagamentos_fornecedores || [],
    bonusPendentes: d.bonus_pendentes || [],
    comissoesPendentes: d.comissoes_pendentes || [],
    parceriasEncerramento: d.parcerias_encerramento || [],
    parceirosSemParceria: d.parceiros_sem_parceria || [],
    saquesPendentes: enrichSaques(d.saques_pendentes || []),
    alertasLucro: d.alertas_lucro || [],
    pagamentosOperadorPendentes: d.pagamentos_operador || [],
    participacoesPendentes: d.participacoes || [],
    casasDesvinculadas: d.casas_desvinculadas || [],
    casasPendentesConciliacao: d.casas_conciliacao || [],
    propostasPagamentoCount: d.propostas_count || 0,
  };
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
