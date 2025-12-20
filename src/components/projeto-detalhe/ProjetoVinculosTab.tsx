import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CaixaTransacaoDialog } from "@/components/caixa/CaixaTransacaoDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoricoVinculosTab } from "./HistoricoVinculosTab";
import { VinculoBonusDrawer } from "./VinculoBonusDrawer";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
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
  DollarSign,
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
  Clock,
  Gift,
  History,
  Coins,
  TrendingUp,
  Info,
  IdCard,
  Copy,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Toggle } from "@/components/ui/toggle";

interface ProjetoVinculosTabProps {
  projetoId: string;
}

interface Vinculo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  projeto_id: string | null;
  bookmaker_status: string;
  saldo_atual: number;
  saldo_em_aposta: number;
  saldo_livre: number;
  saldo_freebet: number;
  moeda: string;
  login_username: string;
  login_password_encrypted: string | null;
  bookmaker_catalogo_id: string | null;
  logo_url?: string | null;
  totalApostas: number;
}

interface BookmakerDisponivel {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_atual: number;
  bookmaker_status: string;
  logo_url?: string | null;
}

export function ProjetoVinculosTab({ projetoId }: ProjetoVinculosTabProps) {
  const navigate = useNavigate();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [disponiveis, setDisponiveis] = useState<BookmakerDisponivel[]>([]);
  const [historicoCount, setHistoricoCount] = useState({ total: 0, devolvidas: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [transacaoDialogOpen, setTransacaoDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [vinculoToRemove, setVinculoToRemove] = useState<Vinculo | null>(null);
  const [statusPopoverId, setStatusPopoverId] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [bonusDrawerOpen, setBonusDrawerOpen] = useState(false);
  const [selectedBookmakerForBonus, setSelectedBookmakerForBonus] = useState<{ id: string; nome: string; login?: string; password?: string | null; logo?: string | null; bookmakerCatalogoId?: string | null } | null>(null);
  const [filterBonusOnly, setFilterBonusOnly] = useState(false);

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

  useEffect(() => {
    fetchVinculos();
    fetchHistoricoCount();
  }, [projetoId]);

  const fetchVinculos = async () => {
    try {
      setLoading(true);

      // Fetch bookmakers linked to this project
      const { data: vinculosData, error: vinculosError } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          projeto_id,
          status,
          saldo_atual,
          saldo_freebet,
          moeda,
          login_username,
          login_password_encrypted,
          bookmaker_catalogo_id,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .eq("projeto_id", projetoId);

      if (vinculosError) throw vinculosError;

      // Fetch apostas count and pending stakes per bookmaker (simples + multiplas)
      const bookmakerIds = (vinculosData || []).map((v: any) => v.id);
      
      let apostasCount: Record<string, number> = {};
      let saldoEmAposta: Record<string, number> = {};
      
      if (bookmakerIds.length > 0) {
        // Fetch apostas simples
        const { data: apostasSimples } = await supabase
          .from("apostas")
          .select("bookmaker_id, stake, status")
          .eq("projeto_id", projetoId)
          .in("bookmaker_id", bookmakerIds);

        // Fetch apostas multiplas
        const { data: apostasMultiplas } = await supabase
          .from("apostas_multiplas")
          .select("bookmaker_id, stake, status")
          .eq("projeto_id", projetoId)
          .in("bookmaker_id", bookmakerIds);

        // Process apostas simples
        if (apostasSimples) {
          apostasSimples.forEach((a: any) => {
            apostasCount[a.bookmaker_id] = (apostasCount[a.bookmaker_id] || 0) + 1;
            if (a.status === "PENDENTE") {
              saldoEmAposta[a.bookmaker_id] = (saldoEmAposta[a.bookmaker_id] || 0) + (a.stake || 0);
            }
          });
        }
        
        // Process apostas multiplas (1 multipla = 1 aposta)
        if (apostasMultiplas) {
          apostasMultiplas.forEach((a: any) => {
            apostasCount[a.bookmaker_id] = (apostasCount[a.bookmaker_id] || 0) + 1;
            if (a.status === "PENDENTE") {
              saldoEmAposta[a.bookmaker_id] = (saldoEmAposta[a.bookmaker_id] || 0) + (a.stake || 0);
            }
          });
        }
      }

      const mappedVinculos: Vinculo[] = (vinculosData || []).map((v: any) => {
        const emAposta = saldoEmAposta[v.id] || 0;
        return {
          id: v.id,
          nome: v.nome,
          parceiro_id: v.parceiro_id,
          parceiro_nome: v.parceiros?.nome || null,
          projeto_id: v.projeto_id,
          bookmaker_status: v.status,
          saldo_atual: v.saldo_atual,
          saldo_em_aposta: emAposta,
          saldo_livre: v.saldo_atual - emAposta,
          saldo_freebet: v.saldo_freebet || 0,
          moeda: v.moeda || "BRL",
          login_username: v.login_username,
          login_password_encrypted: v.login_password_encrypted || null,
          bookmaker_catalogo_id: v.bookmaker_catalogo_id,
          logo_url: v.bookmakers_catalogo?.logo_url || null,
          totalApostas: apostasCount[v.id] || 0,
        };
      });

      setVinculos(mappedVinculos);
    } catch (error: any) {
      toast.error("Erro ao carregar vínculos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricoCount = async () => {
    try {
      const { data, error } = await supabase
        .from("projeto_bookmaker_historico")
        .select("id, data_desvinculacao")
        .eq("projeto_id", projetoId);

      if (error) throw error;

      const total = data?.length || 0;
      const devolvidas = data?.filter(h => h.data_desvinculacao !== null).length || 0;
      setHistoricoCount({ total, devolvidas });
    } catch (error: any) {
      console.error("Erro ao carregar histórico:", error.message);
    }
  };

  const fetchDisponiveis = async () => {
    try {
      // Fetch available bookmakers (not linked to any active project)
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          status,
          saldo_atual,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .is("projeto_id", null)
        .neq("status", "LIMITADA");

      if (error) throw error;

      const mapped: BookmakerDisponivel[] = (data || []).map((v: any) => ({
        id: v.id,
        nome: v.nome,
        parceiro_id: v.parceiro_id,
        parceiro_nome: v.parceiros?.nome || null,
        saldo_atual: v.saldo_atual,
        bookmaker_status: v.status,
        logo_url: v.bookmakers_catalogo?.logo_url || null,
      }));

      setDisponiveis(mapped);
    } catch (error: any) {
      toast.error("Erro ao carregar vínculos disponíveis: " + error.message);
    }
  };

  const handleOpenAddDialog = () => {
    fetchDisponiveis();
    setSelectedIds([]);
    setAddDialogOpen(true);
  };

  const handleAddVinculos = async () => {
    if (selectedIds.length === 0) {
      toast.error("Selecione pelo menos um vínculo");
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Update bookmakers with projeto_id and reset status to ativo
      const { error } = await supabase
        .from("bookmakers")
        .update({ projeto_id: projetoId, status: "ativo" })
        .in("id", selectedIds);

      if (error) throw error;

      // Get bookmaker details for history
      const selectedBookmakers = disponiveis.filter(d => selectedIds.includes(d.id));
      
      // Insert history records
      const historicoRecords = selectedBookmakers.map(bk => ({
        user_id: user.id,
        projeto_id: projetoId,
        bookmaker_id: bk.id,
        parceiro_id: bk.parceiro_id,
        bookmaker_nome: bk.nome,
        parceiro_nome: bk.parceiro_nome,
        data_vinculacao: new Date().toISOString(),
      }));

      await supabase
        .from("projeto_bookmaker_historico")
        .upsert(historicoRecords, { onConflict: "projeto_id,bookmaker_id" });

      toast.success(`${selectedIds.length} vínculo(s) adicionado(s) ao projeto`);
      setAddDialogOpen(false);
      fetchVinculos();
      fetchHistoricoCount();
    } catch (error: any) {
      toast.error("Erro ao adicionar vínculos: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveVinculo = async () => {
    if (!vinculoToRemove) return;

    try {
      setSaving(true);

      // Salvar o status ORIGINAL do bookmaker (ativo ou limitada) antes de alterar
      // Isso permite que a Central de Operações saiba se pode realocar ou só processar saque
      const statusAnterior = vinculoToRemove.bookmaker_status; // "ativo" ou "LIMITADA"

      // Update history record with unlink date and original status
      await supabase
        .from("projeto_bookmaker_historico")
        .update({ 
          data_desvinculacao: new Date().toISOString(),
          status_final: statusAnterior // Salvar status original, não o futuro
        })
        .eq("projeto_id", projetoId)
        .eq("bookmaker_id", vinculoToRemove.id);

      // Se tiver saldo, muda para AGUARDANDO_SAQUE ao invés de liberar diretamente
      if (vinculoToRemove.saldo_atual > 0) {
        const { error } = await supabase
          .from("bookmakers")
          .update({ 
            projeto_id: null, 
            status: "AGUARDANDO_SAQUE" 
          })
          .eq("id", vinculoToRemove.id);

        if (error) throw error;

        toast.success(
          `Vínculo liberado com saldo pendente de ${formatCurrency(vinculoToRemove.saldo_atual, vinculoToRemove.moeda)}. Um alerta foi criado para a tesouraria.`,
          { duration: 5000 }
        );
      } else {
        // Sem saldo, libera normalmente
        const { error } = await supabase
          .from("bookmakers")
          .update({ projeto_id: null })
          .eq("id", vinculoToRemove.id);

        if (error) throw error;

        toast.success("Vínculo liberado do projeto");
      }

      setRemoveDialogOpen(false);
      setVinculoToRemove(null);
      fetchVinculos();
      fetchHistoricoCount();
    } catch (error: any) {
      toast.error("Erro ao liberar vínculo: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeStatus = async (vinculoId: string, newStatus: string) => {
    try {
      setChangingStatus(true);

      // Database expects lowercase values
      const statusLower = newStatus.toLowerCase();
      
      const { error } = await supabase
        .from("bookmakers")
        .update({ status: statusLower })
        .eq("id", vinculoId);

      if (error) throw error;

      toast.success(`Status alterado para ${newStatus === "ATIVO" ? "Ativo" : "Limitada"}`);
      setStatusPopoverId(null);
      fetchVinculos();
    } catch (error: any) {
      toast.error("Erro ao alterar status: " + error.message);
    } finally {
      setChangingStatus(false);
    }
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

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    const symbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      GBP: "£"
    };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

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
    
    return matchesSearch && matchesBonusFilter;
  });

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const totalSaldo = vinculos.reduce((acc, v) => acc + v.saldo_atual, 0);
  const totalBonusAtivo = bonusSummary.active_bonus_total;
  const totalSaldoOperavel = totalSaldo + totalBonusAtivo;
  const vinculosAtivos = vinculos.filter((v) => v.bookmaker_status.toUpperCase() === "ATIVO").length;
  const vinculosLimitados = vinculos.filter((v) => v.bookmaker_status.toUpperCase() === "LIMITADA").length;

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
      <TabsList>
        <TabsTrigger value="ativos" className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Ativos ({vinculos.length})
        </TabsTrigger>
        <TabsTrigger value="historico" className="flex items-center gap-2">
          <History className="h-4 w-4" />
          Histórico ({historicoCount.total})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ativos" className="space-y-4">
        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contas no Projeto</CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vinculos.length}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400">{vinculosAtivos} ativas</span>
              {" · "}
              <span className="text-yellow-400">{vinculosLimitados} limitadas</span>
            </p>
          </CardContent>
        </Card>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-primary/30 bg-primary/5 cursor-help">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    Saldo Operável
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(totalSaldoOperavel)}</div>
                  <p className="text-xs text-muted-foreground">
                    Real {formatCurrency(totalSaldo)} + Bônus {formatCurrency(totalBonusAtivo)}
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">Saldo Operável = Real + Bônus Ativo</p>
              <p className="text-xs text-muted-foreground">Valor disponível para operação incluindo bônus creditados</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bônus Ativo</CardTitle>
            <Gift className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{formatCurrency(totalBonusAtivo)}</div>
            <p className="text-xs text-muted-foreground">
              {bonusSummary.bookmakers_with_active_bonus} casa{bonusSummary.bookmakers_with_active_bonus !== 1 ? 's' : ''} com bônus
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parceiros Únicos</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(vinculos.map((v) => v.parceiro_id).filter(Boolean)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Parceiros com vínculos no projeto
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button onClick={handleOpenAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Vínculos
        </Button>
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
        
        {/* Filter: Only with bonus */}
        <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-card">
          <Switch
            id="filter-bonus"
            checked={filterBonusOnly}
            onCheckedChange={setFilterBonusOnly}
          />
          <Label htmlFor="filter-bonus" className="text-sm cursor-pointer flex items-center gap-1">
            <Gift className="h-3.5 w-3.5 text-purple-400" />
            Só com bônus ({bookmakersWithBonus.length})
          </Label>
        </div>
        
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, parceiro ou login..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Vínculos Grid */}
      {filteredVinculos.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Link2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum vínculo encontrado</h3>
              <p className="text-muted-foreground">
                Adicione vínculos parceiro-bookmaker para começar
              </p>
              <Button className="mt-4" onClick={handleOpenAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Vínculos
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredVinculos.map((vinculo) => (
            <Card key={vinculo.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {vinculo.logo_url ? (
                      <img
                        src={vinculo.logo_url}
                        alt={vinculo.nome}
                        className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-base">{vinculo.nome}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {vinculo.login_username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                            disabled={changingStatus}
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
                          {changingStatus && (
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
                  
                  {/* Saldos separados */}
                  <div className="pt-2 border-t space-y-1.5">
                    {/* Saldo Operável (Real + Bônus) - Destaque */}
                    {(bonusTotalsByBookmaker[vinculo.id] || 0) > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-between p-1.5 rounded bg-primary/10 border border-primary/20">
                              <span className="text-xs font-medium text-primary flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Saldo Operável
                              </span>
                              <span className="text-sm font-bold text-primary">
                                {formatCurrency(vinculo.saldo_atual + (bonusTotalsByBookmaker[vinculo.id] || 0), vinculo.moeda)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Real + Bônus Ativo</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Wallet className="h-3 w-3" />
                        Saldo Real
                      </span>
                      <span className="text-sm font-semibold">{formatCurrency(vinculo.saldo_atual, vinculo.moeda)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Em Aposta
                      </span>
                      <span className="text-sm font-medium text-yellow-400">{formatCurrency(vinculo.saldo_em_aposta, vinculo.moeda)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Livre
                      </span>
                      <span className="text-sm font-medium text-emerald-400">{formatCurrency(vinculo.saldo_livre, vinculo.moeda)}</span>
                    </div>
                    {vinculo.saldo_freebet > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Gift className="h-3 w-3 text-amber-400" />
                          Freebet
                        </span>
                        <span className="text-sm font-medium text-amber-400">{formatCurrency(vinculo.saldo_freebet, vinculo.moeda)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Apostas</span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Target className="h-3 w-3 text-primary" />
                      {vinculo.totalApostas}
                    </span>
                  </div>

                  {/* Bonus Badge */}
                  {(bonusTotalsByBookmaker[vinculo.id] || 0) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Coins className="h-3 w-3 text-purple-400" />
                        Bônus Creditado
                      </span>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        {formatCurrency(bonusTotalsByBookmaker[vinculo.id], vinculo.moeda)}
                      </Badge>
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-2">
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
                      onClick={() => setTransacaoDialogOpen(true)}
                      title="Nova Transação"
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Transação
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setVinculoToRemove(vinculo);
                        setRemoveDialogOpen(true);
                      }}
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
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
              {filteredVinculos.map((vinculo) => (
                <div
                  key={vinculo.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  {/* Logo */}
                  {vinculo.logo_url ? (
                    <img
                      src={vinculo.logo_url}
                      alt={vinculo.nome}
                      className="h-10 w-10 rounded-lg object-contain bg-white p-1 flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{vinculo.nome}</span>
                      {vinculo.login_username && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Popover
                                open={credentialsPopoverOpen === vinculo.id}
                                onOpenChange={(open) => setCredentialsPopoverOpen(open ? vinculo.id : null)}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
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
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Credenciais</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="truncate">{vinculo.parceiro_nome || "Sem parceiro"}</span>
                    </div>
                  </div>

                  {/* Apostas */}
                  <div className="text-center flex-shrink-0 px-2">
                    <p className="text-xs text-muted-foreground">Apostas</p>
                    <p className="font-medium flex items-center justify-center gap-1">
                      <Target className="h-3 w-3 text-primary" />
                      {vinculo.totalApostas}
                    </p>
                  </div>

                  {/* Saldo Total */}
                  <div className="text-right flex-shrink-0 min-w-[80px]">
                    <p className="text-xs text-muted-foreground">Saldo Total</p>
                    <p className="font-semibold">{formatCurrency(vinculo.saldo_atual, vinculo.moeda)}</p>
                  </div>

                  {/* Em Aposta */}
                  <div className="text-right flex-shrink-0 min-w-[80px]">
                    <p className="text-xs text-muted-foreground">Em Aposta</p>
                    <p className="font-medium text-yellow-400">{formatCurrency(vinculo.saldo_em_aposta, vinculo.moeda)}</p>
                  </div>

                  {/* Livre */}
                  <div className="text-right flex-shrink-0 min-w-[80px]">
                    <p className="text-xs text-muted-foreground">Livre</p>
                    <p className="font-medium text-emerald-400">{formatCurrency(vinculo.saldo_livre, vinculo.moeda)}</p>
                  </div>

                  {/* Freebet (condicional) */}
                  {vinculo.saldo_freebet > 0 && (
                    <div className="text-right flex-shrink-0 min-w-[80px]">
                      <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                        <Gift className="h-3 w-3 text-amber-400" />
                        Freebet
                      </p>
                      <p className="font-medium text-amber-400">{formatCurrency(vinculo.saldo_freebet, vinculo.moeda)}</p>
                    </div>
                  )}

                  {/* Bonus Badge in List */}
                  {(bonusTotalsByBookmaker[vinculo.id] || 0) > 0 && (
                    <div className="text-right flex-shrink-0 min-w-[80px]">
                      <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                        <Coins className="h-3 w-3 text-purple-400" />
                        Bônus
                      </p>
                      <p className="font-medium text-purple-400">{formatCurrency(bonusTotalsByBookmaker[vinculo.id], vinculo.moeda)}</p>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="flex-shrink-0">
                    {getStatusBadge(vinculo.bookmaker_status)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Credentials Popover */}
                    {vinculo.login_username && (
                      <Popover
                        open={credentialsPopoverOpen === vinculo.id}
                        onOpenChange={(open) => setCredentialsPopoverOpen(open ? vinculo.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver Credenciais"
                          >
                            <IdCard className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72" align="end">
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
                                  onClick={() => copyToClipboard(vinculo.login_username, `user-${vinculo.id}`)}
                                >
                                  {copiedField === `user-${vinculo.id}` ? (
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
                                    onClick={() => copyToClipboard(decryptPassword(vinculo.login_password_encrypted), `pass-${vinculo.id}`)}
                                  >
                                    {copiedField === `pass-${vinculo.id}` ? (
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
                      title="Nova Transação"
                      onClick={() => setTransacaoDialogOpen(true)}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
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
                            disabled={changingStatus}
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
                          {changingStatus && (
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
                        setVinculoToRemove(vinculo);
                        setRemoveDialogOpen(true);
                      }}
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Vínculos ao Projeto</DialogTitle>
            <DialogDescription>
              Selecione os vínculos parceiro-bookmaker disponíveis para adicionar ao projeto.
              Vínculos em uso em outros projetos não são exibidos.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px] pr-4">
            {disponiveis.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Link2 className="mx-auto h-10 w-10 mb-2 opacity-50" />
                <p>Nenhum vínculo disponível</p>
                <p className="text-sm">Todos os vínculos estão em uso ou limitados</p>
              </div>
            ) : (
              <div className="space-y-2">
                {disponiveis.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.includes(item.id)
                        ? "bg-primary/10 border-primary"
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
                        className="h-8 w-8 rounded object-contain bg-white p-0.5"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.parceiro_nome || "Sem parceiro"}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {formatCurrency(item.saldo_atual)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddVinculos} disabled={saving || selectedIds.length === 0}>
              {saving ? (
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

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar Vínculo do Projeto?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  O vínculo <strong>{vinculoToRemove?.nome}</strong> do parceiro{" "}
                  <strong>{vinculoToRemove?.parceiro_nome}</strong> será liberado.
                </p>
                {vinculoToRemove && vinculoToRemove.saldo_atual > 0 && (
                  <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
                    <p className="text-yellow-400 font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Atenção: Saldo pendente de {formatCurrency(vinculoToRemove.saldo_atual, vinculoToRemove.moeda)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      O vínculo será marcado como "Aguardando Saque" e um alerta será criado 
                      na Central de Operações para a tesouraria processar o saque.
                    </p>
                  </div>
                )}
                {vinculoToRemove && vinculoToRemove.saldo_atual === 0 && (
                  <p className="text-muted-foreground">
                    Este vínculo está com saldo zerado e ficará disponível para outros projetos.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveVinculo} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Liberando...
                </>
              ) : vinculoToRemove && vinculoToRemove.saldo_atual > 0 ? (
                "Liberar e Criar Alerta"
              ) : (
                "Liberar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Nova Transação */}
      <CaixaTransacaoDialog
        open={transacaoDialogOpen}
        onClose={() => setTransacaoDialogOpen(false)}
        onSuccess={async () => {
          setTransacaoDialogOpen(false);
          // Delay para garantir que o trigger do banco tenha atualizado os saldos
          await new Promise(resolve => setTimeout(resolve, 300));
          fetchVinculos();
        }}
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
            fetchVinculos();
          }}
        />
      )}
      </TabsContent>

      <TabsContent value="historico">
        <HistoricoVinculosTab projetoId={projetoId} />
      </TabsContent>
    </Tabs>
  );
}
