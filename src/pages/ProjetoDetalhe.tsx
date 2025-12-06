import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  ArrowLeft, 
  FolderKanban, 
  LayoutDashboard,
  Target,
  Users,
  Link2,
  CalendarIcon,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Edit,
  Gift,
  Coins,
  AlertTriangle,
  Percent
} from "lucide-react";
import { format, differenceInDays, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProjetoDashboardTab } from "@/components/projeto-detalhe/ProjetoDashboardTab";
import { ProjetoApostasTab } from "@/components/projeto-detalhe/ProjetoApostasTab";
import { ProjetoOperadoresTab } from "@/components/projeto-detalhe/ProjetoOperadoresTab";
import { ProjetoVinculosTab } from "@/components/projeto-detalhe/ProjetoVinculosTab";
import { ProjetoMatchedBettingTab } from "@/components/projeto-detalhe/ProjetoMatchedBettingTab";
import { ProjetoPerdasTab } from "@/components/projeto-detalhe/ProjetoPerdasTab";
import { ProjetoDialog } from "@/components/projetos/ProjetoDialog";
import { DateRange } from "react-day-picker";

interface Projeto {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  data_fim_real: string | null;
  orcamento_inicial: number | null;
  observacoes: string | null;
  tem_investimento_crypto: boolean;
  conciliado: boolean;
  modelo_absorcao_taxas: string;
}

interface ProjetoResumo {
  operadores_ativos: number;
  total_gasto_operadores: number;
}

interface ApostasResumo {
  total_apostas: number;
  apostas_pendentes: number;
  greens: number;
  reds: number;
  voids: number;
  meio_greens: number;
  meio_reds: number;
  total_stake: number;
  lucro_total: number;
  roi_percentual: number;
}

type PeriodFilter = "hoje" | "ontem" | "7dias" | "mes" | "ano" | "todo" | "custom";

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [resumo, setResumo] = useState<ProjetoResumo | null>(null);
  const [apostasResumo, setApostasResumo] = useState<ApostasResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Period filter state
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("todo");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProjeto();
    }
  }, [id]);

  // Refetch KPIs when period changes
  useEffect(() => {
    if (id && projeto) {
      fetchApostasResumo();
    }
  }, [periodFilter, dateRange]);

  const getDateRangeFromFilter = (): { start: Date | null; end: Date | null } => {
    const today = new Date();
    
    switch (periodFilter) {
      case "hoje":
        return { start: startOfDay(today), end: endOfDay(today) };
      case "ontem":
        const yesterday = subDays(today, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "7dias":
        return { start: startOfDay(subDays(today, 7)), end: endOfDay(today) };
      case "mes":
        return { start: startOfMonth(today), end: endOfDay(today) };
      case "ano":
        return { start: startOfYear(today), end: endOfDay(today) };
      case "custom":
        return { 
          start: dateRange?.from || null, 
          end: dateRange?.to || dateRange?.from || null 
        };
      case "todo":
      default:
        return { start: null, end: null };
    }
  };

  const fetchApostasResumo = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      // Build query for apostas with date filter
      let query = supabase
        .from("apostas")
        .select("stake, lucro_prejuizo, status, resultado")
        .eq("projeto_id", id);
      
      if (start) {
        query = query.gte("data_aposta", start.toISOString());
      }
      if (end) {
        query = query.lte("data_aposta", end.toISOString());
      }
      
      const { data: apostas, error } = await query;
      
      if (error) throw error;
      
      // Calculate summary from filtered apostas
      const summary: ApostasResumo = {
        total_apostas: apostas?.length || 0,
        apostas_pendentes: apostas?.filter(a => a.status === "PENDENTE").length || 0,
        greens: apostas?.filter(a => a.resultado === "GREEN").length || 0,
        reds: apostas?.filter(a => a.resultado === "RED").length || 0,
        voids: apostas?.filter(a => a.resultado === "VOID").length || 0,
        meio_greens: apostas?.filter(a => a.resultado === "MEIO_GREEN" || a.resultado === "HALF").length || 0,
        meio_reds: apostas?.filter(a => a.resultado === "MEIO_RED").length || 0,
        total_stake: apostas?.reduce((acc, a) => acc + Number(a.stake || 0), 0) || 0,
        lucro_total: apostas?.reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0) || 0,
        roi_percentual: 0
      };
      
      // Calculate ROI
      if (summary.total_stake > 0) {
        summary.roi_percentual = (summary.lucro_total / summary.total_stake) * 100;
      }
      
      setApostasResumo(summary);
    } catch (error: any) {
      console.error("Erro ao carregar resumo de apostas:", error.message);
    }
  };

  const fetchProjeto = async () => {
    try {
      setLoading(true);
      
      // Fetch project details
      const { data: projetoData, error: projetoError } = await supabase
        .from("projetos")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (projetoError) throw projetoError;
      if (!projetoData) {
        toast.error("Projeto não encontrado");
        navigate("/projetos");
        return;
      }

      setProjeto(projetoData);

      // Fetch project summary from view
      const { data: resumoData } = await supabase
        .from("v_projeto_resumo")
        .select("operadores_ativos, total_gasto_operadores")
        .eq("projeto_id", id)
        .maybeSingle();

      if (resumoData) {
        setResumo(resumoData as ProjetoResumo);
      }

      // Fetch apostas summary (will use period filter)
      await fetchApostasResumo();

    } catch (error: any) {
      toast.error("Erro ao carregar projeto: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (period: PeriodFilter) => {
    setPeriodFilter(period);
    if (period !== "custom") {
      setDateRange(undefined);
    }
  };

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from) {
      setPeriodFilter("custom");
    }
  };

  const getPeriodLabel = (): string => {
    switch (periodFilter) {
      case "hoje": return "Hoje";
      case "ontem": return "Ontem";
      case "7dias": return "7 dias";
      case "mes": return "Este mês";
      case "ano": return "Este ano";
      case "todo": return "Todo período";
      case "custom":
        if (dateRange?.from && dateRange?.to) {
          return `${format(dateRange.from, "dd/MM")} - ${format(dateRange.to, "dd/MM")}`;
        }
        if (dateRange?.from) {
          return format(dateRange.from, "dd/MM/yyyy");
        }
        return "Período";
      default: return "Todo período";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PLANEJADO": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "EM_ANDAMENTO": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "PAUSADO": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "FINALIZADO": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PLANEJADO": return "Planejado";
      case "EM_ANDAMENTO": return "Em Andamento";
      case "PAUSADO": return "Pausado";
      case "FINALIZADO": return "Finalizado";
      default: return status;
    }
  };

  const getDiasAtivos = () => {
    if (!projeto?.data_inicio) return 0;
    const inicio = new Date(projeto.data_inicio);
    const fim = projeto.data_fim_real ? new Date(projeto.data_fim_real) : new Date();
    return differenceInDays(fim, inicio);
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!projeto) {
    return null;
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/projetos")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{projeto.nome}</h2>
                <Badge className={getStatusColor(projeto.status)}>
                  {getStatusLabel(projeto.status)}
                </Badge>
                {projeto.data_inicio && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {getDiasAtivos()} dias
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {projeto.descricao && (
                  <p className="text-muted-foreground">{projeto.descricao}</p>
                )}
              </div>
              {projeto.tem_investimento_crypto && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                    <Coins className="h-3 w-3 mr-1" />
                    Crypto
                  </Badge>
                  <Badge className={projeto.conciliado ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                    {projeto.conciliado ? "Conciliado" : "Pendente"}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
          <Edit className="mr-2 h-4 w-4" />
          Editar Projeto
        </Button>
      </div>

      {/* Period Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Período:</span>
        <div className="flex flex-wrap gap-1">
          {[
            { value: "hoje", label: "Hoje" },
            { value: "ontem", label: "Ontem" },
            { value: "7dias", label: "7 dias" },
            { value: "mes", label: "Mês" },
            { value: "ano", label: "Ano" },
            { value: "todo", label: "Tudo" },
          ].map((period) => (
            <Button
              key={period.value}
              variant={periodFilter === period.value ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodChange(period.value as PeriodFilter)}
              className="h-8"
            >
              {period.label}
            </Button>
          ))}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={periodFilter === "custom" ? "default" : "outline"}
                size="sm"
                className="h-8"
              >
                <CalendarIcon className="h-4 w-4 mr-1" />
                {periodFilter === "custom" ? getPeriodLabel() : "Período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  handleDateRangeSelect(range);
                  if (range?.to) setCalendarOpen(false);
                }}
                locale={ptBR}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* KPIs Resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Apostas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Apostas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apostasResumo?.total_apostas || 0}</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span className="text-emerald-500">{apostasResumo?.greens || 0} G</span>
              <span className="text-red-500">{apostasResumo?.reds || 0} R</span>
              <span className="text-lime-400">{apostasResumo?.meio_greens || 0} ½G</span>
              <span className="text-orange-400">{apostasResumo?.meio_reds || 0} ½R</span>
              <span className="text-gray-400">{apostasResumo?.voids || 0} V</span>
            </div>
          </CardContent>
        </Card>

        {/* Volume em Apostas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(apostasResumo?.total_stake || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Total apostado
            </p>
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {(apostasResumo?.lucro_total || 0) >= 0 ? "Lucro" : "Prejuízo"}
            </CardTitle>
            {(apostasResumo?.lucro_total || 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(apostasResumo?.lucro_total || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(Math.abs(apostasResumo?.lucro_total || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              Resultado do período
            </p>
          </CardContent>
        </Card>

        {/* ROI */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(apostasResumo?.roi_percentual || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {(apostasResumo?.roi_percentual || 0).toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Retorno sobre investimento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="apostas" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Apostas Livres
          </TabsTrigger>
          <TabsTrigger value="matched-betting" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Matched Betting
          </TabsTrigger>
          <TabsTrigger value="operadores" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Operadores
          </TabsTrigger>
          <TabsTrigger value="vinculos" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Vínculos
          </TabsTrigger>
          <TabsTrigger value="perdas" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Perdas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <ProjetoDashboardTab 
            projetoId={id!} 
            periodFilter={periodFilter}
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="apostas">
          <ProjetoApostasTab projetoId={id!} onDataChange={fetchApostasResumo} />
        </TabsContent>

        <TabsContent value="matched-betting">
          <ProjetoMatchedBettingTab projetoId={id!} />
        </TabsContent>

        <TabsContent value="operadores">
          <ProjetoOperadoresTab projetoId={id!} />
        </TabsContent>

        <TabsContent value="vinculos">
          <ProjetoVinculosTab projetoId={id!} />
        </TabsContent>

        <TabsContent value="perdas">
          <ProjetoPerdasTab projetoId={id!} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <ProjetoDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        projeto={{
          id: projeto.id,
          nome: projeto.nome,
          descricao: projeto.descricao,
          status: projeto.status,
          data_inicio: projeto.data_inicio,
          data_fim_prevista: projeto.data_fim_prevista,
          orcamento_inicial: projeto.orcamento_inicial || 0,
          tem_investimento_crypto: projeto.tem_investimento_crypto,
          conciliado: projeto.conciliado,
          modelo_absorcao_taxas: projeto.modelo_absorcao_taxas,
        }}
        mode="edit"
        onSuccess={fetchProjeto}
      />
    </div>
  );
}