import { useState, useMemo, useEffect } from "react";
import { useLaboratorioValueBet } from "@/hooks/useLaboratorioValueBet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, Cell
} from "recharts";
import { format, startOfWeek, startOfMonth, parseISO, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, TrendingUp, TrendingDown, Target, Zap, BarChart3, PieChart as PieChartIcon, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";

const COLORS = ["#00C853", "#2962FF", "#AA00FF", "#FFAB00", "#FF1744", "#00B0FF", "#F50057", "#00E5FF"];

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

  // Fetch available projects with ValueBet strategy
  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ["projects-valuebet", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("workspace_id", workspaceId)
        .order("nome");
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
  });

  const { data: stats, isLoading: loadingStats } = useLaboratorioValueBet(
    selectedProjectIds.length > 0 ? selectedProjectIds : null,
    startDateStr,
    endDateStr
  );

  const toggleProject = (id: string) => {
    setSelectedProjectIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (projects) {
      setSelectedProjectIds(projects.map(p => p.id));
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
            <BarChart3 className="text-[#00C853]" /> Laboratório ValueBet
          </h1>
          <p className="text-muted-foreground">Análise profunda de performance e ROI para estratégias de valor.</p>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal bg-card",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4" />
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
        <Card className="lg:col-span-1 border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Projetos</CardTitle>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" className="text-[10px] h-7 px-2" onClick={selectAll}>Todos</Button>
              <Button variant="outline" size="sm" className="text-[10px] h-7 px-2" onClick={clearSelection}>Limpar</Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[450px] pr-4">
              <div className="space-y-3">
                {projects?.map((project) => (
                  <div key={project.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={project.id} 
                      checked={selectedProjectIds.includes(project.id)}
                      onCheckedChange={() => toggleProject(project.id)}
                    />
                    <Label htmlFor={project.id} className="text-sm cursor-pointer truncate">
                      {project.nome}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Dashboard Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard title="Apostas" value={stats?.kpis?.total_bets ?? 0} icon={Target} />
            <KPICard title="Volume" value={stats?.kpis?.volume ?? 0} isCurrency icon={Zap} />
            <KPICard 
              title="Lucro" 
              value={stats?.kpis?.profit ?? 0} 
              isCurrency 
              icon={stats?.kpis?.profit && stats.kpis.profit >= 0 ? TrendingUp : TrendingDown}
              color={stats?.kpis?.profit && stats.kpis.profit >= 0 ? "text-green-500" : "text-red-500"}
            />
            <KPICard title="ROI" value={stats?.kpis?.roi ?? 0} isPercent icon={TrendingUp} />
            <KPICard title="Win Rate" value={stats?.kpis?.win_rate ?? 0} isPercent icon={PieChartIcon} />
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
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, isCurrency, isPercent, icon: Icon, color }: { 
  title: string; 
  value: number; 
  isCurrency?: boolean; 
  isPercent?: boolean; 
  icon: any;
  color?: string;
}) {
  const formattedValue = isCurrency 
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
    : isPercent 
      ? `${value.toFixed(2)}%`
      : value.toLocaleString();

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="pt-4 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{title}</p>
          <Icon className="h-3 w-3 text-muted-foreground" />
        </div>
        <p className={cn("text-lg font-bold truncate", color)}>{formattedValue}</p>
      </CardContent>
    </Card>
  );
}
