import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend
} from "recharts";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowRightLeft, Wallet, DollarSign, AlertCircle } from "lucide-react";

interface Transacao {
  id: string;
  data_transacao: string;
  tipo_transacao: string;
  tipo_moeda: string;
  moeda: string;
  valor: number;
  valor_usd: number | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
}

interface FluxoFinanceiroOperacionalProps {
  transacoes: Transacao[];
  dataInicio?: Date;
  dataFim?: Date;
  onTransacaoClick?: (transacoes: Transacao[]) => void;
}

type Periodo = "dia" | "semana" | "mes";

const CATEGORIAS_ENTRADAS = [
  { key: "aportes", label: "Aportes de Investidores", color: "hsl(142, 76%, 50%)" },
  { key: "saques_bookmaker", label: "Saques de Bookmakers", color: "hsl(142, 76%, 36%)" },
];

const CATEGORIAS_SAIDAS = [
  { key: "liquidacoes", label: "Liquidações a Investidores", color: "hsl(0, 84%, 60%)" },
  { key: "depositos_bookmaker", label: "Depósitos em Bookmakers", color: "hsl(0, 84%, 45%)" },
  { key: "transferencias", label: "Transferências", color: "hsl(25, 95%, 53%)" },
];

export function FluxoFinanceiroOperacional({
  transacoes,
  dataInicio,
  dataFim,
  onTransacaoClick,
}: FluxoFinanceiroOperacionalProps) {
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filtrar transações pelo período selecionado
  const transacoesFiltradas = useMemo(() => {
    if (!dataInicio && !dataFim) return transacoes;
    
    return transacoes.filter((t) => {
      const dataTransacao = parseISO(t.data_transacao);
      if (dataInicio && dataFim) {
        return isWithinInterval(dataTransacao, { start: dataInicio, end: dataFim });
      }
      if (dataInicio) return dataTransacao >= dataInicio;
      if (dataFim) return dataTransacao <= dataFim;
      return true;
    });
  }, [transacoes, dataInicio, dataFim]);

  // Calcular dados para o gráfico de fluxo líquido por período
  const dadosFluxoLiquido = useMemo(() => {
    if (transacoesFiltradas.length === 0) return [];

    const agrupamentos: Map<string, { entradas: number; saidas: number; transacoes: Transacao[] }> = new Map();

    transacoesFiltradas.forEach((t) => {
      const data = parseISO(t.data_transacao);
      let chave: string;

      switch (periodo) {
        case "dia":
          chave = format(data, "dd/MM");
          break;
        case "semana":
          const inicioSemana = startOfWeek(data, { weekStartsOn: 1 });
          chave = `Sem ${format(inicioSemana, "dd/MM")}`;
          break;
        case "mes":
          chave = format(data, "MMM/yy", { locale: ptBR });
          break;
        default:
          chave = format(data, "dd/MM");
      }

      if (!agrupamentos.has(chave)) {
        agrupamentos.set(chave, { entradas: 0, saidas: 0, transacoes: [] });
      }

      const grupo = agrupamentos.get(chave)!;
      grupo.transacoes.push(t);

      // Classificar como entrada ou saída baseado no fluxo real do caixa operacional
      // ENTRADAS: Aportes de investidores (destino=CAIXA) + Saques de bookmakers
      // SAÍDAS: Liquidações a investidores (origem=CAIXA) + Depósitos em bookmakers + Transferências
      const isEntrada = 
        (t.tipo_transacao === "APORTE_FINANCEIRO" && t.destino_tipo === "CAIXA_OPERACIONAL") ||
        t.tipo_transacao === "SAQUE";

      const isSaida = 
        (t.tipo_transacao === "APORTE_FINANCEIRO" && t.origem_tipo === "CAIXA_OPERACIONAL") ||
        t.tipo_transacao === "DEPOSITO" ||
        (t.tipo_transacao === "TRANSFERENCIA" && t.origem_tipo === "CAIXA_OPERACIONAL");

      const valor = t.tipo_moeda === "CRYPTO" ? (t.valor_usd || 0) : t.valor;

      if (isEntrada) {
        grupo.entradas += valor;
      } else if (isSaida) {
        grupo.saidas += valor;
      }
    });

    return Array.from(agrupamentos.entries())
      .map(([chave, dados]) => ({
        periodo: chave,
        entradas: dados.entradas,
        saidas: dados.saidas,
        liquido: dados.entradas - dados.saidas,
        transacoes: dados.transacoes,
      }))
      .slice(-12); // Últimos 12 períodos
  }, [transacoesFiltradas, periodo]);

  // Calcular distribuição por categoria
  const dadosDistribuicao = useMemo(() => {
    const categorias = {
      aportes: 0,
      saques_bookmaker: 0,
      liquidacoes: 0,
      depositos_bookmaker: 0,
      transferencias: 0,
    };

    const transacoesPorCategoria: Record<string, Transacao[]> = {
      aportes: [],
      saques_bookmaker: [],
      liquidacoes: [],
      depositos_bookmaker: [],
      transferencias: [],
    };

    transacoesFiltradas.forEach((t) => {
      const valor = t.tipo_moeda === "CRYPTO" ? (t.valor_usd || 0) : t.valor;

      // ENTRADAS
      if (t.tipo_transacao === "APORTE_FINANCEIRO" && t.destino_tipo === "CAIXA_OPERACIONAL") {
        // Aporte de investidor → Caixa Operacional
        categorias.aportes += valor;
        transacoesPorCategoria.aportes.push(t);
      } else if (t.tipo_transacao === "SAQUE") {
        // Saque de bookmaker → conta bancária (capital recuperado)
        categorias.saques_bookmaker += valor;
        transacoesPorCategoria.saques_bookmaker.push(t);
      }
      // SAÍDAS
      else if (t.tipo_transacao === "APORTE_FINANCEIRO" && t.origem_tipo === "CAIXA_OPERACIONAL") {
        // Liquidação: Caixa Operacional → Investidor
        categorias.liquidacoes += valor;
        transacoesPorCategoria.liquidacoes.push(t);
      } else if (t.tipo_transacao === "DEPOSITO") {
        // Depósito em bookmaker
        categorias.depositos_bookmaker += valor;
        transacoesPorCategoria.depositos_bookmaker.push(t);
      } else if (t.tipo_transacao === "TRANSFERENCIA" && t.origem_tipo === "CAIXA_OPERACIONAL") {
        // Transferência saindo do caixa operacional
        categorias.transferencias += valor;
        transacoesPorCategoria.transferencias.push(t);
      }
    });

    const entradas = [
      { name: "Aportes de Investidores", value: categorias.aportes, key: "aportes", color: "hsl(142, 76%, 50%)" },
      { name: "Saques de Bookmakers", value: categorias.saques_bookmaker, key: "saques_bookmaker", color: "hsl(142, 76%, 36%)" },
    ].filter(item => item.value > 0);

    const saidas = [
      { name: "Liquidações a Investidores", value: categorias.liquidacoes, key: "liquidacoes", color: "hsl(0, 84%, 60%)" },
      { name: "Depósitos em Bookmakers", value: categorias.depositos_bookmaker, key: "depositos_bookmaker", color: "hsl(0, 84%, 45%)" },
      { name: "Transferências", value: categorias.transferencias, key: "transferencias", color: "hsl(25, 95%, 53%)" },
    ].filter(item => item.value > 0);

    const totalEntradas = entradas.reduce((sum, item) => sum + item.value, 0);
    const totalSaidas = saidas.reduce((sum, item) => sum + item.value, 0);

    return {
      entradas,
      saidas,
      totalEntradas,
      totalSaidas,
      transacoesPorCategoria,
    };
  }, [transacoesFiltradas]);

  // Totais gerais
  const totais = useMemo(() => {
    const totalEntradas = dadosFluxoLiquido.reduce((sum, d) => sum + d.entradas, 0);
    const totalSaidas = dadosFluxoLiquido.reduce((sum, d) => sum + d.saidas, 0);
    return {
      entradas: totalEntradas,
      saidas: totalSaidas,
      liquido: totalEntradas - totalSaidas,
    };
  }, [dadosFluxoLiquido]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const tooltipStyle = {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(12px)",
    borderRadius: "12px",
    padding: "12px 16px",
  };

  const CustomTooltipFluxo = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div style={tooltipStyle}>
          <p className="font-medium text-sm mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-emerald-500">Entradas:</span>
              <span className="font-mono">{formatCurrency(data?.entradas || 0)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-destructive">Saídas:</span>
              <span className="font-mono">{formatCurrency(data?.saidas || 0)}</span>
            </div>
            <div className="border-t border-white/10 pt-1 mt-1">
              <div className="flex justify-between gap-4 font-medium">
                <span className={data?.liquido >= 0 ? "text-emerald-500" : "text-destructive"}>
                  Resultado Líquido:
                </span>
                <span className="font-mono">{formatCurrency(data?.liquido || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomTooltipDistribuicao = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const total = data.payload.tipo === "entrada" ? dadosDistribuicao.totalEntradas : dadosDistribuicao.totalSaidas;
      const percentual = total > 0 ? ((data.value / total) * 100).toFixed(1) : "0";
      
      return (
        <div style={tooltipStyle}>
          <p className="font-medium text-sm mb-1">{data.name}</p>
          <div className="text-sm space-y-1">
            <p className="font-mono">{formatCurrency(data.value)}</p>
            <p className="text-muted-foreground">{percentual}% do total</p>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleCategoryClick = (key: string) => {
    if (onTransacaoClick && dadosDistribuicao.transacoesPorCategoria[key]) {
      onTransacaoClick(dadosDistribuicao.transacoesPorCategoria[key]);
    }
    setSelectedCategory(key);
  };

  const handleBarClick = (data: any) => {
    if (onTransacaoClick && data?.transacoes) {
      onTransacaoClick(data.transacoes);
    }
  };

  if (transacoesFiltradas.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Fluxo Financeiro Operacional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma transação encontrada no período selecionado</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Fluxo Financeiro Operacional
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={periodo === "dia" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodo("dia")}
              className="h-7 px-3 text-xs"
            >
              Diário
            </Button>
            <Button
              variant={periodo === "semana" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodo("semana")}
              className="h-7 px-3 text-xs"
            >
              Semanal
            </Button>
            <Button
              variant={periodo === "mes" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodo("mes")}
              className="h-7 px-3 text-xs"
            >
              Mensal
            </Button>
          </div>
        </div>

        {/* KPIs Resumo */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-500 mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Entradas</span>
            </div>
            <span className="text-lg font-bold text-emerald-400 font-mono">
              {formatCurrency(totais.entradas)}
            </span>
          </div>
          <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/20">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <TrendingDown className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Saídas</span>
            </div>
            <span className="text-lg font-bold text-destructive font-mono">
              {formatCurrency(totais.saidas)}
            </span>
          </div>
          <div className={`rounded-lg p-3 border ${
            totais.liquido >= 0 
              ? "bg-emerald-500/10 border-emerald-500/20" 
              : "bg-destructive/10 border-destructive/20"
          }`}>
            <div className={`flex items-center gap-2 mb-1 ${
              totais.liquido >= 0 ? "text-emerald-500" : "text-destructive"
            }`}>
              <ArrowRightLeft className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Resultado Líquido</span>
            </div>
            <span className={`text-lg font-bold font-mono ${
              totais.liquido >= 0 ? "text-emerald-400" : "text-destructive"
            }`}>
              {totais.liquido >= 0 ? "+" : ""}{formatCurrency(totais.liquido)}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs defaultValue="fluxo" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fluxo" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Fluxo Líquido por Período
            </TabsTrigger>
            <TabsTrigger value="distribuicao" className="gap-2">
              <Wallet className="h-4 w-4" />
              Distribuição por Categoria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fluxo" className="mt-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={dadosFluxoLiquido} 
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  onClick={(e) => e?.activePayload && handleBarClick(e.activePayload[0]?.payload)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="periodo" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltipFluxo />} cursor={{ fill: "rgba(255, 255, 255, 0.05)" }} />
                  <Bar 
                    dataKey="liquido" 
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                  >
                    {dadosFluxoLiquido.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.liquido >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Clique em uma barra para ver as transações do período
            </p>
          </TabsContent>

          <TabsContent value="distribuicao" className="mt-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Entradas */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <h4 className="font-medium text-sm">Entradas</h4>
                  <Badge variant="outline" className="ml-auto text-emerald-500 border-emerald-500/30">
                    {formatCurrency(dadosDistribuicao.totalEntradas)}
                  </Badge>
                </div>
                {dadosDistribuicao.entradas.length > 0 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dadosDistribuicao.entradas.map(e => ({ ...e, tipo: "entrada" }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                          onClick={(data) => handleCategoryClick(data.key)}
                          cursor="pointer"
                        >
                          {dadosDistribuicao.entradas.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color}
                              stroke={selectedCategory === entry.key ? "hsl(var(--primary))" : "transparent"}
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltipDistribuicao />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    Nenhuma entrada no período
                  </div>
                )}
                <div className="space-y-1 mt-2">
                  {dadosDistribuicao.entradas.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleCategoryClick(item.key)}
                      className={`w-full flex items-center justify-between text-xs p-2 rounded hover:bg-muted/50 transition-colors ${
                        selectedCategory === item.key ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-mono text-muted-foreground">
                        {formatCurrency(item.value)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Saídas */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <h4 className="font-medium text-sm">Saídas</h4>
                  <Badge variant="outline" className="ml-auto text-destructive border-destructive/30">
                    {formatCurrency(dadosDistribuicao.totalSaidas)}
                  </Badge>
                </div>
                {dadosDistribuicao.saidas.length > 0 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dadosDistribuicao.saidas.map(e => ({ ...e, tipo: "saida" }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                          onClick={(data) => handleCategoryClick(data.key)}
                          cursor="pointer"
                        >
                          {dadosDistribuicao.saidas.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color}
                              stroke={selectedCategory === entry.key ? "hsl(var(--primary))" : "transparent"}
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltipDistribuicao />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    Nenhuma saída no período
                  </div>
                )}
                <div className="space-y-1 mt-2">
                  {dadosDistribuicao.saidas.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleCategoryClick(item.key)}
                      className={`w-full flex items-center justify-between text-xs p-2 rounded hover:bg-muted/50 transition-colors ${
                        selectedCategory === item.key ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-mono text-muted-foreground">
                        {formatCurrency(item.value)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Clique em uma categoria para ver as transações relacionadas
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
