import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowRightLeft, Wallet, DollarSign, AlertCircle, Building2, Users, HelpCircle, BarChart3 } from "lucide-react";

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

// Componente de ajuda reutilizável
function KpiHelp({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Componente de tooltip para abas
function TabHelp({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help transition-colors ml-1" />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px] text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
  // REGRA: CRYPTO = USD, FIAT = BRL, nunca misturar
  const dadosCapitalExterno = useMemo(() => {
    const agrupamentos: Map<string, { 
      aportes_brl: number; 
      aportes_usd: number;
      liquidacoes_brl: number; 
      liquidacoes_usd: number;
      transacoes: Transacao[] 
    }> = new Map();

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
        agrupamentos.set(chave, { aportes_brl: 0, aportes_usd: 0, liquidacoes_brl: 0, liquidacoes_usd: 0, transacoes: [] });
      }

      const grupo = agrupamentos.get(chave)!;
      grupo.transacoes.push(t);
      
      const isCrypto = t.tipo_moeda === "CRYPTO";
      const isUSD = t.moeda === "USD" || isCrypto;
      const valor = isCrypto ? (t.valor_usd || 0) : t.valor;

      // Aporte: Investidor → Caixa
      if (t.destino_tipo === "CAIXA_OPERACIONAL") {
        if (isUSD) {
          grupo.aportes_usd += valor;
        } else {
          grupo.aportes_brl += valor;
        }
      }
      // Liquidação: Caixa → Investidor
      if (t.origem_tipo === "CAIXA_OPERACIONAL") {
        if (isUSD) {
          grupo.liquidacoes_usd += valor;
        } else {
          grupo.liquidacoes_brl += valor;
        }
      }
    });

    const dados = Array.from(agrupamentos.entries())
      .map(([chave, dados]) => ({
        periodo: chave,
        aportes: dados.aportes_brl,
        aportes_usd: dados.aportes_usd,
        liquidacoes: -dados.liquidacoes_brl,
        liquidacoes_usd: -dados.liquidacoes_usd,
        liquido: dados.aportes_brl - dados.liquidacoes_brl,
        liquido_usd: dados.aportes_usd - dados.liquidacoes_usd,
        transacoes: dados.transacoes,
      }))
      .slice(-12);

    const totalAportesBRL = dados.reduce((sum, d) => sum + d.aportes, 0);
    const totalAportesUSD = dados.reduce((sum, d) => sum + d.aportes_usd, 0);
    const totalLiquidacoesBRL = dados.reduce((sum, d) => sum + Math.abs(d.liquidacoes), 0);
    const totalLiquidacoesUSD = dados.reduce((sum, d) => sum + Math.abs(d.liquidacoes_usd), 0);

    return { 
      dados, 
      totalAportes: totalAportesBRL, 
      totalAportesUSD,
      totalLiquidacoes: totalLiquidacoesBRL,
      totalLiquidacoesUSD,
      liquido: totalAportesBRL - totalLiquidacoesBRL,
      liquidoUSD: totalAportesUSD - totalLiquidacoesUSD,
      hasUSD: totalAportesUSD > 0 || totalLiquidacoesUSD > 0
    };
  }, [transacoesFiltradas, periodo]);

  // 2. Capital Alocado em Operação (Bookmakers)
  // REGRA: CRYPTO = USD, FIAT = BRL, nunca misturar
  const dadosCapitalOperacao = useMemo(() => {
    const agrupamentos: Map<string, { 
      depositos_brl: number; 
      depositos_usd: number;
      saques_brl: number; 
      saques_usd: number;
      transacoes: Transacao[] 
    }> = new Map();

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
        agrupamentos.set(chave, { depositos_brl: 0, depositos_usd: 0, saques_brl: 0, saques_usd: 0, transacoes: [] });
      }

      const grupo = agrupamentos.get(chave)!;
      grupo.transacoes.push(t);
      
      const isCrypto = t.tipo_moeda === "CRYPTO";
      const isUSD = t.moeda === "USD" || isCrypto;
      const valor = isCrypto ? (t.valor_usd || 0) : t.valor;

      if (t.tipo_transacao === "DEPOSITO") {
        if (isUSD) {
          grupo.depositos_usd += valor;
        } else {
          grupo.depositos_brl += valor;
        }
      } else if (t.tipo_transacao === "SAQUE") {
        if (isUSD) {
          grupo.saques_usd += valor;
        } else {
          grupo.saques_brl += valor;
        }
      }
    });

    const dados = Array.from(agrupamentos.entries())
      .map(([chave, dados]) => ({
        periodo: chave,
        depositos: dados.depositos_brl,
        depositos_usd: dados.depositos_usd,
        saques: dados.saques_brl,
        saques_usd: dados.saques_usd,
        alocacaoLiquida: dados.depositos_brl - dados.saques_brl,
        alocacaoLiquidaUSD: dados.depositos_usd - dados.saques_usd,
        transacoes: dados.transacoes,
      }))
      .slice(-12);

    const totalDepositosBRL = dados.reduce((sum, d) => sum + d.depositos, 0);
    const totalDepositosUSD = dados.reduce((sum, d) => sum + d.depositos_usd, 0);
    const totalSaquesBRL = dados.reduce((sum, d) => sum + d.saques, 0);
    const totalSaquesUSD = dados.reduce((sum, d) => sum + d.saques_usd, 0);

    return { 
      dados, 
      totalDepositos: totalDepositosBRL, 
      totalDepositosUSD,
      totalSaques: totalSaquesBRL,
      totalSaquesUSD,
      alocacaoLiquida: totalDepositosBRL - totalSaquesBRL,
      alocacaoLiquidaUSD: totalDepositosUSD - totalSaquesUSD,
      hasUSD: totalDepositosUSD > 0 || totalSaquesUSD > 0
    };
  }, [transacoesFiltradas, periodo]);

  // 3. Performance Operacional - cálculos com saldo inicial e final
  const performanceOperacional = useMemo(() => {
    const totalDepositos = dadosCapitalOperacao.totalDepositos;
    const totalSaques = dadosCapitalOperacao.totalSaques;
    const saldoFinal = saldoBookmakers;
    
    // Saldo Inicial = Saldo Final + Saques - Depósitos (engenharia reversa)
    const saldoInicial = saldoFinal + totalSaques - totalDepositos;
    
    // Lucro = (Saldo Final + Saques) - (Saldo Inicial + Depósitos)
    const lucro = (saldoFinal + totalSaques) - (saldoInicial + totalDepositos);
    
    // Capital Médio para ROI
    const capitalMedio = (saldoInicial + saldoFinal) / 2;
    
    // ROI = Lucro / Capital Médio * 100
    const roi = capitalMedio > 0 ? (lucro / capitalMedio) * 100 : null;

    return { 
      saldoInicial,
      saldoFinal,
      totalDepositos, 
      totalSaques, 
      lucro,
      capitalMedio,
      roi 
    };
  }, [dadosCapitalOperacao, saldoBookmakers]);

  const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatUSD = (value: number) => formatCurrency(value, "USD");

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
        <Tabs defaultValue="fluxo" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="fluxo" className="gap-1 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Fluxo de Caixa</span>
              <span className="sm:hidden">Fluxo</span>
              <TabHelp text="Representa o fluxo financeiro efetivo da operação. Aqui são exibidos apenas movimentos de caixa: depósitos enviados às bookmakers e saques recebidos delas. Não considera variações internas de saldo." />
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-1 text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Performance</span>
              <span className="sm:hidden">Perform.</span>
              <TabHelp text="Representa o cenário financeiro real dos projetos. Aqui é calculado o lucro ou prejuízo considerando a variação do saldo nas bookmakers, mesmo quando não há saques. Mostra o verdadeiro retorno do período." />
            </TabsTrigger>
            <TabsTrigger value="externo" className="gap-1 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Capital Externo</span>
              <span className="sm:hidden">Externo</span>
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
                  <KpiHelp text="Total de capital recebido de investidores no período selecionado" />
                </div>
                <div className="space-y-1">
                  <span className="text-lg font-bold text-emerald-400 font-mono">
                    {formatCurrency(dadosCapitalExterno.totalAportes)}
                  </span>
                  {dadosCapitalExterno.hasUSD && dadosCapitalExterno.totalAportesUSD > 0 && (
                    <div className="text-sm font-mono text-blue-400">
                      + {formatUSD(dadosCapitalExterno.totalAportesUSD)}
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                <div className="flex items-center gap-2 text-amber-500 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Liquidações</span>
                  <KpiHelp text="Total de capital devolvido aos investidores (lucros ou resgates)" />
                </div>
                <div className="space-y-1">
                  <span className="text-lg font-bold text-amber-400 font-mono">
                    {formatCurrency(dadosCapitalExterno.totalLiquidacoes)}
                  </span>
                  {dadosCapitalExterno.hasUSD && dadosCapitalExterno.totalLiquidacoesUSD > 0 && (
                    <div className="text-sm font-mono text-blue-400">
                      + {formatUSD(dadosCapitalExterno.totalLiquidacoesUSD)}
                    </div>
                  )}
                </div>
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
                  <KpiHelp text="Diferença entre aportes e liquidações. Positivo = mais capital entrando" />
                </div>
                <div className="space-y-1">
                  <span className={`text-lg font-bold font-mono ${
                    dadosCapitalExterno.liquido >= 0 ? "text-emerald-400" : "text-destructive"
                  }`}>
                    {dadosCapitalExterno.liquido >= 0 ? "+" : ""}{formatCurrency(dadosCapitalExterno.liquido)}
                  </span>
                  {dadosCapitalExterno.hasUSD && (
                    <div className={`text-sm font-mono ${dadosCapitalExterno.liquidoUSD >= 0 ? "text-blue-400" : "text-red-400"}`}>
                      {dadosCapitalExterno.liquidoUSD >= 0 ? "+" : ""}{formatUSD(dadosCapitalExterno.liquidoUSD)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Gráfico */}
            {dadosCapitalExterno.dados.length > 0 ? (
              <ModernBarChart
                data={dadosCapitalExterno.dados}
                categoryKey="periodo"
                bars={[
                  { 
                    dataKey: "aportes", 
                    label: "Aportes BRL", 
                    gradientStart: "#22C55E", 
                    gradientEnd: "#16A34A" 
                  },
                  { 
                    dataKey: "liquidacoes", 
                    label: "Liquidações BRL", 
                    gradientStart: "#F97316", 
                    gradientEnd: "#EA580C" 
                  },
                ]}
                height={280}
                barSize={24}
                formatValue={(value) => formatCurrency(value)}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de investidores no período
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Quanto capital novo entrou (aportes) vs quanto foi devolvido (liquidações) aos investidores. BRL e USD são exibidos separadamente.
            </p>
          </TabsContent>

          {/* Aba 2: Fluxo de Caixa (Capital em Operação - Bookmakers) */}
          <TabsContent value="fluxo" className="mt-4 space-y-4">
            {/* KPIs - Depósitos e Saques separados por moeda */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                <div className="flex items-center gap-2 text-blue-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Depósitos</span>
                  <KpiHelp text="Capital enviado às bookmakers no período selecionado" />
                </div>
                <div className="space-y-1">
                  <span className="text-xl font-bold text-blue-400 font-mono">
                    {formatCurrency(dadosCapitalOperacao.totalDepositos)}
                  </span>
                  {dadosCapitalOperacao.hasUSD && dadosCapitalOperacao.totalDepositosUSD > 0 && (
                    <div className="text-sm font-mono text-cyan-400">
                      + {formatUSD(dadosCapitalOperacao.totalDepositosUSD)}
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                <div className="flex items-center gap-2 text-purple-500 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saques</span>
                  <KpiHelp text="Capital retornado das bookmakers para o caixa no período" />
                </div>
                <div className="space-y-1">
                  <span className="text-xl font-bold text-purple-400 font-mono">
                    {formatCurrency(dadosCapitalOperacao.totalSaques)}
                  </span>
                  {dadosCapitalOperacao.hasUSD && dadosCapitalOperacao.totalSaquesUSD > 0 && (
                    <div className="text-sm font-mono text-cyan-400">
                      + {formatUSD(dadosCapitalOperacao.totalSaquesUSD)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Gráfico */}
            {dadosCapitalOperacao.dados.length > 0 ? (
              <ModernBarChart
                data={dadosCapitalOperacao.dados}
                categoryKey="periodo"
                bars={[
                  { 
                    dataKey: "depositos", 
                    label: "Depósitos BRL", 
                    gradientStart: "#3B82F6", 
                    gradientEnd: "#2563EB" 
                  },
                  { 
                    dataKey: "saques", 
                    label: "Saques BRL", 
                    gradientStart: "#8B5CF6", 
                    gradientEnd: "#7C3AED" 
                  },
                ]}
                height={280}
                barSize={24}
                formatValue={(value) => formatCurrency(value)}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de bookmakers no período
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Fluxo financeiro efetivo. BRL e USD (Crypto) são exibidos separadamente, nunca somados.
            </p>
          </TabsContent>

          {/* Aba 3: Performance Operacional (Resultado do Período) */}
          <TabsContent value="performance" className="mt-4 space-y-4">
            {/* KPIs - Saldo Inicial, Saldo Final, Depósitos, Saques */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saldo Inicial</span>
                  <KpiHelp text="Capital nas bookmakers no início do período (calculado)" />
                </div>
                <span className="text-lg font-bold font-mono">
                  {formatCurrency(performanceOperacional.saldoInicial)}
                </span>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saldo Final</span>
                  <KpiHelp text="Capital nas bookmakers no final do período (atual)" />
                </div>
                <span className="text-lg font-bold font-mono">
                  {formatCurrency(performanceOperacional.saldoFinal)}
                </span>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                <div className="flex items-center gap-2 text-blue-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Depósitos</span>
                  <KpiHelp text="Capital enviado às bookmakers no período" />
                </div>
                <span className="text-lg font-bold text-blue-400 font-mono">
                  {formatCurrency(performanceOperacional.totalDepositos)}
                </span>
              </div>
              <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                <div className="flex items-center gap-2 text-purple-500 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saques</span>
                  <KpiHelp text="Capital retornado das bookmakers no período" />
                </div>
                <span className="text-lg font-bold text-purple-400 font-mono">
                  {formatCurrency(performanceOperacional.totalSaques)}
                </span>
              </div>
            </div>

            {/* KPIs de Lucro e ROI */}
            <div className="grid grid-cols-2 gap-4">
              {/* Lucro do Período */}
              {(() => {
                const isPositivo = performanceOperacional.lucro > 0;
                const isNegativo = performanceOperacional.lucro < 0;
                return (
                  <div className={`rounded-lg p-4 border ${
                    isPositivo 
                      ? "bg-emerald-500/10 border-emerald-500/20" 
                      : isNegativo 
                        ? "bg-destructive/10 border-destructive/20"
                        : "bg-muted/30 border-border/50"
                  }`}>
                    <div className={`flex items-center gap-2 mb-1 ${
                      isPositivo ? "text-emerald-500" : isNegativo ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      <DollarSign className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase">Lucro do Período</span>
                      <KpiHelp text="Lucro = (Saldo Final + Saques) - (Saldo Inicial + Depósitos). Considera variação de saldo nas bookmakers." />
                    </div>
                    <span className={`text-xl font-bold font-mono ${
                      isPositivo ? "text-emerald-400" : isNegativo ? "text-destructive" : "text-foreground"
                    }`}>
                      {isPositivo ? "+" : ""}{formatCurrency(performanceOperacional.lucro)}
                    </span>
                    {performanceOperacional.lucro !== 0 && (
                      <span className={`text-xs ml-2 ${isPositivo ? "text-emerald-500" : "text-destructive"}`}>
                        ({isPositivo ? "Lucro" : "Prejuízo"})
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* ROI */}
              {(() => {
                const roi = performanceOperacional.roi;
                const isPositivo = roi !== null && roi > 0;
                const isNegativo = roi !== null && roi < 0;
                return (
                  <div className={`rounded-lg p-4 border ${
                    isPositivo 
                      ? "bg-emerald-500/10 border-emerald-500/20" 
                      : isNegativo 
                        ? "bg-destructive/10 border-destructive/20"
                        : "bg-muted/30 border-border/50"
                  }`}>
                    <div className={`flex items-center gap-2 mb-1 ${
                      isPositivo ? "text-emerald-500" : isNegativo ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      <BarChart3 className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase">ROI do Período</span>
                      <KpiHelp text="ROI = Lucro ÷ Capital Médio. Mais relevante em análises semanais, mensais ou de longo prazo." />
                    </div>
                    <span className={`text-xl font-bold font-mono ${
                      isPositivo ? "text-emerald-400" : isNegativo ? "text-destructive" : "text-foreground"
                    }`}>
                      {roi !== null ? (
                        <>
                          {isPositivo ? "+" : ""}{roi.toFixed(2)}%
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Fórmula explicativa */}
            <div className="bg-muted/20 rounded-lg p-4 border border-border/50">
              <h4 className="font-medium mb-3 text-sm">Como é calculado o resultado:</h4>
              <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
                <Badge variant="outline" className="text-foreground border-border/50 bg-muted/30">
                  Saldo Final
                </Badge>
                <span className="text-muted-foreground">+</span>
                <Badge variant="outline" className="text-purple-400 border-purple-500/30 bg-purple-500/10">
                  Saques
                </Badge>
                <span className="text-muted-foreground">-</span>
                <Badge variant="outline" className="text-foreground border-border/50 bg-muted/30">
                  Saldo Inicial
                </Badge>
                <span className="text-muted-foreground">-</span>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/10">
                  Depósitos
                </Badge>
                <span className="text-muted-foreground">=</span>
                <Badge variant="outline" className={`${
                  performanceOperacional.lucro >= 0 
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" 
                    : "text-destructive border-destructive/30 bg-destructive/10"
                }`}>
                  Lucro
                </Badge>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Mostra o retorno real da operação no período, considerando a variação de saldo dentro das bookmakers. Representa o lucro/performance dos projetos, mesmo quando o capital permanece alocado.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
