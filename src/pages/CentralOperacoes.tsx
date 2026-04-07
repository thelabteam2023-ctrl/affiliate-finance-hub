/**
 * REGRA DE VISIBILIDADE (NÃO MODIFICAR SEM REVISÃO DE SEGURANÇA):
 * 
 * Operadores enxergam somente eventos operacionais de projetos vinculados.
 * Financeiro, parceiros e administração NÃO fazem parte do escopo operacional.
 * 
 * Domínios:
 * - project_event: Ciclos, entregas, pagamentos de operador (filtrado por vínculo)
 * - financial_event: Saques, participações investidores (owner/admin/finance)
 * - partner_event: Parceiros, indicadores, comissões, bônus (owner/admin/finance)
 * - admin_event: Alertas críticos, configurações (owner/admin)
 * 
 * REFATORADO: Componente reduzido de 2100+ para ~500 linhas via extração de:
 * - useCentralOperacoesMutations (handlers de mutação)
 * - CentralOperacoesDialogs (modais/diálogos)
 * - useAlertCards (builder de cards) — inline useMemo mantido por acoplamento com handlers
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTopBar } from "@/contexts/TopBarContext";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OcorrenciasModule } from "@/components/ocorrencias/OcorrenciasModule";
import { useOcorrenciasKpis } from "@/hooks/useOcorrencias";
import { formatCurrency as formatCurrencyUtil } from "@/utils/formatCurrency";
import { supabase } from "@/integrations/supabase/client";
import { getFirstLastName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OperationCard } from "@/components/central-operacoes/OperationCard";
import { OperationItem } from "@/components/central-operacoes/OperationItem";
import { CentralKPISummary } from "@/components/central-operacoes/CentralKPISummary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Bell, Clock, DollarSign, Building2, User, Calendar,
  RefreshCw, Loader2, FolderKanban, Package, Target, Users, Banknote,
  CheckCircle2, TrendingUp, Gift, Zap, UserPlus, ShieldAlert, Unlink,
  Wallet, Ghost, Truck, MoreVertical, Undo2, XCircle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { SaquesSmartFilter } from "@/components/central-operacoes/SaquesSmartFilter";
import { CasasLimitadasSmartFilter } from "@/components/central-operacoes/CasasLimitadasSmartFilter";
import { ParticipacoesSmartFilter } from "@/components/central-operacoes/ParticipacoesSmartFilter";
import { PropostasPagamentoCard } from "@/components/operadores/PropostasPagamentoCard";
import { ContasDisponiveisModule } from "@/components/central-operacoes/ContasDisponiveisModule";
import { BookmakersLivresModule } from "@/components/central-operacoes/BookmakersLivresModule";
import BookmakersNaoCriadasModule from "@/components/central-operacoes/BookmakersNaoCriadasModule";
import { CentralOperacoesDialogs } from "@/components/central-operacoes/CentralOperacoesDialogs";
import { OperatorSaquesReadOnly } from "@/components/central-operacoes/OperatorSaquesReadOnly";
import { useCentralOperacoesMutations, type DispensaState, type PerdaLimitadaState } from "@/hooks/useCentralOperacoesMutations";
import { useCicloAlertas } from "@/hooks/useCicloAlertas";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { RenewalSuccessData } from "@/components/parcerias/ParceriaDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  useCentralOperacoesData,
  ROLE_VISIBILITY,
  type EventDomain,
  type EntregaPendente,
  type PagamentoParceiroPendente,
  type PagamentoFornecedorPendente,
  type PagamentoOperadorPendente,
  type ParceriaAlertaEncerramento,
  type SaquePendenteConfirmacao,
  type AlertaLucroParceiro,
  type ParticipacaoPendente,
  type BookmakerDesvinculado,
} from "@/hooks/useCentralOperacoesData";

// Mapeamento de cards para domínios
const CARD_DOMAIN_MAP: Record<string, EventDomain> = {
  'alertas-criticos': 'admin_event',
  'propostas-pagamento': 'project_event',
  'casas-pendentes-conciliacao': 'financial_event',
  'saques-aguardando': 'financial_event',
  'saques-processamento': 'financial_event',
  'casas-limitadas': 'financial_event',
  'casas-desvinculadas': 'financial_event',
  'participacoes-investidores': 'financial_event',
  'pagamentos-operador': 'project_event',
  'ciclos-apuracao': 'project_event',
  'alertas-lucro': 'partner_event',
  'entregas-pendentes': 'project_event',
  'parceiros-sem-parceria': 'partner_event',
  'pagamentos-parceiros': 'partner_event',
  'pagamentos-fornecedores': 'partner_event',
  'bonus-pendentes': 'partner_event',
  'comissoes-pendentes': 'partner_event',
  'parcerias-encerrando': 'partner_event',
};

const PRIORITY = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 } as const;

export default function CentralOperacoes() {
  const { setContent: setTopBarContent } = useTopBar();
  const navigate = useNavigate();

  const { alertas: alertasCiclos, dismissedCount: ciclosDismissedCount, showDismissed: showDismissedCiclos, setShowDismissed: setShowDismissedCiclos, dismissCiclo, undismissCiclo, refetch: refetchCiclos } = useCicloAlertas();
  const { role, isOperator } = useRole();
  const { user, workspaceId } = useAuth();
  const { data: kpisOcorrencias } = useOcorrenciasKpis();
  

  // ==================== REACT QUERY: Cache + Deduplicação ====================
  const { data: centralData, loading, refreshing, refetch: refetchCentral, allowedDomains } = useCentralOperacoesData();

  const {
    alertas, entregasPendentes, pagamentosParceiros, pagamentosFornecedores,
    bonusPendentes, comissoesPendentes, parceriasEncerramento: parceriasEncerramentoData,
    parceirosSemParceria, saquesPendentes, alertasLucro: alertasLucroData,
    pagamentosOperadorPendentes, participacoesPendentes, casasDesvinculadas,
    casasPendentesConciliacao, propostasPagamentoCount,
  } = centralData;

  // Mutable state for optimistic updates
  const [alertasLucro, setAlertasLucro] = useState<AlertaLucroParceiro[]>([]);
  const [parceriasEncerramento, setParceriasEncerramento] = useState<ParceriaAlertaEncerramento[]>([]);
  useEffect(() => { setAlertasLucro(alertasLucroData); }, [alertasLucroData]);
  useEffect(() => { setParceriasEncerramento(parceriasEncerramentoData); }, [parceriasEncerramentoData]);

  // Contagem de contas disponíveis
  const { data: contasDisponiveisCount } = useQuery({
    queryKey: ['contas-disponiveis-count', workspaceId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bookmakers')
        .select('id', { count: 'exact', head: true })
        .is('projeto_id', null)
        .eq('workspace_id', workspaceId!)
        .gte('saldo_atual', 1);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // Projetos ativos para vincular bookmakers
  const { data: projetosAtivos } = useQuery({
    queryKey: ['projetos-ativos-central', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, nome')
        .eq('workspace_id', workspaceId!)
        .in('status', ['PLANEJADO', 'EM_ANDAMENTO'])
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  // ─── REALTIME ─────
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    const debouncedRefresh = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => refetchCentral(), 5000);
    };
    const channel = supabase
      .channel('central-operacoes-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_ledger', filter: `workspace_id=eq.${workspaceId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookmakers', filter: `workspace_id=eq.${workspaceId}` }, debouncedRefresh)
      .subscribe();
    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, refetchCentral]);

  // ─── Dialog UI states ─────
  const [conciliacaoOpen, setConciliacaoOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<EntregaPendente | null>(null);
  const [confirmarSaqueOpen, setConfirmarSaqueOpen] = useState(false);
  const [selectedSaque, setSelectedSaque] = useState<SaquePendenteConfirmacao | null>(null);
  const [pagamentoOperadorOpen, setPagamentoOperadorOpen] = useState(false);
  const [selectedPagamentoOperador, setSelectedPagamentoOperador] = useState<PagamentoOperadorPendente | null>(null);
  const [pagamentoParticipacaoOpen, setPagamentoParticipacaoOpen] = useState(false);
  const [selectedParticipacao, setSelectedParticipacao] = useState<ParticipacaoPendente | null>(null);
  const [dispensaOpen, setDispensaOpen] = useState(false);
  const [dispensaParceriaId, setDispensaParceriaId] = useState<string | null>(null);
  const [dispensaParceiroNome, setDispensaParceiroNome] = useState('');
  const [dispensaMotivo, setDispensaMotivo] = useState('');
  const [dispensaLoading, setDispensaLoading] = useState(false);
  const [dispensaComissaoJaPaga, setDispensaComissaoJaPaga] = useState(false);
  const [dispensaValorComissao, setDispensaValorComissao] = useState(0);
  const [dispensaEstornar, setDispensaEstornar] = useState(false);
  const [dispensaIndicadorNome, setDispensaIndicadorNome] = useState('');
  const [perdaLimitadaDialog, setPerdaLimitadaDialog] = useState<PerdaLimitadaState | null>(null);
  const [pagamentoFornecedorOpen, setPagamentoFornecedorOpen] = useState(false);
  const [selectedPagamentoFornecedor, setSelectedPagamentoFornecedor] = useState<PagamentoFornecedorPendente | null>(null);
  const [pagamentoParceiroDialogOpen, setPagamentoParceiroDialogOpen] = useState(false);
  const [selectedPagamentoParceiro, setSelectedPagamentoParceiro] = useState<PagamentoParceiroPendente | null>(null);
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false);
  const [parceriaToEncerrar, setParceriaToEncerrar] = useState<ParceriaAlertaEncerramento | null>(null);
  const [encerrarLoading, setEncerrarLoading] = useState(false);
  const [renovarDialogOpen, setRenovarDialogOpen] = useState(false);
  const [parceriaToRenovar, setParceriaToRenovar] = useState<ParceriaAlertaEncerramento | null>(null);
  // Vincular projeto a casa pendente de conciliação
  const [vincularConciliacaoOpen, setVincularConciliacaoOpen] = useState(false);
  const [selectedCasaConciliacao, setSelectedCasaConciliacao] = useState<typeof casasPendentesConciliacao[0] | null>(null);
  const [selectedProjetoVincular, setSelectedProjetoVincular] = useState("");
  const [vincularConciliacaoLoading, setVincularConciliacaoLoading] = useState(false);
  const [mainTab, setMainTabState] = useState<'financeiro' | 'contas' | 'ocorrencias' | 'alertas'>(() => {
    const saved = localStorage.getItem('central-operacoes-main-tab');
    if (role === 'operator') return 'financeiro';
    if (saved === 'financeiro' || saved === 'contas' || saved === 'ocorrencias' || saved === 'alertas') return saved;
    return 'financeiro';
  });
  const setMainTab = (tab: typeof mainTab) => {
    if (isOperator) return;
    setMainTabState(tab);
    localStorage.setItem('central-operacoes-main-tab', tab);
  };

  // ─── Extracted mutation handlers ─────
  const fetchData = useCallback((isRefresh?: boolean) => { refetchCentral(); }, [refetchCentral]);
  const mutations = useCentralOperacoesMutations(fetchData);

  const formatCurrency = (value: number, moeda: string = "BRL") => formatCurrencyUtil(value, moeda);

  const handleVincularConciliacao = async () => {
    if (!selectedCasaConciliacao || !selectedProjetoVincular || !user || !workspaceId) return;
    setVincularConciliacaoLoading(true);
    try {
      const { error: updateError } = await supabase
        .from("bookmakers")
        .update({ projeto_id: selectedProjetoVincular })
        .eq("id", selectedCasaConciliacao.bookmaker_id);
      if (updateError) throw updateError;

      await supabase.from("projeto_bookmaker_historico").insert({
        projeto_id: selectedProjetoVincular,
        bookmaker_id: selectedCasaConciliacao.bookmaker_id,
        bookmaker_nome: selectedCasaConciliacao.bookmaker_nome,
        parceiro_id: (selectedCasaConciliacao as any).parceiro_id || null,
        parceiro_nome: selectedCasaConciliacao.parceiro_nome || null,
        user_id: user.id,
        workspace_id: workspaceId,
      });

      const { executeLink } = await import("@/lib/projetoTransitionService");
      await executeLink({
        bookmakerId: selectedCasaConciliacao.bookmaker_id,
        projetoId: selectedProjetoVincular,
        workspaceId,
        userId: user.id,
        saldoAtual: selectedCasaConciliacao.saldo_atual,
        moeda: selectedCasaConciliacao.moeda,
      });

      toast.success(`"${selectedCasaConciliacao.bookmaker_nome}" vinculada ao projeto!`);
      setVincularConciliacaoOpen(false);
      refetchCentral();
    } catch (err) {
      console.error("Erro ao vincular:", err);
      toast.error("Erro ao vincular bookmaker ao projeto");
    } finally {
      setVincularConciliacaoLoading(false);
    }
  };

  const handleRenovarClick = (parc: ParceriaAlertaEncerramento) => {
    setParceriaToRenovar(parc);
    setRenovarDialogOpen(true);
  };

  const handleRenovarDialogClose = () => {
    setRenovarDialogOpen(false);
    setParceriaToRenovar(null);
    fetchData(true);
  };

  const handleRenewalSuccess = (data: RenewalSuccessData) => {
    setRenovarDialogOpen(false);
    setParceriaToRenovar(null);
    fetchData(true);
    if (data.origem_tipo === "FORNECEDOR" && data.fornecedor_id) {
      setSelectedPagamentoFornecedor({
        parceriaId: data.newParceriaId,
        fornecedorNome: data.fornecedorNome || "",
        fornecedorId: data.fornecedor_id,
        parceiroNome: data.parceiroNome,
        valorFornecedor: data.valor_fornecedor,
        valorPago: 0,
        valorRestante: data.valor_fornecedor,
        diasRestantes: 0,
        workspaceId: "",
      });
      setPagamentoFornecedorOpen(true);
    } else {
      setSelectedPagamentoParceiro({
        parceriaId: data.newParceriaId,
        parceiroNome: data.parceiroNome,
        valorParceiro: data.valor_parceiro,
        origemTipo: data.origem_tipo,
        diasRestantes: 0,
        parceiroId: data.parceiro_id,
        workspaceId: "",
      });
      setPagamentoParceiroDialogOpen(true);
    }
  };

  const handleConciliarEntrega = (entrega: EntregaPendente) => {
    setSelectedEntrega(entrega);
    setConciliacaoOpen(true);
  };

  const handleConfirmarSaque = (saque: SaquePendenteConfirmacao) => {
    setSelectedSaque(saque);
    setConfirmarSaqueOpen(true);
  };

  const dispensaState: DispensaState = {
    open: dispensaOpen,
    parceriaId: dispensaParceriaId,
    parceiroNome: dispensaParceiroNome,
    motivo: dispensaMotivo,
    loading: dispensaLoading,
    comissaoJaPaga: dispensaComissaoJaPaga,
    valorComissao: dispensaValorComissao,
    estornar: dispensaEstornar,
    indicadorNome: dispensaIndicadorNome,
  };

  const handleDispensarPagamento = async () => {
    setDispensaLoading(true);
    try {
      await mutations.handleDispensarPagamento(dispensaState, pagamentosParceiros, () => {
        setDispensaOpen(false);
        setDispensaMotivo('');
        setDispensaParceriaId(null);
        setDispensaComissaoJaPaga(false);
        setDispensaEstornar(false);
      });
    } finally {
      setDispensaLoading(false);
    }
  };

  const handleEncerrarParceria = async () => {
    if (!parceriaToEncerrar) return;
    await mutations.handleEncerrarParceria(
      parceriaToEncerrar,
      setParceriasEncerramento,
      setEncerrarLoading,
      setEncerrarDialogOpen,
      setParceriaToEncerrar,
    );
  };

  // ─── Derived data ─────
  // Fetch investor bookmaker IDs to exclude from Central de Operações
  const { data: investorBkIds } = useQuery({
    queryKey: ["investor-bookmaker-ids", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookmakers")
        .select("id")
        .eq("workspace_id", workspaceId!)
        .not("investidor_id", "is", null);
      return new Set((data || []).map((b: any) => b.id));
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const alertasSaques = alertas
    .filter((a) => a.tipo_alerta === "BOOKMAKER_SAQUE")
    .filter((a) => !investorBkIds || !investorBkIds.has(a.entidade_id));
  const alertasLimitadas = alertas.filter((a) => a.tipo_alerta === "BOOKMAKER_LIMITADA");
  const alertasCriticos = alertas.filter((a) => a.nivel_urgencia === "CRITICA");

  const alertasCiclosFiltrados = useMemo(() => {
    if (!isOperator) return alertasCiclos;
    return alertasCiclos;
  }, [alertasCiclos, isOperator]);

  // ─── Alert cards builder (kept inline due to heavy coupling with handlers) ─────
  const alertCards = useMemo(() => {
    const cards: Array<{ id: string; priority: number; component: JSX.Element; domain: EventDomain }> = [];

    // 1. Alertas Críticos
    if (alertasCriticos.length > 0 && allowedDomains.includes('admin_event')) {
      cards.push({
        id: "alertas-criticos", priority: PRIORITY.CRITICAL, domain: 'admin_event',
        component: (
          <OperationCard key="alertas-criticos" title="Alertas Críticos" icon={<AlertTriangle className="h-4 w-4" />} color="red" count={alertasCriticos.length}>
            {alertasCriticos.slice(0, 5).map((alerta) => (
              <OperationItem key={alerta.entidade_id} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="red" label={alerta.titulo}
                actions={<Button size="sm" variant="destructive" className="h-6 text-xs px-2 shrink-0">Resolver</Button>} />
            ))}
          </OperationCard>
        ),
      });
    }

    // 2. Propostas de Pagamento
    if (allowedDomains.includes('project_event') && propostasPagamentoCount > 0) {
      cards.push({ id: "propostas-pagamento", priority: PRIORITY.HIGH, domain: 'project_event', component: <PropostasPagamentoCard key="propostas-pagamento" /> });
    }

    // 2.5. Casas Pendentes de Conciliação
    if (casasPendentesConciliacao.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-pendentes-conciliacao", priority: PRIORITY.CRITICAL, domain: 'financial_event',
        component: (
          <OperationCard key="casas-pendentes-conciliacao" title="Conciliação Pendente" icon={<ShieldAlert className="h-4 w-4" />} color="amber" count={casasPendentesConciliacao.length}
            description="Casas bloqueadas até conciliar transações"
            tooltip={{ title: "Conciliação Obrigatória", description: "Casas com transações pendentes não podem ser utilizadas para apostas ou bônus até que a conciliação seja realizada.", flow: "Transações pendentes (depósitos, saques em processamento) devem ser conciliadas para liberar a casa para operação." }}>
            {casasPendentesConciliacao.map((casa) => (
              <OperationItem key={casa.bookmaker_id} icon={<ShieldAlert className="h-3.5 w-3.5" />} color="amber" pulse
                label={`${casa.bookmaker_nome}${casa.parceiro_nome ? ` · ${getFirstLastName(casa.parceiro_nome)}` : ''}`}
                sublabel={`${casa.projeto_nome || 'Sem projeto'} • ${casa.qtd_transacoes_pendentes} transaç${casa.qtd_transacoes_pendentes === 1 ? 'ão' : 'ões'}`}
                value={formatCurrency(casa.valor_total_pendente, casa.moeda)}
                actions={
                  <div className="flex items-center gap-1">
                    {!casa.projeto_nome && (
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedCasaConciliacao(casa); setSelectedProjetoVincular(""); setVincularConciliacaoOpen(true); }} className="h-6 text-xs px-1.5"><FolderKanban className="h-3 w-3" /></Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate(`/caixa?tab=conciliacao&bookmaker=${casa.bookmaker_id}`)} className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 h-6 text-xs px-2">Conciliar</Button>
                  </div>
                } />
            ))}
          </OperationCard>
        ),
      });
    }

    // 3. Saques Aguardando Confirmação
    if (saquesPendentes.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "saques-aguardando", priority: PRIORITY.HIGH, domain: 'financial_event',
        component: (
          <OperationCard key="saques-aguardando" title="Saques Aguardando Confirmação" icon={<Clock className="h-4 w-4" />} color="yellow" count={saquesPendentes.length}
            tooltip={{ title: "Saques Aguardando Confirmação", description: "Saques que foram iniciados e precisam de confirmação de recebimento.", flow: "Quando um saque é registrado no Caixa, ele fica pendente até que a tesouraria confirme o recebimento." }}>
            <SaquesSmartFilter saques={saquesPendentes}>
              {(filtered) => (
                <>
                  {filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum saque encontrado com os filtros aplicados.</p>
                  ) : filtered.map((saque) => {
                    const destinoNome = saque.destino_wallet_id ? (saque.wallet_exchange || saque.wallet_nome || "Wallet") : (saque.banco_nome || "Conta Bancária");
                    const parceiroShort = saque.parceiro_nome ? getFirstLastName(saque.parceiro_nome) : "";
                    return (
                      <OperationItem key={saque.id} icon={saque.destino_wallet_id ? <Wallet className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />} color="yellow"
                        label={`${destinoNome}${parceiroShort ? ` · ${parceiroShort}` : ""}`}
                        sublabel={`${saque.bookmaker_nome}${saque.coin ? ` · ${saque.coin}` : ""}${saque.projeto_nome ? ` · ${saque.projeto_nome}` : ""}`}
                        value={formatCurrency(saque.valor_origem || saque.valor, saque.moeda_origem || saque.moeda)}
                        actions={<Button size="sm" onClick={() => handleConfirmarSaque(saque)} className="bg-yellow-600 hover:bg-yellow-700 h-6 text-xs px-2 shrink-0">Confirmar</Button>} />
                    );
                  })}
                </>
              )}
            </SaquesSmartFilter>
          </OperationCard>
        ),
      });
    }

    // 4. Saques Pendentes de Processamento
    if (alertasSaques.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "saques-processamento", priority: PRIORITY.HIGH, domain: 'financial_event',
        component: (
          <OperationCard key="saques-processamento" title="Saques Pendentes de Processamento" icon={<DollarSign className="h-4 w-4" />} color="emerald" count={alertasSaques.length}
            tooltip={{ title: "Saques Pendentes de Processamento", description: "Bookmakers marcados para saque que aguardam processamento.", flow: "Casa chega aqui quando desvinculada como 'limitada' (saque automático) ou quando gestor escolhe 'Marcar para Saque'." }}>
            {alertasSaques.map((alerta) => (
              <OperationItem key={alerta.entidade_id} icon={<Building2 className="h-3.5 w-3.5" />} color="emerald"
                label={alerta.titulo}
                sublabel={alerta.parceiro_nome ? getFirstLastName(alerta.parceiro_nome) : undefined}
                value={alerta.valor ? formatCurrency(alerta.valor, alerta.moeda) : undefined}
                actions={
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => mutations.handleSaqueAction(alerta)} className="h-6 text-xs px-2">Processar</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-6 w-6 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => mutations.handleCancelarLiberacao(alerta)} className="text-xs gap-2"><Undo2 className="h-3.5 w-3.5" />Cancelar Liberação</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                } />
            ))}
          </OperationCard>
        ),
      });
    }

    // 4.5. Casas Limitadas
    if (alertasLimitadas.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-limitadas", priority: PRIORITY.HIGH, domain: 'financial_event',
        component: (
          <OperationCard key="casas-limitadas" title="Casas Limitadas" icon={<ShieldAlert className="h-4 w-4" />} color="orange" count={alertasLimitadas.length}
            description="Casas devolvidas/limitadas com saldo pendente"
            tooltip={{ title: "Casas Limitadas", description: "Bookmakers marcadas como limitadas e ainda vinculadas a projetos.", flow: "Quando uma bookmaker é marcada como 'Limitada', ela aparece aqui para processamento de saque." }}>
            <CasasLimitadasSmartFilter casas={alertasLimitadas}>
              {(filtered) => (
                <>
                  {filtered.map((alerta) => (
                    <OperationItem key={alerta.entidade_id} icon={<Building2 className="h-3.5 w-3.5" />} color="orange"
                      label={alerta.titulo}
                      sublabel={`${alerta.parceiro_nome ? `${getFirstLastName(alerta.parceiro_nome)} • ` : ''}Sacar ou realocar saldo`}
                      value={alerta.valor ? formatCurrency(alerta.valor, alerta.moeda) : undefined}
                      actions={
                        <div className="flex items-center gap-1">
                          <TooltipProvider><Tooltip delayDuration={200}><TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => setPerdaLimitadaDialog({ open: true, bookmakerId: alerta.entidade_id, bookmakerNome: alerta.titulo, moeda: alerta.moeda || "BRL", saldoAtual: alerta.valor || 0 })} className="border-destructive/50 text-destructive hover:bg-destructive/10 h-6 text-xs px-2 gap-1"><Ghost className="h-3 w-3" />Fantasma</Button>
                          </TooltipTrigger><TooltipContent side="top" className="max-w-xs p-3 space-y-1"><p className="font-medium text-sm">Saldo Fantasma</p><p className="text-xs text-muted-foreground">Registra como perda operacional o saldo residual que não pode ser sacado.</p></TooltipContent></Tooltip></TooltipProvider>
                          <Button size="sm" onClick={() => mutations.handleSaqueAction(alerta)} className="bg-orange-600 hover:bg-orange-700 h-6 text-xs px-2">Sacar</Button>
                        </div>
                      } />
                  ))}
                  {filtered.length === 0 && <p className="text-center text-[10px] text-muted-foreground py-4">Nenhuma casa encontrada com os filtros aplicados.</p>}
                </>
              )}
            </CasasLimitadasSmartFilter>
          </OperationCard>
        ),
      });
    }

    // 4.6. Casas Aguardando Decisão
    const casasAguardandoDecisao = casasDesvinculadas.filter(c => c.status === 'AGUARDANDO_DECISAO');
    const casasAtivasDesvinculadas = casasDesvinculadas.filter(c => c.status === 'ATIVO' || c.status?.toUpperCase() === 'LIMITADA');

    if (casasAguardandoDecisao.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-aguardando-decisao", priority: PRIORITY.HIGH, domain: 'financial_event',
        component: (
          <OperationCard key="casas-aguardando-decisao" title="Casas Aguardando Decisão" icon={<Unlink className="h-4 w-4" />} color="purple" count={casasAguardandoDecisao.length}
            description="Definir destino: disponibilizar ou sacar"
            tooltip={{ title: "Casas Aguardando Decisão", description: "Bookmakers ativas desvinculadas de projetos com saldo positivo.", flow: "Quando um operador desvincula uma casa ATIVA com saldo, ela aguarda decisão do responsável financeiro." }}>
            {casasAguardandoDecisao.map((casa) => (
              <OperationItem key={casa.id} icon={<Unlink className="h-3.5 w-3.5" />} color="purple"
                label={casa.nome}
                sublabel={casa.parceiro_nome ? getFirstLastName(casa.parceiro_nome) : "Sem parceiro"}
                value={formatCurrency(casa.saldo_efetivo, casa.moeda)}
                actions={
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => mutations.handleDisponibilizarCasa(casa)} className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-6 text-xs px-2">Disponibilizar</Button>
                    <Button size="sm" onClick={() => mutations.handleMarcarParaSaque(casa)} className="bg-purple-600 hover:bg-purple-700 h-6 text-xs px-2">Marcar Saque</Button>
                  </div>
                } />
            ))}
          </OperationCard>
        ),
      });
    }

    // Card legado casas ativas desvinculadas
    if (casasAtivasDesvinculadas.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-desvinculadas", priority: PRIORITY.MEDIUM, domain: 'financial_event',
        component: (
          <OperationCard key="casas-desvinculadas" title="Casas Desvinculadas" icon={<Unlink className="h-4 w-4" />} color="slate" count={casasAtivasDesvinculadas.length}
            description="Casas sem projeto com saldo pendente"
            tooltip={{ title: "Casas Desvinculadas (Legado)", description: "Bookmakers desvinculadas antes da nova regra de decisão.", flow: "Casas desvinculadas antes do novo fluxo aparecem aqui para compatibilidade." }}>
            {casasAtivasDesvinculadas.map((casa) => (
              <OperationItem key={casa.id} icon={<Unlink className="h-3.5 w-3.5" />} color="slate"
                label={casa.nome}
                sublabel={casa.parceiro_nome ? getFirstLastName(casa.parceiro_nome) : "Sem parceiro"}
                value={formatCurrency(casa.saldo_efetivo, casa.moeda)}
                actions={
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => mutations.handleSolicitarSaqueCasaDesvinculada(casa)} className="bg-slate-600 hover:bg-slate-700 h-6 text-xs px-2">Sacar</Button>
                    <Button size="sm" variant="outline" onClick={() => mutations.handleAcknowledgeCasaDesvinculada(casa)} className="border-slate-500/30 text-slate-400 hover:bg-slate-500/10 h-6 text-xs px-2">Ciente</Button>
                  </div>
                } />
            ))}
          </OperationCard>
        ),
      });
    }

    // 5. Participações de Investidores
    if (participacoesPendentes.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "participacoes-investidores", priority: PRIORITY.HIGH, domain: 'financial_event',
        component: (
          <OperationCard key="participacoes-investidores" title="Participações de Investidores" icon={<Banknote className="h-4 w-4" />} color="indigo" count={participacoesPendentes.length}
            tooltip={{ title: "Participações de Investidores", description: "Pagamentos de participação nos lucros devidos aos investidores.", flow: "Quando um ciclo é fechado com lucro, a participação de cada investidor é calculada." }}>
            <ParticipacoesSmartFilter participacoes={participacoesPendentes}>
              {(filtered) => (
                <>
                  {filtered.map((part) => (
                    <OperationItem key={part.id} icon={<User className="h-3.5 w-3.5" />} color="indigo"
                      label={part.investidor_nome}
                      sublabel={`${part.projeto_nome} • Ciclo ${part.ciclo_numero}`}
                      value={formatCurrency(part.valor_participacao)}
                      onClick={() => { setSelectedParticipacao(part); setPagamentoParticipacaoOpen(true); }}
                      actions={<Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); setSelectedParticipacao(part); setPagamentoParticipacaoOpen(true); }}>Pagar</Button>} />
                  ))}
                </>
              )}
            </ParticipacoesSmartFilter>
          </OperationCard>
        ),
      });
    }

    // 6. Pagamentos de Operador
    if (pagamentosOperadorPendentes.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "pagamentos-operador", priority: PRIORITY.HIGH, domain: 'project_event',
        component: (
          <OperationCard key="pagamentos-operador" title="Pagamentos de Operador" icon={<Users className="h-4 w-4" />} color="orange" count={pagamentosOperadorPendentes.length}
            tooltip={{ title: "Pagamentos de Operador", description: "Pagamentos pendentes aos operadores de projetos.", flow: "Quando um operador atinge meta ou tem pagamento agendado, o valor é gerado e aguarda processamento." }}>
            {pagamentosOperadorPendentes.map((pag) => (
              <OperationItem key={pag.id} icon={<DollarSign className="h-3.5 w-3.5" />} color="orange"
                label={pag.operador_nome}
                sublabel={`${pag.tipo_pagamento}${pag.projeto_nome ? ` • ${pag.projeto_nome}` : ""}`}
                value={formatCurrency(pag.valor)}
                onClick={() => { setSelectedPagamentoOperador(pag); setPagamentoOperadorOpen(true); }}
                actions={<Button size="sm" className="bg-orange-600 hover:bg-orange-700 h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); setSelectedPagamentoOperador(pag); setPagamentoOperadorOpen(true); }}>Pagar</Button>} />
            ))}
          </OperationCard>
        ),
      });
    }

    // 7. Ciclos de Apuração
    const showCiclosCard = (alertasCiclosFiltrados.length > 0 || ciclosDismissedCount > 0) && allowedDomains.includes('project_event');
    if (showCiclosCard) {
      cards.push({
        id: "ciclos-apuracao", priority: PRIORITY.MEDIUM, domain: 'project_event',
        component: (
          <OperationCard key="ciclos-apuracao" title="Ciclos de Apuração" icon={<Target className="h-4 w-4" />} color="violet" count={alertasCiclosFiltrados.length}
            tooltip={{ title: "Ciclos de Apuração", description: "Ciclos próximos do fechamento ou que já atingiram a meta.", flow: "Ciclos são criados automaticamente e fecham por tempo, volume ou ambos." }}
            headerActions={ciclosDismissedCount > 0 ? (
              <button onClick={() => setShowDismissedCiclos(!showDismissedCiclos)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                {showDismissedCiclos ? "Ocultar" : `${ciclosDismissedCount} oculto${ciclosDismissedCount > 1 ? "s" : ""}`}
              </button>
            ) : undefined}>
            {alertasCiclosFiltrados.length === 0 && !showDismissedCiclos ? (
              <p className="text-xs text-muted-foreground text-center py-4">Todos os ciclos foram ocultos.</p>
            ) : (
              alertasCiclosFiltrados.map((ciclo) => {
                const isDismissed = ciclo.dismissed;
                return (
                  <div key={ciclo.id} className={`p-2 rounded-xl border group transition-all duration-150 ${isDismissed ? "border-muted/40 bg-muted/10 opacity-60" : ciclo.urgencia === "CRITICA" ? "border-red-500/30 bg-red-500/[0.06]" : ciclo.urgencia === "ALTA" ? "border-orange-500/30 bg-orange-500/[0.06]" : "border-violet-500/20 bg-violet-500/[0.06]"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/projeto/${ciclo.projeto_id}`)}>
                        <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate">{ciclo.projeto_nome}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">Ciclo {ciclo.numero_ciclo}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {ciclo.tipo_gatilho === "TEMPO" && <Clock className="h-3 w-3 text-muted-foreground" />}
                        {ciclo.tipo_gatilho === "VOLUME" && <Target className="h-3 w-3 text-muted-foreground" />}
                        {ciclo.tipo_gatilho === "HIBRIDO" && <Zap className="h-3 w-3 text-muted-foreground" />}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); isDismissed ? undismissCiclo(ciclo.id) : dismissCiclo(ciclo.id); }}>
                              {isDismissed ? <Undo2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">{isDismissed ? "Tornar visível novamente" : "Ocultar este ciclo"}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {(ciclo.tipo_gatilho === "VOLUME" || ciclo.tipo_gatilho === "HIBRIDO") && ciclo.meta_volume && (
                      <div className="mt-2"><Progress value={Math.min(100, ciclo.progresso_volume)} className="h-1" /><p className="text-[10px] text-muted-foreground mt-1">{ciclo.progresso_volume.toFixed(0)}% concluído</p></div>
                    )}
                  </div>
                );
              })
            )}
          </OperationCard>
        ),
      });
    }

    // 8. Alertas de Lucro
    if (alertasLucro.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "alertas-lucro", priority: PRIORITY.MEDIUM, domain: 'partner_event',
        component: (
          <OperationCard key="alertas-lucro" title="Marcos de Lucro Atingidos" icon={<TrendingUp className="h-4 w-4" />} color="emerald" count={alertasLucro.length}
            tooltip={{ title: "Marcos de Lucro", description: "Parceiros que atingiram marcos importantes de lucro acumulado.", flow: "Quando o lucro total de um parceiro cruza um marco configurado, um alerta é gerado." }}>
            {alertasLucro.map((alerta) => (
              <OperationItem key={alerta.id} icon={<TrendingUp className="h-3.5 w-3.5" />} color="emerald"
                label={alerta.parceiro_nome}
                sublabel={`Lucro: ${formatCurrency(alerta.lucro_atual)}`}
                value={`R$ ${alerta.marco_valor.toLocaleString("pt-BR")}`}
                actions={
                  <Button size="sm" variant="outline" onClick={async () => { try { await supabase.from("parceiro_lucro_alertas").update({ notificado: true }).eq("id", alerta.id); setAlertasLucro(prev => prev.filter(a => a.id !== alerta.id)); toast.success("Marco verificado"); } catch { toast.error("Erro ao confirmar"); } }} className="h-6 text-[10px] px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Button>
                } />
            ))}
          </OperationCard>
        ),
      });
    }

    // 9. Entregas Pendentes
    if (entregasPendentes.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "entregas-pendentes", priority: PRIORITY.MEDIUM, domain: 'project_event',
        component: (
          <OperationCard key="entregas-pendentes" title="Entregas Pendentes" icon={<Package className="h-4 w-4" />} color="purple" count={entregasPendentes.length}
            tooltip={{ title: "Entregas Pendentes", description: "Entregas prontas para conciliação e pagamento.", flow: "Quando uma entrega atinge a meta, ela fica disponível para conciliação." }}>
            {entregasPendentes.map((entrega) => (
              <OperationItem key={entrega.id} icon={<Target className="h-3.5 w-3.5" />} color={entrega.nivel_urgencia === "CRITICA" ? "red" : "purple"}
                label={entrega.operador_nome}
                sublabel={`${entrega.projeto_nome} • Entrega #${entrega.numero_entrega}`}
                value={formatCurrency(entrega.resultado_nominal)}
                actions={<Button size="sm" onClick={() => handleConciliarEntrega(entrega)} className="bg-purple-600 hover:bg-purple-700 h-6 text-xs px-2">Conciliar</Button>} />
            ))}
          </OperationCard>
        ),
      });
    }

    // 10. Parceiros sem Parceria
    if (parceirosSemParceria.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "parceiros-sem-parceria", priority: PRIORITY.LOW, domain: 'partner_event',
        component: (
          <OperationCard key="parceiros-sem-parceria" title="Parceiros sem Origem" icon={<UserPlus className="h-4 w-4" />} color="amber" count={parceirosSemParceria.length}
            description="Parceiros sem indicação, fornecedor ou origem registrada"
            tooltip={{ title: "Parceiros sem Origem", description: "Parceiros ativos sem indicador, fornecedor ou outra origem registrada.", flow: "Parceiros cadastrados sem origem aparecem aqui para definição." }}>
            {parceirosSemParceria.map((parceiro) => (
              <OperationItem key={parceiro.id} icon={<User className="h-3.5 w-3.5" />} color="amber"
                label={getFirstLastName(parceiro.nome)}
                actions={<Button size="sm" variant="outline" onClick={() => navigate("/programa-indicacao", { state: { tab: "parcerias", parceiroId: parceiro.id } })} className="h-6 text-xs px-2">Definir Origem</Button>} />
            ))}
          </OperationCard>
        ),
      });
    }

    // 11. Pagamentos a Parceiros
    if (pagamentosParceiros.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "pagamentos-parceiros", priority: PRIORITY.LOW, domain: 'partner_event',
        component: (
          <OperationCard key="pagamentos-parceiros" title="Pagamentos a Parceiros" icon={<DollarSign className="h-4 w-4" />} color="cyan" count={pagamentosParceiros.length}
            tooltip={{ title: "Pagamentos a Parceiros", description: "Valores devidos aos parceiros conforme acordado na parceria.", flow: "Quando uma parceria possui valor acordado para o parceiro, ele aparece aqui." }}>
            {pagamentosParceiros.map((pag) => (
              <OperationItem key={pag.parceriaId} icon={<User className="h-3.5 w-3.5" />} color="cyan"
                label={getFirstLastName(pag.parceiroNome)}
                value={formatCurrency(pag.valorParceiro)}
                actions={
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedPagamentoParceiro(pag); setPagamentoParceiroDialogOpen(true); }} className="h-6 text-xs px-2">Pagar</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-muted-foreground hover:text-destructive" onClick={async () => {
                      setDispensaParceriaId(pag.parceriaId);
                      setDispensaParceiroNome(pag.parceiroNome);
                      setDispensaMotivo('');
                      setDispensaEstornar(false);
                      const { data: parData } = await supabase.from("parcerias").select("comissao_paga, valor_comissao_indicador, indicacao_id").eq("id", pag.parceriaId).single();
                      const jaPaga = parData?.comissao_paga === true && (parData?.valor_comissao_indicador || 0) > 0;
                      setDispensaComissaoJaPaga(jaPaga);
                      setDispensaValorComissao(parData?.valor_comissao_indicador || 0);
                      if (jaPaga && parData?.indicacao_id) {
                        const { data: ind } = await supabase.from("v_indicacoes_workspace").select("indicador_id").eq("id", parData.indicacao_id).maybeSingle();
                        if (ind?.indicador_id) { const { data: indRef } = await supabase.from("indicadores_referral").select("nome").eq("id", ind.indicador_id).maybeSingle(); setDispensaIndicadorNome(indRef?.nome || "Indicador"); } else { setDispensaIndicadorNome("Indicador"); }
                      } else { setDispensaIndicadorNome(""); }
                      setDispensaOpen(true);
                    }}><XCircle className="h-3 w-3 mr-1" />Dispensar</Button>
                  </div>
                } />
            ))}
          </OperationCard>
        ),
      });
    }

    // 11b. Pagamentos a Fornecedores
    if (pagamentosFornecedores.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "pagamentos-fornecedores", priority: PRIORITY.MEDIUM, domain: 'partner_event',
        component: (
          <OperationCard key="pagamentos-fornecedores" title="Pagamentos a Fornecedores" icon={<Truck className="h-4 w-4" />} color="orange" count={pagamentosFornecedores.length}
            tooltip={{ title: "Pagamentos a Fornecedores", description: "Valores devidos aos fornecedores conforme acordado na parceria.", flow: "Quando uma parceria é vinculada a um fornecedor com valor contratado, ele aparece aqui." }}>
            {pagamentosFornecedores.map((pag) => (
              <OperationItem key={pag.parceriaId} icon={<Truck className="h-3.5 w-3.5" />} color="orange"
                label={pag.fornecedorNome}
                sublabel={`Parceiro: ${getFirstLastName(pag.parceiroNome)}${pag.valorPago > 0 ? ` · Pago: ${formatCurrency(pag.valorPago)} de ${formatCurrency(pag.valorFornecedor)}` : ''}`}
                value={formatCurrency(pag.valorRestante)}
                actions={<Button size="sm" variant="ghost" onClick={() => { setSelectedPagamentoFornecedor(pag); setPagamentoFornecedorOpen(true); }} className="h-6 text-xs px-2">Pagar</Button>} />
            ))}
          </OperationCard>
        ),
      });
    }

    // 12. Bônus Pendentes
    if (bonusPendentes.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "bonus-pendentes", priority: PRIORITY.LOW, domain: 'partner_event',
        component: (
          <OperationCard key="bonus-pendentes" title="Bônus de Indicadores" icon={<Gift className="h-4 w-4" />} color="pink" count={bonusPendentes.reduce((acc, b) => acc + b.ciclosPendentes, 0)}
            tooltip={{ title: "Bônus de Indicadores", description: "Bônus devidos a indicadores que atingiram metas.", flow: "Quando um indicador atinge a meta de parceiros indicados, um bônus é gerado." }}>
            {bonusPendentes.map((bonus) => (
              <OperationItem key={bonus.indicadorId} icon={<Gift className="h-3.5 w-3.5" />} color="pink"
                label={bonus.indicadorNome}
                sublabel={`${bonus.ciclosPendentes} ciclo(s) pendente(s)`}
                value={formatCurrency(bonus.totalBonusPendente)}
                actions={<Button size="sm" variant="ghost" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })} className="h-6 text-xs px-2">Pagar</Button>} />
            ))}
          </OperationCard>
        ),
      });
    }

    // 13. Comissões Pendentes
    if (comissoesPendentes.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "comissoes-pendentes", priority: PRIORITY.LOW, domain: 'partner_event',
        component: (
          <OperationCard key="comissoes-pendentes" title="Comissões Pendentes" icon={<Banknote className="h-4 w-4" />} color="teal" count={comissoesPendentes.length}
            tooltip={{ title: "Comissões Pendentes", description: "Comissões devidas a indicadores por parceiros que eles indicaram.", flow: "Quando uma parceria indicada gera receita, uma comissão é calculada para o indicador." }}>
            {comissoesPendentes.map((comissao) => (
              <OperationItem key={comissao.parceriaId} icon={<Banknote className="h-3.5 w-3.5" />} color="teal"
                label={comissao.indicadorNome}
                sublabel={`→ ${getFirstLastName(comissao.parceiroNome)}`}
                value={formatCurrency(comissao.valorComissao)}
                actions={<Button size="sm" variant="ghost" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })} className="h-6 text-xs px-2">Pagar</Button>} />
            ))}
          </OperationCard>
        ),
      });
    }

    // 14. Parcerias Encerrando
    if (parceriasEncerramento.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "parcerias-encerrando", priority: PRIORITY.LOW, domain: 'partner_event',
        component: (
          <OperationCard key="parcerias-encerrando" title="Parcerias Encerrando" icon={<Calendar className="h-4 w-4" />} color="red" count={parceriasEncerramento.length}
            tooltip={{ title: "Parcerias Encerrando", description: "Parcerias com data de fim próxima que precisam de ação.", flow: "Parcerias com encerramento nos próximos dias aparecem aqui." }}>
            {parceriasEncerramento.map((parc) => {
              const isRed = parc.diasRestantes <= 5;
              return (
                <OperationItem key={parc.id} icon={<Calendar className="h-3.5 w-3.5" />} color={isRed ? "red" : "yellow"}
                  label={getFirstLastName(parc.parceiroNome)}
                  actions={
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[10px] h-5 ${isRed ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{parc.diasRestantes <= 0 ? `${Math.abs(parc.diasRestantes)}d atrás` : `${parc.diasRestantes}d`}</Badge>
                      <Button size="sm" variant="outline" onClick={() => handleRenovarClick(parc)} className="h-6 text-xs px-2">Renovar</Button>
                      <Button size="sm" variant="destructive" onClick={() => { setParceriaToEncerrar(parc); setEncerrarDialogOpen(true); }} className="h-6 text-xs px-2">Encerrar</Button>
                    </div>
                  } />
              );
            })}
          </OperationCard>
        ),
      });
    }

    return cards.sort((a, b) => a.priority - b.priority);
   }, [
    alertasCriticos, saquesPendentes, alertasSaques, alertasLimitadas, casasDesvinculadas,
    participacoesPendentes, pagamentosOperadorPendentes, alertasCiclosFiltrados, alertasLucro,
    entregasPendentes, parceirosSemParceria, pagamentosParceiros, pagamentosFornecedores, bonusPendentes, comissoesPendentes,
    parceriasEncerramento, allowedDomains, propostasPagamentoCount, casasPendentesConciliacao, navigate, mutations,
    ciclosDismissedCount, showDismissedCiclos, setShowDismissedCiclos, dismissCiclo, undismissCiclo,
  ]);

  const hasAnyAlerts = alertCards.length > 0;

  // TopBar
  useEffect(() => {
    setTopBarContent(
      <TooltipProvider><Tooltip><TooltipTrigger asChild>
        <div className="flex items-center gap-2 cursor-default">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><Bell className="h-4 w-4 text-primary" /></div>
          <span className="font-semibold text-sm">{isOperator ? "Central de Ações de Projetos" : "Central de Operações"}</span>
        </div>
      </TooltipTrigger><TooltipContent side="bottom">{isOperator ? "Ações pendentes nos seus projetos" : "Ações que demandam atenção imediata"}</TooltipContent></Tooltip></TooltipProvider>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent, isOperator]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        <div className="grid gap-3 md:gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-3 md:space-y-4">
      {/* Actions bar */}
      <div className="flex items-center justify-end">
        {(mainTab === 'financeiro' || mainTab === 'contas') && (
          <Button variant="outline" size="sm" onClick={() => { fetchData(true); refetchCiclos(); }} disabled={refreshing} className="h-8">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5 hidden sm:inline">Atualizar</span>
          </Button>
        )}
      </div>

      {isOperator ? (
        <OperatorSaquesReadOnly />
      ) : (
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)}>
        <TabsList className="w-full md:w-auto overflow-x-auto scrollbar-none">
          <TabsTrigger value="financeiro" className="relative text-xs md:text-sm">
            Financeiro
            {alertCards.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold leading-none">{alertCards.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="contas" className="relative text-xs md:text-sm">
            Bookmakers
            {(contasDisponiveisCount ?? 0) > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none animate-pulse">!</span>}
          </TabsTrigger>
          <TabsTrigger value="ocorrencias" className="relative text-xs md:text-sm">
            Ocorrências
            {(kpisOcorrencias?.abertas_total ?? 0) > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">{kpisOcorrencias!.abertas_total}</span>}
          </TabsTrigger>
          <TabsTrigger value="alertas" disabled className="opacity-50 text-xs md:text-sm">Alertas<span className="ml-1 text-[10px] text-muted-foreground hidden sm:inline">(em breve)</span></TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro" className="mt-3 md:mt-4 space-y-3 md:space-y-4">
          {/* KPI Summary */}
          <CentralKPISummary
            criticalCount={alertasCriticos.length + casasPendentesConciliacao.length}
            saquesCount={saquesPendentes.length + alertasSaques.length}
            pendentesCount={pagamentosOperadorPendentes.length + participacoesPendentes.length + entregasPendentes.length}
            limitadasCount={alertasLimitadas.length}
          />

          {!hasAnyAlerts && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.03] backdrop-blur-sm">
              <div className="text-center py-12 md:py-16">
                <div className="mx-auto h-14 w-14 md:h-16 md:w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4"><CheckCircle2 className="h-7 w-7 md:h-8 md:w-8 text-emerald-400" /></div>
                <h3 className="text-lg md:text-xl font-semibold text-emerald-400">Nenhuma pendência</h3>
                <p className="text-muted-foreground mt-2 text-sm">Todas as operações estão em dia! 🎉</p>
              </div>
            </div>
          )}
          {hasAnyAlerts && (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2 lg:grid-cols-3">{alertCards.map((card) => card.component)}</div>
          )}
        </TabsContent>

        <TabsContent value="contas" className="mt-4">
          <Tabs defaultValue="contas-saldo" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="contas-saldo">Bookmakers Disponíveis</TabsTrigger>
              <TabsTrigger value="bookmakers-livres">Bookmakers Livres</TabsTrigger>
              <TabsTrigger value="nao-criadas">Não Criadas</TabsTrigger>
            </TabsList>
            <TabsContent value="contas-saldo"><ContasDisponiveisModule /></TabsContent>
            <TabsContent value="bookmakers-livres">
                <BookmakersLivresModule
                  onRegistrarPerda={(bookmakerId, bookmakerNome, moeda, saldoAtual) => setPerdaLimitadaDialog({ open: true, bookmakerId, bookmakerNome, moeda, saldoAtual })}
                  onVincularProjeto={async (bookmakerId, projetoId, projetoNome) => {
                    try {
                      const { data: current } = await supabase.from("bookmakers").select("projeto_id, saldo_atual, moeda, workspace_id").eq("id", bookmakerId).single();
                      if (current?.projeto_id) { toast.error("Casa já vinculada a um projeto"); return; }
                      const { error } = await supabase.from("bookmakers").update({ projeto_id: projetoId }).eq("id", bookmakerId);
                      if (error) throw error;
                      if (current?.workspace_id) {
                        const { data: userData } = await supabase.auth.getUser();
                        if (userData.user) {
                          const { executeLink } = await import("@/lib/projetoTransitionService");
                          await executeLink({ bookmakerId, projetoId, workspaceId: current.workspace_id, userId: userData.user.id, saldoAtual: current.saldo_atual || 0, moeda: current.moeda || "BRL" });
                        }
                      }
                      toast.success(`Casa vinculada ao projeto "${projetoNome}"`);
                      fetchData(true);
                    } catch (err) { console.error("Erro ao vincular:", err); toast.error("Erro ao vincular projeto"); }
                  }}
                  onNewTransacao={(bookmakerId, bookmakerNome, moeda, _saldo, _saldoUsd, tipo) => {
                    navigate("/caixa", { state: { openDialog: true, bookmakerId, bookmakerNome, tipo: tipo === "deposito" ? "deposito" : "retirada", moeda } });
                  }}
                />
            </TabsContent>
            <TabsContent value="nao-criadas">
              <BookmakersNaoCriadasModule />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="ocorrencias" className="mt-4"><OcorrenciasModule /></TabsContent>
        <TabsContent value="alertas" className="mt-4">
          <div className="flex flex-col items-center justify-center py-24 text-center"><p className="text-muted-foreground">Em breve: Alertas automáticos do sistema.</p></div>
        </TabsContent>
      </Tabs>
      )}

      {/* Extracted dialogs */}
      <CentralOperacoesDialogs
        fetchData={fetchData}
        selectedEntrega={selectedEntrega}
        conciliacaoOpen={conciliacaoOpen}
        setConciliacaoOpen={setConciliacaoOpen}
        selectedSaque={selectedSaque}
        confirmarSaqueOpen={confirmarSaqueOpen}
        setConfirmarSaqueOpen={setConfirmarSaqueOpen}
        setSelectedSaque={setSelectedSaque}
        selectedPagamentoOperador={selectedPagamentoOperador}
        pagamentoOperadorOpen={pagamentoOperadorOpen}
        setPagamentoOperadorOpen={setPagamentoOperadorOpen}
        setSelectedPagamentoOperador={setSelectedPagamentoOperador}
        selectedParticipacao={selectedParticipacao}
        pagamentoParticipacaoOpen={pagamentoParticipacaoOpen}
        setPagamentoParticipacaoOpen={setPagamentoParticipacaoOpen}
        setSelectedParticipacao={setSelectedParticipacao}
        dispensaState={dispensaState}
        setDispensaOpen={setDispensaOpen}
        setDispensaMotivo={setDispensaMotivo}
        setDispensaEstornar={setDispensaEstornar}
        onDispensarPagamento={handleDispensarPagamento}
        perdaLimitadaDialog={perdaLimitadaDialog}
        setPerdaLimitadaDialog={setPerdaLimitadaDialog}
        selectedPagamentoParceiro={selectedPagamentoParceiro}
        pagamentoParceiroDialogOpen={pagamentoParceiroDialogOpen}
        setPagamentoParceiroDialogOpen={setPagamentoParceiroDialogOpen}
        setSelectedPagamentoParceiro={setSelectedPagamentoParceiro}
        selectedPagamentoFornecedor={selectedPagamentoFornecedor}
        pagamentoFornecedorOpen={pagamentoFornecedorOpen}
        setPagamentoFornecedorOpen={setPagamentoFornecedorOpen}
        setSelectedPagamentoFornecedor={setSelectedPagamentoFornecedor}
        encerrarDialogOpen={encerrarDialogOpen}
        setEncerrarDialogOpen={setEncerrarDialogOpen}
        parceriaToEncerrar={parceriaToEncerrar}
        encerrarLoading={encerrarLoading}
        onEncerrarParceria={handleEncerrarParceria}
        renovarDialogOpen={renovarDialogOpen}
        handleRenovarDialogClose={handleRenovarDialogClose}
        parceriaToRenovar={parceriaToRenovar}
        onRenewalSuccess={handleRenewalSuccess}
      />

      {/* Dialog: Vincular projeto a casa pendente de conciliação */}
      <Dialog open={vincularConciliacaoOpen} onOpenChange={setVincularConciliacaoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular a Projeto</DialogTitle>
            <DialogDescription>
              Vincular <strong>{selectedCasaConciliacao?.bookmaker_nome}</strong>
              {selectedCasaConciliacao?.parceiro_nome && ` de ${getFirstLastName(selectedCasaConciliacao.parceiro_nome)}`} a um projeto ativo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm">Saldo: <strong>{selectedCasaConciliacao && formatCurrency(selectedCasaConciliacao.saldo_atual, selectedCasaConciliacao.moeda)}</strong></span>
            </div>
            <Select value={selectedProjetoVincular} onValueChange={setSelectedProjetoVincular}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar projeto..." />
              </SelectTrigger>
              <SelectContent>
                {(projetosAtivos || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincularConciliacaoOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleVincularConciliacao}
              disabled={!selectedProjetoVincular || vincularConciliacaoLoading}
            >
              {vincularConciliacaoLoading ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
