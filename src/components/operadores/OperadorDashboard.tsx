import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  Target, 
  DollarSign,
  Users,
  Percent,
  BarChart3,
  Activity,
  AlertTriangle,
  Flame,
  Gem,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  Award,
  Calendar
} from "lucide-react";
import { format, subDays, startOfMonth, startOfYear, parseISO, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";

interface OperadorComparativo {
  operador_id: string;
  nome: string;
  cpf: string;
  status: string;
  tipo_contrato: string;
  projetos_ativos: number;
  lucro_total_gerado: number;
  total_apostas: number;
  apostas_ganhas: number;
  volume_total: number;
  total_pago: number;
  total_pendente: number;
}

interface ProjetoOperador {
  operador_projeto_id: string;
  operador_id: string;
  projeto_id: string;
  operador_nome: string;
  projeto_nome: string;
  modelo_pagamento: string;
  valor_fixo: number;
  percentual: number;
  base_calculo: string;
  frequencia_entrega: string;
  meta_valor: number | null;
  meta_percentual: number | null;
  tipo_meta: string | null;
  faixas_escalonadas: any;
  status: string;
  lucro_projeto: number;
  faturamento_projeto: number;
  total_apostas: number;
  apostas_ganhas: number;
  total_depositado: number;
  total_sacado: number;
}

interface Projeto {
  id: string;
  nome: string;
}

interface Entrega {
  id: string;
  numero_entrega: number;
  status: string;
  meta_valor: number | null;
  resultado_nominal: number;
  data_inicio: string;
  data_fim_prevista: string | null;
  operador_projeto_id: string;
}

const MODELOS_PAGAMENTO_LABELS: Record<string, string> = {
  FIXO_MENSAL: "Fixo Mensal",
  PORCENTAGEM: "Porcentagem",
  HIBRIDO: "Híbrido",
  POR_ENTREGA: "Por Entrega",
  COMISSAO_ESCALONADA: "Comissão Escalonada",
  PROPORCIONAL_LUCRO: "Proporcional ao Lucro",
};

const PERIODOS = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "mes", label: "Este mês" },
  { value: "ano", label: "Este ano" },
  { value: "todos", label: "Todo período" },
];

export function OperadorDashboard() {
  const { workspace } = useWorkspace();
  const [operadores, setOperadores] = useState<OperadorComparativo[]>([]);
  const [projetosOperadores, setProjetosOperadores] = useState<ProjetoOperador[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("30d");
  const [modeloFilter, setModeloFilter] = useState("todos");
  const [projetoFilter, setProjetoFilter] = useState("todos");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (workspace?.id) {
      fetchData();
    }
  }, [periodo, workspace?.id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch operadores comparativos com filtro por workspace
      const { data: opData, error: opError } = await supabase
        .from("v_operador_comparativo" as any)
        .select("*")
        .eq("workspace_id", workspace?.id);

      if (opError) throw opError;
      setOperadores((opData || []) as any);

      // Fetch projetos com detalhes de lucro
      const { data: projData, error: projError } = await supabase
        .from("v_projeto_lucro_operador" as any)
        .select("*");

      if (projError) throw projError;
      setProjetosOperadores((projData || []) as any);

      // Fetch projetos para filtro
      const { data: projListData, error: projListError } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("workspace_id", workspace?.id)
        .in("status", ["PLANEJADO", "EM_ANDAMENTO"])
        .order("nome");

      if (!projListError) {
        setProjetos(projListData || []);
      }

      // Fetch entregas ativas
      const { data: entregasData, error: entregasError } = await supabase
        .from("entregas")
        .select("*")
        .eq("status", "EM_ANDAMENTO");

      if (!entregasError) {
        setEntregas(entregasData || []);
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Calcular métricas derivadas
  const operadoresEnriquecidos = useMemo(() => {
    return operadores.map((op) => {
      const winRate = op.total_apostas > 0 
        ? (op.apostas_ganhas / op.total_apostas) * 100 
        : 0;
      const roi = op.volume_total > 0 
        ? (op.lucro_total_gerado / op.volume_total) * 100 
        : 0;
      const mediaPorAposta = op.total_apostas > 0 
        ? op.lucro_total_gerado / op.total_apostas 
        : 0;

      // Buscar projetos deste operador
      const projetosOp = projetosOperadores.filter(p => p.operador_id === op.operador_id);
      
      // Buscar entregas ativas deste operador
      const entregasOp = entregas.filter(e => 
        projetosOp.some(p => p.operador_projeto_id === e.operador_projeto_id)
      );

      // Calcular pagamento estimado baseado no modelo
      let pagamentoEstimado = 0;
      projetosOp.forEach((proj) => {
        const lucro = proj.lucro_projeto;
        switch (proj.modelo_pagamento) {
          case "FIXO_MENSAL":
            pagamentoEstimado += proj.valor_fixo;
            break;
          case "PORCENTAGEM":
          case "PROPORCIONAL_LUCRO":
            if (lucro > 0) {
              pagamentoEstimado += lucro * (proj.percentual / 100);
            }
            break;
          case "HIBRIDO":
            pagamentoEstimado += proj.valor_fixo;
            if (lucro > 0) {
              pagamentoEstimado += lucro * (proj.percentual / 100);
            }
            break;
          case "POR_ENTREGA":
            if (proj.meta_valor && lucro >= proj.meta_valor) {
              pagamentoEstimado += lucro * (proj.percentual / 100);
            }
            break;
          case "COMISSAO_ESCALONADA":
            if (proj.faixas_escalonadas && lucro > 0) {
              const faixas = proj.faixas_escalonadas as any[];
              for (const faixa of faixas) {
                if (lucro >= faixa.min && (faixa.max === null || lucro <= faixa.max)) {
                  pagamentoEstimado += lucro * (faixa.percentual / 100);
                  break;
                }
              }
            }
            break;
        }
      });

      // Calcular progresso da entrega atual
      let entregaAtual = null;
      let progressoEntrega = 0;
      if (entregasOp.length > 0) {
        entregaAtual = entregasOp[0];
        if (entregaAtual.meta_valor) {
          progressoEntrega = Math.min((entregaAtual.resultado_nominal / entregaAtual.meta_valor) * 100, 100);
        }
      }

      return {
        ...op,
        winRate,
        roi,
        mediaPorAposta,
        projetos: projetosOp,
        entregas: entregasOp,
        entregaAtual,
        progressoEntrega,
        pagamentoEstimado,
      };
    }).sort((a, b) => b.lucro_total_gerado - a.lucro_total_gerado);
  }, [operadores, projetosOperadores, entregas]);

  // Filtrar por modelo e projeto
  const operadoresFiltrados = useMemo(() => {
    let filtered = operadoresEnriquecidos;
    
    if (modeloFilter !== "todos") {
      filtered = filtered.filter((op) =>
        op.projetos.some((p) => p.modelo_pagamento === modeloFilter)
      );
    }
    
    if (projetoFilter !== "todos") {
      filtered = filtered.filter((op) =>
        op.projetos.some((p) => p.projeto_id === projetoFilter)
      );
    }
    
    return filtered;
  }, [operadoresEnriquecidos, modeloFilter, projetoFilter]);

  // Identificar destaques
  const melhorROI = useMemo(() => {
    return operadoresEnriquecidos.reduce((best, op) => 
      op.roi > (best?.roi || 0) ? op : best, 
      null as typeof operadoresEnriquecidos[0] | null
    );
  }, [operadoresEnriquecidos]);

  const maiorLucro = useMemo(() => {
    return operadoresEnriquecidos[0] || null;
  }, [operadoresEnriquecidos]);

  const piorDrawdown = useMemo(() => {
    return operadoresEnriquecidos.reduce((worst, op) => 
      op.lucro_total_gerado < (worst?.lucro_total_gerado || 0) ? op : worst, 
      null as typeof operadoresEnriquecidos[0] | null
    );
  }, [operadoresEnriquecidos]);

  const melhorWinRate = useMemo(() => {
    return operadoresEnriquecidos
      .filter(op => op.total_apostas >= 10)
      .reduce((best, op) => 
        op.winRate > (best?.winRate || 0) ? op : best, 
        null as typeof operadoresEnriquecidos[0] | null
      );
  }, [operadoresEnriquecidos]);

  // Totais gerais
  const totais = useMemo(() => {
    return {
      lucroTotal: operadoresEnriquecidos.reduce((acc, op) => acc + op.lucro_total_gerado, 0),
      volumeTotal: operadoresEnriquecidos.reduce((acc, op) => acc + op.volume_total, 0),
      apostasTotal: operadoresEnriquecidos.reduce((acc, op) => acc + op.total_apostas, 0),
      operadoresAtivos: operadoresEnriquecidos.filter(op => op.projetos_ativos > 0).length,
      pagamentoEstimadoTotal: operadoresEnriquecidos.reduce((acc, op) => acc + op.pagamentoEstimado, 0),
    };
  }, [operadoresEnriquecidos]);

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getStatusBadge = (op: typeof operadoresEnriquecidos[0]) => {
    if (op.operador_id === melhorROI?.operador_id && op.roi > 0) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Flame className="h-3 w-3 mr-1" /> Em alta</Badge>;
    }
    if (op.lucro_total_gerado < 0) {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Risco</Badge>;
    }
    if (op.progressoEntrega >= 88 && op.progressoEntrega < 100) {
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Gem className="h-3 w-3 mr-1" /> Meta próxima</Badge>;
    }
    if (op.progressoEntrega >= 100) {
      return <Badge className="bg-primary/20 text-primary border-primary/30"><Award className="h-3 w-3 mr-1" /> Meta atingida</Badge>;
    }
    return null;
  };

  // Dados para gráfico comparativo usando ModernBarChart
  const chartData = operadoresFiltrados.slice(0, 10).map((op) => ({
    nome: op.nome.split(" ")[0],
    lucro: op.lucro_total_gerado,
    volume: op.volume_total,
  }));

  // Insights automáticos
  const insights = useMemo(() => {
    const result: { type: "success" | "warning" | "info"; message: string }[] = [];

    // Operadores próximos da meta
    operadoresEnriquecidos.forEach(op => {
      if (op.progressoEntrega >= 85 && op.progressoEntrega < 100 && op.entregaAtual?.meta_valor) {
        const falta = op.entregaAtual.meta_valor - op.entregaAtual.resultado_nominal;
        result.push({
          type: "info",
          message: `${op.nome.split(" ")[0]} está a ${formatCurrency(falta)} de atingir a meta`
        });
      }
    });

    // Operadores com ROI negativo
    const comRoiNegativo = operadoresEnriquecidos.filter(op => op.roi < -5 && op.total_apostas >= 10);
    if (comRoiNegativo.length > 0) {
      result.push({
        type: "warning",
        message: `${comRoiNegativo.length} operador(es) com ROI negativo acima de -5%`
      });
    }

    // Melhor performer
    if (melhorWinRate && melhorWinRate.winRate >= 55) {
      result.push({
        type: "success",
        message: `${melhorWinRate.nome.split(" ")[0]} lidera com ${formatPercent(melhorWinRate.winRate)} de win rate`
      });
    }

    return result.slice(0, 3);
  }, [operadoresEnriquecidos, melhorWinRate]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-[180px]">
            <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={projetoFilter} onValueChange={setProjetoFilter}>
          <SelectTrigger className="w-[200px]">
            <Target className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Projetos</SelectItem>
            {projetos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={modeloFilter} onValueChange={setModeloFilter}>
          <SelectTrigger className="w-[200px]">
            <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Modelo de Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Modelos</SelectItem>
            {Object.entries(MODELOS_PAGAMENTO_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {insights.map((insight, idx) => (
            <Badge 
              key={idx} 
              variant="outline"
              className={`
                py-1.5 px-3
                ${insight.type === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : ""}
                ${insight.type === "warning" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : ""}
                ${insight.type === "info" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : ""}
              `}
            >
              <Zap className="h-3 w-3 mr-1.5" />
              {insight.message}
            </Badge>
          ))}
        </div>
      )}

      {/* KPIs de Destaque */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Maior ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            {melhorROI ? (
              <>
                <p className="text-lg font-bold truncate">{melhorROI.nome}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {formatPercent(melhorROI.roi)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {melhorROI.total_apostas} apostas
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Sem dados</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Maior Lucro
            </CardTitle>
          </CardHeader>
          <CardContent>
            {maiorLucro ? (
              <>
                <p className="text-lg font-bold truncate">{maiorLucro.nome}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {formatCurrency(maiorLucro.lucro_total_gerado)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ROI: {formatPercent(maiorLucro.roi)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Sem dados</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Melhor Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {melhorWinRate ? (
              <>
                <p className="text-lg font-bold truncate">{melhorWinRate.nome}</p>
                <p className="text-2xl font-bold text-blue-500">
                  {formatPercent(melhorWinRate.winRate)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {melhorWinRate.apostas_ganhas}/{melhorWinRate.total_apostas} acertos
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Min. 10 apostas</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Pior Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {piorDrawdown && piorDrawdown.lucro_total_gerado < 0 ? (
              <>
                <p className="text-lg font-bold truncate">{piorDrawdown.nome}</p>
                <p className="text-2xl font-bold text-red-500">
                  {formatCurrency(piorDrawdown.lucro_total_gerado)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ROI: {formatPercent(piorDrawdown.roi)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhum em prejuízo</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumo Geral */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Resumo Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Lucro Total</p>
              <p className={`text-xl font-bold ${totais.lucroTotal >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {formatCurrency(totais.lucroTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Volume Total</p>
              <p className="text-xl font-bold">{formatCurrency(totais.volumeTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Apostas</p>
              <p className="text-xl font-bold">{totais.apostasTotal.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Operadores Ativos</p>
              <p className="text-xl font-bold">{totais.operadoresAtivos}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagamentos Estimados</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(totais.pagamentoEstimadoTotal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico Comparativo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Comparativo de Lucro por Operador
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          <div className="h-[300px] overflow-hidden">
            <ModernBarChart
              data={chartData}
              categoryKey="nome"
              bars={[
                {
                  dataKey: "lucro",
                  label: "Lucro",
                  gradientStart: "#22C55E",
                  gradientEnd: "#16A34A",
                },
              ]}
              height={280}
              showLabels={false}
              showLegend={false}
              formatValue={(value) => formatCurrency(value)}
              customTooltipContent={(payload, label) => (
                <div>
                  <p className="font-medium text-sm mb-2">{label}</p>
                  <div className="space-y-1">
                    <p className="text-emerald-500 font-semibold">
                      Lucro: {formatCurrency(payload[0]?.value || 0)}
                    </p>
                  </div>
                </div>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ranking e Cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Ranking de Lucro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {operadoresFiltrados.map((op, index) => (
                  <div
                    key={op.operador_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm
                        ${index === 0 ? "bg-amber-500/20 text-amber-500" : ""}
                        ${index === 1 ? "bg-gray-400/20 text-gray-400" : ""}
                        ${index === 2 ? "bg-orange-600/20 text-orange-600" : ""}
                        ${index > 2 ? "bg-muted text-muted-foreground" : ""}
                      `}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{op.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {op.projetos_ativos} projeto(s) • {op.total_apostas} apostas
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${op.lucro_total_gerado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {formatCurrency(op.lucro_total_gerado)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ROI: {formatPercent(op.roi)}
                      </p>
                    </div>
                  </div>
                ))}
                {operadoresFiltrados.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum operador encontrado
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Cards Detalhados */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Detalhes por Operador
          </h3>
          <ScrollArea className="h-[450px]">
            <div className="space-y-4 pr-4">
              {operadoresFiltrados.map((op) => (
                <Card key={op.operador_id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{op.nome}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {op.projetos.map(p => p.projeto_nome).join(", ") || "Sem projetos"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {getStatusBadge(op)}
                        <Badge variant="outline">
                          {op.projetos[0]?.modelo_pagamento 
                            ? MODELOS_PAGAMENTO_LABELS[op.projetos[0].modelo_pagamento] 
                            : "N/A"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Lucro Acumulado</p>
                        <p className={`text-lg font-bold ${op.lucro_total_gerado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {formatCurrency(op.lucro_total_gerado)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">ROI</p>
                        <p className="text-lg font-bold">
                          {formatPercent(op.roi)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Win Rate</p>
                        <p className="text-lg font-bold">
                          {formatPercent(op.winRate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pgto. Estimado</p>
                        <p className="text-lg font-bold text-primary">
                          {formatCurrency(op.pagamentoEstimado)}
                        </p>
                      </div>
                    </div>

                    {/* Progresso da Entrega */}
                    {op.entregaAtual && op.entregaAtual.meta_valor && (
                      <div className="space-y-1.5 pt-2 border-t">
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Entrega #{op.entregaAtual.numero_entrega}
                          </span>
                          <span className={op.progressoEntrega >= 100 ? "text-emerald-500 font-medium" : ""}>
                            {formatPercent(op.progressoEntrega)}
                          </span>
                        </div>
                        <Progress 
                          value={op.progressoEntrega} 
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{formatCurrency(op.entregaAtual.resultado_nominal)}</span>
                          <span>Meta: {formatCurrency(op.entregaAtual.meta_valor)}</span>
                        </div>
                      </div>
                    )}

                    {/* Expandable details */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => toggleExpand(op.operador_id)}
                    >
                      {expandedCards.has(op.operador_id) ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Menos detalhes
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Mais detalhes
                        </>
                      )}
                    </Button>

                    {expandedCards.has(op.operador_id) && (
                      <div className="pt-3 border-t space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Total Apostas:</span>
                            <span className="ml-2 font-medium">{op.total_apostas}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Volume:</span>
                            <span className="ml-2 font-medium">{formatCurrency(op.volume_total)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Média/Aposta:</span>
                            <span className="ml-2 font-medium">{formatCurrency(op.mediaPorAposta)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total Pago:</span>
                            <span className="ml-2 font-medium text-emerald-500">{formatCurrency(op.total_pago)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {operadoresFiltrados.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum operador encontrado com os filtros selecionados
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
