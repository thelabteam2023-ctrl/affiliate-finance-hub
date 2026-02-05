import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus, FinalizeReason } from "@/hooks/useProjectBonuses";
import { useQuery } from "@tanstack/react-query";
import { VinculoBonusDrawer } from "../VinculoBonusDrawer";
import { FinalizeBonusDialog } from "../FinalizeBonusDialog";
import { cn } from "@/lib/utils";
import { 
  Building2, 
  Coins, 
  Wallet, 
  TrendingUp, 
  Search, 
  Gift, 
  Clock, 
  User,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Target,
  LayoutGrid,
  List,
  Eye,
  History,
  XCircle,
  RotateCcw
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

interface BonusCasasTabProps {
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
  saldo_real: number;
  moeda: string;
  bonus_ativo: number;
  bonuses: ProjectBonus[];
  nearest_expiry: Date | null;
  // Métricas operacionais de apostas
  total_apostas: number;
  volume_apostado: number;
  lucro_prejuizo: number;
}

export function BonusCasasTab({ projetoId }: BonusCasasTabProps) {
  const { bonuses, finalizeBonus, saving, getBookmakersWithActiveBonus, getRolloverPercentage } = useProjectBonuses({ projectId: projetoId });
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  
  // Drawer state
  const [bonusDrawerOpen, setBonusDrawerOpen] = useState(false);
  const [selectedBookmaker, setSelectedBookmaker] = useState<{ id: string; nome: string; login?: string; password?: string | null; logo?: string | null; bookmaker_catalogo_id?: string | null; moeda?: string } | null>(null);
  
  // Finalize dialog state
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [bonusToFinalize, setBonusToFinalize] = useState<ProjectBonus | null>(null);

  const bookmakersInBonusMode = getBookmakersWithActiveBonus();

  // Query para buscar dados de apostas por bookmaker
  const { data: apostasStats = {} } = useQuery({
    queryKey: ["bonus-casas-apostas-stats", projetoId],
    queryFn: async () => {
      // Busca todas as apostas do projeto agrupadas por bookmaker
      const { data, error } = await supabase
        .from("apostas_unificada")
        .select("bookmaker_id, stake, lucro_prejuizo, status")
        .eq("projeto_id", projetoId)
        .neq("status", "CANCELADA");

      if (error) throw error;

      // Agrupa por bookmaker_id
      const stats: Record<string, { total_apostas: number; volume_apostado: number; lucro_prejuizo: number }> = {};
      
      (data || []).forEach((aposta: any) => {
        const bkId = aposta.bookmaker_id;
        if (!bkId) return;
        
        if (!stats[bkId]) {
          stats[bkId] = { total_apostas: 0, volume_apostado: 0, lucro_prejuizo: 0 };
        }
        
        stats[bkId].total_apostas += 1;
        stats[bkId].volume_apostado += Number(aposta.stake) || 0;
        stats[bkId].lucro_prejuizo += Number(aposta.lucro_prejuizo) || 0;
      });

      return stats;
    },
    enabled: !!projetoId,
    staleTime: 1000 * 30,
  });

  // Use React Query for fetching bookmakers - automatically refreshes when bonuses change
  const { data: bookmakers = [], isLoading: loading } = useQuery({
    queryKey: ["bonus-casas-bookmakers", projetoId, bookmakersInBonusMode.join(","), bonuses.length, Object.keys(apostasStats).length],
    queryFn: async () => {
      if (bookmakersInBonusMode.length === 0) return [];

      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          login_username,
          login_password_encrypted,
          saldo_atual,
          saldo_usd,
          moeda,
          bookmaker_catalogo_id,
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url),
          parceiros!bookmakers_parceiro_id_fkey (nome)
        `)
        .in("id", bookmakersInBonusMode);

      if (error) throw error;

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
        const bonusTotal = activeBonuses.reduce((acc, b) => acc + b.bonus_amount, 0);
        
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

        // Usar saldo_usd para moedas USD/USDT, senão saldo_atual
        const moeda = bk.moeda || 'BRL';
        const saldoReal = (moeda === 'USD' || moeda === 'USDT') 
          ? (bk.saldo_usd || 0) 
          : (bk.saldo_atual || 0);

        // Pegar métricas de apostas
        const bkApostasStats = apostasStats[bk.id] || { total_apostas: 0, volume_apostado: 0, lucro_prejuizo: 0 };

        return {
          id: bk.id,
          nome: bk.nome,
          login_username: bk.login_username,
          login_password_encrypted: bk.login_password_encrypted || null,
          logo_url: bk.bookmakers_catalogo?.logo_url || null,
          bookmaker_catalogo_id: bk.bookmaker_catalogo_id || null,
          parceiro_nome: bk.parceiros?.nome || null,
          saldo_real: saldoReal,
          moeda: moeda,
          bonus_ativo: bonusTotal,
          bonuses: bkBonuses,
          nearest_expiry: nearestExpiry,
          total_apostas: bkApostasStats.total_apostas,
          volume_apostado: bkApostasStats.volume_apostado,
          lucro_prejuizo: bkApostasStats.lucro_prejuizo,
        };
      });

      // Sort by bonus amount descending
      mapped.sort((a, b) => b.bonus_ativo - a.bonus_ativo);
      
      return mapped;
    },
    enabled: !!projetoId,
    staleTime: 1000 * 30,
  });

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
  };

  const formatCurrency = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

  const getExpiryBadge = (expiryDate: Date | null) => {
    if (!expiryDate) return null;
    const daysUntil = differenceInDays(expiryDate, new Date());
    
    if (daysUntil < 0) {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expirado</Badge>;
    }
    if (daysUntil <= 7) {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{daysUntil}d restantes</Badge>;
    }
    if (daysUntil <= 15) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{daysUntil}d restantes</Badge>;
    }
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{daysUntil}d restantes</Badge>;
  };

  const filteredBookmakers = bookmakers.filter(bk => 
    bk.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bk.login_username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bk.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get pending bonuses (not yet credited)
  const pendingBonuses = bonuses.filter(b => b.status === 'pending');

  // Get bookmakers that need action: credited bonus but zero balance (consumed)
  const bookmakersNeedingAction = useMemo(() => {
    return bookmakers.filter(bk => {
      const activeBonuses = bk.bonuses.filter(b => b.status === 'credited');
      // Has credited bonus but zero or negative real balance = needs finalization
      return activeBonuses.length > 0 && bk.saldo_real <= 0;
    });
  }, [bookmakers]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "cards" | "list")}>
          <ToggleGroupItem value="list" aria-label="Visualização em lista">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="cards" aria-label="Visualização em cards">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* ACTION REQUIRED ALERT - Bookmakers with zero balance needing finalization */}
      {bookmakersNeedingAction.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/10 animate-pulse-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Ação Necessária ({bookmakersNeedingAction.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Estas casas têm bônus ativo, mas saldo zerado. Finalize o bônus para registrar o resultado.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bookmakersNeedingAction.map((bk) => {
                const activeBonuses = bk.bonuses.filter(b => b.status === 'credited');
                return activeBonuses.map((bonus) => (
                  <div 
                    key={bonus.id} 
                    className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-red-500/30"
                  >
                    {bk.logo_url ? (
                      <img
                        src={bk.logo_url}
                        alt={bk.nome}
                        className="h-8 w-8 rounded-lg object-contain bg-white p-0.5"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{bk.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{bonus.title}</p>
                      <p className="text-xs text-red-400">Saldo: {formatCurrency(bk.saldo_real, bk.moeda)}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-500/30 hover:bg-red-500/20 text-red-400"
                      onClick={() => handleFinalizeClick(bonus)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Finalizar
                    </Button>
                  </div>
                ));
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                <div 
                  key={bonus.id} 
                  className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-yellow-500/20"
                >
                  {bonus.bookmaker_logo_url ? (
                    <img
                      src={bonus.bookmaker_logo_url}
                      alt={bonus.bookmaker_nome}
                      className="h-8 w-8 rounded-lg object-contain bg-white p-0.5"
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
                    <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400">
                      Pendente
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              O rollover só será contado após o bônus ser creditado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {filteredBookmakers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Coins className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma casa em modo bônus</h3>
              <p className="text-muted-foreground">
                Adicione bônus às casas para vê-las aqui
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        /* LIST VIEW */
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bookmaker</TableHead>
                <TableHead>Parceiro</TableHead>
                <TableHead className="text-center">Apostas</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">Saldo Unificado</TableHead>
                <TableHead className="text-right">Bônus Ativo</TableHead>
                <TableHead className="min-w-[180px]">Rollover</TableHead>
                <TableHead className="text-center">Expiração</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookmakers.map((bk) => {
                const activeBonuses = bk.bonuses.filter(b => b.status === 'credited');
                
                // Calculate combined rollover
                const totalRolloverTarget = activeBonuses.reduce((acc, b) => acc + (b.rollover_target_amount || 0), 0);
                const totalRolloverProgress = activeBonuses.reduce((acc, b) => acc + (b.rollover_progress || 0), 0);
                const hasRollover = totalRolloverTarget > 0;
                const rolloverPercent = hasRollover ? Math.min(100, (totalRolloverProgress / totalRolloverTarget) * 100) : 0;
                
                return (
                  <TableRow key={bk.id} className="hover:bg-amber-500/5">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {bk.logo_url ? (
                          <img
                            src={bk.logo_url}
                            alt={bk.nome}
                            className="h-8 w-8 rounded-lg object-contain bg-white p-0.5"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {bk.nome}
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1">
                              <Coins className="h-2.5 w-2.5" />
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{bk.login_username}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{bk.parceiro_nome || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {bk.total_apostas}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(bk.volume_apostado, bk.moeda)}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-semibold",
                      bk.lucro_prejuizo > 0 ? "text-emerald-400" : bk.lucro_prejuizo < 0 ? "text-red-400" : "text-muted-foreground"
                    )}>
                      {bk.lucro_prejuizo > 0 ? "+" : ""}{formatCurrency(bk.lucro_prejuizo, bk.moeda)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatCurrency(bk.saldo_real, bk.moeda)}
                    </TableCell>
                    <TableCell className="text-right text-amber-400 font-semibold">
                      {formatCurrency(bk.bonus_ativo, bk.moeda)}
                    </TableCell>
                    <TableCell>
                      {hasRollover ? (
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
                                    {rolloverPercent.toFixed(0)}%
                                  </span>
                                </div>
                                <Progress 
                                  value={rolloverPercent} 
                                  className={cn(
                                    "h-2",
                                    rolloverPercent >= 100 && "[&>div]:bg-emerald-500"
                                  )}
                                />
                                <div className="text-[10px] text-muted-foreground">
                                  {formatCurrency(totalRolloverProgress, bk.moeda)} / {formatCurrency(totalRolloverTarget, bk.moeda)}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-1">
                                <p>Meta total: {formatCurrency(totalRolloverTarget, bk.moeda)}</p>
                                <p>Apostado: {formatCurrency(totalRolloverProgress, bk.moeda)}</p>
                                <p>Falta: {formatCurrency(Math.max(0, totalRolloverTarget - totalRolloverProgress), bk.moeda)}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem rollover</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {getExpiryBadge(bk.nearest_expiry)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-500/30 hover:bg-amber-500/10"
                        onClick={() => handleOpenBonusDrawer(bk)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
                          className="h-10 w-10 rounded-lg object-contain bg-white p-1"
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

                    {/* Métricas Operacionais de Apostas */}
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Métricas Operacionais</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 rounded bg-muted/50">
                          <p className="text-lg font-bold">{bk.total_apostas}</p>
                          <p className="text-[10px] text-muted-foreground">Apostas</p>
                        </div>
                        <div className="text-center p-2 rounded bg-muted/50">
                          <p className="text-sm font-bold">{formatCurrency(bk.volume_apostado, bk.moeda)}</p>
                          <p className="text-[10px] text-muted-foreground">Volume</p>
                        </div>
                        <div className={cn(
                          "text-center p-2 rounded",
                          bk.lucro_prejuizo > 0 ? "bg-emerald-500/10" : bk.lucro_prejuizo < 0 ? "bg-red-500/10" : "bg-muted/50"
                        )}>
                          <p className={cn(
                            "text-sm font-bold",
                            bk.lucro_prejuizo > 0 ? "text-emerald-400" : bk.lucro_prejuizo < 0 ? "text-red-400" : ""
                          )}>
                            {bk.lucro_prejuizo > 0 ? "+" : ""}{formatCurrency(bk.lucro_prejuizo, bk.moeda)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">P&L</p>
                        </div>
                      </div>
                    </div>

                    {/* Balances */}
                    <div className="pt-2 border-t space-y-2 mt-2">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Saldos & Bônus</p>
                      {/* Operational Balance - Highlight */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-between p-2 rounded bg-primary/10 border border-primary/20">
                              <span className="text-xs font-medium text-primary flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Saldo Unificado
                              </span>
                              <span className="text-sm font-bold text-primary">
                                {formatCurrency(bk.saldo_real, bk.moeda)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Saldo total da conta (real + bônus misturados)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Wallet className="h-3 w-3" />
                          Saldo Real
                        </span>
                        <span className="text-sm font-semibold">{formatCurrency(bk.saldo_real, bk.moeda)}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Gift className="h-3 w-3 text-amber-400" />
                          Bônus Ativo
                        </span>
                        <span className="text-sm font-semibold text-amber-400">{formatCurrency(bk.bonus_ativo, bk.moeda)}</span>
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

                    {/* Active Bonuses List */}
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

      {/* Finalized Bonuses History Section */}
      <FinalizedBonusesSection bonuses={bonuses} formatCurrency={formatCurrency} />

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
          onBonusChange={() => {}} // React Query handles automatic refresh
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

// Finalized bonuses section component
const REASON_LABELS: Record<FinalizeReason, { label: string; icon: React.ElementType; color: string }> = {
  rollover_completed: { label: "Rollover Concluído (Saque)", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30" },
  cycle_completed: { label: "Ciclo Encerrado", icon: CheckCircle2, color: "text-blue-400 bg-blue-500/20 border-blue-500/30" },
  expired: { label: "Expirado", icon: XCircle, color: "text-red-400 bg-red-500/20 border-red-500/30" },
  cancelled_reversed: { label: "Cancelado / Revertido", icon: RotateCcw, color: "text-gray-400 bg-gray-500/20 border-gray-500/30" },
};

interface FinalizedBonusesSectionProps {
  bonuses: ProjectBonus[];
  formatCurrency: (value: number, moeda?: string) => string;
}

function FinalizedBonusesSection({ bonuses, formatCurrency }: FinalizedBonusesSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const finalizedBonuses = bonuses.filter(b => b.status === 'finalized');
  
  if (finalizedBonuses.length === 0) return null;
  
  // Group by bookmaker
  const byBookmaker = finalizedBonuses.reduce((acc, bonus) => {
    const key = bonus.bookmaker_id;
    if (!acc[key]) {
      acc[key] = {
        bookmaker_nome: bonus.bookmaker_nome,
        bookmaker_logo: bonus.bookmaker_logo_url,
        bonuses: [],
      };
    }
    acc[key].bonuses.push(bonus);
    return acc;
  }, {} as Record<string, { bookmaker_nome: string; bookmaker_logo: string | null; bonuses: ProjectBonus[] }>);

  const getReasonBadge = (reason: FinalizeReason | null) => {
    if (!reason) return null;
    const config = REASON_LABELS[reason];
    const Icon = config.icon;
    return (
      <Badge className={cn("text-[10px]", config.color)}>
        <Icon className="h-2.5 w-2.5 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-muted">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <History className="h-4 w-4" />
                Histórico de Casas Finalizadas ({finalizedBonuses.length})
              </span>
              <Badge variant="outline" className="text-xs">
                {isOpen ? "Recolher" : "Expandir"}
              </Badge>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {Object.entries(byBookmaker).map(([bkId, data]) => (
                <div key={bkId} className="p-3 rounded-lg bg-card border">
                  <div className="flex items-center gap-3 mb-3">
                    {data.bookmaker_logo ? (
                      <img
                        src={data.bookmaker_logo}
                        alt={data.bookmaker_nome}
                        className="h-8 w-8 rounded-lg object-contain bg-white p-0.5"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <span className="font-medium">{data.bookmaker_nome}</span>
                      <p className="text-xs text-muted-foreground">{data.bonuses.length} bônus finalizados</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {data.bonuses.map(bonus => (
                      <div key={bonus.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="truncate text-muted-foreground">{bonus.title || 'Bônus'}</span>
                          <span className="font-medium">{formatCurrency(bonus.bonus_amount, bonus.currency)}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getReasonBadge(bonus.finalize_reason)}
                          {bonus.finalized_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {format(parseISO(bonus.finalized_at), "dd/MM/yy", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
