import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { ConfirmacaoSenhaDialog } from "@/components/ui/confirmacao-senha-dialog";
import {
  Gift,
  Plus,
  Search,
  Building2,
  Edit,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Undo2,
  Calendar,
  TrendingUp,
  DollarSign,
  Filter,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useProjectBonuses, ProjectBonus, BonusStatus, BonusFormData } from "@/hooks/useProjectBonuses";
import { BonusDialog } from "./BonusDialog";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";
import { useBookmakerSaldosQuery, BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";

interface ProjetoBonusTabProps {
  projetoId: string;
}

// Interface adaptada para o BonusDialog (mantendo compatibilidade)
interface BookmakerOption {
  id: string;
  nome: string;
  login_username: string;
  login_password_encrypted?: string | null;
  logo_url?: string | null;
  bookmaker_catalogo_id?: string | null;
  saldo_atual?: number;
  saldo_usd?: number;
  moeda?: string;
  parceiro_nome?: string;
}

const getStatusBadge = (status: BonusStatus) => {
  switch (status) {
    case "credited":
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Creditado
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="h-3 w-3 mr-1" />
          Falhou
        </Badge>
      );
    case "expired":
      return (
        <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Expirado
        </Badge>
      );
    case "reversed":
      return (
        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
          <Undo2 className="h-3 w-3 mr-1" />
          Estornado
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
};

const formatCurrency = (value: number, currency: string = "BRL") => {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    USDT: "USDT",
  };
  return `${symbols[currency] || currency} ${value.toFixed(2)}`;
};

export function ProjetoBonusTab({ projetoId }: ProjetoBonusTabProps) {
  const {
    bonuses,
    loading,
    saving,
    getSummary,
    createBonus,
    updateBonus,
    deleteBonus,
  } = useProjectBonuses({ projectId: projetoId });

  const activeBonusBookmakerIds = useMemo(() => {
    return new Set(
      bonuses
        .filter((b) => b.status === "credited" && b.saldo_atual > 0)
        .map((b) => b.bookmaker_id)
    );
  }, [bonuses]);

  // IDs de bookmakers que já possuem bônus PENDENTE (não podem receber novo bônus)
  const pendingBonusBookmakerIds = useMemo(() => {
    return new Set(
      bonuses
        .filter((b) => b.status === "pending")
        .map((b) => b.bookmaker_id)
    );
  }, [bonuses]);

  // CORREÇÃO: Usar RPC canônica para saldos em vez de query direta
  const { data: saldosData, isLoading: loadingSaldos } = useBookmakerSaldosQuery({
    projetoId,
    enabled: true,
    includeZeroBalance: true // Incluir bookmakers com saldo zero no dialog de bonus
  });

  // Query adicional para buscar bookmaker_catalogo_id (necessário para templates de bônus)
  const { data: catalogoIdsData } = useQuery({
    queryKey: ["bookmaker-catalogo-ids", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, bookmaker_catalogo_id")
        .eq("projeto_id", projetoId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!projetoId
  });

  // Criar mapa de bookmaker_id -> bookmaker_catalogo_id
  const catalogoIdMap = useMemo(() => {
    const map = new Map<string, string | null>();
    (catalogoIdsData || []).forEach(item => {
      map.set(item.id, item.bookmaker_catalogo_id);
    });
    return map;
  }, [catalogoIdsData]);

  const loadingBookmakers = loadingSaldos;

  // Adaptar dados do hook para a interface BookmakerOption esperada pelo BonusDialog
  const bookmakers: BookmakerOption[] = useMemo(() => {
    if (!saldosData) return [];
    return saldosData.map((bk: BookmakerSaldo) => ({
      id: bk.id,
      nome: bk.nome,
      login_username: "", // Não disponível no RPC, mas não é usado no select
      login_password_encrypted: null,
      logo_url: bk.logo_url,
      bookmaker_catalogo_id: catalogoIdMap.get(bk.id) || null,
      saldo_atual: bk.saldo_operavel, // CORREÇÃO: usar saldo_operavel em vez de saldo_real
      saldo_usd: bk.moeda === "USD" || bk.moeda === "USDT" ? bk.saldo_operavel : 0,
      moeda: bk.moeda,
      parceiro_nome: bk.parceiro_nome || undefined,
    }));
  }, [saldosData, catalogoIdMap]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<BonusStatus | "all">("all");
  const [bookmakerFilter, setBookmakerFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<ProjectBonus | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [captchaDialogOpen, setCaptchaDialogOpen] = useState(false);
  const [bonusToDelete, setBonusToDelete] = useState<string | null>(null);
  const [bonusToDeleteIsCredited, setBonusToDeleteIsCredited] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (data: BonusFormData): Promise<boolean> => {
    if (editingBonus) {
      return await updateBonus(editingBonus.id, data);
    } else {
      return await createBonus(data);
    }
  };

  const handleEdit = (bonus: ProjectBonus) => {
    setEditingBonus(bonus);
    setDialogOpen(true);
  };

  const handleRequestDelete = (bonusId: string, isCredited: boolean) => {
    setBonusToDelete(bonusId);
    setBonusToDeleteIsCredited(isCredited);
    if (isCredited) {
      setCaptchaDialogOpen(true);
    } else {
      setDeleteDialogOpen(true);
    }
  };

  const handleDelete = async () => {
    if (!bonusToDelete) return;
    setDeleting(true);
    await deleteBonus(bonusToDelete);
    setDeleting(false);
    setDeleteDialogOpen(false);
    setCaptchaDialogOpen(false);
    setBonusToDelete(null);
    setBonusToDeleteIsCredited(false);
  };

  const summary = getSummary();

  const filteredBonuses = bonuses.filter((b) => {
    // Search filter
    const matchSearch =
      b.bookmaker_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter
    const matchStatus = statusFilter === "all" || b.status === statusFilter;

    // Bookmaker filter
    const matchBookmaker = bookmakerFilter === "all" || b.bookmaker_id === bookmakerFilter;

    return matchSearch && matchStatus && matchBookmaker;
  });

  // Top bookmakers by credited bonus
  const topBookmakers = bonuses
    .filter((b) => b.status === "credited")
    .reduce((acc, b) => {
      const key = b.bookmaker_id;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          nome: b.bookmaker_nome || "N/A",
          logo_url: b.bookmaker_logo_url,
          total: 0,
          count: 0,
        };
      }
      acc[key].total += b.bonus_amount;
      acc[key].count++;
      return acc;
    }, {} as Record<string, { id: string; nome: string; logo_url?: string | null; total: number; count: number }>);

  const topBookmakersList = Object.values(topBookmakers)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (loading || loadingBookmakers) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bônus Creditados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(summary.total_credited)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.count_credited} bônus
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">
              {formatCurrency(summary.total_pending)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.count_pending} aguardando
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhos / Expirados</CardTitle>
            <XCircle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(summary.total_failed + summary.total_expired)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.count_failed + summary.count_expired} bônus
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Registrado</CardTitle>
            <Gift className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bonuses.length}</div>
            <p className="text-xs text-muted-foreground">
              em {Object.keys(topBookmakers).length} casas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Bookmakers (optional) */}
      {topBookmakersList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Top Casas por Bônus Creditado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {topBookmakersList.map((bk) => (
                <div
                  key={bk.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border"
                >
                  {bk.logo_url ? (
                    <img
                      src={bk.logo_url}
                      alt={bk.nome}
                      className="h-6 w-6 rounded object-contain logo-blend"
                    />
                  ) : (
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="font-medium">{bk.nome}</span>
                  <Badge variant="secondary">
                    {formatCurrency(bk.total)} ({bk.count})
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => { setEditingBonus(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar Bônus
        </Button>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por casa, título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BonusStatus | "all")}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="credited">Creditado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
            <SelectItem value="reversed">Estornado</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={bookmakerFilter !== "all" ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
            >
              <Building2 className="h-3.5 w-3.5 mr-1" />
              {bookmakerFilter === "all" 
                ? "Casas" 
                : bookmakers.find(b => b.id === bookmakerFilter)?.nome || "Casa"}
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar casa..." />
              <CommandList>
                <CommandEmpty>Nenhuma casa encontrada.</CommandEmpty>
                <CommandGroup>
                  <CommandItem onSelect={() => setBookmakerFilter("all")} className="py-2">
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary flex-shrink-0",
                        bookmakerFilter === "all"
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="text-sm">Todas as Casas</span>
                  </CommandItem>
                  {bookmakers.map((bk) => {
                    const isSelected = bookmakerFilter === bk.id;
                    return (
                      <CommandItem key={bk.id} onSelect={() => setBookmakerFilter(bk.id)} className="py-2">
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary flex-shrink-0",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-sm tracking-wide uppercase truncate">
                            {bk.nome}
                          </span>
                          {bk.parceiro_nome && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {bk.parceiro_nome}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Bonus Table */}
      {filteredBonuses.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Gift className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum bônus encontrado</h3>
              <p className="text-muted-foreground">
                {bonuses.length === 0
                  ? "Registre bônus recebidos pelos vínculos do projeto"
                  : "Ajuste os filtros para ver mais resultados"}
              </p>
              <Button className="mt-4" onClick={() => { setEditingBonus(null); setDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Registrar Bônus
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Casa</th>
                    <th className="text-left p-4 font-medium">Perfil</th>
                    <th className="text-right p-4 font-medium">Valor</th>
                    <th className="text-center p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Título</th>
                    <th className="text-left p-4 font-medium">Data</th>
                    <th className="text-left p-4 font-medium">Expira em</th>
                    <th className="text-center p-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBonuses.map((bonus) => (
                    <tr key={bonus.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {bonus.bookmaker_logo_url ? (
                            <img
                              src={bonus.bookmaker_logo_url}
                              alt={bonus.bookmaker_nome}
                              className="h-8 w-8 rounded object-contain logo-blend p-0.5"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <Building2 className="h-4 w-4" />
                            </div>
                          )}
                          <span className="font-medium">{bonus.bookmaker_nome}</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {bonus.bookmaker_login}
                      </td>
                      <td className="p-4 text-right font-semibold">
                        {formatCurrency(bonus.bonus_amount, bonus.currency)}
                      </td>
                      <td className="p-4 text-center">
                        {getStatusBadge(bonus.status)}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {bonus.title || "-"}
                      </td>
                      <td className="p-4">
                        <span className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(bonus.credited_at || bonus.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </td>
                      <td className="p-4">
                        {bonus.expires_at ? (
                          <span className="flex items-center gap-1 text-sm text-amber-400">
                            <Clock className="h-3 w-3" />
                            {format(new Date(bonus.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(bonus)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleRequestDelete(bonus.id, bonus.status === "credited")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <BonusDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projetoId}
        bookmakers={
          editingBonus
            ? bookmakers
            : bookmakers.filter((b) => 
                !pendingBonusBookmakerIds.has(b.id) && 
                !activeBonusBookmakerIds.has(b.id)
              )
        }
        bonus={editingBonus}
        saving={saving}
        onSubmit={handleSubmit}
      />

      {/* Delete Confirmation - Simple (non-credited) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Bônus</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este bônus? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation - CAPTCHA (credited bonus, impacts balance) */}
      <ConfirmacaoSenhaDialog
        open={captchaDialogOpen}
        onOpenChange={setCaptchaDialogOpen}
        onConfirm={handleDelete}
        title="Excluir Bônus Creditado"
        description="Este bônus já foi creditado no saldo. A exclusão irá estornar o valor automaticamente. Digite o código para confirmar."
        confirmLabel={deleting ? "Excluindo..." : "Excluir e Estornar"}
        variant="danger"
      />
    </div>
  );
}
