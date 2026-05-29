import { useState, useMemo, useEffect } from "react";
import { useValueBetLabData } from "@/hooks/useValueBetLabData";
import { useValuebetProjectsSummary } from "@/hooks/useValuebetProjectsSummary";
import { LabSidebar } from "@/components/laboratorio/LabSidebar";
import { LabKPIPanel } from "@/components/laboratorio/LabKPIPanel";
import { MarketsTab } from "@/components/laboratorio/tabs/MarketsTab";
import { OddRangesTab } from "@/components/laboratorio/tabs/OddRangesTab";
import { EvolutionTab } from "@/components/laboratorio/tabs/EvolutionTab";
import { BetsTab } from "@/components/laboratorio/tabs/BetsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Loader2, Filter, Calendar, Info, BarChart3, 
  Target, Zap, TrendingUp, ChevronDown 
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { ValuebetProjectPicker } from "@/components/laboratorio/ValuebetProjectPicker";
import { ValuebetDebugMonitor } from "@/components/laboratorio/ValuebetDebugMonitor";
import { cn } from "@/lib/utils";

export default function LaboratorioValueBet() {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { from: start, to: end };
  });

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;

  const { data: projectsSummary } = useValuebetProjectsSummary();
  const { stats, isLoading, error: rpcError } = useValueBetLabData(
    selectedProjectIds.length > 0 ? selectedProjectIds : null,
    startDateStr,
    endDateStr,
    selectedSport
  );

  // Auto-select projects
  useEffect(() => {
    if (projectsSummary && projectsSummary.length > 0 && selectedProjectIds.length === 0) {
      setSelectedProjectIds(projectsSummary.map(p => p.projeto_id));
    }
  }, [projectsSummary]);

  const activeMetrics = useMemo(() => {
    if (!stats) return null;
    if (selectedSport && stats.sports[selectedSport]) {
      return stats.sports[selectedSport];
    }
    return stats.global;
  }, [stats, selectedSport]);

  const filteredBetsForTab = useMemo(() => {
    if (!stats?.raw) return [];
    if (!selectedSport) return stats.raw;
    return stats.raw.filter(b => {
      let rawSport = b.esporte || 'Outros';
      let bSport = rawSport.trim() === "" ? "Outros" : rawSport.charAt(0).toUpperCase() + rawSport.slice(1).toLowerCase();
      // Apply same normalization as hook
      if (bSport.toLowerCase() === 'soccer') bSport = 'Futebol';
      if (bSport.toLowerCase() === 'efootball') bSport = 'E-sports';
      if (['counter-strike', 'league of legends', 'valorant', 'dota 2'].includes(bSport.toLowerCase())) bSport = 'E-sports';
      if (bSport.toLowerCase() === 'hockey') bSport = 'Hóquei';
      if (bSport.toLowerCase() === 'basketball') bSport = 'Basquete';
      if (bSport.toLowerCase() === 'tennis') bSport = 'Tênis';
      if (bSport.toLowerCase() === 'volleyball') bSport = 'Vôlei';
      return bSport === selectedSport;
    });
  }, [stats, selectedSport]);

  const filteredMarketsForTab = useMemo(() => {
    if (!stats) return {};
    if (!selectedSport) {
      // Aggregate markets from all sports
      const aggregated: any = {};
      Object.values(stats.sports).forEach(sport => {
        Object.entries(sport.markets).forEach(([mName, mStats]) => {
          if (!aggregated[mName]) {
            aggregated[mName] = { ...mStats, oddRanges: { ...mStats.oddRanges } };
          } else {
            aggregated[mName].total += mStats.total;
            aggregated[mName].validas += mStats.validas;
            aggregated[mName].stake += mStats.stake;
            aggregated[mName].profit += mStats.profit;
            aggregated[mName].greens += mStats.greens;
            aggregated[mName].meioGreens += mStats.meioGreens;
            aggregated[mName].meioReds += mStats.meioReds;
            aggregated[mName].reds += mStats.reds;
            aggregated[mName].voids += mStats.voids;
            aggregated[mName].roi = aggregated[mName].stake > 0 ? (aggregated[mName].profit / aggregated[mName].stake) * 100 : 0;
            aggregated[mName].winRate = aggregated[mName].validas > 0 ? ((aggregated[mName].greens + aggregated[mName].meioGreens * 0.5) / aggregated[mName].validas) * 100 : 0;
            
            // Merge odd ranges
            Object.entries(mStats.oddRanges).forEach(([oRange, oMetrics]) => {
              if (!aggregated[mName].oddRanges[oRange]) {
                aggregated[mName].oddRanges[oRange] = { ...oMetrics };
              } else {
                aggregated[mName].oddRanges[oRange].total += oMetrics.total;
                aggregated[mName].oddRanges[oRange].validas += oMetrics.validas;
                aggregated[mName].oddRanges[oRange].stake += oMetrics.stake;
                aggregated[mName].oddRanges[oRange].profit += oMetrics.profit;
                aggregated[mName].oddRanges[oRange].greens += oMetrics.greens;
                aggregated[mName].oddRanges[oRange].meioGreens += oMetrics.meioGreens;
                aggregated[mName].oddRanges[oRange].meioReds += oMetrics.meioReds;
                aggregated[mName].oddRanges[oRange].reds += oMetrics.reds;
                aggregated[mName].oddRanges[oRange].voids += oMetrics.voids;
              }
            });
          }
        });
      });
      return aggregated;
    }
    return stats.sports[selectedSport].markets;
  }, [stats, selectedSport]);

  if (isLoading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Processando Laboratório...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Navigation Level 1 — Sidebar */}
      <LabSidebar 
        sports={stats?.sports || {}} 
        selectedSport={selectedSport}
        onSelect={setSelectedSport}
        globalRoi={stats?.global.roi || 0}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border/40 flex items-center justify-between px-6 bg-card/10 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <h1 className="text-xl font-black flex items-center gap-2">
                <BarChart3 className="text-primary h-5 w-5" /> 
                {selectedSport || "Todos os Esportes"}
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Monitor Analítico • ValueBet
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 px-4 text-xs gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 text-primary font-bold rounded-full transition-all shadow-sm"
                >
                  <Filter className="h-3.5 w-3.5" /> 
                  Configurar Projetos
                  {selectedProjectIds.length > 0 && (
                    <span className="ml-1 bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full text-[10px]">
                      {selectedProjectIds.length}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] p-0 border-l border-border/40 bg-card/95 backdrop-blur-xl">
                <SheetHeader className="p-6 pb-2">
                  <SheetTitle className="text-xl font-black uppercase tracking-tighter">Projetos em Estudo</SheetTitle>
                  <SheetDescription className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Filtre os dados por fonte de aposta.
                  </SheetDescription>
                </SheetHeader>
                <div className="p-4 h-[calc(100vh-150px)]">
                  <ValuebetProjectPicker
                    projects={projectsSummary || []}
                    selectedIds={selectedProjectIds}
                    onToggle={(id) => setSelectedProjectIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])}
                    onSelectAll={() => setSelectedProjectIds(projectsSummary?.map(p => p.projeto_id) || [])}
                    onClear={() => setSelectedProjectIds([])}
                    className="border-0 bg-transparent shadow-none"
                  />
                </div>
              </SheetContent>
            </Sheet>

            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 px-4 text-xs gap-2 border-border/40 bg-card/40 hover:bg-card/60 rounded-full transition-all"
                >
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {dateRange?.from ? format(dateRange.from, "dd/MM/yy") : 'Início'} — {dateRange?.to ? format(dateRange.to, "dd/MM/yy") : 'Fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 flex flex-col gap-2 border-b border-border/10 bg-muted/20">
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] uppercase font-black h-8 bg-background/50" 
                      onClick={() => {
                        const now = new Date();
                        setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
                      }}
                    >
                      Mês Atual
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] uppercase font-black h-8 bg-background/50" 
                      onClick={() => {
                        const now = new Date();
                        setDateRange({ from: startOfYear(now), to: endOfYear(now) });
                      }}
                    >
                      Ano Atual
                    </Button>
                  </div>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    className="text-[10px] uppercase font-black h-8 w-full shadow-lg shadow-primary/20" 
                    onClick={() => {
                      setDateRange(undefined);
                    }}
                  >
                    Ver Todo o Período
                  </Button>
                </div>
                <CalendarComponent
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-primary/20">
          {rpcError && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
              <Info className="h-5 w-5 text-red-500" />
              <p className="text-sm font-bold text-red-400">Falha ao carregar dados: {rpcError.message}</p>
            </div>
          )}

          {/* KPIs Globais */}
          {activeMetrics && <LabKPIPanel metrics={activeMetrics} />}

          {/* Tabs */}
          <Tabs defaultValue="markets" className="space-y-6">
            <div className="flex items-center justify-between border-b border-border/20 pb-1">
              <TabsList className="bg-transparent h-auto p-0 gap-8">
                <TabsTrigger value="markets" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-0 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground data-[state=active]:text-foreground transition-all">
                  Mercados
                </TabsTrigger>
                <TabsTrigger value="odds" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-0 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground data-[state=active]:text-foreground transition-all">
                  Faixas de Odd
                </TabsTrigger>
                <TabsTrigger value="evolution" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-0 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground data-[state=active]:text-foreground transition-all">
                  Evolução
                </TabsTrigger>
                <TabsTrigger value="bets" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-0 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground data-[state=active]:text-foreground transition-all">
                  Apostas
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="markets" className="mt-0">
              <div className="space-y-6">
                <MarketsTab markets={filteredMarketsForTab} />
                {/* Gráfico adicional no menu: Entrada por Entrada */}
                <Card className="bg-card/40 border-border/40">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Desempenho Diário do Escopo (Entrada por Entrada)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EvolutionTab 
                      evolution={stats?.evolution || []} 
                      evolutionByEntry={stats?.evolutionByEntry}
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="odds" className="mt-0">
              <OddRangesTab markets={filteredMarketsForTab} />
            </TabsContent>

            <TabsContent value="evolution" className="mt-0">
              <EvolutionTab evolution={stats?.evolution || []} evolutionByEntry={stats?.evolutionByEntry} />
            </TabsContent>

            <TabsContent value="bets" className="mt-0">
              <BetsTab bets={filteredBetsForTab} />
            </TabsContent>
          </Tabs>

          {/* Debug Monitor at the bottom */}
          <ValuebetDebugMonitor 
            workspaceId={null} 
            projectIds={selectedProjectIds} 
            rpcData={stats} 
            rpcError={rpcError} 
            rpcLoading={isLoading} 
          />
        </main>
      </div>
    </div>
  );
}