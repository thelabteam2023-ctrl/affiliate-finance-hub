import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { format, isWithinInterval, parseISO, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowRightLeft, AlertCircle, Building2, Users, HelpCircle, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCotacoes } from "@/hooks/useCotacoes";

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
  setDataInicio?: (date: Date | undefined) => void;
  setDataFim?: (date: Date | undefined) => void;
  saldoBookmakers?: number;
  onTransacaoClick?: (transacoes: Transacao[]) => void;
}

type Periodo = "dia" | "semana" | "mes" | "customizado";

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
  setDataInicio,
  setDataFim,
  saldoBookmakers = 0,
  onTransacaoClick,
}: FluxoFinanceiroOperacionalProps) {
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(new Date());
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  
  // Buscar cotação USD/BRL para normalizar as barras do gráfico
  const { cotacaoUSD } = useCotacoes();

  // Handler para mudar período
  const handlePeriodoChange = (newPeriodo: Periodo) => {
    setPeriodo(newPeriodo);
    if (newPeriodo !== "customizado") {
      setShowCustomDatePicker(false);
    } else {
      setShowCustomDatePicker(true);
      // Aplicar datas customizadas quando mudar para customizado
      if (setDataInicio && customStartDate) setDataInicio(customStartDate);
      if (setDataFim && customEndDate) setDataFim(customEndDate);
    }
  };

  // Aplicar datas quando o usuário selecionar
  const handleCustomDateApply = () => {
    if (setDataInicio) setDataInicio(customStartDate);
    if (setDataFim) setDataFim(customEndDate);
    setShowCustomDatePicker(false);
  };

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
        // Valores normalizados em BRL para altura das barras (USD * cotação)
        aportes_usd_normalizado: dados.aportes_usd * cotacaoUSD,
        liquidacoes: -dados.liquidacoes_brl,
        liquidacoes_usd: -dados.liquidacoes_usd,
        liquidacoes_usd_normalizado: -dados.liquidacoes_usd * cotacaoUSD,
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
  }, [transacoesFiltradas, periodo, cotacaoUSD]);

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
        // Valores normalizados em BRL para altura das barras (USD * cotação)
        depositos_usd_normalizado: dados.depositos_usd * cotacaoUSD,
        saques: dados.saques_brl,
        saques_usd: dados.saques_usd,
        saques_usd_normalizado: dados.saques_usd * cotacaoUSD,
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
  }, [transacoesFiltradas, periodo, cotacaoUSD]);

  const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatUSD = (value: number) => formatCurrency(value, "USD");

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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={periodo === "dia" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodoChange("dia")}
              className="h-7 px-3 text-xs"
            >
              Diário
            </Button>
            <Button
              variant={periodo === "semana" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodoChange("semana")}
              className="h-7 px-3 text-xs"
            >
              Semanal
            </Button>
            <Button
              variant={periodo === "mes" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodoChange("mes")}
              className="h-7 px-3 text-xs"
            >
              Mensal
            </Button>
            <Popover open={showCustomDatePicker} onOpenChange={setShowCustomDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  variant={periodo === "customizado" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePeriodoChange("customizado")}
                  className="h-7 px-3 text-xs gap-1"
                >
                  <CalendarIcon className="h-3 w-3" />
                  Customizado
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="end">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Data Início</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal text-xs h-8",
                              !customStartDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {customStartDate ? format(customStartDate, "dd/MM/yyyy") : "Selecione"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customStartDate}
                            onSelect={setCustomStartDate}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Data Fim</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal text-xs h-8",
                              !customEndDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {customEndDate ? format(customEndDate, "dd/MM/yyyy") : "Selecione"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customEndDate}
                            onSelect={setCustomEndDate}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Button 
                    onClick={handleCustomDateApply} 
                    size="sm" 
                    className="w-full"
                    disabled={!customStartDate || !customEndDate}
                  >
                    Aplicar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs defaultValue="fluxo" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fluxo" className="gap-1 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Fluxo de Caixa</span>
              <span className="sm:hidden">Fluxo</span>
              <TabHelp text="Representa o fluxo financeiro efetivo da operação. Aqui são exibidos apenas movimentos de caixa: depósitos enviados às bookmakers e saques recebidos delas. Não considera variações internas de saldo." />
            </TabsTrigger>
            <TabsTrigger value="externo" className="gap-1 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Capital Externo</span>
              <span className="sm:hidden">Externo</span>
              <TabHelp text="Fluxo de capital com investidores. Aportes (entrada de capital) e liquidações (retorno de capital ou lucros)." />
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

            {/* Gráfico com 4 séries: BRL e USD separados */}
            {dadosCapitalExterno.dados.length > 0 ? (
              <ModernBarChart
                data={dadosCapitalExterno.dados}
                categoryKey="periodo"
                hideYAxisTicks={dadosCapitalExterno.hasUSD}
                bars={[
                  { 
                    dataKey: "aportes", 
                    label: "Aportes BRL", 
                    gradientStart: "#22C55E", 
                    gradientEnd: "#16A34A",
                    currency: "BRL",
                  },
                  { 
                    // Usa valor normalizado para altura da barra
                    dataKey: "aportes_usd_normalizado", 
                    label: "Aportes USD",
                    // Usa valor original em USD para o label
                    labelValueKey: "aportes_usd",
                    gradientStart: "#06B6D4", 
                    gradientEnd: "#0891B2",
                    currency: "USD",
                  },
                  { 
                    dataKey: "liquidacoes", 
                    label: "Liquidações BRL", 
                    gradientStart: "#F97316", 
                    gradientEnd: "#EA580C",
                    currency: "BRL",
                  },
                  { 
                    // Usa valor normalizado para altura da barra
                    dataKey: "liquidacoes_usd_normalizado", 
                    label: "Liquidações USD",
                    // Usa valor original em USD para o label
                    labelValueKey: "liquidacoes_usd",
                    gradientStart: "#EC4899", 
                    gradientEnd: "#DB2777",
                    currency: "USD",
                  },
                ]}
                height={300}
                barSize={24}
                showLabels={true}
                formatLabel={(value, ctx) => {
                  if (value === 0) return "";
                  // Use explicit currency from bar config
                  const currency = ctx?.currency;
                  const prefix = currency === "USD" ? "US$ " : "R$ ";
                  return prefix + Math.abs(Number(value)).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
                }}
                customTooltipContent={(payload, label) => {
                  const data = payload[0]?.payload;
                  const hasAnyUSD = (data?.aportes_usd || 0) > 0 || Math.abs(data?.liquidacoes_usd || 0) > 0;
                  
                  return (
                    <>
                      <p className="font-medium text-sm mb-2">{label}</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-emerald-500">Aportes BRL:</span>
                          <span className="font-mono">{formatCurrency(data?.aportes || 0)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-amber-500">Liquidações BRL:</span>
                          <span className="font-mono">{formatCurrency(Math.abs(data?.liquidacoes || 0))}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-cyan-500">Aportes USD:</span>
                          <span className="font-mono">{formatUSD(data?.aportes_usd || 0)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-pink-500">Liquidações USD:</span>
                          <span className="font-mono">{formatUSD(Math.abs(data?.liquidacoes_usd || 0))}</span>
                        </div>
                        <div className="border-t border-white/10 pt-1 mt-1 space-y-1">
                          <div className="flex justify-between gap-4 font-medium">
                            <span className={data?.liquido >= 0 ? "text-emerald-500" : "text-destructive"}>
                              Saldo BRL:
                            </span>
                            <span className="font-mono">{formatCurrency(data?.liquido || 0)}</span>
                          </div>
                          {hasAnyUSD && (
                            <div className="flex justify-between gap-4 font-medium">
                              <span className={data?.liquido_usd >= 0 ? "text-cyan-500" : "text-pink-500"}>
                                Saldo USD:
                              </span>
                              <span className="font-mono">{formatUSD(data?.liquido_usd || 0)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de investidores no período
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Quanto capital novo entrou (aportes) vs quanto foi devolvido (liquidações).
              {dadosCapitalExterno.hasUSD && " Barras em escala proporcional para comparação visual entre moedas."}
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

            {/* Gráfico com 4 séries: BRL e USD separados */}
            {dadosCapitalOperacao.dados.length > 0 ? (
              <ModernBarChart
                data={dadosCapitalOperacao.dados}
                categoryKey="periodo"
                hideYAxisTicks={dadosCapitalOperacao.hasUSD}
                bars={[
                  { 
                    dataKey: "depositos", 
                    label: "Depósitos BRL", 
                    gradientStart: "#3B82F6", 
                    gradientEnd: "#2563EB",
                    currency: "BRL",
                  },
                  { 
                    // Usa valor normalizado para altura da barra
                    dataKey: "depositos_usd_normalizado", 
                    label: "Depósitos USD",
                    // Usa valor original em USD para o label
                    labelValueKey: "depositos_usd",
                    gradientStart: "#06B6D4", 
                    gradientEnd: "#0891B2",
                    currency: "USD",
                  },
                  { 
                    dataKey: "saques", 
                    label: "Saques BRL", 
                    gradientStart: "#8B5CF6", 
                    gradientEnd: "#7C3AED",
                    currency: "BRL",
                  },
                  { 
                    // Usa valor normalizado para altura da barra
                    dataKey: "saques_usd_normalizado", 
                    label: "Saques USD",
                    // Usa valor original em USD para o label
                    labelValueKey: "saques_usd",
                    gradientStart: "#EC4899", 
                    gradientEnd: "#DB2777",
                    currency: "USD",
                  },
                ]}
                height={300}
                barSize={24}
                showLabels={true}
                formatLabel={(value, ctx) => {
                  if (value === 0) return "";
                  // Use explicit currency from bar config
                  const currency = ctx?.currency;
                  const prefix = currency === "USD" ? "US$ " : "R$ ";
                  return prefix + Math.abs(Number(value)).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
                }}
                customTooltipContent={(payload, label) => {
                  const data = payload[0]?.payload;
                  const hasAnyUSD = (data?.depositos_usd || 0) > 0 || (data?.saques_usd || 0) > 0;
                  
                  return (
                    <>
                      <p className="font-medium text-sm mb-2">{label}</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-blue-500">Depósitos BRL:</span>
                          <span className="font-mono">{formatCurrency(data?.depositos || 0)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-purple-500">Saques BRL:</span>
                          <span className="font-mono">{formatCurrency(data?.saques || 0)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-cyan-500">Depósitos USD:</span>
                          <span className="font-mono">{formatUSD(data?.depositos_usd || 0)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-pink-500">Saques USD:</span>
                          <span className="font-mono">{formatUSD(data?.saques_usd || 0)}</span>
                        </div>
                        <div className="border-t border-white/10 pt-1 mt-1 space-y-1">
                          <div className="flex justify-between gap-4 font-medium">
                            <span className={data?.alocacaoLiquida >= 0 ? "text-blue-500" : "text-purple-500"}>
                              Alocação Líquida BRL:
                            </span>
                            <span className="font-mono">{formatCurrency(data?.alocacaoLiquida || 0)}</span>
                          </div>
                          {hasAnyUSD && (
                            <div className="flex justify-between gap-4 font-medium">
                              <span className={data?.alocacaoLiquidaUSD >= 0 ? "text-cyan-500" : "text-pink-500"}>
                                Alocação Líquida USD:
                              </span>
                              <span className="font-mono">{formatUSD(data?.alocacaoLiquidaUSD || 0)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de bookmakers no período
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Fluxo financeiro efetivo.
              {dadosCapitalOperacao.hasUSD && " Barras em escala proporcional para comparação visual entre moedas."}
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
