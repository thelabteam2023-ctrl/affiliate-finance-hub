import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
  ChevronUp
} from "lucide-react";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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
  const [operadores, setOperadores] = useState<OperadorComparativo[]>([]);
  const [projetosOperadores, setProjetosOperadores] = useState<ProjetoOperador[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("30d");
  const [modeloFilter, setModeloFilter] = useState("todos");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [periodo]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch operadores comparativos
      const { data: opData, error: opError } = await supabase
        .from("v_operador_comparativo")
        .select("*");

      if (opError) throw opError;
      setOperadores(opData || []);

      // Fetch projetos com detalhes de lucro
      const { data: projData, error: projError } = await supabase
        .from("v_projeto_lucro_operador")
        .select("*");

      if (projError) throw projError;
      setProjetosOperadores(projData || []);
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
      const projetos = projetosOperadores.filter(p => p.operador_id === op.operador_id);
      
      // Calcular pagamento estimado baseado no modelo
      let pagamentoEstimado = 0;
      projetos.forEach((proj) => {
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
            // Calcular progresso da meta
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

      return {
        ...op,
        winRate,
        roi,
        mediaPorAposta,
        projetos,
        pagamentoEstimado,
      };
    }).sort((a, b) => b.lucro_total_gerado - a.lucro_total_gerado);
  }, [operadores, projetosOperadores]);

  // Filtrar por modelo
  const operadoresFiltrados = useMemo(() => {
    if (modeloFilter === "todos") return operadoresEnriquecidos;
    return operadoresEnriquecidos.filter((op) =>
      op.projetos.some((p) => p.modelo_pagamento === modeloFilter)
    );
  }, [operadoresEnriquecidos, modeloFilter]);

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
    if (op.operador_id === melhorROI?.operador_id) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Flame className="h-3 w-3 mr-1" /> Em alta</Badge>;
    }
    if (op.lucro_total_gerado < 0) {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Risco</Badge>;
    }
    if (op.projetos.some(p => p.meta_valor && p.lucro_projeto >= p.meta_valor * 0.88)) {
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Gem className="h-3 w-3 mr-1" /> Meta próxima</Badge>;
    }
    return null;
  };

  // Dados para gráfico
  const chartData = operadoresFiltrados.slice(0, 10).map((op) => ({
    nome: op.nome.split(" ")[0],
    lucro: op.lucro_total_gerado,
    roi: op.roi,
  }));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
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

        <Select value={modeloFilter} onValueChange={setModeloFilter}>
          <SelectTrigger className="w-[200px]">
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

      {/* KPIs de Destaque */}
      <div className="grid gap-4 md:grid-cols-3">
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
                <p className="text-xl font-bold">{melhorROI.nome}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {formatPercent(melhorROI.roi)}
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
                <p className="text-xl font-bold">{maiorLucro.nome}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {formatCurrency(maiorLucro.lucro_total_gerado)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Sem dados</p>
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
                <p className="text-xl font-bold">{piorDrawdown.nome}</p>
                <p className="text-2xl font-bold text-red-500">
                  {formatCurrency(piorDrawdown.lucro_total_gerado)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhum em prejuízo</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Comparativo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Comparativo de Lucro por Operador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis dataKey="nome" className="text-xs" />
                <YAxis 
                  tickFormatter={(value) => formatCurrency(value).replace("R$", "")}
                  className="text-xs"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background/95 backdrop-blur border rounded-lg p-3 shadow-lg">
                          <p className="font-medium">{payload[0].payload.nome}</p>
                          <p className="text-emerald-500">
                            Lucro: {formatCurrency(payload[0].value as number)}
                          </p>
                          <p className="text-muted-foreground">
                            ROI: {formatPercent(payload[0].payload.roi)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="lucro" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.lucro >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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

                    {/* Meta progress if applicable */}
                    {op.projetos.some(p => p.modelo_pagamento === "POR_ENTREGA" && p.meta_valor) && (
                      <div className="space-y-1">
                        {op.projetos
                          .filter(p => p.modelo_pagamento === "POR_ENTREGA" && p.meta_valor)
                          .map((proj) => {
                            const progresso = Math.min((proj.lucro_projeto / (proj.meta_valor || 1)) * 100, 100);
                            const falta = Math.max((proj.meta_valor || 0) - proj.lucro_projeto, 0);
                            return (
                              <div key={proj.operador_projeto_id}>
                                <div className="flex justify-between text-xs">
                                  <span>Meta: {formatCurrency(proj.meta_valor || 0)}</span>
                                  <span>{formatPercent(progresso)} concluído</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary transition-all" 
                                    style={{ width: `${progresso}%` }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Faltam {formatCurrency(falta)} para próxima entrega
                                </p>
                              </div>
                            );
                          })}
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
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
