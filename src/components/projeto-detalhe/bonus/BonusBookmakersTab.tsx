import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { useProjectBonuses, ProjectBonus, FinalizeReason } from "@/hooks/useProjectBonuses";
import { EditFinalizeReasonDialog } from "./EditFinalizeReasonDialog";
import { useBookmakerSaldosQuery, BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { VinculoBonusDrawer } from "../VinculoBonusDrawer";
import { FinalizeBonusDialog } from "../FinalizeBonusDialog";
import { BonusDialog } from "../BonusDialog";
import { BonusFormData } from "@/hooks/useProjectBonuses";
import { ProjectBonusAnalyticsTab } from "./analytics-por-casa";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { 
  Building2, 
  Coins, 
  Search, 
  Plus,
  Eye,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  User,
  Wallet,
  TrendingUp,
  Clock,
  Gift,
  CheckCircle2,
  Target,
  History,
  XCircle,
  AlertTriangle,
  RotateCcw,
  BarChart3,
  ArrowDownUp,
  Pencil
} from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const REASON_LABELS: Record<FinalizeReason, { label: string; icon: React.ElementType; color: string }> = {
  rollover_completed: { label: "Rollover Concluído (Saque)", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30" },
  cycle_completed: { label: "Ciclo Encerrado", icon: CheckCircle2, color: "text-blue-400 bg-blue-500/20 border-blue-500/30" },
  expired: { label: "Expirado", icon: XCircle, color: "text-red-400 bg-red-500/20 border-red-500/30" },
  cancelled_reversed: { label: "Cancelado / Revertido", icon: RotateCcw, color: "text-gray-400 bg-gray-500/20 border-gray-500/30" },
};

// Subcomponent to show finalized bonus history
function FinalizedBonusHistory({ 
  projetoId,
  bonuses, 
  formatCurrency,
  updateFinalizeReason,
}: { 
  projetoId: string;
  bonuses: ProjectBonus[]; 
  formatCurrency: (value: number, moeda: string) => string;
  updateFinalizeReason: (id: string, reason: FinalizeReason) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<ProjectBonus | null>(null);
  
  const finalizedBonuses = bonuses.filter(b => b.status === 'finalized');
  
  // Fetch ajustes pós-limitação
  const { data: ajustesData = [] } = useQuery({
    queryKey: ["bonus-historico-ajustes", projetoId],
    queryFn: async () => {
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, nome, moeda, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)")
        .eq("projeto_id", projetoId);

      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map((b: any) => b.id);
      const bkMap = new Map(bookmakers.map((b: any) => [b.id, {
        nome: b.nome,
        moeda: b.moeda || "BRL",
        logo_url: (b as any).bookmakers_catalogo?.logo_url || null,
      }]));

      const { data, error } = await supabase
        .from("financial_events")
        .select("id, valor, bookmaker_id, moeda, metadata, created_at")
        .in("bookmaker_id", bookmakerIds)
        .eq("tipo_evento", "AJUSTE")
        .not("metadata", "is", null);

      if (error) throw error;

      return (data || []).filter(evt => {
        try {
          const meta = typeof evt.metadata === "string" ? JSON.parse(evt.metadata) : evt.metadata;
          return meta?.tipo_ajuste === "AJUSTE_POS_LIMITACAO";
        } catch { return false; }
      }).map(evt => {
        const meta = typeof evt.metadata === "string" ? JSON.parse(evt.metadata) : evt.metadata;
        const bk = bkMap.get(evt.bookmaker_id);
        return {
          id: evt.id,
          type: "ajuste" as const,
          valor: Number(evt.valor) || 0,
          moeda: evt.moeda || bk?.moeda || "BRL",
          bookmaker_nome: meta?.bookmaker_nome || bk?.nome || "Casa Desconhecida",
          bookmaker_logo_url: bk?.logo_url || null,
          data_ajuste: meta?.data_encerramento || evt.created_at,
          saldo_limitacao: Number(meta?.saldo_no_momento_limitacao) || 0,
          saldo_final: Number(meta?.saldo_final) || 0,
          created_at: evt.created_at,
        };
      });
    },
    enabled: !!projetoId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  const totalEntries = finalizedBonuses.length + ajustesData.length;
  
  if (totalEntries === 0) return null;

  // Merge and sort by date
  type HistoryEntry = 
    | { type: "bonus"; data: ProjectBonus; sortDate: string }
    | { type: "ajuste"; data: typeof ajustesData[0]; sortDate: string };

  const entries: HistoryEntry[] = [
    ...finalizedBonuses.map(b => ({
      type: "bonus" as const,
      data: b,
      sortDate: b.finalized_at || b.created_at,
    })),
    ...ajustesData.map(a => ({
      type: "ajuste" as const,
      data: a,
      sortDate: a.created_at,
    })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  
  const getReasonBadge = (reason: FinalizeReason | null) => {
    if (!reason) return null;
    const config = REASON_LABELS[reason];
    if (!config) return null;
    const Icon = config.icon;
    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-muted/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span>Histórico de Bônus Finalizados</span>
                <Badge variant="secondary" className="ml-2">
                  {totalEntries}
                </Badge>
              </div>
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {entries.map(entry => {
                  if (entry.type === "bonus") {
                    const bonus = entry.data;
                    return (
                      <div key={bonus.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border">
                        {bonus.bookmaker_logo_url ? (
                          <img
                            src={bonus.bookmaker_logo_url}
                            alt={bonus.bookmaker_nome}
                            className="h-8 w-8 rounded-lg object-contain logo-blend p-0.5 flex-shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{bonus.bookmaker_nome}</span>
                            {bonus.title && (
                              <>
                                <span className="text-muted-foreground text-xs">•</span>
                                <span className="text-xs text-muted-foreground">{bonus.title}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {bonus.parceiro_nome && (
                              <>
                                <span>{bonus.parceiro_nome}</span>
                                <span>•</span>
                              </>
                            )}
                            {bonus.finalized_at && (
                              <span>
                                {format(parseISO(bonus.finalized_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                          <span className="font-semibold text-sm">{formatCurrency(bonus.bonus_amount, bonus.currency)}</span>
                          <div className="flex items-center gap-1">
                            {getReasonBadge(bonus.finalize_reason)}
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingBonus(bonus); }}
                              className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                              title="Editar motivo"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Ajuste Pós-Limitação
                  const ajuste = entry.data;
                  const isPositive = ajuste.valor >= 0;
                  return (
                    <div key={ajuste.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-amber-500/20">
                      {ajuste.bookmaker_logo_url ? (
                        <img
                          src={ajuste.bookmaker_logo_url}
                          alt={ajuste.bookmaker_nome}
                          className="h-8 w-8 rounded-lg object-contain logo-blend p-0.5 flex-shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <ArrowDownUp className="h-4 w-4 text-amber-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{ajuste.bookmaker_nome}</span>
                          <span className="text-muted-foreground text-xs">•</span>
                          <span className="text-xs text-muted-foreground">Ajuste Pós-Limitação</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>
                            {formatCurrency(ajuste.saldo_limitacao, ajuste.moeda)} → {formatCurrency(ajuste.saldo_final, ajuste.moeda)}
                          </span>
                          <span>•</span>
                          <span>
                            {format(parseISO(ajuste.data_ajuste), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <span className={`font-semibold text-sm ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                          {isPositive ? "+" : ""}{formatCurrency(ajuste.valor, ajuste.moeda)}
                        </span>
                        <Badge className="text-amber-400 bg-amber-500/20 border-amber-500/30">
                          <ArrowDownUp className="h-3 w-3 mr-1" />
                          Pós-Limitação
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>

      {editingBonus && (
        <EditFinalizeReasonDialog
          open={!!editingBonus}
          onOpenChange={(open) => { if (!open) setEditingBonus(null); }}
          currentReason={editingBonus.finalize_reason}
          bonusTitle={editingBonus.title}
          bookmakerNome={editingBonus.bookmaker_nome || ""}
          onSave={(reason) => updateFinalizeReason(editingBonus.id, reason)}
        />
      )}
    </Collapsible>
  );
}
interface BonusBookmakersTabProps {
  projetoId: string;
}

interface BookmakerInBonusMode {
  id: string;
  nome: string;
  login_username: string;
  login_password_encrypted: string | null;
  logo_url: string | null;
  bookmaker_catalogo_id: string | null;
  parceiro_nome: string | null;
  // UNIFICADO: saldo_operavel vem direto da RPC canônica (já inclui bônus creditados)
  saldo_operavel: number;
  moeda: string;
  bonuses: ProjectBonus[];
  nearest_expiry: Date | null;
  hasActiveBonus: boolean;
}

export function BonusBookmakersTab({ projetoId }: BonusBookmakersTabProps) {
  const { bonuses, fetchBonuses, finalizeBonus, updateBonus, saving, getBookmakersWithActiveBonus, getRolloverPercentage, updateFinalizeReason } = useProjectBonuses({ projectId: projetoId });
  const [bookmakers, setBookmakers] = useState<BookmakerInBonusMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [subTab, setSubTab] = useState<"operacional" | "analytics">("operacional");
  
  // Drawer state
  const [bonusDrawerOpen, setBonusDrawerOpen] = useState(false);
  const [selectedBookmaker, setSelectedBookmaker] = useState<{ id: string; nome: string; login?: string; password?: string | null; logo?: string | null; bookmaker_catalogo_id?: string | null; moeda?: string } | null>(null);
  
  // Finalize dialog state
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [bonusToFinalize, setBonusToFinalize] = useState<ProjectBonus | null>(null);
  
  // Pending bonus edit dialog state (separate from drawer)
  const [pendingBonusDialogOpen, setPendingBonusDialogOpen] = useState(false);
  const [pendingBonusToEdit, setPendingBonusToEdit] = useState<ProjectBonus | null>(null);
  const [pendingBonusBookmaker, setPendingBonusBookmaker] = useState<{ id: string; nome: string; login?: string; password?: string | null; logo?: string | null; bookmaker_catalogo_id?: string | null; moeda?: string } | null>(null);

  const bookmakersInBonusMode = getBookmakersWithActiveBonus();

  // Usar hook canônico para saldos (fonte única de verdade) - ANTES do useEffect
  const { data: saldosData, isLoading: saldosLoading } = useBookmakerSaldosQuery({
    projetoId,
    enabled: true,
    includeZeroBalance: true
  });

  useEffect(() => {
    // Aguardar saldosData estar disponível
    if (!saldosLoading) {
      fetchBookmakers();
    }
  }, [projetoId, bonuses, saldosData, saldosLoading]);

  const fetchBookmakers = async () => {
    if (bookmakersInBonusMode.length === 0) {
      setBookmakers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          login_username,
          login_password_encrypted,
          moeda,
          bookmaker_catalogo_id,
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url),
          parceiros!bookmakers_parceiro_id_fkey (nome)
        `)
        .in("id", bookmakersInBonusMode);

      if (error) throw error;

      // Criar mapa de saldos canônicos
      const saldosMap = new Map<string, BookmakerSaldo>();
      (saldosData || []).forEach(s => saldosMap.set(s.id, s));

      // Group bonuses by bookmaker
      const bonusesByBookmaker: Record<string, ProjectBonus[]> = {};
      bonuses.forEach(b => {
        if (!bonusesByBookmaker[b.bookmaker_id]) {
          bonusesByBookmaker[b.bookmaker_id] = [];
        }
        bonusesByBookmaker[b.bookmaker_id].push(b);
      });

      const mapped: BookmakerInBonusMode[] = (data || []).map((bk: any) => {
        const bkBonuses = bonusesByBookmaker[bk.id] || [];
        const activeBonuses = bkBonuses.filter(b => b.status === 'credited');
        
        // Find nearest expiry
        let nearestExpiry: Date | null = null;
        activeBonuses.forEach(b => {
          if (b.expires_at) {
            const expiryDate = parseISO(b.expires_at);
            if (!nearestExpiry || expiryDate < nearestExpiry) {
              nearestExpiry = expiryDate;
            }
          }
        });

        // SALDO OPERÁVEL: usar valor canônico da RPC (já inclui bônus)
        const saldoCanonicoData = saldosMap.get(bk.id);
        const saldoOperavel = saldoCanonicoData?.saldo_operavel ?? 0;

        return {
          id: bk.id,
          nome: bk.nome,
          login_username: bk.login_username,
          login_password_encrypted: bk.login_password_encrypted || null,
          logo_url: bk.bookmakers_catalogo?.logo_url || null,
          bookmaker_catalogo_id: bk.bookmaker_catalogo_id || null,
          parceiro_nome: bk.parceiros?.nome || null,
          // UNIFICADO: saldo_operavel já inclui tudo (real + bônus + freebet)
          saldo_operavel: saldoOperavel,
          moeda: bk.moeda || 'BRL',
          bonuses: bkBonuses,
          nearest_expiry: nearestExpiry,
          hasActiveBonus: activeBonuses.length > 0,
        };
      });

      // Sort by saldo_operavel descending
      mapped.sort((a, b) => b.saldo_operavel - a.saldo_operavel);
      
      setBookmakers(mapped);
    } catch (error) {
      console.error("Error fetching bookmakers:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleOpenBonusDrawer = (bk: BookmakerInBonusMode) => {
    setSelectedBookmaker({
      id: bk.id,
      nome: bk.nome,
      login: bk.login_username,
      password: bk.login_password_encrypted,
      logo: bk.logo_url,
      bookmaker_catalogo_id: bk.bookmaker_catalogo_id,
      moeda: bk.moeda,
    });
    setBonusDrawerOpen(true);
  };

  const handleFinalizeClick = (bonus: ProjectBonus) => {
    setBonusToFinalize(bonus);
    setFinalizeDialogOpen(true);
  };

  const handleConfirmFinalize = async (reason: FinalizeReason): Promise<boolean> => {
    if (!bonusToFinalize) return false;
    const success = await finalizeBonus(bonusToFinalize.id, reason);
    if (success) setFinalizeDialogOpen(false);
    setBonusToFinalize(null);
    return success;
  };

  const formatCurrency = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

  const getExpiryBadge = (expiryDate: Date | null) => {
    if (!expiryDate) return <span className="text-muted-foreground text-xs">—</span>;
    const daysUntil = differenceInDays(expiryDate, new Date());
    
    if (daysUntil < 0) {
      return <Badge variant="destructive" className="text-xs">Expirado</Badge>;
    }
    if (daysUntil <= 7) {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">{daysUntil}d</Badge>;
    }
    if (daysUntil <= 15) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">{daysUntil}d</Badge>;
    }
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">{daysUntil}d</Badge>;
  };

  const filteredBookmakers = bookmakers.filter(bk => 
    bk.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bk.login_username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bk.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get pending bonuses (not yet credited)
  const pendingBonuses = bonuses.filter(b => b.status === 'pending');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {/* Sub-tabs Navigation */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "operacional" | "analytics")}>
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="operacional" className="data-[state=active]:bg-background gap-2">
            <Building2 className="h-4 w-4" />
            Operacional
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-background gap-2">
            <BarChart3 className="h-4 w-4" />
            Análise por Casa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operacional" className="mt-4 space-y-4">
          {/* Search and View Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, login ou parceiro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "list" | "cards")}>
              <ToggleGroupItem value="list" aria-label="Visualização em lista">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="cards" aria-label="Visualização em cards">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

      {/* Pending Bonuses Section */}
      {pendingBonuses.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-400">
              <Clock className="h-4 w-4" />
              Aguardando Crédito ({pendingBonuses.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pendingBonuses.map((bonus) => (
                <TooltipProvider key={bonus.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/10 transition-colors"
                        onClick={() => {
                          // Open edit dialog directly without drawer
                          setPendingBonusToEdit(bonus);
                          setPendingBonusBookmaker({
                            id: bonus.bookmaker_id,
                            nome: bonus.bookmaker_nome,
                            login: bonus.bookmaker_login,
                            password: null,
                            logo: bonus.bookmaker_logo_url,
                            bookmaker_catalogo_id: bonus.bookmaker_catalogo_id,
                            moeda: bonus.currency,
                          });
                          setPendingBonusDialogOpen(true);
                        }}
                      >
                        {bonus.bookmaker_logo_url ? (
                          <img
                            src={bonus.bookmaker_logo_url}
                            alt={bonus.bookmaker_nome}
                            className="h-8 w-8 rounded-lg object-contain logo-blend p-0.5"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                            <Gift className="h-4 w-4 text-yellow-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{bonus.bookmaker_nome}</p>
                          <p className="text-xs text-muted-foreground truncate">{bonus.title}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-yellow-400">
                            {formatCurrency(bonus.bonus_amount, bonus.currency)}
                          </p>
                          <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400 cursor-pointer">
                            Pendente
                          </Badge>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Clique para editar o status</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              O rollover só será contado após o bônus ser creditado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {filteredBookmakers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Coins className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma bookmaker em modo bônus</h3>
              <p className="text-muted-foreground">
                Adicione bônus às bookmakers para vê-las aqui
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Bookmaker</TableHead>
                  <TableHead>Parceiro</TableHead>
                  <TableHead className="text-right">Saldo Operável</TableHead>
                  <TableHead className="text-center">Expiração</TableHead>
                  <TableHead className="text-center">Ativos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookmakers.map((bk) => {
                  const activeBonuses = bk.bonuses.filter(b => b.status === 'credited');
                  const isExpanded = expandedRows.has(bk.id);
                  
                  // Calculate combined rollover for all active bonuses
                  const totalRolloverTarget = activeBonuses.reduce((acc, b) => acc + (b.rollover_target_amount || 0), 0);
                  const totalRolloverProgress = activeBonuses.reduce((acc, b) => acc + (b.rollover_progress || 0), 0);
                  const hasRollover = totalRolloverTarget > 0;
                  const rolloverPercent = hasRollover ? Math.min(100, (totalRolloverProgress / totalRolloverTarget) * 100) : 0;
                  
                  return (
                    <Collapsible key={bk.id} asChild open={isExpanded} onOpenChange={() => toggleRow(bk.id)}>
                      <>
                        <TableRow 
                          className="hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleRow(bk.id)}
                        >
                          <TableCell>
                            <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {bk.logo_url ? (
                                <img
                                  src={bk.logo_url}
                                  alt={bk.nome}
                                  className="h-8 w-8 rounded object-contain logo-blend p-0.5"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                                  <Building2 className="h-4 w-4 text-primary" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate flex items-center gap-1.5">
                                  {bk.nome}
                                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1 py-0">
                                    <Coins className="h-2.5 w-2.5" />
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{bk.login_username}</div>
                                
                                {/* Rollover Progress Bar */}
                                {hasRollover && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="mt-1.5 space-y-0.5 max-w-[200px]">
                                          <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-muted-foreground flex items-center gap-1">
                                              <Target className="h-2.5 w-2.5" />
                                              Rollover
                                            </span>
                                            <span className={rolloverPercent >= 100 ? "text-emerald-400 font-medium" : "text-muted-foreground"}>
                                              {formatCurrency(totalRolloverProgress, bk.moeda)} / {formatCurrency(totalRolloverTarget, bk.moeda)}
                                            </span>
                                          </div>
                                          <Progress 
                                            value={rolloverPercent} 
                                            className="h-1"
                                          />
                                          <div className="text-right text-[10px] text-muted-foreground">
                                            {rolloverPercent.toFixed(0)}% concluído
                                          </div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="text-xs space-y-1">
                                          <p>Meta total: {formatCurrency(totalRolloverTarget, bk.moeda)}</p>
                                          <p>Apostado: {formatCurrency(totalRolloverProgress, bk.moeda)}</p>
                                          <p>Progresso: {rolloverPercent.toFixed(1)}%</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {bk.parceiro_nome || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {/* SALDO UNIFICADO: saldo_operavel já inclui tudo */}
                            <span className="font-semibold text-primary flex items-center justify-end gap-1">
                              {bk.hasActiveBonus && <Gift className="h-3.5 w-3.5 text-amber-400" />}
                              {formatCurrency(bk.saldo_operavel, bk.moeda)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {getExpiryBadge(bk.nearest_expiry)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="text-xs">
                              {activeBonuses.length}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBonusDrawer(bk);
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver / Adicionar
                            </Button>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={7} className="py-3">
                              <div className="pl-10 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Bônus Ativos ({activeBonuses.length})
                                </p>
                                {activeBonuses.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Nenhum bônus ativo</p>
                                ) : (
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {activeBonuses.map(bonus => (
                                      <div 
                                        key={bonus.id} 
                                        className="flex items-center justify-between p-2 rounded-md bg-background border text-sm"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium truncate">{bonus.title || 'Bônus'}</div>
                                          <div className="text-xs text-amber-400 font-semibold">
                                            {formatCurrency(bonus.bonus_amount, bonus.currency)}
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 text-xs hover:bg-emerald-500/20 hover:text-emerald-400 shrink-0"
                                          onClick={() => handleFinalizeClick(bonus)}
                                        >
                                          Finalizar
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        /* CARDS VIEW */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBookmakers.map((bk) => {
            const activeBonuses = bk.bonuses.filter(b => b.status === 'credited');
            
            return (
              <Card key={bk.id} className="border-amber-500/30 hover:border-amber-500/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {bk.logo_url ? (
                        <img
                          src={bk.logo_url}
                          alt={bk.nome}
                          className="h-10 w-10 rounded-lg object-contain logo-blend p-1"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {bk.nome}
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                            <Coins className="h-3 w-3 mr-1" />
                            Bônus
                          </Badge>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">{bk.login_username}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Partner */}
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{bk.parceiro_nome || "Sem parceiro"}</span>
                    </div>

                    {/* Balances */}
                    <div className="pt-2 border-t space-y-2">
                      {/* Operational Balance - Highlight */}
                      {/* SALDO UNIFICADO: exibir apenas saldo_operavel com ícone se há bônus */}
                      <div className="flex items-center justify-between p-2 rounded bg-primary/10 border border-primary/20">
                        <span className="text-xs font-medium text-primary flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Saldo Operável
                        </span>
                        <span className="text-sm font-bold text-primary flex items-center gap-1">
                          {bk.hasActiveBonus && <Gift className="h-3 w-3 text-amber-400" />}
                          {formatCurrency(bk.saldo_operavel, bk.moeda)}
                        </span>
                      </div>
                    </div>

                    {/* Expiry */}
                    {bk.nearest_expiry && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expiração
                        </span>
                        {getExpiryBadge(bk.nearest_expiry)}
                      </div>
                    )}

                    {/* Active Bonuses List with Rollover */}
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Bônus Ativos ({activeBonuses.length}):</p>
                      <ScrollArea className="h-32">
                        <div className="space-y-2">
                          {activeBonuses.map(bonus => {
                            const rolloverPercent = getRolloverPercentage(bonus);
                            const hasRollover = bonus.rollover_target_amount && bonus.rollover_target_amount > 0;
                            
                            return (
                              <div key={bonus.id} className="text-xs p-2 rounded bg-card border space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="truncate">{bonus.title || 'Bônus'}</span>
                                    <span className="font-semibold text-amber-400">{formatCurrency(bonus.bonus_amount, bonus.currency)}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs hover:bg-emerald-500/20 hover:text-emerald-400"
                                    onClick={() => handleFinalizeClick(bonus)}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Finalizar
                                  </Button>
                                </div>
                                
                                {/* Rollover Progress Bar */}
                                {hasRollover && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="space-y-1">
                                          <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-muted-foreground flex items-center gap-1">
                                              <Target className="h-3 w-3" />
                                              Rollover
                                            </span>
                                            <span className={rolloverPercent >= 100 ? "text-emerald-400 font-medium" : "text-muted-foreground"}>
                                              {formatCurrency(bonus.rollover_progress || 0, bonus.currency)} / {formatCurrency(bonus.rollover_target_amount!, bonus.currency)}
                                            </span>
                                          </div>
                                          <Progress 
                                            value={rolloverPercent} 
                                            className="h-1.5"
                                          />
                                          <div className="text-right text-[10px] text-muted-foreground">
                                            {rolloverPercent.toFixed(0)}% concluído
                                          </div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="text-xs space-y-1">
                                          <p>Meta de rollover: {formatCurrency(bonus.rollover_target_amount!, bonus.currency)}</p>
                                          <p>Apostado: {formatCurrency(bonus.rollover_progress || 0, bonus.currency)}</p>
                                          {bonus.rollover_multiplier && <p>Multiplicador: {bonus.rollover_multiplier}x</p>}
                                          {bonus.min_odds && <p>Odd mínima: {bonus.min_odds}</p>}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-amber-500/30 hover:bg-amber-500/10"
                        onClick={() => handleOpenBonusDrawer(bk)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Ver / Adicionar Bônus
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Histórico de Bônus Finalizados */}
      <FinalizedBonusHistory 
        projetoId={projetoId}
        bonuses={bonuses} 
        formatCurrency={formatCurrency}
        updateFinalizeReason={updateFinalizeReason}
      />

        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <ProjectBonusAnalyticsTab projectId={projetoId} />
        </TabsContent>
      </Tabs>

      {/* Bonus Drawer */}
      {selectedBookmaker && (
        <VinculoBonusDrawer
          open={bonusDrawerOpen}
          onOpenChange={setBonusDrawerOpen}
          projectId={projetoId}
          bookmakerId={selectedBookmaker.id}
          bookmakerName={selectedBookmaker.nome}
          bookmakerLogin={selectedBookmaker.login}
          bookmakerPassword={selectedBookmaker.password}
          bookmakerLogo={selectedBookmaker.logo}
          bookmakerCatalogoId={selectedBookmaker.bookmaker_catalogo_id}
          currency={selectedBookmaker.moeda}
          onBonusChange={fetchBonuses}
        />
      )}

      {/* Pending Bonus Edit Dialog (separate from drawer) */}
      {pendingBonusBookmaker && (
        <BonusDialog
          open={pendingBonusDialogOpen}
          onOpenChange={(open) => {
            setPendingBonusDialogOpen(open);
            if (!open) {
              setPendingBonusToEdit(null);
              setPendingBonusBookmaker(null);
            }
          }}
          projectId={projetoId}
          bookmakers={[{
            id: pendingBonusBookmaker.id,
            nome: pendingBonusBookmaker.nome,
            login_username: pendingBonusBookmaker.login || "",
            login_password_encrypted: pendingBonusBookmaker.password,
            logo_url: pendingBonusBookmaker.logo,
            bookmaker_catalogo_id: pendingBonusBookmaker.bookmaker_catalogo_id,
            moeda: pendingBonusBookmaker.moeda,
          }]}
          bonus={pendingBonusToEdit}
          preselectedBookmakerId={pendingBonusBookmaker.id}
          saving={saving}
          onSubmit={async (data: BonusFormData) => {
            if (!pendingBonusToEdit) return false;
            const success = await updateBonus(pendingBonusToEdit.id, data);
            if (success) {
              setPendingBonusDialogOpen(false);
              setPendingBonusToEdit(null);
              setPendingBonusBookmaker(null);
            }
            return success;
          }}
        />
      )}

      {/* Finalize Dialog */}
      <FinalizeBonusDialog
        open={finalizeDialogOpen}
        onOpenChange={setFinalizeDialogOpen}
        bonusAmount={bonusToFinalize?.bonus_amount || 0}
        currency={bonusToFinalize?.currency || 'BRL'}
        onConfirm={handleConfirmFinalize}
      />
    </div>
  );
}
