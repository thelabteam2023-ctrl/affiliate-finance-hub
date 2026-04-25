import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useProjectResponsibilities } from "@/hooks/useProjectResponsibilities";
import { AjusteSaldoDialog } from "./AjusteSaldoDialog";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { 
  useProjetoVinculos, 
  useBookmakersDisponiveis, 
  useAddVinculos, 
  useChangeBookmakerStatus,
  type Vinculo,
  type BookmakerDisponivel 
} from "@/hooks/useProjetoVinculos";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CaixaTransacaoDialog } from "@/components/caixa/CaixaTransacaoDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SaquesBrokerTab } from "./SaquesBrokerTab";
import { ExtratoProjetoTab } from "./ExtratoProjetoTab";

import { ContasNoProjetoCard } from "./ContasNoProjetoCard";
import { SaldoOperavelCard } from "./SaldoOperavelCard";
import { VinculoBonusDrawer } from "./VinculoBonusDrawer";
import { BalanceDiscrepancyAlert } from "./BalanceDiscrepancyAlert";
import { DeltaCambialCard } from "./DeltaCambialCard";
import { ConciliacaoVinculoDialog } from "./ConciliacaoVinculoDialog";
import { DesvinculacaoEmMassaDialog } from "./DesvinculacaoEmMassaDialog";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Link2,
  Link2Off,
  Plus,
  Search,
  User,
  Building2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  LayoutGrid,
  List,
  AlertTriangle,
  Target,
  ArrowRightLeft,
  Wallet,
  Gift,
  History,
  Coins,
  IdCard,
  Copy,
  Check,
  Globe,
  Lock,
  TrendingDown,
  Scale,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowDownAZ,
  Clock,
  Users,
  ArrowUpFromLine,
  Pencil,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Toggle } from "@/components/ui/toggle";
import { SaldoOperavelDisplay } from "@/components/ui/saldo-operavel-display";
import { usePasswordDecryption } from "@/hooks/usePasswordDecryption";
import { LazyPasswordField } from "@/components/parceiros/LazyPasswordField";
import { BrokerReceberContasDialog } from "@/components/broker/BrokerReceberContasDialog";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ESTRATEGIA_LABELS, type ApostaEstrategia } from "@/lib/apostaConstants";
import { openApostaMultiplaWindow, openApostaWindow, openSurebetWindow } from "@/lib/windowHelper";

type VinculoSortMode = "alpha" | "newest" | "oldest" | "apostas_desc" | "apostas_asc" | "saldo_desc" | "saldo_asc" | "em_aposta_desc" | "em_aposta_asc" | "disponivel_desc" | "disponivel_asc";

interface ProjetoVinculosTabProps {
  projetoId: string;
  tipoProjeto?: string;
  investidorId?: string | null;
  isBroker?: boolean;
}

interface ApostaUsoBookmaker {
  id: string;
  pernaId?: string;
  data_aposta: string;
  evento: string | null;
  esporte: string | null;
  mercado: string | null;
  estrategia: string | null;
  forma_registro: string | null;
  status: string | null;
  resultado: string | null;
  odd: number | null;
  stake: number | null;
  moeda: string | null;
  selecao: string | null;
  casas?: Array<{ nome: string; stake: number | null; moeda: string | null }>;
}

// Interface Vinculo importada de useProjetoVinculos

export function ProjetoVinculosTab({ projetoId, tipoProjeto, investidorId, isBroker: isBrokerProp }: ProjetoVinculosTabProps) {
  const { workspaceId } = useWorkspace();
  const navigate = useNavigate();
  
  // Hook de responsabilidades - verifica se o usuário pode gerenciar vínculos
  const { 
    canManageVinculos, 
    canManageBonus,
    loading: responsibilitiesLoading 
  } = useProjectResponsibilities(projetoId);

  const queryClient = useQueryClient();
  // ===== REACT QUERY HOOKS - Lifecycle management automático =====
  // Isso elimina toasts "fantasmas" após navegação, pois as queries
  // são automaticamente canceladas no unmount do componente.
  
  const { 
    vinculos, 
    isLoading: loading, 
    historicoCount, 
    refetch: refetchVinculos,
    invalidate: invalidateVinculos 
  } = useProjetoVinculos(projetoId);

  // Bookmakers disponíveis (não vinculados) - habilitado apenas quando dialog abre
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { 
    data: disponiveis = [], 
    refetch: refetchDisponiveis 
  } = useBookmakersDisponiveis(addDialogOpen);

  // Mutations com React Query
  const addVinculosMutation = useAddVinculos(projetoId, workspaceId);
  const changeStatusMutation = useChangeBookmakerStatus(projetoId);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Estados para busca e filtros do modal de adicionar vínculos
  const [addDialogSearchTerm, setAddDialogSearchTerm] = useState("");
  const [showOnlyWithBalance, setShowOnlyWithBalance] = useState(false);
  const [transacaoDialogOpen, setTransacaoDialogOpen] = useState(false);
  const [transacaoContext, setTransacaoContext] = useState<{
    bookmarkerId: string;
    bookmakerNome: string;
    moeda: string;
    saldoAtual: number;
    parceiroId: string | null;
    tipo: "DEPOSITO" | "SAQUE";
  } | null>(null);
  const [statusPopoverId, setStatusPopoverId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [bonusDrawerOpen, setBonusDrawerOpen] = useState(false);
  const [selectedBookmakerForBonus, setSelectedBookmakerForBonus] = useState<{ id: string; nome: string; login?: string; password?: string | null; logo?: string | null; bookmakerCatalogoId?: string | null } | null>(null);
  const [filterBonusOnly, setFilterBonusOnly] = useState(false);
  const [cotacaoTrabalho, setCotacaoTrabalho] = useState<number | null>(null);
  const [cotacaoTrabalhoEur, setCotacaoTrabalhoEur] = useState<number | null>(null);
  const [cotacaoTrabalhoGbp, setCotacaoTrabalhoGbp] = useState<number | null>(null);
  const [cotacaoTrabalhoMyr, setCotacaoTrabalhoMyr] = useState<number | null>(null);
  const [cotacaoTrabalhoMxn, setCotacaoTrabalhoMxn] = useState<number | null>(null);
  const [cotacaoTrabalhoArs, setCotacaoTrabalhoArs] = useState<number | null>(null);
  const [cotacaoTrabalhoCop, setCotacaoTrabalhoCop] = useState<number | null>(null);
  const [conciliacaoDialogOpen, setConciliacaoDialogOpen] = useState(false);
  const [vinculoParaConciliar, setVinculoParaConciliar] = useState<Vinculo | null>(null);
  const [bulkUnlinkOpen, setBulkUnlinkOpen] = useState(false);
  const [selectedCasas, setSelectedCasas] = useState<string[]>([]);
  const [selectedParceiros, setSelectedParceiros] = useState<string[]>([]);
  const [ajusteSaldoDialogOpen, setAjusteSaldoDialogOpen] = useState(false);
  const [vinculoParaAjuste, setVinculoParaAjuste] = useState<Vinculo | null>(null);
  const [vinculoDetalhesMobile, setVinculoDetalhesMobile] = useState<Vinculo | null>(null);
  const [vinculoApostasModal, setVinculoApostasModal] = useState<Vinculo | null>(null);
  
  const sortStorageKey = `vinculos-sort-mode:${projetoId}`;
  const [sortMode, setSortModeState] = useState<VinculoSortMode>(() => {
    if (typeof window === "undefined") return "alpha";
    try {
      const stored = localStorage.getItem(sortStorageKey);
      return (stored as VinculoSortMode) || "alpha";
    } catch {
      return "alpha";
    }
  });
  const setSortMode = useCallback((value: VinculoSortMode | ((prev: VinculoSortMode) => VinculoSortMode)) => {
    setSortModeState(prev => {
      const next = typeof value === "function" ? (value as (p: VinculoSortMode) => VinculoSortMode)(prev) : value;
      try {
        localStorage.setItem(sortStorageKey, next);
      } catch {
        // ignore quota/availability errors
      }
      return next;
    });
  }, [sortStorageKey]);
  const [receberContasDialogOpen, setReceberContasDialogOpen] = useState(false);
  const isBroker = isBrokerProp === true;

  const apostasUsoQuery = useQuery({
    queryKey: ["vinculo-apostas-uso", projetoId, vinculoApostasModal?.id],
    enabled: !!projetoId && !!vinculoApostasModal?.id,
    queryFn: async (): Promise<ApostaUsoBookmaker[]> => {
      const bookmakerId = vinculoApostasModal!.id;

      const [{ data: simples, error: simplesError }, { data: pernas, error: pernasError }] = await Promise.all([
        supabase
          .from("apostas_unificada")
          .select("id, data_aposta, evento, esporte, mercado, estrategia, forma_registro, status, resultado, odd, stake, moeda_operacao, selecao")
          .eq("projeto_id", projetoId)
          .eq("workspace_id", workspaceId)
          .eq("bookmaker_id", bookmakerId)
          .is("cancelled_at", null),
        supabase
          .from("apostas_pernas")
          .select("id, selecao, selecao_livre, odd, stake, moeda, aposta:apostas_unificada!inner(id, projeto_id, workspace_id, data_aposta, evento, esporte, mercado, estrategia, forma_registro, status, resultado, cancelled_at)")
          .eq("bookmaker_id", bookmakerId)
          .eq("aposta.projeto_id", projetoId)
          .eq("aposta.workspace_id", workspaceId)
          .is("aposta.cancelled_at", null),
      ]);

      if (simplesError) throw simplesError;
      if (pernasError) throw pernasError;

      const apostaIdsComPernas = Array.from(new Set((pernas || []).map((p: any) => p.aposta?.id).filter(Boolean)));
      const casasPorAposta = new Map<string, Array<{ nome: string; stake: number | null; moeda: string | null }>>();
      if (apostaIdsComPernas.length > 0) {
        const { data: todasPernas, error: todasPernasError } = await supabase
          .from("apostas_pernas")
          .select("aposta_id, stake, moeda, bookmaker:bookmakers(nome)")
          .in("aposta_id", apostaIdsComPernas);

        if (todasPernasError) throw todasPernasError;

        (todasPernas || []).forEach((p: any) => {
          const casas = casasPorAposta.get(p.aposta_id) || [];
          casas.push({ nome: p.bookmaker?.nome || "Casa", stake: p.stake, moeda: p.moeda });
          casasPorAposta.set(p.aposta_id, casas);
        });
      }

      const rows: ApostaUsoBookmaker[] = [];
      (simples || []).forEach((a: any) => rows.push({
        id: a.id,
        data_aposta: a.data_aposta,
        evento: a.evento,
        esporte: a.esporte,
        mercado: a.mercado,
        estrategia: a.estrategia,
        forma_registro: a.forma_registro,
        status: a.status,
        resultado: a.resultado,
        odd: a.odd,
        stake: a.stake,
        moeda: a.moeda_operacao,
        selecao: a.selecao,
        casas: [{ nome: vinculoApostasModal?.nome || "Casa", stake: a.stake, moeda: a.moeda_operacao }],
      }));
      (pernas || []).forEach((p: any) => rows.push({
        id: p.aposta.id,
        pernaId: p.id,
        data_aposta: p.aposta.data_aposta,
        evento: p.aposta.evento,
        esporte: p.aposta.esporte,
        mercado: p.aposta.mercado,
        estrategia: p.aposta.estrategia,
        forma_registro: p.aposta.forma_registro,
        status: p.aposta.status,
        resultado: p.aposta.resultado,
        odd: p.odd,
        stake: p.stake,
        moeda: p.moeda,
        selecao: p.selecao_livre || p.selecao,
        casas: casasPorAposta.get(p.aposta.id) || [],
      }));

      return rows.sort((a, b) => new Date(b.data_aposta).getTime() - new Date(a.data_aposta).getTime());
    },
  });

  const { bonuses, fetchBonuses: refetchBonuses, getSummary, getActiveBonusByBookmaker, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });

  const bonusSummary = getSummary();
  const bookmakersWithBonus = getBookmakersWithActiveBonus();


  // Calculate bonus totals per bookmaker (only credited/active bonuses)
  const bonusTotalsByBookmaker = bonuses.reduce((acc, bonus) => {
    if (bonus.status === 'credited') {
      acc[bonus.bookmaker_id] = (acc[bonus.bookmaker_id] || 0) + bonus.bonus_amount;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleOpenBonusDrawer = (bookmaker: { id: string; nome: string; login?: string; password?: string | null; logo?: string | null; bookmakerCatalogoId?: string | null }) => {
    setSelectedBookmakerForBonus(bookmaker);
    setBonusDrawerOpen(true);
  };

  const [projetoNome, setProjetoNome] = useState<string>("");

  const fetchCotacaoTrabalho = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("projetos")
        .select(
          "nome, cotacao_trabalho, cotacao_trabalho_eur, cotacao_trabalho_gbp, cotacao_trabalho_myr, cotacao_trabalho_mxn, cotacao_trabalho_ars, cotacao_trabalho_cop"
        )
        .eq("id", projetoId)
        .single();

      if (error) throw error;
      setProjetoNome(data?.nome || "");
      setCotacaoTrabalho(data?.cotacao_trabalho != null ? Number(data.cotacao_trabalho) : null);
      setCotacaoTrabalhoEur(data?.cotacao_trabalho_eur != null ? Number(data.cotacao_trabalho_eur) : null);
      setCotacaoTrabalhoGbp(data?.cotacao_trabalho_gbp != null ? Number(data.cotacao_trabalho_gbp) : null);
      setCotacaoTrabalhoMyr((data as any)?.cotacao_trabalho_myr != null ? Number((data as any).cotacao_trabalho_myr) : null);
      setCotacaoTrabalhoMxn((data as any)?.cotacao_trabalho_mxn != null ? Number((data as any).cotacao_trabalho_mxn) : null);
      setCotacaoTrabalhoArs((data as any)?.cotacao_trabalho_ars != null ? Number((data as any).cotacao_trabalho_ars) : null);
      setCotacaoTrabalhoCop((data as any)?.cotacao_trabalho_cop != null ? Number((data as any).cotacao_trabalho_cop) : null);
    } catch (error: any) {
      console.error("Erro ao buscar cotações de trabalho:", error.message);
    }
  }, [projetoId]);

  useEffect(() => {
    fetchCotacaoTrabalho();
  }, [projetoId, fetchCotacaoTrabalho]);

  // ===== FUNÇÕES MANUAIS REMOVIDAS =====
  // fetchVinculos, fetchHistoricoCount, fetchDisponiveis, handleAddVinculos, handleChangeStatus
  // foram substituídas por React Query hooks acima (useProjetoVinculos, useBookmakersDisponiveis, etc.)
  // Isso garante lifecycle management automático e elimina toasts fantasmas.

  // Lógica de filtragem e ordenação para o modal de adicionar vínculos
  const disponiveisFiltrados = useMemo(() => {
    let resultado = [...disponiveis];

    // Filtro de busca (case-insensitive, substring)
    if (addDialogSearchTerm.trim()) {
      const termo = addDialogSearchTerm.toLowerCase().trim();
      resultado = resultado.filter((item) =>
        item.nome.toLowerCase().includes(termo) ||
        (item.parceiro_nome && item.parceiro_nome.toLowerCase().includes(termo))
      );
    }

    // Filtro de saldo > 0
    if (showOnlyWithBalance) {
      resultado = resultado.filter((item) => item.saldo_atual > 0);
    }

    // Ordenação: saldo decrescente, depois nome alfabético
    resultado.sort((a, b) => {
      // Primeiro: ordenar por saldo (decrescente)
      if (b.saldo_atual !== a.saldo_atual) {
        return b.saldo_atual - a.saldo_atual;
      }
      // Segundo: ordenar por nome (alfabético)
      return a.nome.localeCompare(b.nome);
    });

    return resultado;
  }, [disponiveis, addDialogSearchTerm, showOnlyWithBalance]);

  const handleOpenAddDialog = () => {
    refetchDisponiveis();
    setSelectedIds([]);
    setAddDialogOpen(true);
  };

  const handleAddVinculos = () => {
    if (selectedIds.length === 0) {
      toast.error("Selecione pelo menos um vínculo");
      return;
    }

    addVinculosMutation.mutate(selectedIds, {
      onSuccess: () => {
        setAddDialogOpen(false);
        setSelectedIds([]);
      }
    });
  };

  // handleRemoveVinculo foi substituído pelo ConciliacaoVinculoDialog

  const handleChangeStatus = (vinculoId: string, newStatus: string) => {
    changeStatusMutation.mutate({ bookmarkerId: vinculoId, newStatus }, {
      onSuccess: () => {
        setStatusPopoverId(null);
      }
    });
  };

  const { requestDecrypt, isDecrypted, getCached } = usePasswordDecryption();

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error("Erro ao copiar");
    }
  };

  // Hook de formatação multi-moeda
  const { 
    formatCurrency, 
    groupBalancesByMoeda, 
    convertToBRL, 
    getMoedaBadgeInfo,
    getCotacaoInfo,
    loading: cotacoesLoading 
  } = useProjectCurrencyFormat();

  // Hook de moeda do PROJETO (para conversão à moeda de consolidação usando Cotação de Trabalho)
  const projetoCurrency = useProjetoCurrency(projetoId);
  const moedaConsolidacaoProjeto = projetoCurrency.moedaConsolidacao;
  const convertToConsolidacaoProjeto = projetoCurrency.convertToConsolidation;
  const formatConsolidacaoProjeto = (valor: number) => projetoCurrency.formatCurrency(valor);

  // Agrupar saldos por moeda para KPIs - usando saldo_operavel como base
  const balancesByMoeda = useMemo(() => {
    return groupBalancesByMoeda(
      vinculos.map(v => ({ saldo: v.saldo_operavel, moeda: v.moeda }))
    );
  }, [vinculos, groupBalancesByMoeda]);

  // Calcular totais consolidados em BRL
  // NOVO: saldo_operavel já inclui real + freebet + bônus - apostas pendentes
  const consolidatedTotals = useMemo(() => {
    const totalRealBRL = vinculos.reduce((acc, v) => acc + convertToBRL(v.saldo_real, v.moeda), 0);
    const totalFreebetBRL = vinculos.reduce((acc, v) => acc + convertToBRL(v.saldo_freebet || 0, v.moeda), 0);
    const totalBonusBRL = vinculos.reduce((acc, v) => acc + convertToBRL(v.saldo_bonus || 0, v.moeda), 0);
    const totalOperavelBRL = vinculos.reduce((acc, v) => acc + convertToBRL(v.saldo_operavel, v.moeda), 0);
    
    const hasForeignCurrency = vinculos.some(v => v.moeda !== "BRL");
    
    return {
      totalRealBRL,
      totalFreebetBRL,
      totalBonusBRL,
      totalOperavelBRL,
      hasForeignCurrency,
    };
  }, [vinculos, convertToBRL]);

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "ATIVO":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        );
      case "LIMITADA":
        return (
          <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-600/30 dark:border-yellow-500/30">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Limitada
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            {status}
          </Badge>
        );
    }
  };

  const getAbaAposta = (estrategia: string | null) => {
    const labels: Record<string, string> = {
      PUNTER: "Punter",
      SUREBET: "Surebet",
      VALUEBET: "ValueBet",
      EXTRACAO_FREEBET: "Freebets",
      EXTRACAO_BONUS: "Bônus",
      DUPLO_GREEN: "Duplo Green",
    };
    return labels[estrategia || ""] || ESTRATEGIA_LABELS[estrategia as ApostaEstrategia] || "Todas as Apostas";
  };

  const getApostaTab = (estrategia: string | null) => {
    const tabs: Record<string, string> = {
      PUNTER: "punter",
      SUREBET: "surebet",
      VALUEBET: "valuebet",
      EXTRACAO_FREEBET: "freebets",
      EXTRACAO_BONUS: "bonus",
      DUPLO_GREEN: "duplogreen",
    };
    return tabs[estrategia || ""] || "apostas";
  };

  const openEditarApostaUso = (aposta: ApostaUsoBookmaker) => {
    const activeTab = getApostaTab(aposta.estrategia);
    const estrategia = aposta.estrategia || undefined;

    if (aposta.forma_registro === "ARBITRAGEM" || aposta.estrategia === "SUREBET") {
      openSurebetWindow({ projetoId, id: aposta.id, activeTab });
      return;
    }

    if (aposta.forma_registro === "MULTIPLA") {
      openApostaMultiplaWindow({ projetoId, id: aposta.id, activeTab, estrategia });
      return;
    }

    openApostaWindow({ projetoId, id: aposta.id, activeTab, estrategia });
  };

  const openApostasModal = (vinculo: Vinculo) => {
    if (vinculo.totalApostas <= 0) return;
    setVinculoApostasModal(vinculo);
  };

  const filteredVinculos = vinculos.filter((v) => {
    const matchesSearch =
      v.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.login_username.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBonusFilter = filterBonusOnly ? bookmakersWithBonus.includes(v.id) : true;
    
    const matchesCasaFilter = selectedCasas.length === 0 || selectedCasas.includes(v.nome);
    
    const matchesParceiroFilter = selectedParceiros.length === 0 || 
      (v.parceiro_nome && selectedParceiros.includes(v.parceiro_nome));
    
    return matchesSearch && matchesBonusFilter && matchesCasaFilter && matchesParceiroFilter;
  });

  // Aplicar ordenação
  const sortedVinculos = useMemo(() => {
    const sorted = [...filteredVinculos];
    switch (sortMode) {
      case "newest":
        sorted.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case "oldest":
        sorted.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });
        break;
      case "apostas_desc":
        sorted.sort((a, b) => b.totalApostas - a.totalApostas || a.nome.localeCompare(b.nome));
        break;
      case "apostas_asc":
        sorted.sort((a, b) => a.totalApostas - b.totalApostas || a.nome.localeCompare(b.nome));
        break;
      case "saldo_desc":
        sorted.sort((a, b) => b.saldo_operavel - a.saldo_operavel || a.nome.localeCompare(b.nome));
        break;
      case "saldo_asc":
        sorted.sort((a, b) => a.saldo_operavel - b.saldo_operavel || a.nome.localeCompare(b.nome));
        break;
      case "em_aposta_desc":
        sorted.sort((a, b) => b.saldo_em_aposta - a.saldo_em_aposta || a.nome.localeCompare(b.nome));
        break;
      case "em_aposta_asc":
        sorted.sort((a, b) => a.saldo_em_aposta - b.saldo_em_aposta || a.nome.localeCompare(b.nome));
        break;
      case "disponivel_desc":
        sorted.sort((a, b) => b.saldo_disponivel - a.saldo_disponivel || a.nome.localeCompare(b.nome));
        break;
      case "disponivel_asc":
        sorted.sort((a, b) => a.saldo_disponivel - b.saldo_disponivel || a.nome.localeCompare(b.nome));
        break;
      default:
        sorted.sort((a, b) => a.nome.localeCompare(b.nome));
    }
    return sorted;
  }, [filteredVinculos, sortMode]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const vinculosAtivos = vinculos.filter((v) => v.bookmaker_status.toUpperCase() === "ATIVO").length;
  const vinculosLimitados = vinculos.filter((v) => v.bookmaker_status.toUpperCase() === "LIMITADA").length;

  // Listas únicas para filtros (como FilterDropdownItem)
  const casasFilterItems = useMemo(() => {
    const seen = new Map<string, { logoUrl?: string | null }>();
    vinculos.forEach(v => {
      if (!seen.has(v.nome)) {
        seen.set(v.nome, { logoUrl: v.logo_url });
      }
    });
    return Array.from(seen.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nome, meta]) => ({
        value: nome,
        label: nome,
        logoUrl: meta.logoUrl,
      }));
  }, [vinculos]);
  
  const parceirosFilterItems = useMemo(() => {
    const names = [...new Set(vinculos.map(v => v.parceiro_nome).filter(Boolean) as string[])].sort();
    return names.map(nome => ({
      value: nome,
      label: nome,
    }));
  }, [vinculos]);

  const openTransacao = (vinculo: Vinculo, tipo: "DEPOSITO" | "SAQUE") => {
    setTransacaoContext({
      bookmarkerId: vinculo.id,
      bookmakerNome: vinculo.nome,
      moeda: vinculo.moeda,
      saldoAtual: vinculo.saldo_real,
      parceiroId: vinculo.parceiro_id,
      tipo,
    });
    setVinculoDetalhesMobile(null);
    setTransacaoDialogOpen(true);
  };

  const openAjusteSaldo = (vinculo: Vinculo) => {
    setVinculoParaAjuste(vinculo);
    setVinculoDetalhesMobile(null);
    setAjusteSaldoDialogOpen(true);
  };

  const openConciliacao = (vinculo: Vinculo) => {
    setVinculoParaConciliar(vinculo);
    setVinculoDetalhesMobile(null);
    setConciliacaoDialogOpen(true);
  };

  const openBonusDrawer = (vinculo: Vinculo) => {
    setVinculoDetalhesMobile(null);
    handleOpenBonusDrawer({ id: vinculo.id, nome: vinculo.nome, login: vinculo.login_username, password: vinculo.login_password_encrypted, logo: vinculo.logo_url, bookmakerCatalogoId: vinculo.bookmaker_catalogo_id });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="ativos" className="space-y-4">
      <div className="flex justify-center">
        <TabsList>
          <TabsTrigger value="ativos" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Ativos ({vinculos.length})
          </TabsTrigger>
          <TabsTrigger value="extrato" className="flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4" />
            {isBroker ? "Extrato Broker" : "Extrato"}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="ativos" className="space-y-3">
        {/* KPIs - Faixa compacta horizontal */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:justify-center">
          {/* Relacionamentos compacto */}
          <ContasNoProjetoCard 
            projetoId={projetoId} 
            hasForeignCurrency={consolidatedTotals.hasForeignCurrency} 
          />

          {/* Saldo Operável - mantém destaque mas compacto */}
          <div className="flex-shrink-0">
            <SaldoOperavelCard projetoId={projetoId} />
          </div>

          {/* Cotações compactas */}
          {consolidatedTotals.hasForeignCurrency && (
            <DeltaCambialCard
              projetoId={projetoId}
              cotacaoTrabalho={cotacaoTrabalho}
              cotacaoTrabalhoEur={cotacaoTrabalhoEur}
              cotacaoTrabalhoGbp={cotacaoTrabalhoGbp}
              cotacaoTrabalhoMyr={cotacaoTrabalhoMyr}
              cotacaoTrabalhoMxn={cotacaoTrabalhoMxn}
              cotacaoTrabalhoArs={cotacaoTrabalhoArs}
              cotacaoTrabalhoCop={cotacaoTrabalhoCop}
              onCotacaoUpdated={fetchCotacaoTrabalho}
            />
          )}
        </div>
      
      {/* Alerta de discrepância de saldo */}
      <BalanceDiscrepancyAlert
        projetoId={projetoId}
        formatCurrency={(val, moeda) => formatCurrency(val, moeda || "BRL")}
        onFixed={invalidateVinculos}
      />
      
      {/* Toolbar responsiva: empilha em mobile, alinha em desktop */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Botão Adicionar Vínculos - com controle de responsabilidade */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block w-full sm:w-auto">
                <Button 
                  size="sm"
                  onClick={handleOpenAddDialog}
                  disabled={!canManageVinculos || responsibilitiesLoading}
                  className={`text-xs w-full sm:w-auto ${!canManageVinculos && !responsibilitiesLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {responsibilitiesLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : !canManageVinculos ? (
                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Adicionar Vínculos
                </Button>
              </span>
            </TooltipTrigger>
            {!canManageVinculos && !responsibilitiesLoading && (
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-sm">
                  Você não possui a responsabilidade para gerenciar vínculos neste projeto.
                  Entre em contato com o administrador para solicitar esta permissão.
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        {/* Botão Receber Contas - apenas projetos Broker */}
        {isBroker && canManageVinculos && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setReceberContasDialogOpen(true)}
          >
            <Users className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Receber Contas</span>
          </Button>
        )}
        {/* Botão Desvinculação em Massa */}
        {canManageVinculos && vinculos.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setBulkUnlinkOpen(true)}
          >
            <Link2Off className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Desvincular em Massa</span>
          </Button>
        )}
        <Toggle
          pressed={viewMode === "list"}
          onPressedChange={(pressed) => setViewMode(pressed ? "list" : "cards")}
          aria-label="Alternar modo de visualização"
          className="data-[state=on]:bg-primary/20"
        >
          {viewMode === "cards" ? (
            <List className="h-4 w-4" />
          ) : (
            <LayoutGrid className="h-4 w-4" />
          )}
        </Toggle>
        
        {/* Filtro por Casas */}
        <FilterDropdown
          type="casas"
          items={casasFilterItems}
          selectedValues={selectedCasas}
          onSelectionChange={setSelectedCasas}
        />

        {/* Filtro por Parceiros */}
        <FilterDropdown
          type="parceiros"
          items={parceirosFilterItems}
          selectedValues={selectedParceiros}
          onSelectionChange={setSelectedParceiros}
        />

        <div className="relative flex-1 min-w-full sm:min-w-[200px] sm:max-w-sm order-last sm:order-none">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, parceiro ou login..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sort dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 shrink-0">
              <ArrowUpDown className="h-4 w-4" />
              <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden xs:inline sm:inline">
                {sortMode === "alpha" ? "A-Z" 
                  : sortMode === "newest" ? "Recentes" 
                  : sortMode === "oldest" ? "Antigos"
                  : sortMode === "apostas_desc" ? "Apostas ↓"
                  : sortMode === "apostas_asc" ? "Apostas ↑"
                  : sortMode === "saldo_desc" ? "Saldo ↓"
                  : sortMode === "saldo_asc" ? "Saldo ↑"
                  : sortMode === "em_aposta_desc" ? "Em Aposta ↓"
                  : sortMode === "em_aposta_asc" ? "Em Aposta ↑"
                  : sortMode === "disponivel_desc" ? "Disponível ↓"
                  : sortMode === "disponivel_asc" ? "Disponível ↑"
                  : "A-Z"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setSortMode("alpha")} className={`justify-center ${sortMode === "alpha" ? "bg-accent" : ""}`}>
              <ArrowDownAZ className="h-4 w-4 mr-2" /> Nome A-Z
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode("newest")} className={`justify-center ${sortMode === "newest" ? "bg-accent" : ""}`}>
              <Clock className="h-4 w-4 mr-2" /> Mais recentes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode("oldest")} className={`justify-center ${sortMode === "oldest" ? "bg-accent" : ""}`}>
              <Clock className="h-4 w-4 mr-2" /> Mais antigos
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSortMode(prev => prev === "apostas_desc" ? "apostas_asc" : "apostas_desc")} className={`justify-center ${sortMode.startsWith("apostas") ? "bg-accent" : ""}`}>
              <Target className="h-4 w-4 mr-2" /> Apostas {sortMode === "apostas_asc" ? "↑" : "↓"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode(prev => prev === "saldo_desc" ? "saldo_asc" : "saldo_desc")} className={`justify-center ${sortMode.startsWith("saldo") ? "bg-accent" : ""}`}>
              <Wallet className="h-4 w-4 mr-2" /> Saldo Operável {sortMode === "saldo_asc" ? "↑" : "↓"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode(prev => prev === "em_aposta_desc" ? "em_aposta_asc" : "em_aposta_desc")} className={`justify-center ${sortMode.startsWith("em_aposta") ? "bg-accent" : ""}`}>
              <Target className="h-4 w-4 mr-2" /> Em Aposta {sortMode === "em_aposta_asc" ? "↑" : "↓"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortMode(prev => prev === "disponivel_desc" ? "disponivel_asc" : "disponivel_desc")} className={`justify-center ${sortMode.startsWith("disponivel") ? "bg-accent" : ""}`}>
              <Coins className="h-4 w-4 mr-2" /> Disponível {sortMode === "disponivel_asc" ? "↑" : "↓"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Lista de Vínculos Ativos — scroll interno (anti-regressão) */}
      {/* Altura responsiva: mais alta em desktop, menor em mobile para não dominar a tela */}
      <div className="relative">
        <ScrollArea className="h-[60vh] sm:h-[520px] pr-2">
          {sortedVinculos.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Link2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum vínculo encontrado</h3>
              <p className="text-muted-foreground">
                {canManageVinculos 
                  ? "Adicione vínculos parceiro-bookmaker para começar"
                  : "Nenhum vínculo disponível para visualização"
                }
              </p>
              {canManageVinculos && (
                <Button className="mt-4" onClick={handleOpenAddDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Vínculos
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedVinculos.map((vinculo) => (
            <Card key={vinculo.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {vinculo.logo_url ? (
                      <img
                        src={vinculo.logo_url}
                        alt={vinculo.nome}
                        className="h-10 w-10 rounded-lg object-contain p-1"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="text-base">{vinculo.nome}</CardTitle>
                        {/* Badge de moeda para moedas estrangeiras */}
                        {vinculo.moeda !== "BRL" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline" 
                                  className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30"
                                >
                                  {vinculo.moeda}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{getCotacaoInfo(vinculo.moeda)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {vinculo.login_username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Badge de conciliação pendente */}
                    {vinculo.has_pending_transactions && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-destructive/20 text-destructive border-destructive/30 animate-pulse cursor-pointer">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Conciliar
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-sm">Esta casa possui transações pendentes de conciliação.</p>
                            <p className="text-xs text-muted-foreground mt-1">Operações bloqueadas até conciliar.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {getStatusBadge(vinculo.bookmaker_status)}
                    <Popover 
                      open={statusPopoverId === vinculo.id} 
                      onOpenChange={(open) => setStatusPopoverId(open ? vinculo.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Alterar Status"
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56" align="end">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Alterar Status</h4>
                          <RadioGroup
                            value={vinculo.bookmaker_status.toUpperCase()}
                            onValueChange={(value) => handleChangeStatus(vinculo.id, value)}
                            disabled={changeStatusMutation.isPending}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="ATIVO" id={`ativo-${vinculo.id}`} />
                              <Label htmlFor={`ativo-${vinculo.id}`} className="flex items-center gap-2 cursor-pointer">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                Ativo
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="LIMITADA" id={`limitada-${vinculo.id}`} />
                              <Label htmlFor={`limitada-${vinculo.id}`} className="flex items-center gap-2 cursor-pointer">
                                <ShieldAlert className="h-4 w-4 text-yellow-400" />
                                Limitada
                              </Label>
                            </div>
                          </RadioGroup>
                          {changeStatusMutation.isPending && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Salvando...
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {vinculo.parceiro_nome || (vinculo.investidor_nome && vinculo.instance_identifier ? vinculo.instance_identifier : "Sem parceiro")}
                    </span>
                    {vinculo.investidor_nome && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400">
                        Inv: {vinculo.investidor_nome}
                      </Badge>
                    )}
                  </div>
                  
                  {/* ===== SALDOS UNIFICADOS ===== */}
                  <div className="pt-2 border-t">
                    <SaldoOperavelDisplay
                      saldoOperavel={vinculo.saldo_operavel}
                      saldoEmAposta={vinculo.saldo_em_aposta}
                      saldoDisponivel={vinculo.saldo_disponivel}
                      saldoReal={vinculo.saldo_real}
                      saldoFreebet={vinculo.saldo_freebet}
                      saldoBonus={vinculo.saldo_bonus}
                      saldoSaquePendente={vinculo.saldo_saque_pendente}
                      formatCurrency={(val, moeda) => formatCurrency(val, moeda || vinculo.moeda)}
                      moeda={vinculo.moeda}
                      variant="card"
                      convertToConsolidacao={convertToConsolidacaoProjeto}
                      moedaConsolidacao={moedaConsolidacaoProjeto}
                      formatConsolidacao={formatConsolidacaoProjeto}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Apostas</span>
                    <button
                      type="button"
                      disabled={vinculo.totalApostas <= 0}
                      onClick={() => openApostasModal(vinculo)}
                      className="text-sm font-medium flex items-center gap-1 rounded px-1 transition-colors enabled:hover:text-primary disabled:cursor-default"
                    >
                      <Target className="h-3 w-3 text-primary" />
                      {vinculo.totalApostas}
                    </button>
                  </div>
                  
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleOpenBonusDrawer({ id: vinculo.id, nome: vinculo.nome, login: vinculo.login_username, password: vinculo.login_password_encrypted, logo: vinculo.logo_url, bookmakerCatalogoId: vinculo.bookmaker_catalogo_id })}
                        title="Ver Bônus"
                      >
                        <Coins className="mr-2 h-4 w-4" />
                        Bônus
                      </Button>
                      {!vinculo.investidor_id && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setTransacaoContext({
                                bookmarkerId: vinculo.id,
                                bookmakerNome: vinculo.nome,
                                moeda: vinculo.moeda,
                                saldoAtual: vinculo.saldo_real,
                                parceiroId: vinculo.parceiro_id,
                                tipo: "DEPOSITO",
                              });
                              setTransacaoDialogOpen(true);
                            }}
                            title="Depositar"
                          >
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            Depósito
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setTransacaoContext({
                                bookmarkerId: vinculo.id,
                                bookmakerNome: vinculo.nome,
                                moeda: vinculo.moeda,
                                saldoAtual: vinculo.saldo_real,
                                parceiroId: vinculo.parceiro_id,
                                tipo: "SAQUE",
                              });
                              setTransacaoDialogOpen(true);
                            }}
                            title="Sacar"
                          >
                            <Wallet className="mr-2 h-4 w-4" />
                            Saque
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setVinculoParaAjuste(vinculo);
                          setAjusteSaldoDialogOpen(true);
                        }}
                        title="Ajustar Saldo"
                      >
                        <Scale className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setVinculoParaConciliar(vinculo);
                          setConciliacaoDialogOpen(true);
                        }}
                      >
                        <Link2Off className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {sortedVinculos.map((vinculo) => (
                <div
                  key={vinculo.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  {/* Logo */}
                  {vinculo.logo_url ? (
                    <img
                      src={vinculo.logo_url}
                      alt={vinculo.nome}
                      className="h-10 w-10 rounded-lg object-contain p-1 flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{vinculo.nome}</span>
                      {/* Badge de conciliação pendente na lista */}
                      {vinculo.has_pending_transactions && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-destructive/20 text-destructive border-destructive/30 animate-pulse text-[10px] px-1.5 py-0">
                                <AlertTriangle className="h-3 w-3 mr-0.5" />
                                Conciliar
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-sm">Transações pendentes de conciliação.</p>
                              <p className="text-xs text-muted-foreground mt-1">Operações bloqueadas.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {/* Badge de moeda para moedas estrangeiras na lista */}
                      {vinculo.moeda !== "BRL" && (
                        <Badge 
                          variant="outline" 
                          className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30"
                        >
                          {vinculo.moeda}
                        </Badge>
                      )}
                      {vinculo.login_username && (
                        <Popover
                          open={credentialsPopoverOpen === vinculo.id}
                          onOpenChange={(open) => setCredentialsPopoverOpen(open ? vinculo.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Credenciais"
                            >
                              <IdCard className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72" align="start">
                            <div className="space-y-3">
                              <h4 className="font-medium text-sm">Credenciais de Acesso</h4>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground">Usuário</p>
                                    <p className="text-sm font-medium truncate">{vinculo.login_username}</p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 flex-shrink-0"
                                    onClick={() => copyToClipboard(vinculo.login_username, `user-header-${vinculo.id}`)}
                                  >
                                    {copiedField === `user-header-${vinculo.id}` ? (
                                      <Check className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                                {vinculo.login_password_encrypted && (
                                  <div className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-muted-foreground">Senha</p>
                                      <LazyPasswordField
                                        cacheKey={`projeto-vinculos:${vinculo.id}`}
                                        encrypted={vinculo.login_password_encrypted}
                                        requestDecrypt={requestDecrypt}
                                        isDecrypted={isDecrypted}
                                        getCached={getCached}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="truncate">{vinculo.parceiro_nome || (vinculo.investidor_nome && vinculo.instance_identifier ? vinculo.instance_identifier : "Sem parceiro")}</span>
                      {vinculo.investidor_nome && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400 ml-1">
                          Inv: {vinculo.investidor_nome}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Apostas */}
                  <div className="hidden sm:block text-center w-[70px] flex-shrink-0">
                    <p 
                      className="text-xs text-muted-foreground flex items-center justify-center gap-1 cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => setSortMode(prev => prev === "apostas_desc" ? "apostas_asc" : "apostas_desc")}
                    >
                      Apostas
                      {sortMode === "apostas_desc" && <ArrowDown className="h-3 w-3 text-primary" />}
                      {sortMode === "apostas_asc" && <ArrowUp className="h-3 w-3 text-primary" />}
                    </p>
                    <button
                      type="button"
                      disabled={vinculo.totalApostas <= 0}
                      onClick={() => openApostasModal(vinculo)}
                      className="font-medium tabular-nums flex items-center justify-center gap-1 rounded px-1 mx-auto transition-colors enabled:hover:text-primary disabled:cursor-default"
                    >
                      <Target className="h-3 w-3 text-primary" />
                      {vinculo.totalApostas}
                    </button>
                  </div>

                  {/* ===== SALDOS UNIFICADOS (LIST) ===== */}
                  <SaldoOperavelDisplay
                    saldoOperavel={vinculo.saldo_operavel}
                    saldoEmAposta={vinculo.saldo_em_aposta}
                    saldoDisponivel={vinculo.saldo_disponivel}
                    saldoReal={vinculo.saldo_real}
                    saldoFreebet={vinculo.saldo_freebet}
                    saldoBonus={vinculo.saldo_bonus}
                    saldoSaquePendente={vinculo.saldo_saque_pendente}
                    formatCurrency={(val, moeda) => formatCurrency(val, moeda || vinculo.moeda)}
                    moeda={vinculo.moeda}
                    variant="list"
                    onSortSaldo={() => setSortMode(prev => prev === "saldo_desc" ? "saldo_asc" : "saldo_desc")}
                    onSortEmAposta={() => setSortMode(prev => prev === "em_aposta_desc" ? "em_aposta_asc" : "em_aposta_desc")}
                    onSortDisponivel={() => setSortMode(prev => prev === "disponivel_desc" ? "disponivel_asc" : "disponivel_desc")}
                    sortSaldo={sortMode === "saldo_desc" ? "desc" : sortMode === "saldo_asc" ? "asc" : null}
                    sortEmAposta={sortMode === "em_aposta_desc" ? "desc" : sortMode === "em_aposta_asc" ? "asc" : null}
                    sortDisponivel={sortMode === "disponivel_desc" ? "desc" : sortMode === "disponivel_asc" ? "asc" : null}
                    convertToConsolidacao={convertToConsolidacaoProjeto}
                    moedaConsolidacao={moedaConsolidacaoProjeto}
                    formatConsolidacao={formatConsolidacaoProjeto}
                    className="hidden sm:flex"
                  />

                  {/* Status Badge */}
                  <div className="flex-shrink-0">
                    {getStatusBadge(vinculo.bookmaker_status)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 sm:hidden"
                      title="Ver detalhes"
                      onClick={() => setVinculoDetalhesMobile(vinculo)}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden sm:inline-flex h-8 w-8"
                      title="Ver Bônus"
                      onClick={() => openBonusDrawer(vinculo)}
                    >
                      <Coins className="h-4 w-4" />
                    </Button>
                    {!vinculo.investidor_id && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hidden sm:inline-flex h-8 w-8"
                          title="Depositar"
                          onClick={() => openTransacao(vinculo, "DEPOSITO")}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hidden sm:inline-flex h-8 w-8"
                          title="Sacar"
                          onClick={() => openTransacao(vinculo, "SAQUE")}
                        >
                          <Wallet className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Popover 
                      open={statusPopoverId === vinculo.id} 
                      onOpenChange={(open) => setStatusPopoverId(open ? vinculo.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hidden sm:inline-flex h-8 w-8"
                          title="Alterar Status"
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56" align="end">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Alterar Status</h4>
                          <RadioGroup
                            value={vinculo.bookmaker_status.toUpperCase()}
                            onValueChange={(value) => handleChangeStatus(vinculo.id, value)}
                            disabled={changeStatusMutation.isPending}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="ATIVO" id={`ativo-list-${vinculo.id}`} />
                              <Label htmlFor={`ativo-list-${vinculo.id}`} className="flex items-center gap-2 cursor-pointer">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                Ativo
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="LIMITADA" id={`limitada-list-${vinculo.id}`} />
                              <Label htmlFor={`limitada-list-${vinculo.id}`} className="flex items-center gap-2 cursor-pointer">
                                <ShieldAlert className="h-4 w-4 text-yellow-400" />
                                Limitada
                              </Label>
                            </div>
                          </RadioGroup>
                          {changeStatusMutation.isPending && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Salvando...
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="hidden sm:inline-flex h-8 w-8"
                            title="Ajustar Saldo"
                            onClick={() => openAjusteSaldo(vinculo)}
                          >
                            <Scale className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Ajustar Saldo</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden sm:inline-flex h-8 w-8 text-destructive hover:text-destructive"
                      title="Liberar do Projeto"
                      onClick={() => openConciliacao(vinculo)}
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
                    {/* Botão Ajuste Pós-Limitação na lista */}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        </ScrollArea>
        {/* Indicador visual sutil de scroll (fade) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-background/90 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-background/90 to-transparent" />
      </div>

      <Dialog open={!!vinculoDetalhesMobile} onOpenChange={(open) => !open && setVinculoDetalhesMobile(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-lg">
          {vinculoDetalhesMobile && (
            <div className="space-y-4 p-5">
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-start gap-3 pr-8">
                  {vinculoDetalhesMobile.logo_url ? (
                    <img src={vinculoDetalhesMobile.logo_url} alt={vinculoDetalhesMobile.nome} className="h-12 w-12 rounded-lg object-contain p-1 shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate">{vinculoDetalhesMobile.nome}</span>
                      {getStatusBadge(vinculoDetalhesMobile.bookmaker_status)}
                      {vinculoDetalhesMobile.moeda !== "BRL" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">{vinculoDetalhesMobile.moeda}</Badge>}
                    </div>
                    <p className="text-sm font-normal text-muted-foreground truncate">
                      {vinculoDetalhesMobile.parceiro_nome || (vinculoDetalhesMobile.investidor_nome && vinculoDetalhesMobile.instance_identifier ? vinculoDetalhesMobile.instance_identifier : "Sem parceiro")}
                    </p>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {vinculoDetalhesMobile.has_pending_transactions && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Esta casa possui transações pendentes de conciliação. Operações podem estar bloqueadas até conciliar.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Login</p>
                  <p className="font-medium truncate">{vinculoDetalhesMobile.login_username || "Não informado"}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Apostas</p>
                  <button
                    type="button"
                    disabled={vinculoDetalhesMobile.totalApostas <= 0}
                    onClick={() => openApostasModal(vinculoDetalhesMobile)}
                    className="font-medium flex items-center gap-1 rounded transition-colors enabled:hover:text-primary disabled:cursor-default"
                  >
                    <Target className="h-3.5 w-3.5 text-primary" />{vinculoDetalhesMobile.totalApostas}
                  </button>
                </div>
              </div>

              {vinculoDetalhesMobile.login_password_encrypted && (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Senha</p>
                  <LazyPasswordField
                    cacheKey={`projeto-vinculos-mobile:${vinculoDetalhesMobile.id}`}
                    encrypted={vinculoDetalhesMobile.login_password_encrypted}
                    requestDecrypt={requestDecrypt}
                    isDecrypted={isDecrypted}
                    getCached={getCached}
                  />
                </div>
              )}

              <SaldoOperavelDisplay
                saldoOperavel={vinculoDetalhesMobile.saldo_operavel}
                saldoEmAposta={vinculoDetalhesMobile.saldo_em_aposta}
                saldoDisponivel={vinculoDetalhesMobile.saldo_disponivel}
                saldoReal={vinculoDetalhesMobile.saldo_real}
                saldoFreebet={vinculoDetalhesMobile.saldo_freebet}
                saldoBonus={vinculoDetalhesMobile.saldo_bonus}
                saldoSaquePendente={vinculoDetalhesMobile.saldo_saque_pendente}
                formatCurrency={(val, moeda) => formatCurrency(val, moeda || vinculoDetalhesMobile.moeda)}
                moeda={vinculoDetalhesMobile.moeda}
                variant="card"
                convertToConsolidacao={convertToConsolidacaoProjeto}
                moedaConsolidacao={moedaConsolidacaoProjeto}
                formatConsolidacao={formatConsolidacaoProjeto}
              />

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => openBonusDrawer(vinculoDetalhesMobile)}><Coins className="mr-2 h-4 w-4" />Bônus</Button>
                <Popover open={statusPopoverId === `mobile-${vinculoDetalhesMobile.id}`} onOpenChange={(open) => setStatusPopoverId(open ? `mobile-${vinculoDetalhesMobile.id}` : null)}>
                  <PopoverTrigger asChild><Button variant="outline" size="sm"><ShieldAlert className="mr-2 h-4 w-4" />Status</Button></PopoverTrigger>
                  <PopoverContent className="w-56" align="end">
                    <RadioGroup value={vinculoDetalhesMobile.bookmaker_status.toUpperCase()} onValueChange={(value) => handleChangeStatus(vinculoDetalhesMobile.id, value)} disabled={changeStatusMutation.isPending}>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="ATIVO" id={`ativo-mobile-${vinculoDetalhesMobile.id}`} /><Label htmlFor={`ativo-mobile-${vinculoDetalhesMobile.id}`}>Ativo</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="LIMITADA" id={`limitada-mobile-${vinculoDetalhesMobile.id}`} /><Label htmlFor={`limitada-mobile-${vinculoDetalhesMobile.id}`}>Limitada</Label></div>
                    </RadioGroup>
                  </PopoverContent>
                </Popover>
                {!vinculoDetalhesMobile.investidor_id && <Button variant="outline" size="sm" onClick={() => openTransacao(vinculoDetalhesMobile, "DEPOSITO")}><ArrowRightLeft className="mr-2 h-4 w-4" />Depósito</Button>}
                {!vinculoDetalhesMobile.investidor_id && <Button variant="outline" size="sm" onClick={() => openTransacao(vinculoDetalhesMobile, "SAQUE")}><Wallet className="mr-2 h-4 w-4" />Saque</Button>}
                <Button variant="outline" size="sm" onClick={() => openAjusteSaldo(vinculoDetalhesMobile)}><Scale className="mr-2 h-4 w-4" />Ajuste</Button>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:text-destructive" onClick={() => openConciliacao(vinculoDetalhesMobile)}><Link2Off className="mr-2 h-4 w-4" />Liberar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!vinculoApostasModal} onOpenChange={(open) => !open && setVinculoApostasModal(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Apostas da casa</DialogTitle>
            <DialogDescription>
              {vinculoApostasModal?.nome} · {vinculoApostasModal?.parceiro_nome || "Sem parceiro"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {apostasUsoQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => <Skeleton key={idx} className="h-16 w-full" />)}
              </div>
            ) : apostasUsoQuery.data?.length ? (
              <div className="space-y-2">
                {apostasUsoQuery.data.map((aposta) => (
                  <div key={`${aposta.id}-${aposta.pernaId || "main"}`} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate uppercase">{aposta.evento || "Aposta"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {aposta.esporte || "—"}{aposta.mercado ? ` · ${aposta.mercado}` : ""}{aposta.selecao ? ` · ${aposta.selecao}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{getAbaAposta(aposta.estrategia)}</Badge>
                        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => openEditarApostaUso(aposta)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{format(new Date(aposta.data_aposta), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      <span>Status: {aposta.status || "—"}</span>
                      <span>Resultado: {aposta.resultado || "Pendente"}</span>
                      {aposta.odd != null && <span>@{Number(aposta.odd).toFixed(2)}</span>}
                      {aposta.stake != null && <span>Stake: {formatCurrency(Number(aposta.stake), aposta.moeda || vinculoApostasModal?.moeda || "BRL")}</span>}
                    </div>
                    {aposta.casas?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {aposta.casas.map((casa, idx) => (
                          <Badge key={`${aposta.id}-${casa.nome}-${idx}`} variant="secondary" className="text-[10px] font-normal">
                            {casa.nome}: {casa.stake != null ? formatCurrency(Number(casa.stake), casa.moeda || vinculoApostasModal?.moeda || "BRL") : "—"}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Target className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Nenhuma aposta encontrada para esta casa.
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        setAddDialogOpen(open);
        // Reset filtros ao fechar
        if (!open) {
          setAddDialogSearchTerm("");
          setShowOnlyWithBalance(false);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Vínculos ao Projeto</DialogTitle>
            <DialogDescription>
              Selecione os vínculos parceiro-bookmaker disponíveis para adicionar ao projeto.
              Vínculos em uso em outros projetos não são exibidos.
            </DialogDescription>
          </DialogHeader>

          {/* Campo de busca e filtros */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por casa ou parceiro..."
                value={addDialogSearchTerm}
                onChange={(e) => setAddDialogSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-with-balance"
                  checked={showOnlyWithBalance}
                  onCheckedChange={setShowOnlyWithBalance}
                />
                <Label htmlFor="show-with-balance" className="text-sm cursor-pointer">
                  Mostrar apenas com saldo
                </Label>
              </div>
              <span className="text-xs text-muted-foreground">
                {disponiveisFiltrados.length} de {disponiveis.length} vínculos
              </span>
            </div>
          </div>

          <ScrollArea className="max-h-[350px] pr-4">
            {disponiveis.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Link2 className="mx-auto h-10 w-10 mb-2 opacity-50" />
                <p>Nenhum vínculo disponível</p>
                <p className="text-sm">Todos os vínculos estão em uso ou limitados</p>
              </div>
            ) : disponiveisFiltrados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="mx-auto h-10 w-10 mb-2 opacity-50" />
                <p>Nenhum vínculo encontrado</p>
                <p className="text-sm">Tente ajustar os filtros de busca</p>
              </div>
            ) : (
              <div className="space-y-2">
                {disponiveisFiltrados.map((item) => {
                  const hasSaldo = item.saldo_atual > 0;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIds.includes(item.id)
                          ? "bg-primary/10 border-primary"
                          : hasSaldo
                          ? "hover:bg-muted/50 border-green-500/30 bg-green-500/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => toggleSelection(item.id)}
                    >
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={() => toggleSelection(item.id)}
                      />
                      {item.logo_url ? (
                        <img
                          src={item.logo_url}
                          alt={item.nome}
                          className="h-8 w-8 rounded object-contain p-0.5"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Building2 className="h-4 w-4" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">{item.nome}</p>
                          {item.moeda !== 'BRL' && (
                            <Badge 
                              variant="outline" 
                              className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30"
                            >
                              {item.moeda}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.parceiro_nome || "Sem parceiro"}
                        </p>
                      </div>
                      <span className={`text-sm font-medium ${hasSaldo ? "text-green-500" : "text-muted-foreground"}`}>
                        {formatCurrency(Math.max(0, item.saldo_atual), item.moeda)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddVinculos} disabled={addVinculosMutation.isPending || selectedIds.length === 0}>
              {addVinculosMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar {selectedIds.length > 0 && `(${selectedIds.length})`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de remoção foi substituído pelo ConciliacaoVinculoDialog */}

      {/* Dialog Nova Transação */}
      <CaixaTransacaoDialog
        open={transacaoDialogOpen}
        onClose={() => {
          setTransacaoDialogOpen(false);
          setTransacaoContext(null);
        }}
        onSuccess={async () => {
          setTransacaoDialogOpen(false);
          setTransacaoContext(null);
          // Delay para garantir que o trigger do banco tenha atualizado os saldos
          await new Promise(resolve => setTimeout(resolve, 300));
          invalidateVinculos();
        }}
        defaultTipoTransacao={transacaoContext?.tipo}
        defaultDestinoBookmakerId={transacaoContext?.tipo === "DEPOSITO" ? transacaoContext?.bookmarkerId : undefined}
        defaultOrigemBookmakerId={transacaoContext?.tipo === "SAQUE" ? transacaoContext?.bookmarkerId : undefined}
        defaultOrigemParceiroId={transacaoContext?.tipo === "DEPOSITO" ? (transacaoContext?.parceiroId || undefined) : undefined}
        defaultDestinoParceiroId={transacaoContext?.tipo === "SAQUE" ? (transacaoContext?.parceiroId || undefined) : undefined}
        defaultTipoMoeda="FIAT"
        defaultMoeda={transacaoContext?.moeda || "BRL"}
        entryPoint={transacaoContext ? "affiliate_deposit" : undefined}
        allowedTipoTransacao={transacaoContext ? ["DEPOSITO", "SAQUE"] : undefined}
      />

      {/* Bonus History Drawer */}
      {selectedBookmakerForBonus && (
        <VinculoBonusDrawer
          open={bonusDrawerOpen}
          onOpenChange={(open) => {
            setBonusDrawerOpen(open);
            if (!open) {
              setSelectedBookmakerForBonus(null);
              refetchBonuses();
            }
          }}
          projectId={projetoId}
          bookmakerId={selectedBookmakerForBonus.id}
          bookmakerName={selectedBookmakerForBonus.nome}
          bookmakerLogin={selectedBookmakerForBonus.login}
          bookmakerPassword={selectedBookmakerForBonus.password}
          bookmakerLogo={selectedBookmakerForBonus.logo}
          bookmakerCatalogoId={selectedBookmakerForBonus.bookmakerCatalogoId}
          onBonusChange={() => {
            refetchBonuses();
            invalidateVinculos();
          }}
        />
      )}
      </TabsContent>



      <TabsContent value="extrato">
        {isBroker ? (
          <SaquesBrokerTab projetoId={projetoId} />
        ) : (
          <ExtratoProjetoTab projetoId={projetoId} />
        )}
      </TabsContent>

      <ConciliacaoVinculoDialog
        open={conciliacaoDialogOpen}
        onOpenChange={(open) => {
          setConciliacaoDialogOpen(open);
          if (!open) setVinculoParaConciliar(null);
        }}
        vinculo={vinculoParaConciliar ? {
          id: vinculoParaConciliar.id,
          nome: vinculoParaConciliar.nome,
          parceiro_nome: vinculoParaConciliar.parceiro_nome,
          saldo_atual: vinculoParaConciliar.saldo_real, // Conciliação usa saldo_real
          moeda: vinculoParaConciliar.moeda,
          bookmaker_status: vinculoParaConciliar.bookmaker_status,
          investidor_id: vinculoParaConciliar.investidor_id,
          instance_identifier: vinculoParaConciliar.instance_identifier,
          investidor_nome: vinculoParaConciliar.investidor_nome,
        } : null}
        projetoId={projetoId}
        projetoNome={projetoNome}
        workspaceId={workspaceId}
        onConciliado={() => {
          invalidateVinculos();
          queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-data", projetoId] });
          queryClient.invalidateQueries({ queryKey: ["central-operacoes-data"] });
          queryClient.invalidateQueries({ queryKey: ["contas-disponiveis-count"] });
        }}
      />


      {/* Dialog Desvinculação em Massa */}
      <DesvinculacaoEmMassaDialog
        open={bulkUnlinkOpen}
        onOpenChange={setBulkUnlinkOpen}
        vinculos={vinculos}
        projetoId={projetoId}
        projetoNome={projetoNome}
        workspaceId={workspaceId}
        onConcluido={invalidateVinculos}
      />

      {/* Dialog Ajuste de Saldo */}
      <AjusteSaldoDialog
        open={ajusteSaldoDialogOpen}
        onOpenChange={(open) => {
          setAjusteSaldoDialogOpen(open);
          if (!open) setVinculoParaAjuste(null);
        }}
        vinculo={vinculoParaAjuste ? {
          id: vinculoParaAjuste.id,
          nome: vinculoParaAjuste.nome,
          parceiro_nome: vinculoParaAjuste.parceiro_nome,
          saldo_atual: vinculoParaAjuste.saldo_real,
          moeda: vinculoParaAjuste.moeda,
        } : null}
        projetoId={projetoId}
        projetoNome={projetoNome}
        workspaceId={workspaceId}
        onAjustado={() => {
          invalidateVinculos();
          queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-data", projetoId] });
        }}
      />

      {/* Broker: Receber Contas Dialog */}
      {isBroker && (
        <BrokerReceberContasDialog
          open={receberContasDialogOpen}
          onClose={() => setReceberContasDialogOpen(false)}
          onSuccess={() => {
            setReceberContasDialogOpen(false);
            invalidateVinculos();
          }}
          projetoId={projetoId}
        />
      )}
    </Tabs>
  );
}
