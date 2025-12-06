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
  Legend
} from "recharts";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowRightLeft, Wallet, DollarSign, AlertCircle, Building2, Users } from "lucide-react";

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
  saldoBookmakers?: number;
  onTransacaoClick?: (transacoes: Transacao[]) => void;
}

type Periodo = "dia" | "semana" | "mes";

export function FluxoFinanceiroOperacional({
  transacoes,
  dataInicio,
  dataFim,
  saldoBookmakers = 0,
  onTransacaoClick,
}: FluxoFinanceiroOperacionalProps) {
  const [periodo, setPeriodo] = useState<Periodo>("dia");

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

  // 1. Fluxo de Capital Externo (Investidores)
  const dadosCapitalExterno = useMemo(() => {
    const agrupamentos: Map<string, { aportes: number; liquidacoes: number; transacoes: Transacao[] }> = new Map();

    transacoesFiltradas.forEach((t) => {
      if (t.tipo_transacao !== "APORTE_FINANCEIRO") return;
      
      const data = parseISO(t.data_transacao);
      let chave: string;

      switch (periodo) {
        case "dia":
          chave = format(data, "dd/MM");
          break;
        case "semana":
          chave = `Sem ${format(data, "w")}`;
          break;
        case "mes":
          chave = format(data, "MMM/yy", { locale: ptBR });
          break;
        default:
          chave = format(data, "dd/MM");
      }

      if (!agrupamentos.has(chave)) {
        agrupamentos.set(chave, { aportes: 0, liquidacoes: 0, transacoes: [] });
      }

      const grupo = agrupamentos.get(chave)!;
      grupo.transacoes.push(t);
      const valor = t.tipo_moeda === "CRYPTO" ? (t.valor_usd || 0) : t.valor;

      // Aporte: Investidor → Caixa
      if (t.destino_tipo === "CAIXA_OPERACIONAL") {
        grupo.aportes += valor;
      }
      // Liquidação: Caixa → Investidor
      if (t.origem_tipo === "CAIXA_OPERACIONAL") {
        grupo.liquidacoes += valor;
      }
    });

    const dados = Array.from(agrupamentos.entries())
      .map(([chave, dados]) => ({
        periodo: chave,
        aportes: dados.aportes,
        liquidacoes: -dados.liquidacoes,
        liquido: dados.aportes - dados.liquidacoes,
        transacoes: dados.transacoes,
      }))
      .slice(-12);

    const totalAportes = dados.reduce((sum, d) => sum + d.aportes, 0);
    const totalLiquidacoes = dados.reduce((sum, d) => sum + Math.abs(d.liquidacoes), 0);

    return { dados, totalAportes, totalLiquidacoes, liquido: totalAportes - totalLiquidacoes };
  }, [transacoesFiltradas, periodo]);

  // 2. Capital Alocado em Operação (Bookmakers)
  const dadosCapitalOperacao = useMemo(() => {
    const agrupamentos: Map<string, { depositos: number; saques: number; transacoes: Transacao[] }> = new Map();

    transacoesFiltradas.forEach((t) => {
      if (t.tipo_transacao !== "DEPOSITO" && t.tipo_transacao !== "SAQUE") return;
      
      const data = parseISO(t.data_transacao);
      let chave: string;

      switch (periodo) {
        case "dia":
          chave = format(data, "dd/MM");
          break;
        case "semana":
          chave = `Sem ${format(data, "w")}`;
          break;
        case "mes":
          chave = format(data, "MMM/yy", { locale: ptBR });
          break;
        default:
          chave = format(data, "dd/MM");
      }

      if (!agrupamentos.has(chave)) {
        agrupamentos.set(chave, { depositos: 0, saques: 0, transacoes: [] });
      }

      const grupo = agrupamentos.get(chave)!;
      grupo.transacoes.push(t);
      const valor = t.tipo_moeda === "CRYPTO" ? (t.valor_usd || 0) : t.valor;

      if (t.tipo_transacao === "DEPOSITO") {
        grupo.depositos += valor;
      } else if (t.tipo_transacao === "SAQUE") {
        grupo.saques += valor;
      }
    });

    const dados = Array.from(agrupamentos.entries())
      .map(([chave, dados]) => ({
        periodo: chave,
        depositos: dados.depositos,
        saques: dados.saques,
        alocacaoLiquida: dados.depositos - dados.saques,
        transacoes: dados.transacoes,
      }))
      .slice(-12);

    const totalDepositos = dados.reduce((sum, d) => sum + d.depositos, 0);
    const totalSaques = dados.reduce((sum, d) => sum + d.saques, 0);

    return { dados, totalDepositos, totalSaques, alocacaoLiquida: totalDepositos - totalSaques };
  }, [transacoesFiltradas, periodo]);

  // 3. Resultado Operacional
  const resultadoOperacional = useMemo(() => {
    const totalDepositos = dadosCapitalOperacao.totalDepositos;
    const totalSaques = dadosCapitalOperacao.totalSaques;
    
    // Resultado = Saldo Atual em Bookmakers + Total Sacado - Total Depositado
    const resultado = saldoBookmakers + totalSaques - totalDepositos;
    const percentualRetorno = totalDepositos > 0 
      ? ((resultado / totalDepositos) * 100) 
      : 0;

    return { 
      totalDepositos, 
      totalSaques, 
      saldoBookmakers,
      resultado,
      percentualRetorno 
    };
  }, [dadosCapitalOperacao, saldoBookmakers]);

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

  const CustomTooltipExterno = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div style={tooltipStyle}>
          <p className="font-medium text-sm mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-emerald-500">Aportes:</span>
              <span className="font-mono">{formatCurrency(data?.aportes || 0)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-amber-500">Liquidações:</span>
              <span className="font-mono">{formatCurrency(Math.abs(data?.liquidacoes || 0))}</span>
            </div>
            <div className="border-t border-white/10 pt-1 mt-1">
              <div className="flex justify-between gap-4 font-medium">
                <span className={data?.liquido >= 0 ? "text-emerald-500" : "text-destructive"}>
                  Saldo:
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

  const CustomTooltipOperacao = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div style={tooltipStyle}>
          <p className="font-medium text-sm mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-blue-500">Depósitos:</span>
              <span className="font-mono">{formatCurrency(data?.depositos || 0)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-purple-500">Saques:</span>
              <span className="font-mono">{formatCurrency(data?.saques || 0)}</span>
            </div>
            <div className="border-t border-white/10 pt-1 mt-1">
              <div className="flex justify-between gap-4 font-medium">
                <span className={data?.alocacaoLiquida >= 0 ? "text-blue-500" : "text-purple-500"}>
                  Alocação Líquida:
                </span>
                <span className="font-mono">{formatCurrency(data?.alocacaoLiquida || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
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
            Análise Financeira
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
            Análise Financeira
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
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs defaultValue="externo" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="externo" className="gap-2 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Capital Externo</span>
              <span className="sm:hidden">Externo</span>
            </TabsTrigger>
            <TabsTrigger value="operacao" className="gap-2 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Capital em Operação</span>
              <span className="sm:hidden">Operação</span>
            </TabsTrigger>
            <TabsTrigger value="resultado" className="gap-2 text-xs sm:text-sm">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Resultado</span>
              <span className="sm:hidden">Resultado</span>
            </TabsTrigger>
          </TabsList>

          {/* Aba 1: Capital Externo (Investidores) */}
          <TabsContent value="externo" className="mt-4 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
                <div className="flex items-center gap-2 text-emerald-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Aportes</span>
                </div>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {formatCurrency(dadosCapitalExterno.totalAportes)}
                </span>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                <div className="flex items-center gap-2 text-amber-500 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Liquidações</span>
                </div>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {formatCurrency(dadosCapitalExterno.totalLiquidacoes)}
                </span>
              </div>
              <div className={`rounded-lg p-3 border ${
                dadosCapitalExterno.liquido >= 0 
                  ? "bg-emerald-500/10 border-emerald-500/20" 
                  : "bg-destructive/10 border-destructive/20"
              }`}>
                <div className={`flex items-center gap-2 mb-1 ${
                  dadosCapitalExterno.liquido >= 0 ? "text-emerald-500" : "text-destructive"
                }`}>
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saldo Líquido</span>
                </div>
                <span className={`text-lg font-bold font-mono ${
                  dadosCapitalExterno.liquido >= 0 ? "text-emerald-400" : "text-destructive"
                }`}>
                  {dadosCapitalExterno.liquido >= 0 ? "+" : ""}{formatCurrency(dadosCapitalExterno.liquido)}
                </span>
              </div>
            </div>

            {/* Gráfico */}
            {dadosCapitalExterno.dados.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={dadosCapitalExterno.dados} 
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
                    <Tooltip content={<CustomTooltipExterno />} cursor={{ fill: "rgba(255, 255, 255, 0.05)" }} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '16px' }}
                      formatter={(value) => value === 'aportes' ? 'Aportes' : 'Liquidações'}
                    />
                    <Bar dataKey="aportes" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} name="aportes" />
                    <Bar dataKey="liquidacoes" fill="hsl(25, 95%, 53%)" radius={[4, 4, 0, 0]} name="liquidacoes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de investidores no período
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Quanto capital novo entrou (aportes) vs quanto foi devolvido (liquidações) aos investidores
            </p>
          </TabsContent>

          {/* Aba 2: Capital em Operação (Bookmakers) */}
          <TabsContent value="operacao" className="mt-4 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                <div className="flex items-center gap-2 text-blue-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Depósitos</span>
                </div>
                <span className="text-lg font-bold text-blue-400 font-mono">
                  {formatCurrency(dadosCapitalOperacao.totalDepositos)}
                </span>
              </div>
              <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                <div className="flex items-center gap-2 text-purple-500 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saques</span>
                </div>
                <span className="text-lg font-bold text-purple-400 font-mono">
                  {formatCurrency(dadosCapitalOperacao.totalSaques)}
                </span>
              </div>
              <div className={`rounded-lg p-3 border ${
                dadosCapitalOperacao.alocacaoLiquida >= 0 
                  ? "bg-blue-500/10 border-blue-500/20" 
                  : "bg-purple-500/10 border-purple-500/20"
              }`}>
                <div className={`flex items-center gap-2 mb-1 ${
                  dadosCapitalOperacao.alocacaoLiquida >= 0 ? "text-blue-500" : "text-purple-500"
                }`}>
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Alocação Líquida</span>
                </div>
                <span className={`text-lg font-bold font-mono ${
                  dadosCapitalOperacao.alocacaoLiquida >= 0 ? "text-blue-400" : "text-purple-400"
                }`}>
                  {dadosCapitalOperacao.alocacaoLiquida >= 0 ? "+" : ""}{formatCurrency(dadosCapitalOperacao.alocacaoLiquida)}
                </span>
              </div>
            </div>

            {/* Gráfico */}
            {dadosCapitalOperacao.dados.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={dadosCapitalOperacao.dados} 
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
                    <Tooltip content={<CustomTooltipOperacao />} cursor={{ fill: "rgba(255, 255, 255, 0.05)" }} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '16px' }}
                      formatter={(value) => value === 'depositos' ? 'Depósitos' : 'Saques'}
                    />
                    <Bar dataKey="depositos" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="depositos" />
                    <Bar dataKey="saques" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} name="saques" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de bookmakers no período
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Quanto capital está sendo alocado (depósitos) ou recuperado (saques) das operações em bookmakers
            </p>
          </TabsContent>

          {/* Aba 3: Resultado Operacional */}
          <TabsContent value="resultado" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                <div className="text-xs text-muted-foreground mb-1">Total Depositado</div>
                <span className="text-xl font-bold text-blue-400 font-mono">
                  {formatCurrency(resultadoOperacional.totalDepositos)}
                </span>
              </div>
              <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                <div className="text-xs text-muted-foreground mb-1">Total Sacado</div>
                <span className="text-xl font-bold text-purple-400 font-mono">
                  {formatCurrency(resultadoOperacional.totalSaques)}
                </span>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                <div className="text-xs text-muted-foreground mb-1">Saldo em Bookmakers</div>
                <span className="text-xl font-bold font-mono">
                  {formatCurrency(resultadoOperacional.saldoBookmakers)}
                </span>
              </div>
              <div className={`rounded-lg p-4 border ${
                resultadoOperacional.resultado >= 0 
                  ? "bg-emerald-500/10 border-emerald-500/20" 
                  : "bg-destructive/10 border-destructive/20"
              }`}>
                <div className="text-xs text-muted-foreground mb-1">Resultado Estimado</div>
                <span className={`text-xl font-bold font-mono ${
                  resultadoOperacional.resultado >= 0 ? "text-emerald-400" : "text-destructive"
                }`}>
                  {resultadoOperacional.resultado >= 0 ? "+" : ""}{formatCurrency(resultadoOperacional.resultado)}
                </span>
              </div>
            </div>

            {/* Explicação visual */}
            <div className="bg-muted/20 rounded-lg p-4 border border-border/50">
              <h4 className="font-medium mb-3 text-sm">Como é calculado o resultado:</h4>
              <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
                <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/10">
                  Saldo Bookmakers
                </Badge>
                <span className="text-muted-foreground">+</span>
                <Badge variant="outline" className="text-purple-400 border-purple-500/30 bg-purple-500/10">
                  Total Sacado
                </Badge>
                <span className="text-muted-foreground">-</span>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/10">
                  Total Depositado
                </Badge>
                <span className="text-muted-foreground">=</span>
                <Badge variant="outline" className={`${
                  resultadoOperacional.resultado >= 0 
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" 
                    : "text-destructive border-destructive/30 bg-destructive/10"
                }`}>
                  Resultado
                </Badge>
              </div>
              
              {resultadoOperacional.totalDepositos > 0 && (
                <div className="mt-4 text-center">
                  <span className="text-sm text-muted-foreground">Retorno sobre capital investido: </span>
                  <span className={`font-mono font-bold ${
                    resultadoOperacional.percentualRetorno >= 0 ? "text-emerald-400" : "text-destructive"
                  }`}>
                    {resultadoOperacional.percentualRetorno >= 0 ? "+" : ""}
                    {resultadoOperacional.percentualRetorno.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              O resultado considera o capital atual em bookmakers mais os saques realizados, subtraindo os depósitos feitos
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
