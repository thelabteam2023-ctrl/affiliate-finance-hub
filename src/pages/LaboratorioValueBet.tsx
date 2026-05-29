import { useState, useMemo, useEffect } from "react";
import { useLaboratorioValueBet } from "@/hooks/useLaboratorioValueBet";
import { useValuebetProjectsSummary } from "@/hooks/useValuebetProjectsSummary";
import { ValuebetProjectPicker } from "@/components/laboratorio/ValuebetProjectPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, Cell
} from "recharts";
import { format, startOfWeek, startOfMonth, parseISO, startOfYear, endOfMonth, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, TrendingUp, TrendingDown, Target, Zap, BarChart3, PieChart as PieChartIcon, Calendar, AlertCircle, Settings2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { KPIAnchorCard } from "@/components/kpis/KPIAnchorCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";

export default function LaboratorioValueBet() {
  const { workspaceId } = useAuth();
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [timeGrouping, setTimeGrouping] = useState<"daily" | "weekly" | "monthly">("daily");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Initialize with last 30 days
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setDateRange({ from: start, to: end });
  }, []);

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;

  // Fetch available projects with ValueBet statistics
  const { data: projectsSummary, isLoading: loadingProjects } = useValuebetProjectsSummary();

  // Auto-select all projects on first load
  useEffect(() => {
    if (projectsSummary && projectsSummary.length > 0 && selectedProjectIds.length === 0) {
      setSelectedProjectIds(projectsSummary.map(p => p.projeto_id));
    }
  }, [projectsSummary]);

  const { data: stats, isLoading: loadingStats } = useLaboratorioValueBet(
    selectedProjectIds.length > 0 ? selectedProjectIds : null,
    startDateStr,
    endDateStr
  );

  const totalBetsHeader = useMemo(() => {
    if (!stats?.kpis?.total_bets) return "0 apostas";
    return `${stats.kpis.total_bets.toLocaleString()} apostas`;
  }, [stats?.kpis?.total_bets]);

  const toggleProject = (id: string) => {
    setSelectedProjectIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (projectsSummary) {
      setSelectedProjectIds(projectsSummary.map(p => p.projeto_id));
    }
  };

  const clearSelection = () => {
    setSelectedProjectIds([]);
  };

  const groupedEvolutionData = useMemo(() => {
    if (!stats?.evolution) return [];

    const grouped: Record<string, number> = {};
    
    stats.evolution.forEach(item => {
      const date = parseISO(item.date);
      let key = item.date;
      
      if (timeGrouping === "weekly") {
        key = format(startOfWeek(date), "yyyy-MM-dd");
      } else if (timeGrouping === "monthly") {
        key = format(startOfMonth(date), "yyyy-MM-01");
      }
      
      grouped[key] = (grouped[key] || 0) + item.daily_profit;
    });

    let cumulative = 0;
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, profit]) => {
        cumulative += profit;
        return {
          date,
          profit,
          cumulative,
          formattedDate: format(parseISO(date), timeGrouping === "daily" ? "dd/MM" : timeGrouping === "weekly" ? "'Sem' dd/MM" : "MMM/yy", { locale: ptBR })
        };
      });
  }, [stats?.evolution, timeGrouping]);

  if (loadingProjects) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-background min-h-full text-foreground">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="text-[#00C853]" /> Monitor de Apostas
          </h1>
          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            {totalBetsHeader} • Estratégia: VALUEBET
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-card text-xs hover:bg-primary/10 hover:text-primary border-border/50"
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 7);
              setDateRange({ from: start, to: end });
            }}
          >
            7 dias
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-card text-xs hover:bg-primary/10 hover:text-primary border-border/50"
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 30);
              setDateRange({ from: start, to: end });
            }}
          >
            30 dias
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                size="sm"
                className={cn(
                  "w-[240px] justify-start text-left font-normal bg-card text-xs border-border/50",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4 text-primary" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "dd/MM/yyyy")} - {format(dateRange.to, "dd/MM/yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "dd/MM/yyyy")
                  )
                ) : (
                  <span>Selecionar período</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-card border-border" align="end">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Filtros */}
        <div className="lg:col-span-1">
          <ValuebetProjectPicker
            projects={projectsSummary || []}
            selectedIds={selectedProjectIds}
            onToggle={toggleProject}
            onSelectAll={selectAll}
            onClear={clearSelection}
          />
        </div>

        {/* Dashboard Content */}
        <div className="lg:col-span-3 space-y-6">
          {selectedProjectIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bg-card/30 rounded-xl border border-dashed border-border/50 space-y-4">
              <AlertCircle className="h-12 w-12 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-lg font-medium text-muted-foreground">Nenhum projeto selecionado</p>
                <p className="text-sm text-muted-foreground/60">Selecione ao menos um projeto na lista ao lado para ver os dados.</p>
              </div>
              <Button variant="outline" onClick={selectAll}>Selecionar Todos</Button>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KPIAnchorCard 
                  label="TOTAL DE APOSTAS" 
                  value={stats?.kpis?.total_bets ?? 0} 
                  icon={<Target className="h-4 w-4 text-muted-foreground/60" />}
                />
                <KPIAnchorCard 
                  label="VOLUME APOSTADO" 
                  value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats?.kpis?.volume ?? 0)} 
                  icon={<Zap className="h-4 w-4 text-muted-foreground/60" />}
                />
                <KPIAnchorCard 
                  label="LUCRO / PREJUÍZO" 
                  value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats?.kpis?.profit ?? 0)} 
                  valueClass={stats?.kpis?.profit && stats.kpis.profit >= 0 ? "text-green-500" : "text-red-500"}
                  icon={stats?.kpis?.profit && stats.kpis.profit >= 0 ? <TrendingUp className="h-4 w-4 text-green-500/60" /> : <TrendingDown className="h-4 w-4 text-red-500/60" />}
                />
                <KPIAnchorCard 
                  label="ROI GERAL" 
                  value={`${(stats?.kpis?.roi ?? 0).toFixed(2)}%`}
                  valueClass={stats?.kpis?.roi && stats.kpis.roi >= 0 ? "text-green-400" : "text-red-400"}
                />
                <KPIAnchorCard 
                  label="WIN RATE" 
                  value={`${(stats?.kpis?.win_rate ?? 0).toFixed(1)}%`}
                />
              </div>

              {/* Gráfico de Evolução */}
              <Card className="border-border bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-medium">Evolução de Lucro Acumulado</CardTitle>
                  <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md">
                    {(["daily", "weekly", "monthly"] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setTimeGrouping(g)}
                        className={cn(
                          "px-3 py-1 text-xs rounded-sm transition-colors",
                          timeGrouping === g ? "bg-primary text-black font-medium" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {g === "daily" ? "Dia" : g === "weekly" ? "Semana" : "Mês"}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    {loadingStats ? (
                      <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={groupedEvolutionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d35" vertical={false} />
                          <XAxis dataKey="formattedDate" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: "#1e2128", border: "1px solid #2a2d35", borderRadius: "8px" }}
                            labelStyle={{ color: "#888888", marginBottom: "4px" }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="cumulative" 
                            stroke="#00C853" 
                            strokeWidth={2} 
                            dot={false}
                            activeDot={{ r: 4, fill: "#00C853" }} 
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gráfico por Mercado */}
                <Card className="border-border bg-card/50">
                  <CardHeader><CardTitle className="text-base font-medium">Performance por Mercado</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats?.markets?.sort((a,b) => b.profit - a.profit)}>
                          <XAxis dataKey="mercado_grupo" stroke="#888888" fontSize={10} hide />
                          <YAxis stroke="#888888" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: "#1e2128", border: "1px solid #2a2d35", borderRadius: "8px" }}
                          />
                          <Bar dataKey="profit" name="Lucro/Prejuízo">
                            {stats?.markets?.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? "#00C853" : "#FF1744"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Gráfico por Faixa de Odd */}
                <Card className="border-border bg-card/50">
                  <CardHeader><CardTitle className="text-base font-medium">Performance por Faixa de Odd</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats?.odds}>
                          <XAxis dataKey="faixa_odd" stroke="#888888" fontSize={10} />
                          <YAxis stroke="#888888" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: "#1e2128", border: "1px solid #2a2d35", borderRadius: "8px" }}
                          />
                          <Bar dataKey="profit" name="Lucro/Prejuízo">
                            {stats?.odds?.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? "#2962FF" : "#FF1744"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
