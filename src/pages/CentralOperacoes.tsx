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
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { getTodayCivilDate } from "@/utils/dateUtils";
import { useTopBar } from "@/contexts/TopBarContext";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OcorrenciasModule } from "@/components/ocorrencias/OcorrenciasModule";
import { SolicitacoesModule } from "@/components/solicitacoes/SolicitacoesModule";
import { useOcorrenciasKpis } from "@/hooks/useOcorrencias";
import { useSolicitacoesKpis } from "@/hooks/useSolicitacoes";
import { formatCurrency as formatCurrencyUtil } from "@/utils/formatCurrency";
import { supabase } from "@/integrations/supabase/client";
import { getFirstLastName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Clock,
  DollarSign,
  Building2,
  User,
  Calendar,
  RefreshCw,
  Loader2,
  FolderKanban,
  Package,
  Target,
  Users,
  Banknote,
  CheckCircle2,
  TrendingUp,
  Gift,
  Zap,
  UserPlus,
  ShieldAlert,
  Unlink,
  Wallet,
  XCircle,
  Ghost,
  Truck,
  MoreVertical,
  Undo2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { EntregaConciliacaoDialog } from "@/components/entregas/EntregaConciliacaoDialog";
import { ConfirmarSaqueDialog } from "@/components/caixa/ConfirmarSaqueDialog";
import { SaquesSmartFilter } from "@/components/central-operacoes/SaquesSmartFilter";
import { CasasLimitadasSmartFilter } from "@/components/central-operacoes/CasasLimitadasSmartFilter";
import { ParticipacoesSmartFilter } from "@/components/central-operacoes/ParticipacoesSmartFilter";
import { PagamentoOperadorDialog } from "@/components/operadores/PagamentoOperadorDialog";
import { PropostasPagamentoCard } from "@/components/operadores/PropostasPagamentoCard";
import { PagamentoParticipacaoDialog } from "@/components/projetos/PagamentoParticipacaoDialog";
import { useCicloAlertas } from "@/hooks/useCicloAlertas";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { RegistrarPerdaRapidaDialog } from "@/components/parceiros/RegistrarPerdaRapidaDialog";
import { PagamentoFornecedorDialog } from "@/components/programa-indicacao/PagamentoFornecedorDialog";
import { PagamentoParceiroDialog } from "@/components/programa-indicacao/PagamentoParceiroDialog";
import { ParceriaDialog, type RenewalSuccessData } from "@/components/parcerias/ParceriaDialog";
import { ContasDisponiveisModule } from "@/components/central-operacoes/ContasDisponiveisModule";
import { BookmakersLivresModule } from "@/components/central-operacoes/BookmakersLivresModule";

// Types imported from hook
import {
  useCentralOperacoesData,
  ROLE_VISIBILITY,
  type EventDomain,
  type CasaPendenteConciliacao,
  type Alerta,
  type EntregaPendente,
  type PagamentoParceiroPendente,
  type PagamentoFornecedorPendente,
  type BonusPendente,
  type ComissaoPendente,
  type PagamentoOperadorPendente,
  type ParceriaAlertaEncerramento,
  type ParceiroSemParceria,
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

// Enum for card priority
const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
} as const;

export default function CentralOperacoes() {
  const { setContent: setTopBarContent } = useTopBar();
  const navigate = useNavigate();

  const { alertas: alertasCiclos, refetch: refetchCiclos } = useCicloAlertas();
  const { role, isOperator } = useRole();
  const { user, workspaceId } = useAuth();
  const { data: kpisOcorrencias } = useOcorrenciasKpis();
  const { data: kpisSolicitacoes } = useSolicitacoesKpis();

  // ==================== REACT QUERY: Cache + Deduplicação ====================
  const { data: centralData, loading, refreshing, refetch: refetchCentral, allowedDomains } = useCentralOperacoesData();

  // Destructure all data from cached query
  const {
    alertas, entregasPendentes, pagamentosParceiros, pagamentosFornecedores,
    bonusPendentes, comissoesPendentes, parceriasEncerramento: parceriasEncerramentoData,
    parceirosSemParceria, saquesPendentes, alertasLucro: alertasLucroData,
    pagamentosOperadorPendentes, participacoesPendentes, casasDesvinculadas,
    casasPendentesConciliacao, propostasPagamentoCount,
  } = centralData;

  // Mutable state for items that can be modified locally (optimistic updates)
  const [alertasLucro, setAlertasLucro] = useState<AlertaLucroParceiro[]>([]);
  const [parceriasEncerramento, setParceriasEncerramento] = useState<ParceriaAlertaEncerramento[]>([]);
  
  // Sync mutable state from query
  useEffect(() => { setAlertasLucro(alertasLucroData); }, [alertasLucroData]);
  useEffect(() => { setParceriasEncerramento(parceriasEncerramentoData); }, [parceriasEncerramentoData]);

  // Contagem de contas disponíveis com saldo (alerta visual)
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

  // ─── REALTIME: Apenas eventos críticos ─────
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    if (!workspaceId) return;

    const debouncedRefresh = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        refetchCentral();
      }, 3000);
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

  // Dialog UI states (kept local - not data)
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
  const [perdaLimitadaDialog, setPerdaLimitadaDialog] = useState<{
    open: boolean;
    bookmakerId: string;
    bookmakerNome: string;
    moeda: string;
    saldoAtual: number;
  } | null>(null);
  const [pagamentoFornecedorOpen, setPagamentoFornecedorOpen] = useState(false);
  const [selectedPagamentoFornecedor, setSelectedPagamentoFornecedor] = useState<PagamentoFornecedorPendente | null>(null);
  const [pagamentoParceiroDialogOpen, setPagamentoParceiroDialogOpen] = useState(false);
  const [selectedPagamentoParceiro, setSelectedPagamentoParceiro] = useState<PagamentoParceiroPendente | null>(null);
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false);
  const [parceriaToEncerrar, setParceriaToEncerrar] = useState<ParceriaAlertaEncerramento | null>(null);
  const [encerrarLoading, setEncerrarLoading] = useState(false);
  const [renovarDialogOpen, setRenovarDialogOpen] = useState(false);
  const [parceriaToRenovar, setParceriaToRenovar] = useState<ParceriaAlertaEncerramento | null>(null);
  const [mainTab, setMainTabState] = useState<'financeiro' | 'contas' | 'ocorrencias' | 'solicitacoes' | 'alertas'>(() => {
    const saved = localStorage.getItem('central-operacoes-main-tab');
    if (saved === 'financeiro' || saved === 'contas' || saved === 'ocorrencias' || saved === 'solicitacoes' || saved === 'alertas') return saved;
    return 'financeiro';
  });
  const setMainTab = (tab: 'financeiro' | 'contas' | 'ocorrencias' | 'solicitacoes' | 'alertas') => {
    setMainTabState(tab);
    localStorage.setItem('central-operacoes-main-tab', tab);
  };

  // Helper alias for refetch after mutations
  const fetchData = useCallback((isRefresh?: boolean) => { refetchCentral(); }, [refetchCentral]);

  const handleEncerrarParceria = async () => {
    if (!parceriaToEncerrar) return;
    try {
      setEncerrarLoading(true);
      const hoje = new Date();
      const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      const { error } = await supabase
        .from("parcerias")
        .update({ status: "ENCERRADA", data_fim_real: hojeStr })
        .eq("id", parceriaToEncerrar.id);
      if (error) throw error;
      toast.success(`Parceria com ${parceriaToEncerrar.parceiroNome} encerrada com sucesso`);
      setParceriasEncerramento(prev => prev.filter(p => p.id !== parceriaToEncerrar.id));
    } catch (error: any) {
      toast.error("Erro ao encerrar parceria: " + error.message);
    } finally {
      setEncerrarLoading(false);
      setEncerrarDialogOpen(false);
      setParceriaToEncerrar(null);
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
    // Close renewal dialog
    setRenovarDialogOpen(false);
    setParceriaToRenovar(null);
    fetchData(true);

    // Open payment dialog based on origin type
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
      // For DIRETO or INDICADOR, open partner payment dialog
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

  // Usa helper centralizado que previne RangeError em tokens cripto
  const formatCurrency = (value: number, moeda: string = "BRL") => {
    return formatCurrencyUtil(value, moeda);
  };

  const handleSaqueAction = (alerta: Alerta) => {
    // Determinar se é FIAT ou CRYPTO baseado na moeda
    const moedaAlerta = alerta.moeda || "BRL";
    const isCrypto = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL", "MATIC", "ADA", "DOT", "AVAX", "LINK", "UNI", "LTC", "XRP"].includes(moedaAlerta);
    
    // Navegar para Caixa com dados pré-preenchidos para saque incluindo moeda
    navigate("/caixa", { 
      state: { 
        openDialog: true, 
        bookmakerId: alerta.entidade_id,
        bookmakerNome: alerta.titulo,
        parceiroId: alerta.parceiro_id,
        parceiroNome: alerta.parceiro_nome,
        tipoMoeda: isCrypto ? "CRYPTO" : "FIAT",
        moeda: isCrypto ? undefined : moedaAlerta,
        coin: isCrypto ? moedaAlerta : undefined,
      } 
    });
  };

  const handleConciliarEntrega = (entrega: EntregaPendente) => {
    setSelectedEntrega(entrega);
    setConciliacaoOpen(true);
  };

  const handleConfirmarSaque = (saque: SaquePendenteConfirmacao) => {
    setSelectedSaque(saque);
    setConfirmarSaqueOpen(true);
  };

  const handleSolicitarSaqueCasaDesvinculada = (casa: BookmakerDesvinculado) => {
    navigate("/caixa", { state: { openDialog: true, bookmakerId: casa.id, bookmakerNome: casa.nome } });
  };

  // Cancelar liberação de saque - reverte bookmaker ao estado anterior
  // Casa aparecerá em "Contas Disponíveis" para nova decisão
  const handleCancelarLiberacao = async (alerta: Alerta) => {
    try {
      // Restaurar status anterior (salvo em status_pre_bloqueio) ou 'ativo' como fallback
      const statusRestaurado = alerta.status_anterior || "ativo";
      
      const { error } = await supabase
        .from("bookmakers")
        .update({
          aguardando_saque_at: null,
          status: statusRestaurado,
          status_pre_bloqueio: null,
        })
        .eq("id", alerta.entidade_id);

      if (error) throw error;

      toast.success(`"${alerta.titulo}" devolvida para Contas Disponíveis`, {
        description: "Você pode vincular a um projeto ou tomar outra decisão.",
      });
      fetchData(true);
    } catch (err) {
      console.error("Erro ao cancelar liberação:", err);
      toast.error("Erro ao cancelar liberação");
    }
  };

  // Marcar casa para saque (decisão do responsável)
  // Usa RPC que preserva estado_conta antes de entrar no workflow
  const handleMarcarParaSaque = async (casa: BookmakerDesvinculado) => {
    try {
      const { error } = await supabase.rpc('marcar_para_saque', {
        p_bookmaker_id: casa.id
      });

      if (error) throw error;
      
      toast.success(`"${casa.nome}" marcada para saque`);
      fetchData(true);
    } catch (err) {
      console.error("Erro ao marcar para saque:", err);
      toast.error("Erro ao marcar para saque");
    }
  };

  // Disponibilizar casa para novos projetos (decisão do responsável)
  // Limpa workflow de saque e restaura estado anterior
  const handleDisponibilizarCasa = async (casa: BookmakerDesvinculado) => {
    try {
      // Se estava em workflow de saque, usar RPC para restaurar estado corretamente
      const { error } = await supabase.rpc('confirmar_saque_concluido', {
        p_bookmaker_id: casa.id
      });

      if (error) throw error;
      
      toast.success(`"${casa.nome}" disponibilizada para novos projetos`);
      fetchData(true);
    } catch (err) {
      console.error("Erro ao disponibilizar casa:", err);
      toast.error("Erro ao disponibilizar casa");
    }
  };

  const handleAcknowledgeCasaDesvinculada = async (casa: BookmakerDesvinculado) => {
    try {
      const { error } = await supabase
        .from("bookmaker_unlinked_acks")
        .insert({
          bookmaker_id: casa.id,
          workspace_id: casa.workspace_id,
          acknowledged_by: user?.id,
          reason: "Usuário reconheceu a pendência",
        });

      if (error) throw error;
      
      toast.success(`Alerta de "${casa.nome}" removido`);
      fetchData(true);
    } catch (err) {
      console.error("Erro ao registrar acknowledge:", err);
      toast.error("Erro ao confirmar ciência");
    }
  };

  const handleDispensarPagamento = async () => {
    if (!dispensaParceriaId || !dispensaMotivo.trim()) return;
    setDispensaLoading(true);
    try {
      const pagData = pagamentosParceiros.find(p => p.parceriaId === dispensaParceriaId);

      const { data: parceria } = await supabase
        .from("parcerias")
        .select("valor_comissao_indicador, comissao_paga, indicacao_id, parceiro_id, workspace_id")
        .eq("id", dispensaParceriaId)
        .single();

      const { error } = await supabase
        .from("parcerias")
        .update({
          pagamento_dispensado: true,
          dispensa_motivo: dispensaMotivo.trim(),
          dispensa_at: new Date().toISOString(),
          dispensa_por: user?.id,
          comissao_paga: true,
        })
        .eq("id", dispensaParceriaId);
      if (error) throw error;

      if (pagData && user) {
        let indicadorId: string | null = null;
        if (parceria?.indicacao_id) {
          const { data: indicacao } = await supabase
            .from("v_indicacoes_workspace")
            .select("indicador_id")
            .eq("id", parceria.indicacao_id)
            .maybeSingle();
          indicadorId = indicacao?.indicador_id || null;
        }

        const auditRecords: any[] = [
          {
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "PAGTO_PARCEIRO_DISPENSADO",
            valor: 0,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaParceriaId,
            parceiro_id: pagData.parceiroId,
            descricao: `Pagamento dispensado: ${dispensaMotivo.trim()}`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          },
        ];

        // Cenário: comissão já paga + estorno solicitado
        if (dispensaComissaoJaPaga && dispensaEstornar) {
          const valorEstorno = dispensaValorComissao;
          
          const { error: ledgerError } = await supabase
            .from("cash_ledger")
            .insert({
              user_id: user.id,
              workspace_id: pagData.workspaceId,
              tipo_transacao: "ESTORNO_COMISSAO_INDICADOR",
              tipo_moeda: "FIAT",
              moeda: "BRL",
              valor: valorEstorno,
              origem_tipo: "PARCEIRO",
              destino_tipo: "CAIXA_OPERACIONAL",
              data_transacao: getTodayCivilDate(),
              descricao: `Estorno comissão - parceria dispensada (${dispensaParceiroNome})`,
              status: "CONFIRMADO",
            });
          if (ledgerError) throw ledgerError;

          auditRecords.push({
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "ESTORNO_COMISSAO_INDICADOR",
            valor: valorEstorno,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaParceriaId,
            parceiro_id: pagData.parceiroId,
            indicador_id: indicadorId,
            descricao: `Estorno comissão: parceria dispensada - ${dispensaMotivo.trim()}`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          });
        } else if (dispensaComissaoJaPaga && !dispensaEstornar) {
          auditRecords.push({
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "COMISSAO_INDICADOR_DISPENSADA",
            valor: 0,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaParceriaId,
            parceiro_id: pagData.parceiroId,
            indicador_id: indicadorId,
            descricao: `⚠️ Comissão de R$ ${dispensaValorComissao.toFixed(2)} já paga ao indicador. Sobrepagamento mantido sem estorno. Motivo dispensa: ${dispensaMotivo.trim()}`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          });
        } else if (!dispensaComissaoJaPaga && parceria?.valor_comissao_indicador && parceria.valor_comissao_indicador > 0) {
          auditRecords.push({
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "COMISSAO_INDICADOR_DISPENSADA",
            valor: 0,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaParceriaId,
            parceiro_id: pagData.parceiroId,
            indicador_id: indicadorId,
            descricao: `Comissão dispensada: parceria não efetivada`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          });
        }

        await supabase.from("movimentacoes_indicacao").insert(auditRecords);
      }

      toast.success(`Pagamento de ${dispensaParceiroNome} dispensado${dispensaComissaoJaPaga && dispensaEstornar ? ". Estorno da comissão registrado." : ""}`);
      setDispensaOpen(false);
      setDispensaMotivo('');
      setDispensaParceriaId(null);
      setDispensaComissaoJaPaga(false);
      setDispensaEstornar(false);
      fetchData(true);
    } catch (err) {
      console.error("Erro ao dispensar pagamento:", err);
      toast.error("Erro ao dispensar pagamento");
    } finally {
      setDispensaLoading(false);
    }
  };

  const alertasSaques = alertas.filter((a) => a.tipo_alerta === "BOOKMAKER_SAQUE");

  const alertasLimitadas = alertas.filter((a) => a.tipo_alerta === "BOOKMAKER_LIMITADA");
  const alertasCriticos = alertas.filter((a) => a.nivel_urgencia === "CRITICA");

  // Filtrar ciclos por projetos do operador
  const alertasCiclosFiltrados = useMemo(() => {
    if (!isOperator) return alertasCiclos;
    // Para operadores, precisaria filtrar pelos projetos vinculados
    // Por enquanto, mostrar todos (a view já deve ter RLS)
    return alertasCiclos;
  }, [alertasCiclos, isOperator]);

  // Build alert cards with priority and domain filtering
  const alertCards = useMemo(() => {
    const cards: Array<{ id: string; priority: number; component: JSX.Element; domain: EventDomain }> = [];

    // 1. Alertas Críticos (highest priority) - admin_event
    if (alertasCriticos.length > 0 && allowedDomains.includes('admin_event')) {
      cards.push({
        id: "alertas-criticos",
        priority: PRIORITY.CRITICAL,
        domain: 'admin_event',
        component: (
          <Card key="alertas-criticos" className="border-red-500/40 bg-red-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                Alertas Críticos
                <Badge className="ml-auto bg-red-500/20 text-red-400">{alertasCriticos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasCriticos.slice(0, 5).map((alerta) => (
                  <div key={alerta.entidade_id} className="flex items-center justify-between p-2 rounded-lg border border-red-500/30 bg-red-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <span className="text-xs font-medium truncate">{alerta.titulo}</span>
                    </div>
                    <Button size="sm" variant="destructive" className="h-6 text-xs px-2 shrink-0">
                      Resolver
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 2. Propostas de Pagamento - project_event (operador vê apenas as próprias)
    // REGRA: Só renderizar se houver propostas pendentes
    if (allowedDomains.includes('project_event') && propostasPagamentoCount > 0) {
      cards.push({
        id: "propostas-pagamento",
        priority: PRIORITY.HIGH,
        domain: 'project_event',
        component: <PropostasPagamentoCard key="propostas-pagamento" />,
      });
    }

    // 2.5. Casas Pendentes de Conciliação - financial_event (PRIORIDADE ALTA)
    // REGRA: Casas com transações pendentes bloqueiam operação
    if (casasPendentesConciliacao.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-pendentes-conciliacao",
        priority: PRIORITY.CRITICAL, // Prioridade crítica - bloqueia operação
        domain: 'financial_event',
        component: (
          <Card key="casas-pendentes-conciliacao" className="border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Conciliação Pendente
                <CardInfoTooltip 
                  title="Conciliação Obrigatória"
                  description="Casas com transações pendentes não podem ser utilizadas para apostas ou bônus até que a conciliação seja realizada."
                  flow="Transações pendentes (depósitos, saques em processamento) devem ser conciliadas para liberar a casa para operação."
                />
                <Badge className="ml-auto bg-amber-500/20 text-amber-600 animate-pulse">{casasPendentesConciliacao.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Casas bloqueadas até conciliar transações
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {casasPendentesConciliacao.map((casa) => (
                  <div key={casa.bookmaker_id} className="flex items-center justify-between p-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0 animate-pulse" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {casa.bookmaker_nome}
                          {casa.parceiro_nome && <span className="text-muted-foreground font-normal"> de {getFirstLastName(casa.parceiro_nome)}</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {casa.projeto_nome ? (
                            <span className="text-primary/80">{casa.projeto_nome}</span>
                          ) : (
                            <span className="text-amber-600 italic">Nenhum projeto vinculado</span>
                          )}
                          <span className="mx-1">•</span>
                          {casa.qtd_transacoes_pendentes} {casa.qtd_transacoes_pendentes === 1 ? "transação" : "transações"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-amber-500">
                        {formatCurrency(casa.valor_total_pendente, casa.moeda)}
                      </span>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          navigate(`/caixa?tab=conciliacao&bookmaker=${casa.bookmaker_id}`);
                        }}
                        className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 h-6 text-xs px-2"
                      >
                        Conciliar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 3. Saques Aguardando Confirmação - financial_event
    if (saquesPendentes.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "saques-aguardando",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="saques-aguardando" className="border-yellow-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-yellow-400" />
                Saques Aguardando Confirmação
                <CardInfoTooltip 
                  title="Saques Aguardando Confirmação"
                  description="Saques que foram iniciados e precisam de confirmação de recebimento pelo parceiro/conta bancária."
                  flow="Quando um saque é registrado no Caixa, ele fica pendente até que a tesouraria confirme que o valor foi recebido no destino."
                />
                <Badge className="ml-auto bg-yellow-500/20 text-yellow-400">{saquesPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <SaquesSmartFilter saques={saquesPendentes}>
                {(filtered) => (
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                    {filtered.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhum saque encontrado com os filtros aplicados.
                      </p>
                    ) : (
                      filtered.map((saque) => {
                        const destinoNome = saque.destino_wallet_id 
                          ? (saque.wallet_exchange || saque.wallet_nome || "Wallet") 
                          : (saque.banco_nome || "Conta Bancária");
                        const parceiroShort = saque.parceiro_nome ? getFirstLastName(saque.parceiro_nome) : "";
                        
                        return (
                          <div key={saque.id} className="flex items-center gap-2 p-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                            {saque.destino_wallet_id ? (
                              <Wallet className="h-4 w-4 text-yellow-400 shrink-0" />
                            ) : (
                              <Building2 className="h-4 w-4 text-yellow-400 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">
                                {destinoNome}{parceiroShort ? ` · ${parceiroShort}` : ""}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {saque.bookmaker_nome}
                                {saque.coin ? ` · ${saque.coin}` : ""}
                                {saque.projeto_nome ? ` · ${saque.projeto_nome}` : ""}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-yellow-400 shrink-0">
                              {formatCurrency(saque.valor_origem || saque.valor, saque.moeda_origem || saque.moeda)}
                            </span>
                            <Button size="sm" onClick={() => handleConfirmarSaque(saque)} className="bg-yellow-600 hover:bg-yellow-700 h-6 text-xs px-2 shrink-0">
                              Confirmar
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </SaquesSmartFilter>
            </CardContent>
          </Card>
        ),
      });
    }

    // 4. Saques Pendentes de Processamento - financial_event
    if (alertasSaques.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "saques-processamento",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="saques-processamento" className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Saques Pendentes de Processamento
                <CardInfoTooltip 
                  title="Saques Pendentes de Processamento"
                  description="Bookmakers marcados para saque que aguardam a tesouraria processar a retirada do saldo."
                  flow="Uma casa chega aqui quando: (1) Foi desvinculada de um projeto e estava marcada como 'limitada' — nesse caso o saque é automático; ou (2) Estava em 'Casas Aguardando Decisão' e o gestor escolheu 'Marcar para Saque'."
                />
                <Badge className="ml-auto bg-emerald-500/20 text-emerald-400">{alertasSaques.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {alertasSaques.map((alerta) => (
                  <div key={alerta.entidade_id} className="flex items-center justify-between p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{alerta.titulo}</p>
                        {alerta.parceiro_nome && (
                          <p className="text-[10px] text-muted-foreground truncate">{getFirstLastName(alerta.parceiro_nome)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {alerta.valor && <span className="text-xs font-bold text-emerald-400">{formatCurrency(alerta.valor, alerta.moeda)}</span>}
                      <Button size="sm" onClick={() => handleSaqueAction(alerta)} className="h-6 text-xs px-2">
                        Processar
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleCancelarLiberacao(alerta)} className="text-xs gap-2">
                            <Undo2 className="h-3.5 w-3.5" />
                            Cancelar Liberação
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 4.5. Casas Limitadas - financial_event
    if (alertasLimitadas.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-limitadas",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="casas-limitadas" className="border-orange-500/30 bg-orange-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-orange-400" />
                Casas Limitadas
                <CardInfoTooltip 
                  title="Casas Limitadas"
                  description="Bookmakers que foram marcadas como limitadas e ainda estão vinculadas a projetos. Precisam de atenção para saque."
                  flow="Quando uma bookmaker é marcada como 'Limitada' (conta restrita pela casa), ela aparece aqui para processamento de saque."
                />
                <Badge className="ml-auto bg-orange-500/20 text-orange-400">{alertasLimitadas.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Casas devolvidas/limitadas com saldo pendente
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <CasasLimitadasSmartFilter casas={alertasLimitadas}>
                {(filtered) => (
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                    {filtered.map((alerta) => (
                      <div key={alerta.entidade_id} className="flex items-center justify-between p-2 rounded-lg border border-orange-500/30 bg-orange-500/10">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Building2 className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{alerta.titulo}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {alerta.parceiro_nome && `${getFirstLastName(alerta.parceiro_nome)} • `}Sacar ou realocar saldo
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {alerta.valor && <span className="text-xs font-bold text-orange-400">{formatCurrency(alerta.valor, alerta.moeda)}</span>}
                          <TooltipProvider>
                            <Tooltip delayDuration={200}>
                              <TooltipTrigger asChild>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => setPerdaLimitadaDialog({
                                    open: true,
                                    bookmakerId: alerta.entidade_id,
                                    bookmakerNome: alerta.titulo,
                                    moeda: alerta.moeda || "BRL",
                                    saldoAtual: alerta.valor || 0,
                                  })}
                                  className="border-destructive/50 text-destructive hover:bg-destructive/10 h-6 text-xs px-2 gap-1"
                                >
                                  <Ghost className="h-3 w-3" />
                                  Fantasma
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs p-3 space-y-1">
                                <p className="font-medium text-sm">Saldo Fantasma</p>
                                <p className="text-xs text-muted-foreground">
                                  Registra como perda operacional o saldo residual que não pode ser sacado (arredondamentos, odds travadas, centavos retidos). Remove a pendência de saque e não afeta estatísticas de apostas.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button size="sm" onClick={() => handleSaqueAction(alerta)} className="bg-orange-600 hover:bg-orange-700 h-6 text-xs px-2">
                            Sacar
                          </Button>
                        </div>
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-center text-[10px] text-muted-foreground py-4">Nenhuma casa encontrada com os filtros aplicados.</p>
                    )}
                  </div>
                )}
              </CasasLimitadasSmartFilter>
            </CardContent>
          </Card>
        ),
      });
    }

    // 4.6. Casas Aguardando Decisão - financial_event
    // Separar casas por status: AGUARDANDO_DECISAO vs ATIVO (legado)
    const casasAguardandoDecisao = casasDesvinculadas.filter(c => c.status === 'AGUARDANDO_DECISAO');
    const casasAtivasDesvinculadas = casasDesvinculadas.filter(c => c.status === 'ATIVO');
    
    if (casasAguardandoDecisao.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-aguardando-decisao",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="casas-aguardando-decisao" className="border-purple-500/30 bg-purple-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Unlink className="h-4 w-4 text-purple-400" />
                Casas Aguardando Decisão
                <CardInfoTooltip 
                  title="Casas Aguardando Decisão"
                  description="Bookmakers ativas que foram desvinculadas de projetos com saldo positivo. Você decide: disponibilizar para outros projetos ou sacar."
                  flow="Quando um operador desvincula uma casa ATIVA (não limitada) com saldo, ela vem para cá aguardando decisão do responsável financeiro."
                />
                <Badge className="ml-auto bg-purple-500/20 text-purple-400">{casasAguardandoDecisao.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Definir destino: disponibilizar ou sacar
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {casasAguardandoDecisao.map((casa) => (
                  <div key={casa.id} className="flex items-center justify-between p-2 rounded-lg border border-purple-500/30 bg-purple-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Unlink className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{casa.nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {casa.parceiro_nome ? getFirstLastName(casa.parceiro_nome) : "Sem parceiro"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-purple-400">{formatCurrency(casa.saldo_efetivo, casa.moeda)}</span>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDisponibilizarCasa(casa)} 
                          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-6 text-xs px-2"
                        >
                          Disponibilizar
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleMarcarParaSaque(casa)} 
                          className="bg-purple-600 hover:bg-purple-700 h-6 text-xs px-2"
                        >
                          Marcar Saque
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // Card legado para casas ativas desvinculadas (compatibilidade)
    if (casasAtivasDesvinculadas.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-desvinculadas",
        priority: PRIORITY.MEDIUM,
        domain: 'financial_event',
        component: (
          <Card key="casas-desvinculadas" className="border-slate-500/30 bg-slate-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Unlink className="h-4 w-4 text-slate-400" />
                Casas Desvinculadas
                <CardInfoTooltip 
                  title="Casas Desvinculadas (Legado)"
                  description="Bookmakers que foram desvinculadas antes da nova regra de decisão. Podem ser sacadas ou marcadas como cientes."
                  flow="Casas desvinculadas antes da implementação do novo fluxo de decisão aparecem aqui para compatibilidade."
                />
                <Badge className="ml-auto bg-slate-500/20 text-slate-400">{casasAtivasDesvinculadas.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Casas sem projeto com saldo pendente
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {casasAtivasDesvinculadas.map((casa) => (
                  <div key={casa.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-500/30 bg-slate-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Unlink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{casa.nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {casa.parceiro_nome ? getFirstLastName(casa.parceiro_nome) : "Sem parceiro"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-slate-400">{formatCurrency(casa.saldo_efetivo, casa.moeda)}</span>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          onClick={() => handleSolicitarSaqueCasaDesvinculada(casa)} 
                          className="bg-slate-600 hover:bg-slate-700 h-6 text-xs px-2"
                        >
                          Sacar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleAcknowledgeCasaDesvinculada(casa)} 
                          className="border-slate-500/30 text-slate-400 hover:bg-slate-500/10 h-6 text-xs px-2"
                        >
                          Ciente
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 5. Participações de Investidores - financial_event
    if (participacoesPendentes.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "participacoes-investidores",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="participacoes-investidores" className="border-indigo-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-indigo-400" />
                Participações de Investidores
                <CardInfoTooltip 
                  title="Participações de Investidores"
                  description="Pagamentos de participação nos lucros devidos aos investidores com base nos ciclos apurados."
                  flow="Quando um ciclo de projeto é fechado com lucro, é calculada a participação de cada investidor conforme percentual acordado."
                />
                <Badge className="ml-auto bg-indigo-500/20 text-indigo-400">{participacoesPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ParticipacoesSmartFilter participacoes={participacoesPendentes}>
                {(filtered) => (
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                    {filtered.map((part) => (
                      <div key={part.id} className="flex items-center justify-between p-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 cursor-pointer" onClick={() => { setSelectedParticipacao(part); setPagamentoParticipacaoOpen(true); }}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <User className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{part.investidor_nome}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{part.projeto_nome} • Ciclo {part.ciclo_numero}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-indigo-400">{formatCurrency(part.valor_participacao)}</span>
                          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); setSelectedParticipacao(part); setPagamentoParticipacaoOpen(true); }}>
                            Pagar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ParticipacoesSmartFilter>
            </CardContent>
          </Card>
        ),
      });
    }

    // 6. Pagamentos de Operador - project_event
    if (pagamentosOperadorPendentes.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "pagamentos-operador",
        priority: PRIORITY.HIGH,
        domain: 'project_event',
        component: (
          <Card key="pagamentos-operador" className="border-orange-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-orange-400" />
                Pagamentos de Operador
                <CardInfoTooltip 
                  title="Pagamentos de Operador"
                  description="Pagamentos pendentes aos operadores de projetos (fixos, comissões ou bonificações)."
                  flow="Quando um operador atinge meta ou tem pagamento agendado, o valor é gerado automaticamente e aguarda processamento."
                />
                <Badge className="ml-auto bg-orange-500/20 text-orange-400">{pagamentosOperadorPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {pagamentosOperadorPendentes.map((pag) => (
                  <div key={pag.id} className="flex items-center justify-between p-2 rounded-lg border border-orange-500/20 bg-orange-500/5 cursor-pointer" onClick={() => { setSelectedPagamentoOperador(pag); setPagamentoOperadorOpen(true); }}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <DollarSign className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{pag.operador_nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{pag.tipo_pagamento}{pag.projeto_nome ? ` • ${pag.projeto_nome}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-orange-400">{formatCurrency(pag.valor)}</span>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700 h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); setSelectedPagamentoOperador(pag); setPagamentoOperadorOpen(true); }}>
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 7. Ciclos de Apuração - project_event
    if (alertasCiclosFiltrados.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "ciclos-apuracao",
        priority: PRIORITY.MEDIUM,
        domain: 'project_event',
        component: (
          <Card key="ciclos-apuracao" className="border-violet-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-violet-400" />
                Ciclos de Apuração
                <CardInfoTooltip 
                  title="Ciclos de Apuração"
                  description="Ciclos de projetos que estão próximos do fechamento ou já atingiram a meta de volume/tempo."
                  flow="Ciclos são criados automaticamente para projetos e fecham por tempo, volume apostado ou ambos (híbrido)."
                />
                <Badge className="ml-auto bg-violet-500/20 text-violet-400">{alertasCiclosFiltrados.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {alertasCiclosFiltrados.map((ciclo) => {
                  const getUrgencyColor = () => {
                    switch (ciclo.urgencia) {
                      case "CRITICA": return "border-red-500/40 bg-red-500/10";
                      case "ALTA": return "border-orange-500/40 bg-orange-500/10";
                      default: return "border-violet-500/30 bg-violet-500/10";
                    }
                  };
                  return (
                    <div key={ciclo.id} className={`p-2 rounded-lg border cursor-pointer ${getUrgencyColor()}`} onClick={() => navigate(`/projeto/${ciclo.projeto_id}`)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate">{ciclo.projeto_nome}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">Ciclo {ciclo.numero_ciclo}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          {ciclo.tipo_gatilho === "TEMPO" && <Clock className="h-3 w-3 text-muted-foreground" />}
                          {ciclo.tipo_gatilho === "VOLUME" && <Target className="h-3 w-3 text-muted-foreground" />}
                          {ciclo.tipo_gatilho === "HIBRIDO" && <Zap className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      </div>
                      {(ciclo.tipo_gatilho === "VOLUME" || ciclo.tipo_gatilho === "HIBRIDO") && ciclo.meta_volume && (
                        <div className="mt-2">
                          <Progress value={Math.min(100, ciclo.progresso_volume)} className="h-1" />
                          <p className="text-[10px] text-muted-foreground mt-1">{ciclo.progresso_volume.toFixed(0)}% concluído</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 8. Alertas de Lucro (Marcos) - partner_event
    if (alertasLucro.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "alertas-lucro",
        priority: PRIORITY.MEDIUM,
        domain: 'partner_event',
        component: (
          <Card key="alertas-lucro" className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Marcos de Lucro Atingidos
                <CardInfoTooltip 
                  title="Marcos de Lucro Atingidos"
                  description="Parceiros que atingiram marcos importantes de lucro acumulado (ex: R$1.000, R$5.000)."
                  flow="Quando o lucro total de um parceiro cruza um marco configurado, um alerta é gerado para acompanhamento."
                />
                <Badge className="ml-auto bg-emerald-500/20 text-emerald-400">{alertasLucro.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {alertasLucro.map((alerta) => (
                  <div key={alerta.id} className="flex items-center justify-between p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{alerta.parceiro_nome}</p>
                        <p className="text-[10px] text-muted-foreground">Lucro: {formatCurrency(alerta.lucro_atual)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-emerald-400">R$ {alerta.marco_valor.toLocaleString("pt-BR")}</span>
                      <Button size="sm" variant="outline" onClick={async () => {
                        try {
                          await supabase.from("parceiro_lucro_alertas").update({ notificado: true }).eq("id", alerta.id);
                          setAlertasLucro(prev => prev.filter(a => a.id !== alerta.id));
                          toast.success("Marco verificado");
                        } catch { toast.error("Erro ao confirmar"); }
                      }} className="h-6 text-[10px] px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                        <CheckCircle2 className="h-3 w-3 mr-1" />OK
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 9. Entregas Pendentes - project_event
    if (entregasPendentes.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "entregas-pendentes",
        priority: PRIORITY.MEDIUM,
        domain: 'project_event',
        component: (
          <Card key="entregas-pendentes" className="border-purple-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-purple-400" />
                Entregas Pendentes
                <CardInfoTooltip 
                  title="Entregas Pendentes"
                  description="Entregas de operadores que estão prontas para conciliação e pagamento."
                  flow="Quando uma entrega atinge a meta (tempo ou valor), ela fica disponível para conciliação e posterior pagamento ao operador."
                />
                <Badge className="ml-auto bg-purple-500/20 text-purple-400">{entregasPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {entregasPendentes.map((entrega) => (
                  <div key={entrega.id} className={`flex items-center justify-between p-2 rounded-lg border ${entrega.nivel_urgencia === "CRITICA" ? "border-red-500/30 bg-red-500/5" : "border-purple-500/20 bg-purple-500/5"}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Target className={`h-3.5 w-3.5 shrink-0 ${entrega.nivel_urgencia === "CRITICA" ? "text-red-400" : "text-purple-400"}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{entrega.operador_nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{entrega.projeto_nome} • Entrega #{entrega.numero_entrega}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-purple-400">{formatCurrency(entrega.resultado_nominal)}</span>
                      <Button size="sm" onClick={() => handleConciliarEntrega(entrega)} className="bg-purple-600 hover:bg-purple-700 h-6 text-xs px-2">
                        Conciliar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 10. Parceiros sem Parceria - partner_event
    if (parceirosSemParceria.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "parceiros-sem-parceria",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="parceiros-sem-parceria" className="border-amber-500/30">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                <UserPlus className="h-4 w-4 text-amber-400" />
                Parceiros sem Origem
                <CardInfoTooltip 
                  title="Parceiros sem Origem"
                  description="Parceiros ativos que não possuem indicador, fornecedor ou outra origem registrada."
                  flow="Parceiros cadastrados sem origem aparecem aqui para definição de como chegaram à operação."
                />
                <Badge className="ml-auto bg-amber-500/20 text-amber-400">{parceirosSemParceria.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Parceiros sem indicação, fornecedor ou origem registrada</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {parceirosSemParceria.map((parceiro) => (
                  <div key={parceiro.id} className="flex items-center justify-between p-2 rounded-lg border status-bg-orange">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <User className="h-3.5 w-3.5 status-orange shrink-0" />
                      <span className="text-xs font-medium truncate">{getFirstLastName(parceiro.nome)}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate("/programa-indicacao", { state: { tab: "parcerias", parceiroId: parceiro.id } })} className="h-6 text-xs px-2 status-orange status-bg-orange hover:opacity-80">
                      Definir Origem
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 11. Pagamentos a Parceiros - partner_event
    if (pagamentosParceiros.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "pagamentos-parceiros",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="pagamentos-parceiros" className="border-cyan-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-cyan-400" />
                Pagamentos a Parceiros
                <CardInfoTooltip 
                  title="Pagamentos a Parceiros"
                  description="Valores devidos aos parceiros conforme acordado na parceria (valor fixo ou percentual)."
                  flow="Quando uma parceria possui valor acordado para o parceiro, ele aparece aqui para pagamento."
                />
                <Badge className="ml-auto bg-cyan-500/20 text-cyan-400">{pagamentosParceiros.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {pagamentosParceiros.map((pag) => (
                  <div key={pag.parceriaId} className="flex items-center justify-between p-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <User className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span className="text-xs font-medium truncate">{getFirstLastName(pag.parceiroNome)}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-bold text-cyan-400">{formatCurrency(pag.valorParceiro)}</span>
                      <Button size="sm" variant="ghost" onClick={() => {
                          setSelectedPagamentoParceiro(pag);
                          setPagamentoParceiroDialogOpen(true);
                        }} className="h-6 text-xs px-2">
                        Pagar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2 text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          setDispensaParceriaId(pag.parceriaId);
                          setDispensaParceiroNome(pag.parceiroNome);
                          setDispensaMotivo('');
                          setDispensaEstornar(false);
                          // Check if comissão was already paid
                          const { data: parData } = await supabase
                            .from("parcerias")
                            .select("comissao_paga, valor_comissao_indicador, indicacao_id")
                            .eq("id", pag.parceriaId)
                            .single();
                          const jaPaga = parData?.comissao_paga === true && (parData?.valor_comissao_indicador || 0) > 0;
                          setDispensaComissaoJaPaga(jaPaga);
                          setDispensaValorComissao(parData?.valor_comissao_indicador || 0);
                          if (jaPaga && parData?.indicacao_id) {
                            const { data: ind } = await supabase
                              .from("v_indicacoes_workspace")
                              .select("indicador_id")
                              .eq("id", parData.indicacao_id)
                              .maybeSingle();
                            if (ind?.indicador_id) {
                              const { data: indRef } = await supabase
                                .from("indicadores_referral")
                                .select("nome")
                                .eq("id", ind.indicador_id)
                                .maybeSingle();
                              setDispensaIndicadorNome(indRef?.nome || "Indicador");
                            } else {
                              setDispensaIndicadorNome("Indicador");
                            }
                          } else {
                            setDispensaIndicadorNome("");
                          }
                          setDispensaOpen(true);
                        }}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Dispensar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 11b. Pagamentos a Fornecedores - partner_event
    if (pagamentosFornecedores.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "pagamentos-fornecedores",
        priority: PRIORITY.MEDIUM,
        domain: 'partner_event',
        component: (
          <Card key="pagamentos-fornecedores" className="border-orange-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4 text-orange-400" />
                Pagamentos a Fornecedores
                <CardInfoTooltip 
                  title="Pagamentos a Fornecedores"
                  description="Valores devidos aos fornecedores conforme acordado na parceria."
                  flow="Quando uma parceria é vinculada a um fornecedor com valor contratado, ele aparece aqui para pagamento."
                />
                <Badge className="ml-auto bg-orange-500/20 text-orange-400">{pagamentosFornecedores.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {pagamentosFornecedores.map((pag) => (
                  <div key={pag.parceriaId} className="flex items-center justify-between p-2 rounded-lg border border-orange-500/20 bg-orange-500/5">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Truck className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                        <span className="text-xs font-medium truncate">{pag.fornecedorNome}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-5">
                        Parceiro: {getFirstLastName(pag.parceiroNome)}
                        {pag.valorPago > 0 && ` · Pago: ${formatCurrency(pag.valorPago)} de ${formatCurrency(pag.valorFornecedor)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-bold text-orange-400">{formatCurrency(pag.valorRestante)}</span>
                      <Button size="sm" variant="ghost" onClick={() => {
                          setSelectedPagamentoFornecedor(pag);
                          setPagamentoFornecedorOpen(true);
                        }} className="h-6 text-xs px-2">
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 12. Bônus Pendentes - partner_event
    if (bonusPendentes.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "bonus-pendentes",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="bonus-pendentes" className="border-pink-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gift className="h-4 w-4 text-pink-400" />
                Bônus de Indicadores
                <CardInfoTooltip 
                  title="Bônus de Indicadores"
                  description="Bônus devidos a indicadores que atingiram metas de parceiros indicados."
                  flow="Quando um indicador atinge a meta de parceiros indicados, um bônus é gerado conforme acordo."
                />
                <Badge className="ml-auto bg-pink-500/20 text-pink-400">{bonusPendentes.reduce((acc, b) => acc + b.ciclosPendentes, 0)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {bonusPendentes.map((bonus) => (
                  <div key={bonus.indicadorId} className="flex items-center justify-between p-2 rounded-lg border border-pink-500/20 bg-pink-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Gift className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{bonus.indicadorNome}</p>
                        <p className="text-[10px] text-muted-foreground">{bonus.ciclosPendentes} ciclo(s) pendente(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-pink-400">{formatCurrency(bonus.totalBonusPendente)}</span>
                      <Button size="sm" variant="ghost" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })} className="h-6 text-xs px-2">
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 13. Comissões Pendentes - partner_event
    if (comissoesPendentes.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "comissoes-pendentes",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="comissoes-pendentes" className="border-teal-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-teal-400" />
                Comissões Pendentes
                <CardInfoTooltip 
                  title="Comissões Pendentes"
                  description="Comissões devidas a indicadores por parceiros que eles indicaram."
                  flow="Quando uma parceria indicada gera receita, uma comissão é calculada para o indicador responsável."
                />
                <Badge className="ml-auto bg-teal-500/20 text-teal-400">{comissoesPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {comissoesPendentes.map((comissao) => (
                  <div key={comissao.parceriaId} className="flex items-center justify-between p-2 rounded-lg border border-teal-500/20 bg-teal-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Banknote className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{comissao.indicadorNome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">→ {getFirstLastName(comissao.parceiroNome)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-teal-400">{formatCurrency(comissao.valorComissao)}</span>
                      <Button size="sm" variant="ghost" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })} className="h-6 text-xs px-2">
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 14. Parcerias Encerrando - partner_event
    if (parceriasEncerramento.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "parcerias-encerrando",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="parcerias-encerrando" className="border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-red-400" />
                Parcerias Encerrando
                <CardInfoTooltip 
                  title="Parcerias Encerrando"
                  description="Parcerias com data de fim próxima que precisam ser renovadas ou encerradas."
                  flow="Parcerias com data de encerramento nos próximos dias aparecem aqui para ação preventiva."
                />
                <Badge className="ml-auto bg-red-500/20 text-red-400">{parceriasEncerramento.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                {parceriasEncerramento.map((parc) => {
                  const isRed = parc.diasRestantes <= 5;
                  return (
                    <div key={parc.id} className={`flex items-center justify-between p-2 rounded-lg border ${isRed ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Calendar className={`h-3.5 w-3.5 shrink-0 ${isRed ? "text-red-400" : "text-yellow-400"}`} />
                        <span className="text-xs font-medium truncate">{getFirstLastName(parc.parceiroNome)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge className={`text-[10px] h-5 ${isRed ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                          {parc.diasRestantes <= 0 ? `${Math.abs(parc.diasRestantes)}d atrás` : `${parc.diasRestantes}d`}
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => handleRenovarClick(parc)} className="h-6 text-xs px-2">
                          Renovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setParceriaToEncerrar(parc); setEncerrarDialogOpen(true); }} className="h-6 text-xs px-2">
                          Encerrar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // Sort by priority
    return cards.sort((a, b) => a.priority - b.priority);
  }, [
    alertasCriticos, saquesPendentes, alertasSaques, alertasLimitadas, casasDesvinculadas,
    participacoesPendentes, pagamentosOperadorPendentes, alertasCiclosFiltrados, alertasLucro, 
    entregasPendentes, parceirosSemParceria, pagamentosParceiros, pagamentosFornecedores, bonusPendentes, comissoesPendentes, 
    parceriasEncerramento, allowedDomains, propostasPagamentoCount, casasPendentesConciliacao, navigate
  ]);

  const hasAnyAlerts = alertCards.length > 0;

  // Inject title into global TopBar
  useEffect(() => {
    setTopBarContent(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-default">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold text-sm">
                {isOperator ? "Central de Ações de Projetos" : "Central de Operações"}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isOperator ? "Ações pendentes nos seus projetos" : "Ações que demandam atenção imediata"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent, isOperator]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Actions bar */}
      <div className="flex items-center justify-end">
        {(mainTab === 'financeiro' || mainTab === 'contas') && (
          <Button variant="outline" onClick={() => { fetchData(true); refetchCiclos(); }} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        )}
      </div>

      {/* Tabs principais */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)}>
        <TabsList>
          <TabsTrigger value="financeiro" className="relative">
            Financeiro
            {alertCards.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold leading-none">
                {alertCards.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="contas" className="relative">
            Bookmakers Disponíveis
            {(contasDisponiveisCount ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none animate-pulse">
                !
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ocorrencias" className="relative">
            Ocorrências
            {(kpisOcorrencias?.abertas_total ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {kpisOcorrencias!.abertas_total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="solicitacoes" className="relative">
            Solicitações
            {(kpisSolicitacoes?.total_abertas ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-yellow-500 text-white text-[10px] font-bold leading-none">
                {kpisSolicitacoes!.total_abertas}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="alertas" disabled className="opacity-50">
            Alertas
            <span className="ml-1.5 text-[10px] text-muted-foreground">(em breve)</span>
          </TabsTrigger>
        </TabsList>

        {/* ABA: FINANCEIRO (conteúdo atual) */}
        <TabsContent value="financeiro" className="mt-4 space-y-4">
          {/* Empty State */}
          {!hasAnyAlerts && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="pt-6">
                <div className="text-center py-16">
                  <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-emerald-400">Nenhuma pendência</h3>
                  <p className="text-muted-foreground mt-2">
                    Todas as operações estão em dia! 🎉
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Alert Cards Grid - 3 columns */}
          {hasAnyAlerts && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {alertCards.map((card) => card.component)}
            </div>
          )}
        </TabsContent>

        {/* ABA: CONTAS DISPONÍVEIS (com sub-abas) */}
        <TabsContent value="contas" className="mt-4">
          <Tabs defaultValue="contas-saldo" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="contas-saldo">Bookmakers Disponíveis</TabsTrigger>
              <TabsTrigger value="bookmakers-livres">Bookmakers Livres</TabsTrigger>
            </TabsList>
            <TabsContent value="contas-saldo">
              <ContasDisponiveisModule />
            </TabsContent>
            <TabsContent value="bookmakers-livres">
              <BookmakersLivresModule
                onRegistrarPerda={(bookmakerId, bookmakerNome, moeda, saldoAtual) =>
                  setPerdaLimitadaDialog({ open: true, bookmakerId, bookmakerNome, moeda, saldoAtual })
                }
                onVincularProjeto={async (bookmakerId, projetoId, projetoNome) => {
                  try {
                    const { data: current } = await supabase
                      .from("bookmakers")
                      .select("projeto_id, saldo_atual, moeda, workspace_id")
                      .eq("id", bookmakerId)
                      .single();
                    if (current?.projeto_id) {
                      toast.error("Casa já vinculada a um projeto");
                      return;
                    }
                    const { error } = await supabase
                      .from("bookmakers")
                      .update({ projeto_id: projetoId })
                      .eq("id", bookmakerId);
                    if (error) throw error;

                    if (current?.workspace_id) {
                      const { data: userData } = await supabase.auth.getUser();
                      if (userData.user) {
                        const { executeLink } = await import("@/lib/projetoTransitionService");
                        await executeLink({
                          bookmakerId,
                          projetoId,
                          workspaceId: current.workspace_id,
                          userId: userData.user.id,
                          saldoAtual: current.saldo_atual || 0,
                          moeda: current.moeda || "BRL",
                        });
                      }
                    }

                    toast.success(`Casa vinculada ao projeto "${projetoNome}"`);
                    fetchData(true);
                  } catch (err) {
                    console.error("Erro ao vincular:", err);
                    toast.error("Erro ao vincular projeto");
                  }
                }}
                onNewTransacao={(bookmakerId, bookmakerNome, moeda, _saldo, _saldoUsd, tipo) => {
                  navigate("/caixa", {
                    state: {
                      openDialog: true,
                      bookmakerId,
                      bookmakerNome,
                      tipo: tipo === "deposito" ? "deposito" : "retirada",
                      moeda,
                    },
                  });
                }}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ABA: OCORRÊNCIAS */}
        <TabsContent value="ocorrencias" className="mt-4">
          <OcorrenciasModule />
        </TabsContent>

        {/* ABA: SOLICITAÇÕES */}
        <TabsContent value="solicitacoes" className="mt-4">
          <SolicitacoesModule />
        </TabsContent>

        {/* ABA: ALERTAS (reservado) */}
        <TabsContent value="alertas" className="mt-4">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-muted-foreground">Em breve: Alertas automáticos do sistema.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs do módulo Financeiro */}
      {selectedEntrega && (
        <EntregaConciliacaoDialog
          open={conciliacaoOpen}
          onOpenChange={setConciliacaoOpen}
          entrega={{
            id: selectedEntrega.id,
            numero_entrega: selectedEntrega.numero_entrega,
            resultado_nominal: selectedEntrega.resultado_nominal,
            saldo_inicial: selectedEntrega.saldo_inicial,
            meta_valor: selectedEntrega.meta_valor,
            meta_percentual: selectedEntrega.meta_percentual,
            tipo_gatilho: selectedEntrega.tipo_gatilho,
            data_inicio: selectedEntrega.data_inicio,
            data_fim_prevista: selectedEntrega.data_fim_prevista,
            operador_projeto_id: selectedEntrega.operador_projeto_id,
          }}
          operadorNome={selectedEntrega.operador_nome}
          operadorId={selectedEntrega.operador_id}
          projetoId={selectedEntrega.projeto_id}
          modeloPagamento={selectedEntrega.modelo_pagamento}
          valorFixo={selectedEntrega.valor_fixo || 0}
          percentual={selectedEntrega.percentual || 0}
          onSuccess={() => fetchData(true)}
        />
      )}

      <ConfirmarSaqueDialog
        open={confirmarSaqueOpen}
        onClose={() => { setConfirmarSaqueOpen(false); setSelectedSaque(null); }}
        onSuccess={() => fetchData(true)}
        saque={selectedSaque}
      />

      <PagamentoOperadorDialog
        open={pagamentoOperadorOpen}
        onOpenChange={(open) => { setPagamentoOperadorOpen(open); if (!open) setSelectedPagamentoOperador(null); }}
        pagamento={selectedPagamentoOperador ? {
          id: selectedPagamentoOperador.id,
          operador_id: selectedPagamentoOperador.operador_id,
          projeto_id: selectedPagamentoOperador.projeto_id || null,
          tipo_pagamento: selectedPagamentoOperador.tipo_pagamento,
          valor: selectedPagamentoOperador.valor,
          moeda: "BRL",
          data_pagamento: selectedPagamentoOperador.data_pagamento,
          data_competencia: null,
          descricao: null,
          status: "PENDENTE",
        } : undefined}
        onSuccess={() => fetchData(true)}
      />

      <PagamentoParticipacaoDialog
        open={pagamentoParticipacaoOpen}
        onOpenChange={(open) => { setPagamentoParticipacaoOpen(open); if (!open) setSelectedParticipacao(null); }}
        participacao={selectedParticipacao ? {
          id: selectedParticipacao.id,
          projeto_id: selectedParticipacao.projeto_id,
          ciclo_id: selectedParticipacao.ciclo_id,
          investidor_id: selectedParticipacao.investidor_id,
          percentual_aplicado: selectedParticipacao.percentual_aplicado,
          base_calculo: selectedParticipacao.base_calculo,
          lucro_base: selectedParticipacao.lucro_base,
          valor_participacao: selectedParticipacao.valor_participacao,
          data_apuracao: selectedParticipacao.data_apuracao,
          status: "A_PAGAR",
        } : undefined}
        onSuccess={() => fetchData(true)}
      />

      {/* Dialog de Dispensar Pagamento */}
      <AlertDialog open={dispensaOpen} onOpenChange={setDispensaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispensar pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              O pagamento a <strong>{getFirstLastName(dispensaParceiroNome)}</strong> será dispensado. Esta parceria não será contabilizada como indicação bem-sucedida.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Alerta de comissão já paga */}
          {dispensaComissaoJaPaga && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-500">Comissão já paga ao indicador</p>
                  <p className="text-muted-foreground mt-1">
                    A comissão de <strong>R$ {dispensaValorComissao.toFixed(2)}</strong>
                    {dispensaIndicadorNome ? ` para ${getFirstLastName(dispensaIndicadorNome)}` : ""} já foi creditada. 
                    Ao dispensar sem estorno, esse valor ficará registrado como sobrepagamento.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-7">
                <Checkbox 
                  id="estornar-comissao-central" 
                  checked={dispensaEstornar}
                  onCheckedChange={(checked) => setDispensaEstornar(checked === true)}
                />
                <label htmlFor="estornar-comissao-central" className="text-sm font-medium cursor-pointer">
                  Estornar comissão (devolver R$ {dispensaValorComissao.toFixed(2)} ao caixa)
                </label>
              </div>
            </div>
          )}

          <div className="py-2">
            <label className="text-sm font-medium mb-1.5 block">Motivo *</label>
            <Textarea
              placeholder="Ex: Parceiro desistiu, parceria não concretizada..."
              value={dispensaMotivo}
              onChange={(e) => setDispensaMotivo(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDispensarPagamento}
              disabled={!dispensaMotivo.trim() || dispensaLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {dispensaLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {dispensaComissaoJaPaga && dispensaEstornar ? "Dispensar + Estornar" : "Dispensar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Registrar Perda - Casas Limitadas */}
      {perdaLimitadaDialog && (
        <RegistrarPerdaRapidaDialog
          open={perdaLimitadaDialog.open}
          onOpenChange={(open) => { if (!open) setPerdaLimitadaDialog(null); }}
          bookmakerId={perdaLimitadaDialog.bookmakerId}
          bookmakerNome={perdaLimitadaDialog.bookmakerNome}
          moeda={perdaLimitadaDialog.moeda}
          saldoAtual={perdaLimitadaDialog.saldoAtual}
          onSuccess={() => fetchData()}
        />
      )}

      {/* Dialog Pagamento Parceiro */}
      <PagamentoParceiroDialog
        open={pagamentoParceiroDialogOpen}
        onOpenChange={(open) => {
          setPagamentoParceiroDialogOpen(open);
          if (!open) setSelectedPagamentoParceiro(null);
        }}
        parceria={selectedPagamentoParceiro ? {
          id: selectedPagamentoParceiro.parceriaId,
          parceiroNome: selectedPagamentoParceiro.parceiroNome,
          valorParceiro: selectedPagamentoParceiro.valorParceiro,
        } : null}
        onSuccess={() => fetchData()}
      />

      {/* Dialog Pagamento Fornecedor */}
      <PagamentoFornecedorDialog
        open={pagamentoFornecedorOpen}
        onOpenChange={(open) => {
          setPagamentoFornecedorOpen(open);
          if (!open) setSelectedPagamentoFornecedor(null);
        }}
        parceria={selectedPagamentoFornecedor ? {
          parceriaId: selectedPagamentoFornecedor.parceriaId,
          fornecedorNome: selectedPagamentoFornecedor.fornecedorNome,
          fornecedorId: selectedPagamentoFornecedor.fornecedorId,
          parceiroNome: selectedPagamentoFornecedor.parceiroNome,
          valorFornecedor: selectedPagamentoFornecedor.valorRestante,
        } : null}
        onSuccess={() => fetchData()}
      />

      {/* Dialog Encerrar Parceria */}
      <AlertDialog open={encerrarDialogOpen} onOpenChange={setEncerrarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar Parceria</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar a parceria com "{parceriaToEncerrar?.parceiroNome}"?
              O status será alterado para ENCERRADA e a data de fim real será definida como hoje.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={encerrarLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEncerrarParceria} disabled={encerrarLoading} className="bg-destructive text-destructive-foreground">
              {encerrarLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Renovar Parceria */}
      <ParceriaDialog
        open={renovarDialogOpen}
        onOpenChange={handleRenovarDialogClose}
        parceria={parceriaToRenovar ? {
          id: parceriaToRenovar.id,
          parceiro_id: parceriaToRenovar.parceiro_id,
          parceiro_nome: parceriaToRenovar.parceiroNome,
          data_inicio: parceriaToRenovar.dataInicio,
          data_fim_prevista: parceriaToRenovar.dataFim,
          duracao_dias: parceriaToRenovar.duracaoDias,
          valor_parceiro: parceriaToRenovar.valor_parceiro,
          valor_indicador: parceriaToRenovar.valor_indicador,
          valor_fornecedor: parceriaToRenovar.valor_fornecedor,
          origem_tipo: parceriaToRenovar.origem_tipo,
          fornecedor_id: parceriaToRenovar.fornecedor_id,
          indicacao_id: parceriaToRenovar.indicacao_id,
          elegivel_renovacao: parceriaToRenovar.elegivel_renovacao,
          observacoes: parceriaToRenovar.observacoes,
          status: parceriaToRenovar.status,
        } : null}
        isViewMode={false}
        isRenewalMode={true}
        onRenewalSuccess={handleRenewalSuccess}
      />
    </div>
  );
}
