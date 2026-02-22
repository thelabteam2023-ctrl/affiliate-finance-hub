import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { useProjectResponsibilities } from "@/hooks/useProjectResponsibilities";
import { useAjustePostLimitacaoEligibility } from "@/hooks/useAjustePostLimitacao";
import { AjustePostLimitacaoVinculoDialog } from "./AjustePostLimitacaoVinculoDialog";
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
import { HistoricoVinculosTab } from "./HistoricoVinculosTab";
import { HistoricoConciliacoesTab } from "./HistoricoConciliacoesTab";

import { ContasNoProjetoCard } from "./ContasNoProjetoCard";
import { SaldoOperavelCard } from "./SaldoOperavelCard";
import { VinculoBonusDrawer } from "./VinculoBonusDrawer";
import { BalanceDiscrepancyAlert } from "./BalanceDiscrepancyAlert";
import { DeltaCambialCard } from "./DeltaCambialCard";
import { ConciliacaoVinculoDialog } from "./ConciliacaoVinculoDialog";
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
  ArrowUpDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Toggle } from "@/components/ui/toggle";
import { SaldoOperavelDisplay } from "@/components/ui/saldo-operavel-display";

type VinculoSortMode = "alpha" | "newest" | "oldest";

interface ProjetoVinculosTabProps {
  projetoId: string;
}

// Interface Vinculo importada de useProjetoVinculos

export function ProjetoVinculosTab({ projetoId }: ProjetoVinculosTabProps) {
  const { workspaceId } = useWorkspace();
  const navigate = useNavigate();
  
  // Hook de responsabilidades - verifica se o usuário pode gerenciar vínculos
  const { 
    canManageVinculos, 
    canManageBonus,
    loading: responsibilitiesLoading 
  } = useProjectResponsibilities(projetoId);

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
  const [selectedCasas, setSelectedCasas] = useState<string[]>([]);
  const [selectedParceiros, setSelectedParceiros] = useState<string[]>([]);
  const [ajusteVinculo, setAjusteVinculo] = useState<Vinculo | null>(null);
  const [sortMode, setSortMode] = useState<VinculoSortMode>("alpha");

  const { bonuses, fetchBonuses: refetchBonuses, getSummary, getActiveBonusByBookmaker, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });

  const bonusSummary = getSummary();
  const bookmakersWithBonus = getBookmakersWithActiveBonus();

  // Ajuste Pós-Limitação: verificar elegibilidade dos vínculos limitados
  const limitedBookmakerIds = useMemo(
    () => vinculos.filter(v => v.bookmaker_status.toUpperCase() === "LIMITADA").map(v => v.id),
    [vinculos]
  );
  const { data: ajusteEligibility = {} } = useAjustePostLimitacaoEligibility(projetoId, limitedBookmakerIds);

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

  const decryptPassword = (encrypted: string | null): string => {
    if (!encrypted) return "";
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  };

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
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        );
      case "LIMITADA":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Limitada
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
            {status}
          </Badge>
        );
    }
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
    if (sortMode === "newest") {
      sorted.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortMode === "oldest") {
      sorted.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateA - dateB;
      });
    } else {
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

  // Listas únicas para filtros
  const uniqueCasas = useMemo(() => {
    return [...new Set(vinculos.map(v => v.nome))].sort();
  }, [vinculos]);
  
  const uniqueParceiros = useMemo(() => {
    return [...new Set(vinculos.map(v => v.parceiro_nome).filter(Boolean) as string[])].sort();
  }, [vinculos]);

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
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico ({historicoCount.total})
          </TabsTrigger>
          <TabsTrigger value="conciliacoes" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Ajustes
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
      
      <div className="flex items-center gap-4 flex-wrap">
        {/* Botão Adicionar Vínculos - com controle de responsabilidade */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button 
                  size="sm"
                  onClick={handleOpenAddDialog}
                  disabled={!canManageVinculos || responsibilitiesLoading}
                  className={!canManageVinculos && !responsibilitiesLoading ? "opacity-50 cursor-not-allowed text-xs" : "text-xs"}
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Building2 className="h-4 w-4" />
              Casas
              {selectedCasas.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {selectedCasas.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2 pb-2 border-b">
                <span className="text-sm font-medium">Filtrar Casas</span>
                {selectedCasas.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setSelectedCasas([])}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <ScrollArea className="h-48">
                <div className="space-y-1">
                  {uniqueCasas.map((casa) => (
                    <div
                      key={casa}
                      className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent rounded cursor-pointer"
                      onClick={() => {
                        setSelectedCasas(prev =>
                          prev.includes(casa)
                            ? prev.filter(c => c !== casa)
                            : [...prev, casa]
                        );
                      }}
                    >
                      <Checkbox
                        checked={selectedCasas.includes(casa)}
                        className="pointer-events-none"
                      />
                      <span className="text-sm truncate">{casa}</span>
                    </div>
                  ))}
                  {uniqueCasas.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhuma casa vinculada
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>

        {/* Filtro por Parceiros */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <User className="h-4 w-4" />
              Parceiros
              {selectedParceiros.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {selectedParceiros.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2 pb-2 border-b">
                <span className="text-sm font-medium">Filtrar Parceiros</span>
                {selectedParceiros.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setSelectedParceiros([])}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <ScrollArea className="h-48">
                <div className="space-y-1">
                  {uniqueParceiros.map((parceiro) => (
                    <div
                      key={parceiro}
                      className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent rounded cursor-pointer"
                      onClick={() => {
                        setSelectedParceiros(prev =>
                          prev.includes(parceiro)
                            ? prev.filter(p => p !== parceiro)
                            : [...prev, parceiro]
                        );
                      }}
                    >
                      <Checkbox
                        checked={selectedParceiros.includes(parceiro)}
                        className="pointer-events-none"
                      />
                      <span className="text-sm truncate">{parceiro}</span>
                    </div>
                  ))}
                  {uniqueParceiros.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhum parceiro vinculado
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, parceiro ou login..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sort toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => {
              setSortMode(prev => 
                prev === "alpha" ? "newest" : prev === "newest" ? "oldest" : "alpha"
              );
            }}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {sortMode === "alpha" ? "A-Z" : sortMode === "newest" ? "Recentes" : "Antigos"}
          </span>
        </div>
      </div>

      {/* Lista de Vínculos Ativos — scroll interno (anti-regressão) */}
      <div className="relative">
        <ScrollArea className="h-[520px] pr-2">
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
                      {vinculo.parceiro_nome || "Sem parceiro"}
                    </span>
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
                      formatCurrency={(val, moeda) => formatCurrency(val, moeda || vinculo.moeda)}
                      moeda={vinculo.moeda}
                      variant="card"
                    />
                    {vinculo.moeda !== "BRL" && (
                      <p className="text-[10px] text-muted-foreground text-right mt-1">
                        ≈ {formatCurrency(convertToBRL(vinculo.saldo_operavel, vinculo.moeda), "BRL")}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Apostas</span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Target className="h-3 w-3 text-primary" />
                      {vinculo.totalApostas}
                    </span>
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
                    {/* Botão Ajuste Pós-Limitação — só para limitadas + com bônus + sem ajuste prévio */}
                    {ajusteEligibility[vinculo.id]?.eligible && canManageVinculos && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-warning border-warning/30 hover:bg-warning/10"
                              onClick={() => setAjusteVinculo(vinculo)}
                            >
                              <TrendingDown className="mr-2 h-4 w-4" />
                              Registrar Ajuste Pós-Limitação
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p className="text-sm max-w-xs">Registrar a variação de saldo após a limitação da conta. Impacta juice e saldo, sem afetar métricas de apostas.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
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
                                      <p className="text-sm font-medium truncate">{decryptPassword(vinculo.login_password_encrypted)}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 flex-shrink-0"
                                      onClick={() => copyToClipboard(decryptPassword(vinculo.login_password_encrypted), `pass-header-${vinculo.id}`)}
                                    >
                                      {copiedField === `pass-header-${vinculo.id}` ? (
                                        <Check className="h-3 w-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
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
                      <span className="truncate">{vinculo.parceiro_nome || "Sem parceiro"}</span>
                    </div>
                  </div>

                  {/* Apostas */}
                  <div className="text-center w-[70px] flex-shrink-0">
                    <p className="text-xs text-muted-foreground">Apostas</p>
                    <p className="font-medium tabular-nums flex items-center justify-center gap-1">
                      <Target className="h-3 w-3 text-primary" />
                      {vinculo.totalApostas}
                    </p>
                  </div>

                  {/* ===== SALDOS UNIFICADOS (LIST) ===== */}
                  <SaldoOperavelDisplay
                    saldoOperavel={vinculo.saldo_operavel}
                    saldoEmAposta={vinculo.saldo_em_aposta}
                    saldoDisponivel={vinculo.saldo_disponivel}
                    saldoReal={vinculo.saldo_real}
                    saldoFreebet={vinculo.saldo_freebet}
                    saldoBonus={vinculo.saldo_bonus}
                    formatCurrency={(val, moeda) => formatCurrency(val, moeda || vinculo.moeda)}
                    moeda={vinculo.moeda}
                    variant="list"
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
                      className="h-8 w-8"
                      title="Ver Bônus"
                      onClick={() => handleOpenBonusDrawer({ id: vinculo.id, nome: vinculo.nome, login: vinculo.login_username, password: vinculo.login_password_encrypted, logo: vinculo.logo_url, bookmakerCatalogoId: vinculo.bookmaker_catalogo_id })}
                    >
                      <Coins className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Depositar"
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
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Sacar"
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
                    >
                      <Wallet className="h-4 w-4" />
                    </Button>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Liberar do Projeto"
                      onClick={() => {
                        setVinculoParaConciliar(vinculo);
                        setConciliacaoDialogOpen(true);
                      }}
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
                    {/* Botão Ajuste Pós-Limitação na lista */}
                    {ajusteEligibility[vinculo.id]?.eligible && canManageVinculos && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-warning hover:text-warning hover:bg-warning/10"
                              onClick={() => setAjusteVinculo(vinculo)}
                              title="Registrar Ajuste Pós-Limitação"
                            >
                              <TrendingDown className="h-4 w-4 mr-1" />
                              <span className="text-xs">Ajuste</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-sm max-w-xs">Registrar a variação de saldo após a limitação da conta. Impacta juice e saldo, sem afetar métricas de apostas.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
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
                        {formatCurrency(item.saldo_atual, item.moeda)}
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


      <TabsContent value="historico">
        <HistoricoVinculosTab projetoId={projetoId} />
      </TabsContent>

      <TabsContent value="conciliacoes">
        <HistoricoConciliacoesTab projetoId={projetoId} />
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
          bookmaker_status: vinculoParaConciliar.bookmaker_status
        } : null}
        projetoId={projetoId}
        projetoNome={projetoNome}
        workspaceId={workspaceId}
        onConciliado={() => {
          invalidateVinculos();
        }}
      />

      {/* Dialog Ajuste Pós-Limitação */}
      {ajusteVinculo && workspaceId && (
        <AjustePostLimitacaoVinculoDialog
          open={!!ajusteVinculo}
          onClose={() => setAjusteVinculo(null)}
          vinculo={{
            id: ajusteVinculo.id,
            nome: ajusteVinculo.nome,
            moeda: ajusteVinculo.moeda,
            saldo_real: ajusteVinculo.saldo_real,
          }}
          projetoId={projetoId}
          workspaceId={workspaceId}
          onSuccess={() => {
            invalidateVinculos();
            setAjusteVinculo(null);
          }}
        />
      )}
    </Tabs>
  );
}
