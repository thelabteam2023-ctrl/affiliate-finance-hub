import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { 
  Plus, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Play,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  AlertTriangle,
  BarChart3,
  ShieldAlert,
  ChevronDown,
  Ban,
  Lock,
  ChevronUp
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
import { CicloDialog } from "./CicloDialog";
import { ComparativoCiclosTab } from "./ComparativoCiclosTab";
import { FecharCicloConfirmDialog } from "./FecharCicloConfirmDialog";
import { useCicloActions } from "@/hooks/useCicloActions";
import { CicloFiltersSimplified, CicloStatusFilter, CicloTipoFilter } from "./ciclos/CicloFiltersSimplified";
import { 
  sortCiclosOperacional, 
  getCicloRealStatus, 
  isMetaPrazo
} from "./ciclos/useCicloSorting";
import { CicloDuracao, CicloMetaDiaria } from "./ciclos/CicloDuracaoMetaDiaria";
import { CicloCardCompact } from "./ciclos/CicloCardCompact";

interface Ciclo {
  id: string;
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  lucro_bruto: number;
  lucro_liquido: number;
  observacoes: string | null;
  tipo_gatilho: string;
  meta_volume: number | null;
  metrica_acumuladora: string;
  valor_acumulado: number;
  excedente_anterior: number;
  excedente_proximo: number;
  operador_projeto_id: string | null;
  gatilho_fechamento: string | null;
  auto_criado: boolean | null;
}

interface ProjetoCiclosTabProps {
  projetoId: string;
  formatCurrency?: (value: number) => string;
}

// Fallback para formatação de moeda
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

interface PerdaCiclo {
  id: string;
  valor: number;
  categoria: string;
  status: string;
  bookmaker_id: string | null;
  bookmaker_nome?: string;
  descricao: string | null;
  data_registro: string;
}

interface PerdasCiclo {
  confirmadas: PerdaCiclo[];
  pendentes: PerdaCiclo[];
  revertidas: PerdaCiclo[];
  totalConfirmadas: number;
  totalPendentes: number;
  totalRevertidas: number;
}

interface CicloMetrics {
  qtdApostas: number;
  volume: number;
  ticketMedio: number;
  lucroBruto: number;  // Lucro das apostas antes das perdas
  lucroReal: number;   // Lucro líquido = lucroBruto - perdasConfirmadas
  roi: number;
  perdas: PerdasCiclo;
}

export function ProjetoCiclosTab({ projetoId, formatCurrency: formatCurrencyProp }: ProjetoCiclosTabProps) {
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCiclo, setSelectedCiclo] = useState<Ciclo | null>(null);
  const [cicloMetrics, setCicloMetrics] = useState<Record<string, CicloMetrics>>({});
  const [fecharConfirmOpen, setFecharConfirmOpen] = useState(false);
  const [cicloParaFechar, setCicloParaFechar] = useState<Ciclo | null>(null);
  const [projetoNome, setProjetoNome] = useState("");
  const [encerrandoPorMeta, setEncerrandoPorMeta] = useState<string | null>(null);
  const { encerrarPorMeta } = useCicloActions();
  
  // Filtros simplificados - default é ATIVO
  const [statusFilter, setStatusFilter] = useState<CicloStatusFilter>("ATIVO");
  const [tipoFilter, setTipoFilter] = useState<CicloTipoFilter>("TODOS");
  
  // Controle de exibição expandida
  const [showAllCycles, setShowAllCycles] = useState(false);
  
  // Encontrar ciclo ativo atual
  const cicloAtivo = useMemo(() => {
    return ciclos.find(c => {
      const realStatus = getCicloRealStatus(c);
      return realStatus === "EM_ANDAMENTO";
    });
  }, [ciclos]);
  
  // Ciclos ordenados e filtrados
  const ciclosFiltrados = useMemo(() => {
    // Primeiro ordenar
    let resultado = sortCiclosOperacional(ciclos);
    
    // Filtrar por status
    resultado = resultado.filter(ciclo => {
      const realStatus = getCicloRealStatus(ciclo);
      if (statusFilter === "FUTURO") return realStatus === "FUTURO";
      if (statusFilter === "ATIVO") return realStatus === "EM_ANDAMENTO";
      if (statusFilter === "CONCLUIDO") return realStatus === "FECHADO";
      return true;
    });
    
    // Filtrar por tipo
    if (tipoFilter !== "TODOS") {
      resultado = resultado.filter(ciclo => {
        if (tipoFilter === "META_PRAZO") return isMetaPrazo(ciclo);
        if (tipoFilter === "META") return (ciclo.tipo_gatilho === "META" || ciclo.tipo_gatilho === "VOLUME") && !isMetaPrazo(ciclo);
        if (tipoFilter === "PRAZO") return ciclo.tipo_gatilho === "TEMPO";
        return true;
      });
    }
    
    return resultado;
  }, [ciclos, statusFilter, tipoFilter]);
  
  // Ciclos a exibir (com controle de expansão)
  const ciclosParaExibir = useMemo(() => {
    // Se filtro não é ATIVO, mostrar todos do filtro
    if (statusFilter !== "ATIVO") {
      return ciclosFiltrados;
    }
    
    // Se está expandido, mostrar todos
    if (showAllCycles) {
      return ciclosFiltrados;
    }
    
    // Por padrão, mostrar apenas 1 ciclo ativo
    return ciclosFiltrados.slice(0, 1);
  }, [ciclosFiltrados, showAllCycles, statusFilter]);
  
  const hasMoreCycles = statusFilter === "ATIVO" && ciclosFiltrados.length > 1;

  useEffect(() => {
    fetchCiclos();
    fetchProjetoNome();
  }, [projetoId]);

  const fetchProjetoNome = async () => {
    const { data } = await supabase
      .from("projetos")
      .select("nome")
      .eq("id", projetoId)
      .single();
    if (data) setProjetoNome(data.nome);
  };

  const fetchCiclos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("projeto_ciclos")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("numero_ciclo", { ascending: false });

      if (error) throw error;
      setCiclos(data || []);
      
      // Fetch real-time metrics for active cycles
      if (data) {
        const activeCycles = data.filter(c => c.status === "EM_ANDAMENTO");
        if (activeCycles.length > 0) {
          fetchMetricsForActiveCycles(activeCycles);
        }
      }
    } catch (error: any) {
      toast.error("Erro ao carregar ciclos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetricsForActiveCycles = async (activeCycles: Ciclo[]) => {
    const metricsMap: Record<string, CicloMetrics> = {};
    
    for (const ciclo of activeCycles) {
      const dataFim = ciclo.data_fim_real || ciclo.data_fim_prevista;
      
      // CRÍTICO: Converter datas do ciclo para UTC usando timezone operacional (America/Sao_Paulo)
      const dataInicioCiclo = parseISO(ciclo.data_inicio);
      const dataFimCiclo = parseISO(dataFim);
      const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicioCiclo, dataFimCiclo);
      
      const [apostasResult, perdasResult, bookmakersResult, cashbackResult, girosResult] = await Promise.all([
        supabase
          .from("apostas_unificada")
          .select("lucro_prejuizo, stake, stake_total, status, forma_registro")
          .eq("projeto_id", projetoId)
          .gte("data_aposta", startUTC)
          .lte("data_aposta", endUTC),
        supabase
          .from("projeto_perdas")
          .select("id, valor, categoria, status, bookmaker_id, descricao, data_registro")
          .eq("projeto_id", projetoId)
          .gte("data_registro", startUTC)
          .lte("data_registro", endUTC),
        supabase
          .from("bookmakers")
          .select("id, nome"),
        // Buscar cashback do período do ciclo (usa date-only)
        supabase
          .from("cashback_manual")
          .select("valor")
          .eq("projeto_id", projetoId)
          .gte("data_credito", ciclo.data_inicio)
          .lte("data_credito", dataFim),
        // Buscar giros grátis do período do ciclo
        supabase
          .from("giros_gratis")
          .select("valor_retorno")
          .eq("projeto_id", projetoId)
          .eq("status", "confirmado")
          .gte("data_registro", startUTC)
          .lte("data_registro", endUTC)
      ]);

      const apostas = apostasResult.data || [];
      const perdasData = perdasResult.data || [];
      const bookmakers = bookmakersResult.data || [];
      const cashbacks = cashbackResult.data || [];
      const giros = girosResult.data || [];

      // Map bookmaker IDs to names
      const bookmakerMap = new Map(bookmakers.map(b => [b.id, b.nome]));

      // Categorize losses
      const perdas: PerdasCiclo = {
        confirmadas: [],
        pendentes: [],
        revertidas: [],
        totalConfirmadas: 0,
        totalPendentes: 0,
        totalRevertidas: 0
      };

      perdasData.forEach(perda => {
        const perdaComNome: PerdaCiclo = {
          ...perda,
          bookmaker_nome: perda.bookmaker_id ? bookmakerMap.get(perda.bookmaker_id) : undefined
        };
        
        if (perda.status === "CONFIRMADA") {
          perdas.confirmadas.push(perdaComNome);
          perdas.totalConfirmadas += perda.valor;
        } else if (perda.status === "PENDENTE") {
          perdas.pendentes.push(perdaComNome);
          perdas.totalPendentes += perda.valor;
        } else if (perda.status === "REVERTIDA") {
          perdas.revertidas.push(perdaComNome);
          perdas.totalRevertidas += perda.valor;
        }
      });

      // Count all entries (including pending)
      const qtdApostas = apostas.length;
      
      // Calculate volume from all entries
      const volume = apostas.reduce((acc, a) => {
        if (a.forma_registro === 'ARBITRAGEM') {
          return acc + (a.stake_total || 0);
        }
        return acc + (a.stake || 0);
      }, 0);
      
      // Calculate profit only from finalized entries (lucro bruto das apostas)
      const lucroApostas = apostas
        .filter(a => a.status === "LIQUIDADA")
        .reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
      
      // NOVO: Calcular lucro de cashback (sempre >= 0)
      const lucroCashback = cashbacks.reduce((acc, cb) => acc + Math.max(0, cb.valor || 0), 0);
      
      // NOVO: Calcular lucro de giros grátis (sempre >= 0)
      const lucroGiros = giros.reduce((acc, g) => acc + Math.max(0, (g as any).valor_retorno || 0), 0);
      
      // LUCRO BRUTO DO CICLO = apostas + cashback + giros
      const lucroBruto = lucroApostas + lucroCashback + lucroGiros;

      // Lucro real = lucro bruto - perdas confirmadas
      const lucroReal = lucroBruto - perdas.totalConfirmadas;

      const ticketMedio = qtdApostas > 0 ? volume / qtdApostas : 0;
      const roi = volume > 0 ? (lucroReal / volume) * 100 : 0;

      metricsMap[ciclo.id] = { qtdApostas, volume, ticketMedio, lucroBruto, lucroReal, roi, perdas };
    }
    
    setCicloMetrics(metricsMap);
  };

  const handleCreateCiclo = () => {
    setSelectedCiclo(null);
    setDialogOpen(true);
  };

  const handleEditCiclo = (ciclo: Ciclo) => {
    setSelectedCiclo(ciclo);
    setDialogOpen(true);
  };

  // Abre o dialog de confirmação forte para fechar ciclo
  const handleFecharCiclo = (ciclo: Ciclo) => {
    setCicloParaFechar(ciclo);
    setFecharConfirmOpen(true);
  };

  // Encerra ciclo automaticamente por meta atingida
  const handleEncerrarPorMeta = async (ciclo: Ciclo, valorAtual: number) => {
    if (!ciclo.meta_volume) return;
    
    setEncerrandoPorMeta(ciclo.id);
    try {
      const result = await encerrarPorMeta(ciclo.id, valorAtual, ciclo.meta_volume);
      if (result.success) {
        fetchCiclos(); // Refresh
      }
    } finally {
      setEncerrandoPorMeta(null);
    }
  };


  const getStatusBadge = (status: string, gatilhoFechamento?: string | null, ciclo?: Ciclo) => {
    // Verificar se é um ciclo futuro (data_inicio > hoje)
    if (ciclo && status === "EM_ANDAMENTO") {
      const realStatus = getCicloRealStatus(ciclo);
      if (realStatus === "FUTURO") {
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Futuro
          </Badge>
        );
      }
    }
    
    switch (status) {
      case "EM_ANDAMENTO":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Play className="h-3 w-3 mr-1" />Em Andamento</Badge>;
      case "FECHADO":
        const motivoLabel = gatilhoFechamento === "META" ? "por Meta" : gatilhoFechamento === "PRAZO" ? "por Prazo" : "";
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Fechado {motivoLabel}
          </Badge>
        );
      case "CANCELADO":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTipoGatilhoBadge = (tipo: string, temDataLimite?: boolean) => {
    switch (tipo) {
      case "TEMPO":
        return <Badge variant="outline" className="text-blue-400 border-blue-500/30"><Clock className="h-3 w-3 mr-1" />Tempo</Badge>;
      case "META":
        return (
          <Badge variant="outline" className="text-purple-400 border-purple-500/30">
            <Target className="h-3 w-3 mr-1" />
            Meta{temDataLimite ? " + Prazo" : ""}
          </Badge>
        );
      // Fallback para dados legados
      case "VOLUME":
        return <Badge variant="outline" className="text-purple-400 border-purple-500/30"><Target className="h-3 w-3 mr-1" />Meta</Badge>;
      case "HIBRIDO":
        return <Badge variant="outline" className="text-amber-400 border-amber-500/30"><Zap className="h-3 w-3 mr-1" />Meta + Prazo</Badge>;
      default:
        return null;
    }
  };

// formatCurrency agora vem como prop

  const getDiasRestantes = (dataFim: string) => {
    const fim = parseLocalDate(dataFim);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return differenceInDays(fim, hoje);
  };

  const getProgressoVolume = (ciclo: Ciclo, realTimeMetrics?: CicloMetrics) => {
    if (!ciclo.meta_volume || ciclo.meta_volume === 0) return { progresso: 0, valorAtual: 0 };
    
    // Para ciclos em andamento, usar métricas em tempo real
    if (ciclo.status === "EM_ANDAMENTO" && realTimeMetrics) {
      const valorAtual = ciclo.metrica_acumuladora === "LUCRO" 
        ? realTimeMetrics.lucroReal 
        : realTimeMetrics.volume;
      return {
        progresso: Math.min(100, (valorAtual / ciclo.meta_volume) * 100),
        valorAtual
      };
    }
    
    // Para ciclos fechados, usar valor_acumulado
    return {
      progresso: Math.min(100, (ciclo.valor_acumulado / ciclo.meta_volume) * 100),
      valorAtual: ciclo.valor_acumulado
    };
  };

  const getCategoriaLabel = (categoria: string) => {
    const labels: Record<string, string> = {
      "SALDO_BLOQUEADO": "Saldo Bloqueado",
      "CONTA_LIMITADA": "Conta Limitada", 
      "BONUS_TRAVADO": "Bônus Travado",
      "BONUS_EXPIRADO": "Bônus Expirado",
      "CONTA_FECHADA": "Conta Fechada",
      "FRAUDE_DETECTADA": "Fraude Detectada",
      "VERIFICACAO_FALHOU": "Verificação Falhou",
      "OUTRO": "Outro"
    };
    return labels[categoria] || categoria;
  };

  const getCategoriaIcon = (categoria: string) => {
    switch (categoria) {
      case "SALDO_BLOQUEADO":
      case "BONUS_TRAVADO":
        return <Lock className="h-3 w-3" />;
      case "CONTA_LIMITADA":
      case "CONTA_FECHADA":
        return <Ban className="h-3 w-3" />;
      default:
        return <ShieldAlert className="h-3 w-3" />;
    }
  };

  const getMetricaLabel = (metrica: string) => {
    return metrica === "LUCRO" ? "Lucro Realizado" : "Volume Apostado";
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Tabs defaultValue="ciclos" className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="ciclos" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Ciclos
          </TabsTrigger>
          <TabsTrigger value="comparativo" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Comparativo
          </TabsTrigger>
        </TabsList>
        <Button onClick={handleCreateCiclo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Ciclo
        </Button>
      </div>

      <TabsContent value="ciclos" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Ciclos de Apuração</h3>
            <p className="text-sm text-muted-foreground">
              Períodos de apuração financeira (por tempo ou volume)
            </p>
          </div>
        </div>

        {/* Filtros simplificados */}
        {ciclos.length > 0 && (
          <CicloFiltersSimplified
            activeStatus={statusFilter}
            activeTipo={tipoFilter}
            onStatusChange={(status) => {
              setStatusFilter(status);
              setShowAllCycles(false); // Reset ao trocar filtro
            }}
            onTipoChange={setTipoFilter}
          />
        )}

      {ciclos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium mb-2">Nenhum ciclo criado</h4>
            <p className="text-muted-foreground text-center mb-4">
              Crie o primeiro ciclo para iniciar a apuração financeira
            </p>
            <Button onClick={handleCreateCiclo}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Ciclo
            </Button>
          </CardContent>
        </Card>
      ) : ciclosFiltrados.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium mb-2">Nenhum ciclo encontrado</h4>
            <p className="text-muted-foreground text-center mb-4">
              Nenhum ciclo corresponde aos filtros selecionados
            </p>
            <Button 
              variant="outline" 
              onClick={() => {
                setStatusFilter("ATIVO");
                setTipoFilter("TODOS");
              }}
            >
              Ver ciclos ativos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Layout híbrido: Ativos full-width, Concluídos/Futuros em 2 colunas */}
          {statusFilter === "ATIVO" ? (
            // Ciclos Ativos - Full width
            <div className="grid gap-4">
              {ciclosParaExibir.map((ciclo) => {
                const diasRestantes = getDiasRestantes(ciclo.data_fim_prevista);
                const isAtrasado = ciclo.status === "EM_ANDAMENTO" && diasRestantes < 0;
                const realTimeMetrics = cicloMetrics[ciclo.id];
                const { progresso: progressoVolume, valorAtual } = getProgressoVolume(ciclo, realTimeMetrics);
                const isMetaProxima = ciclo.tipo_gatilho === "META" && progressoVolume >= 90;
                const isMetaAtingida = progressoVolume >= 100;
                const temDataLimite = ciclo.data_fim_prevista && ciclo.data_fim_prevista !== ciclo.data_inicio;

                return (
              <Card key={ciclo.id} className={isAtrasado || isMetaProxima ? "border-amber-500/50" : isMetaAtingida ? "border-emerald-500/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                        {ciclo.numero_ciclo}
                      </div>
                      <div>
                      <div className="flex items-center gap-2">
                          <CardTitle className="text-base">Ciclo {ciclo.numero_ciclo}</CardTitle>
                          {getTipoGatilhoBadge(ciclo.tipo_gatilho, temDataLimite)}
                          {ciclo.auto_criado && (
                            <Badge variant="outline" className="text-xs text-muted-foreground border-muted">
                              Auto
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseLocalDate(ciclo.data_inicio), "dd/MM/yyyy", { locale: ptBR })} - {format(parseLocalDate(ciclo.data_fim_prevista), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                          <CicloDuracao ciclo={ciclo} formatCurrency={formatCurrency} />
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(ciclo.status, ciclo.gatilho_fechamento, ciclo)}
                      {ciclo.status === "EM_ANDAMENTO" && ciclo.tipo_gatilho === "TEMPO" && (
                        <Badge variant="outline" className={isAtrasado ? "text-amber-400 border-amber-500/50" : ""}>
                          <Clock className="h-3 w-3 mr-1" />
                          {isAtrasado ? `${Math.abs(diasRestantes)} dias atrasado` : `${diasRestantes} dias restantes`}
                        </Badge>
                      )}
                      {/* Meta diária para ciclos Meta + Prazo em andamento */}
                      {ciclo.status === "EM_ANDAMENTO" && ciclo.tipo_gatilho === "META" && ciclo.meta_volume && temDataLimite && (
                        <CicloMetaDiaria 
                          ciclo={ciclo} 
                          valorAtual={valorAtual} 
                          formatCurrency={formatCurrency} 
                        />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Barra de progresso para ciclos por meta */}
                  {ciclo.tipo_gatilho === "META" && ciclo.meta_volume && ciclo.status === "EM_ANDAMENTO" && (
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {getMetricaLabel(ciclo.metrica_acumuladora)}: {formatCurrency(valorAtual)} de {formatCurrency(ciclo.meta_volume)}
                        </span>
                        <span className={`font-medium ${
                          isMetaAtingida ? "text-emerald-400" : 
                          isMetaProxima ? "text-amber-400" : 
                          "text-muted-foreground"
                        }`}>
                          {progressoVolume.toFixed(1)}%
                        </span>
                      </div>
                      <Progress 
                        value={progressoVolume} 
                        className={isMetaAtingida ? "bg-emerald-500/20" : isMetaProxima ? "bg-amber-500/20" : ""} 
                      />
                      {isMetaAtingida && (
                        <div className="flex items-center justify-between text-emerald-400 text-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Meta atingida! Ciclo pronto para fechamento.</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => handleEncerrarPorMeta(ciclo, valorAtual)}
                            disabled={encerrandoPorMeta === ciclo.id}
                          >
                            {encerrandoPorMeta === ciclo.id ? (
                              "Encerrando..."
                            ) : (
                              <>
                                <Target className="h-4 w-4 mr-1" />
                                Encerrar por Meta
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      {isMetaProxima && !isMetaAtingida && (
                        <div className="flex items-center gap-2 text-amber-400 text-sm">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Meta próxima de ser atingida!</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      {/* Para ciclos EM_ANDAMENTO com métricas em tempo real */}
                      {ciclo.status === "EM_ANDAMENTO" && realTimeMetrics ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">Lucro Real</p>
                            {realTimeMetrics.perdas.totalConfirmadas > 0 && (
                              <Badge variant="outline" className="text-xs text-red-400 border-red-500/30">
                                <ShieldAlert className="h-3 w-3 mr-1" />
                                -{formatCurrency(realTimeMetrics.perdas.totalConfirmadas)}
                              </Badge>
                            )}
                          </div>
                          <p className={`text-lg font-semibold ${realTimeMetrics.lucroReal >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {realTimeMetrics.lucroReal >= 0 ? <TrendingUp className="h-4 w-4 inline mr-1" /> : <TrendingDown className="h-4 w-4 inline mr-1" />}
                            {formatCurrency(realTimeMetrics.lucroReal)}
                          </p>
                          {realTimeMetrics.perdas.totalConfirmadas > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Bruto: {formatCurrency(realTimeMetrics.lucroBruto)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-muted-foreground">Lucro Líquido</p>
                          <p className={`text-lg font-semibold ${ciclo.lucro_liquido >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {ciclo.lucro_liquido >= 0 ? <TrendingUp className="h-4 w-4 inline mr-1" /> : <TrendingDown className="h-4 w-4 inline mr-1" />}
                            {formatCurrency(ciclo.lucro_liquido)}
                          </p>
                          {ciclo.lucro_bruto !== ciclo.lucro_liquido && (
                            <p className="text-xs text-muted-foreground">
                              Bruto: {formatCurrency(ciclo.lucro_bruto)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {ciclo.status === "EM_ANDAMENTO" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleEditCiclo(ciclo)}>
                            Editar
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleFecharCiclo(ciclo)}
                            className="gap-1"
                          >
                            <Lock className="h-4 w-4" />
                            Fechar Ciclo
                          </Button>
                        </>
                      )}
                      {ciclo.status === "FECHADO" && (
                        <Button variant="ghost" size="sm" onClick={() => handleEditCiclo(ciclo)}>
                          Ver Detalhes
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Seção de Perdas do Ciclo (apenas para ciclos EM_ANDAMENTO com métricas) */}
                  {ciclo.status === "EM_ANDAMENTO" && realTimeMetrics && (realTimeMetrics.perdas.confirmadas.length > 0 || realTimeMetrics.perdas.pendentes.length > 0 || realTimeMetrics.perdas.revertidas.length > 0) && (
                    <Collapsible className="mt-3 pt-3 border-t">
                      <CollapsibleTrigger className="flex items-center justify-between w-full text-sm">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-amber-400" />
                          <span className="font-medium">Perdas Operacionais do Ciclo</span>
                          <div className="flex gap-1">
                            {realTimeMetrics.perdas.totalConfirmadas > 0 && (
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">
                                {realTimeMetrics.perdas.confirmadas.length} confirmada{realTimeMetrics.perdas.confirmadas.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {realTimeMetrics.perdas.totalPendentes > 0 && (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
                                {realTimeMetrics.perdas.pendentes.length} pendente{realTimeMetrics.perdas.pendentes.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {realTimeMetrics.perdas.totalRevertidas > 0 && (
                              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                {realTimeMetrics.perdas.revertidas.length} revertida{realTimeMetrics.perdas.revertidas.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronDown className="h-4 w-4" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-3">
                        {/* Perdas Confirmadas */}
                        {realTimeMetrics.perdas.confirmadas.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-red-400 font-medium flex items-center gap-1">
                                <XCircle className="h-3 w-3" />
                                Confirmadas (impactam lucro)
                              </span>
                              <span className="text-red-400 font-semibold">-{formatCurrency(realTimeMetrics.perdas.totalConfirmadas)}</span>
                            </div>
                            <div className="grid gap-2">
                              {realTimeMetrics.perdas.confirmadas.map(perda => (
                                <div key={perda.id} className="bg-red-500/5 border border-red-500/20 rounded-md px-3 py-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {getCategoriaIcon(perda.categoria)}
                                      <span className="font-medium">{getCategoriaLabel(perda.categoria)}</span>
                                      {perda.bookmaker_nome && (
                                        <Badge variant="outline" className="text-xs">{perda.bookmaker_nome}</Badge>
                                      )}
                                    </div>
                                    <span className="text-red-400 font-semibold">-{formatCurrency(perda.valor)}</span>
                                  </div>
                                  {perda.descricao && (
                                    <p className="text-xs text-muted-foreground mt-1">{perda.descricao}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Perdas Pendentes */}
                        {realTimeMetrics.perdas.pendentes.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-amber-400 font-medium flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Pendentes (capital em risco)
                              </span>
                              <span className="text-amber-400 font-semibold">{formatCurrency(realTimeMetrics.perdas.totalPendentes)}</span>
                            </div>
                            <div className="grid gap-2">
                              {realTimeMetrics.perdas.pendentes.map(perda => (
                                <div key={perda.id} className="bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {getCategoriaIcon(perda.categoria)}
                                      <span className="font-medium">{getCategoriaLabel(perda.categoria)}</span>
                                      {perda.bookmaker_nome && (
                                        <Badge variant="outline" className="text-xs">{perda.bookmaker_nome}</Badge>
                                      )}
                                    </div>
                                    <span className="text-amber-400 font-semibold">{formatCurrency(perda.valor)}</span>
                                  </div>
                                  {perda.descricao && (
                                    <p className="text-xs text-muted-foreground mt-1">{perda.descricao}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Perdas Revertidas */}
                        {realTimeMetrics.perdas.revertidas.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Revertidas (recuperadas)
                              </span>
                              <span className="text-emerald-400 font-semibold">+{formatCurrency(realTimeMetrics.perdas.totalRevertidas)}</span>
                            </div>
                            <div className="grid gap-2">
                              {realTimeMetrics.perdas.revertidas.map(perda => (
                                <div key={perda.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-md px-3 py-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {getCategoriaIcon(perda.categoria)}
                                      <span className="font-medium">{getCategoriaLabel(perda.categoria)}</span>
                                      {perda.bookmaker_nome && (
                                        <Badge variant="outline" className="text-xs">{perda.bookmaker_nome}</Badge>
                                      )}
                                    </div>
                                    <span className="text-emerald-400 font-semibold">+{formatCurrency(perda.valor)}</span>
                                  </div>
                                  {perda.descricao && (
                                    <p className="text-xs text-muted-foreground mt-1">{perda.descricao}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Sem perdas no ciclo - indicação visual */}
                  {ciclo.status === "EM_ANDAMENTO" && realTimeMetrics && realTimeMetrics.perdas.confirmadas.length === 0 && realTimeMetrics.perdas.pendentes.length === 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Nenhuma perda operacional registrada neste ciclo</span>
                      </div>
                    </div>
                  )}

                  {/* Info de excedente */}
                  {ciclo.excedente_proximo > 0 && ciclo.status === "FECHADO" && (
                    <div className="mt-2 pt-2 border-t flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="h-4 w-4" />
                      <span>Excedente de {formatCurrency(ciclo.excedente_proximo)} transferido para próximo ciclo</span>
                    </div>
                  )}

                  {/* Real-time metrics for EM_ANDAMENTO cycles */}
                  {ciclo.status === "EM_ANDAMENTO" && realTimeMetrics && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Target className="h-3 w-3" /> Métricas em Tempo Real
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <div className="bg-muted/50 px-3 py-1.5 rounded-md">
                          <span className="text-muted-foreground">Apostas: </span>
                          <span className="font-medium">{realTimeMetrics.qtdApostas}</span>
                        </div>
                        <div className="bg-muted/50 px-3 py-1.5 rounded-md">
                          <span className="text-muted-foreground">Volume: </span>
                          <span className="font-medium">{formatCurrency(realTimeMetrics.volume)}</span>
                        </div>
                        <div className="bg-primary/10 px-3 py-1.5 rounded-md border border-primary/20">
                          <span className="text-muted-foreground">Ticket Médio: </span>
                          <span className="font-medium text-primary">{formatCurrency(realTimeMetrics.ticketMedio)}</span>
                        </div>
                        <div className={`px-3 py-1.5 rounded-md ${realTimeMetrics.roi >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                          <span className="text-muted-foreground">ROI: </span>
                          <span className={`font-medium ${realTimeMetrics.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {realTimeMetrics.roi.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Parse and display metrics from observacoes for FECHADO cycles */}
                  {ciclo.status === "FECHADO" && ciclo.observacoes && ciclo.observacoes.includes("📊 Métricas:") && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Target className="h-3 w-3" /> Métricas do Ciclo
                      </p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {(() => {
                          const metricsMatch = ciclo.observacoes.match(/📊 Métricas: (.+)/);
                          if (!metricsMatch) return null;
                          const metricsStr = metricsMatch[1];
                          const parts = metricsStr.split(" | ");
                          return parts.map((part, idx) => {
                            const [label, value] = part.includes(":") 
                              ? [part.split(":")[0].trim(), part.split(":").slice(1).join(":").trim()]
                              : [part.split(" ")[0], part.split(" ").slice(1).join(" ")];
                            return (
                              <div key={idx} className="bg-muted/50 px-3 py-1.5 rounded-md">
                                <span className="text-muted-foreground">{label}: </span>
                                <span className="font-medium">{value || label}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                  
                  {/* Show other observacoes (not metrics) */}
                  {ciclo.observacoes && !ciclo.observacoes.startsWith("📊") && (
                    <p className="text-sm text-muted-foreground mt-2 pt-2 border-t">
                      {ciclo.observacoes.split("\n\n📊")[0]}
                    </p>
                  )}
                </CardContent>
              </Card>
                );
              })}
            </div>
          ) : (
            // Ciclos Concluídos ou Futuros - Grid 2 colunas (cards compactos)
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ciclosParaExibir.map((ciclo) => (
                <CicloCardCompact
                  key={ciclo.id}
                  ciclo={ciclo}
                  formatCurrency={formatCurrency}
                  onEdit={() => handleEditCiclo(ciclo)}
                  parseLocalDate={parseLocalDate}
                />
              ))}
            </div>
          )}
          
          {/* Botão Ver mais/menos ciclos */}
          {hasMoreCycles && statusFilter === "ATIVO" && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAllCycles(!showAllCycles)}
              >
                {showAllCycles ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Ver menos ciclos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Ver mais {ciclosFiltrados.length - 1} ciclo{ciclosFiltrados.length > 2 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <CicloDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        ciclo={selectedCiclo}
        proximoNumero={ciclos.length > 0 ? Math.max(...ciclos.map(c => c.numero_ciclo)) + 1 : 1}
        onSuccess={fetchCiclos}
      />

      {cicloParaFechar && (
        <FecharCicloConfirmDialog
          open={fecharConfirmOpen}
          onOpenChange={setFecharConfirmOpen}
          ciclo={cicloParaFechar}
          projetoNome={projetoNome}
          metrics={cicloMetrics[cicloParaFechar.id] || null}
          onSuccess={fetchCiclos}
        />
      )}
      </TabsContent>

      <TabsContent value="comparativo">
        <ComparativoCiclosTab projetoId={projetoId} formatCurrency={formatCurrency} />
      </TabsContent>
    </Tabs>
  );
}