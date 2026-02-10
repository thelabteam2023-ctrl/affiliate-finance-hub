import { useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { format, isWithinInterval, subDays } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowRightLeft, AlertCircle, Building2, Users, HelpCircle, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCotacoes } from "@/hooks/useCotacoes";
import { getCurrencySymbol } from "@/types/currency";
import { formatCurrencyCompact } from "@/utils/formatCurrency";

// Helper para comparar objetos de cotações por valor (evita re-renders desnecessários)
function areCotacoesEqual(prev: Record<string, number>, next: Record<string, number>): boolean {
  const keys = Object.keys(prev);
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every(key => Math.abs(prev[key] - next[key]) < 0.0001);
}

// Moedas suportadas e suas configurações de cor
const CURRENCY_CONFIG: Record<string, { 
  depositGradient: [string, string]; 
  saqueGradient: [string, string];
  depositColor: string;
  saqueColor: string;
}> = {
  BRL: { 
    depositGradient: ["#3B82F6", "#2563EB"], 
    saqueGradient: ["#8B5CF6", "#7C3AED"],
    depositColor: "text-blue-500",
    saqueColor: "text-purple-500",
  },
  USD: { 
    depositGradient: ["#06B6D4", "#0891B2"], 
    saqueGradient: ["#EC4899", "#DB2777"],
    depositColor: "text-cyan-500",
    saqueColor: "text-pink-500",
  },
  EUR: { 
    depositGradient: ["#10B981", "#059669"], 
    saqueGradient: ["#F59E0B", "#D97706"],
    depositColor: "text-emerald-500",
    saqueColor: "text-amber-500",
  },
  GBP: { 
    depositGradient: ["#6366F1", "#4F46E5"], 
    saqueGradient: ["#EF4444", "#DC2626"],
    depositColor: "text-indigo-500",
    saqueColor: "text-red-500",
  },
  MXN: { 
    depositGradient: ["#14B8A6", "#0D9488"], 
    saqueGradient: ["#F97316", "#EA580C"],
    depositColor: "text-teal-500",
    saqueColor: "text-orange-500",
  },
  MYR: { 
    depositGradient: ["#8B5CF6", "#7C3AED"], 
    saqueGradient: ["#A855F7", "#9333EA"],
    depositColor: "text-violet-500",
    saqueColor: "text-purple-500",
  },
  ARS: { 
    depositGradient: ["#22C55E", "#16A34A"], 
    saqueGradient: ["#84CC16", "#65A30D"],
    depositColor: "text-green-500",
    saqueColor: "text-lime-500",
  },
  COP: { 
    depositGradient: ["#0EA5E9", "#0284C7"], 
    saqueGradient: ["#38BDF8", "#0EA5E9"],
    depositColor: "text-sky-500",
    saqueColor: "text-sky-400",
  },
};

const SUPPORTED_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP"] as const;
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

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
  
  // Buscar todas as cotações para normalizar as barras do gráfico
  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMXN, cotacaoMYR, cotacaoARS, cotacaoCOP } = useCotacoes();
  
  // ESTABILIZAÇÃO: Usar ref para armazenar cotações e só atualizar se valores mudarem significativamente
  // Isso evita re-renders do gráfico quando cotações flutuam minimamente
  const cotacoesRef = useRef<Record<SupportedCurrency, number>>({
    BRL: 1,
    USD: cotacaoUSD,
    EUR: cotacaoEUR,
    GBP: cotacaoGBP,
    MXN: cotacaoMXN,
    MYR: cotacaoMYR,
    ARS: cotacaoARS,
    COP: cotacaoCOP,
  });
  
  // Mapa de cotações estável - só atualiza se houver mudança real nos valores
  const cotacoes: Record<SupportedCurrency, number> = useMemo(() => {
    const newCotacoes: Record<SupportedCurrency, number> = {
      BRL: 1,
      USD: cotacaoUSD,
      EUR: cotacaoEUR,
      GBP: cotacaoGBP,
      MXN: cotacaoMXN,
      MYR: cotacaoMYR,
      ARS: cotacaoARS,
      COP: cotacaoCOP,
    };
    
    // Comparar por valor, não por referência
    if (areCotacoesEqual(cotacoesRef.current, newCotacoes)) {
      return cotacoesRef.current; // Retornar mesma referência se valores iguais
    }
    
    // Atualizar ref e retornar novo objeto
    cotacoesRef.current = newCotacoes;
    return newCotacoes;
  }, [cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMXN, cotacaoMYR, cotacaoARS, cotacaoCOP]);

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
      const dataTransacao = parseLocalDate(t.data_transacao);
      if (dataInicio && dataFim) {
        return isWithinInterval(dataTransacao, { start: dataInicio, end: dataFim });
      }
      if (dataInicio) return dataTransacao >= dataInicio;
      if (dataFim) return dataTransacao <= dataFim;
      return true;
    });
  }, [transacoes, dataInicio, dataFim]);

  // 1. Fluxo de Capital Externo (Investidores)
  // REGRA: Suporta todas as 8 moedas, CRYPTO = USD
  type GrupoDataExterno = {
    aportes: Record<SupportedCurrency, number>;
    liquidacoes: Record<SupportedCurrency, number>;
    transacoes: Transacao[];
  };
  
  const dadosCapitalExternoBase = useMemo(() => {
    const agrupamentos: Map<string, GrupoDataExterno> = new Map();
    
    // Inicializar objeto vazio para cada moeda
    const emptyTotals = (): Record<SupportedCurrency, number> => 
      SUPPORTED_CURRENCIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<SupportedCurrency, number>);

    transacoesFiltradas.forEach((t) => {
      if (t.tipo_transacao !== "APORTE_FINANCEIRO") return;
      
      const data = parseLocalDate(t.data_transacao);
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
        agrupamentos.set(chave, { 
          aportes: emptyTotals(), 
          liquidacoes: emptyTotals(), 
          transacoes: [] 
        });
      }

      const grupo = agrupamentos.get(chave)!;
      grupo.transacoes.push(t);
      
      // Determinar moeda: CRYPTO = USD, FIAT = moeda nativa
      const isCrypto = t.tipo_moeda === "CRYPTO";
      let moeda: SupportedCurrency = isCrypto ? "USD" : (t.moeda as SupportedCurrency);
      
      // Fallback para BRL se moeda não reconhecida
      if (!SUPPORTED_CURRENCIES.includes(moeda)) {
        moeda = "BRL";
      }
      
      const valor = isCrypto ? (t.valor_usd || 0) : t.valor;

      // Aporte: Investidor → Caixa
      if (t.destino_tipo === "CAIXA_OPERACIONAL") {
        grupo.aportes[moeda] += valor;
      }
      // Liquidação: Caixa → Investidor
      if (t.origem_tipo === "CAIXA_OPERACIONAL") {
        grupo.liquidacoes[moeda] += valor;
      }
    });

    // Calcular dados para o gráfico (SEM cotações - apenas valores nativos)
    // IMPORTANTE: Cotações NÃO devem ser dependência deste useMemo
    // para evitar re-render do gráfico quando taxas atualizam.
    // A normalização visual é feita separadamente.
    const dados = Array.from(agrupamentos.entries())
      .map(([chave, grupo]) => {
        const result: Record<string, any> = {
          periodo: chave,
          transacoes: grupo.transacoes,
        };
        
        // Para cada moeda, adicionar valores reais (sem normalização aqui)
        SUPPORTED_CURRENCIES.forEach(currency => {
          const key = currency.toLowerCase();
          
          // Valores reais na moeda nativa
          result[`aportes_${key}`] = grupo.aportes[currency];
          result[`liquidacoes_${key}`] = grupo.liquidacoes[currency];
          
          // Líquido por moeda
          result[`liquido_${key}`] = grupo.aportes[currency] - grupo.liquidacoes[currency];
        });
        
        return result;
      });

    // Calcular totais por moeda
    type CurrencyTotalsExterno = Record<SupportedCurrency, { aportes: number; liquidacoes: number }>;
    const totais: CurrencyTotalsExterno = SUPPORTED_CURRENCIES.reduce((acc, currency) => {
      const key = currency.toLowerCase();
      acc[currency] = {
        aportes: dados.reduce((sum, d) => sum + (d[`aportes_${key}`] || 0), 0),
        liquidacoes: dados.reduce((sum, d) => sum + (d[`liquidacoes_${key}`] || 0), 0),
      };
      return acc;
    }, {} as CurrencyTotalsExterno);

    // Detectar quais moedas têm movimentação
    const moedasAtivas = SUPPORTED_CURRENCIES.filter(currency => 
      totais[currency].aportes > 0 || totais[currency].liquidacoes > 0
    );

    return { 
      dadosBase: dados, // Dados estáveis sem normalização
      totais,
      moedasAtivas,
      // Compatibilidade com código legado
      totalAportes: totais.BRL.aportes, 
      totalAportesUSD: totais.USD.aportes,
      totalLiquidacoes: totais.BRL.liquidacoes,
      totalLiquidacoesUSD: totais.USD.liquidacoes,
      liquido: totais.BRL.aportes - totais.BRL.liquidacoes,
      liquidoUSD: totais.USD.aportes - totais.USD.liquidacoes,
      hasUSD: totais.USD.aportes > 0 || totais.USD.liquidacoes > 0,
      hasMultipleCurrencies: moedasAtivas.length > 1,
    };
  }, [transacoesFiltradas, periodo]);

  // Normalização separada para renderização do gráfico
  // ARQUITETURA: Dados base são estáveis. Normalização pode mudar com cotações
  // mas é aplicada em tempo de renderização, não afetando re-fetches.
  const dadosCapitalExternoNormalizados = useMemo(() => {
    return dadosCapitalExternoBase.dadosBase.map(item => {
      const result = { ...item };
      SUPPORTED_CURRENCIES.forEach(currency => {
        const key = currency.toLowerCase();
        const cotacao = cotacoes[currency];
        // Adicionar valores normalizados para escala visual
        result[`aportes_${key}_norm`] = (item[`aportes_${key}`] || 0) * cotacao;
        result[`liquidacoes_${key}_norm`] = (item[`liquidacoes_${key}`] || 0) * cotacao;
      });
      return result;
    });
  }, [dadosCapitalExternoBase.dadosBase, cotacoes]);

  // Objeto final para uso nos componentes
  const dadosCapitalExterno = useMemo(() => ({
    ...dadosCapitalExternoBase,
    dados: dadosCapitalExternoNormalizados,
  }), [dadosCapitalExternoBase, dadosCapitalExternoNormalizados]);

  // 2. Capital Alocado em Operação (Bookmakers)
  // REGRA: Suporta todas as 8 moedas, CRYPTO = USD
  type CurrencyTotals = Record<SupportedCurrency, { depositos: number; saques: number }>;
  
  const dadosCapitalOperacaoBase = useMemo(() => {
    // Tipo para agrupamento por período
    type GrupoData = {
      depositos: Record<SupportedCurrency, number>;
      saques: Record<SupportedCurrency, number>;
      transacoes: Transacao[];
    };
    
    const agrupamentos: Map<string, GrupoData> = new Map();
    
    // Inicializar objeto vazio para cada moeda
    const emptyTotals = (): Record<SupportedCurrency, number> => 
      SUPPORTED_CURRENCIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<SupportedCurrency, number>);

    transacoesFiltradas.forEach((t) => {
      if (t.tipo_transacao !== "DEPOSITO" && t.tipo_transacao !== "SAQUE") return;
      
      const data = parseLocalDate(t.data_transacao);
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
        agrupamentos.set(chave, { 
          depositos: emptyTotals(), 
          saques: emptyTotals(), 
          transacoes: [] 
        });
      }

      const grupo = agrupamentos.get(chave)!;
      grupo.transacoes.push(t);
      
      // Determinar moeda: CRYPTO = USD, FIAT = moeda nativa
      const isCrypto = t.tipo_moeda === "CRYPTO";
      let moeda: SupportedCurrency = isCrypto ? "USD" : (t.moeda as SupportedCurrency);
      
      // Fallback para BRL se moeda não reconhecida
      if (!SUPPORTED_CURRENCIES.includes(moeda)) {
        moeda = "BRL";
      }
      
      const valor = isCrypto ? (t.valor_usd || 0) : t.valor;

      if (t.tipo_transacao === "DEPOSITO") {
        grupo.depositos[moeda] += valor;
      } else if (t.tipo_transacao === "SAQUE") {
        grupo.saques[moeda] += valor;
      }
    });

    // Calcular dados para o gráfico (SEM cotações - apenas valores nativos)
    // IMPORTANTE: Cotações NÃO devem ser dependência deste useMemo
    // para evitar re-render do gráfico quando taxas atualizam.
    const dados = Array.from(agrupamentos.entries())
      .map(([chave, grupo]) => {
        const result: Record<string, any> = {
          periodo: chave,
          transacoes: grupo.transacoes,
        };
        
        // Para cada moeda, adicionar valores reais (sem normalização aqui)
        SUPPORTED_CURRENCIES.forEach(currency => {
          // Valores reais na moeda nativa
          result[`depositos_${currency.toLowerCase()}`] = grupo.depositos[currency];
          result[`saques_${currency.toLowerCase()}`] = grupo.saques[currency];
          
          // Alocação líquida por moeda
          result[`alocacao_${currency.toLowerCase()}`] = grupo.depositos[currency] - grupo.saques[currency];
        });
        
        return result;
      });

    // Calcular totais por moeda
    const totais: CurrencyTotals = SUPPORTED_CURRENCIES.reduce((acc, currency) => {
      const key = currency.toLowerCase();
      acc[currency] = {
        depositos: dados.reduce((sum, d) => sum + (d[`depositos_${key}`] || 0), 0),
        saques: dados.reduce((sum, d) => sum + (d[`saques_${key}`] || 0), 0),
      };
      return acc;
    }, {} as CurrencyTotals);

    // Detectar quais moedas têm movimentação
    const moedasAtivas = SUPPORTED_CURRENCIES.filter(currency => 
      totais[currency].depositos > 0 || totais[currency].saques > 0
    );

    return { 
      dadosBase: dados, // Dados estáveis sem normalização
      totais,
      moedasAtivas,
      // Compatibilidade com código legado
      totalDepositos: totais.BRL.depositos,
      totalDepositosUSD: totais.USD.depositos,
      totalSaques: totais.BRL.saques,
      totalSaquesUSD: totais.USD.saques,
      alocacaoLiquida: totais.BRL.depositos - totais.BRL.saques,
      alocacaoLiquidaUSD: totais.USD.depositos - totais.USD.saques,
      hasUSD: totais.USD.depositos > 0 || totais.USD.saques > 0,
      hasMultipleCurrencies: moedasAtivas.length > 1,
    };
  }, [transacoesFiltradas, periodo]);

  // Normalização separada para renderização do gráfico de Capital Operação
  const dadosCapitalOperacaoNormalizados = useMemo(() => {
    return dadosCapitalOperacaoBase.dadosBase.map(item => {
      const result = { ...item };
      SUPPORTED_CURRENCIES.forEach(currency => {
        const key = currency.toLowerCase();
        const cotacao = cotacoes[currency];
        // Adicionar valores normalizados para escala visual
        result[`depositos_${key}_norm`] = (item[`depositos_${key}`] || 0) * cotacao;
        result[`saques_${key}_norm`] = (item[`saques_${key}`] || 0) * cotacao;
      });
      return result;
    });
  }, [dadosCapitalOperacaoBase.dadosBase, cotacoes]);

  // Objeto final para uso nos componentes
  const dadosCapitalOperacao = useMemo(() => ({
    ...dadosCapitalOperacaoBase,
    dados: dadosCapitalOperacaoNormalizados,
  }), [dadosCapitalOperacaoBase, dadosCapitalOperacaoNormalizados]);

  // Formatador de moeda dinâmico
  const formatCurrencyValue = (value: number, currency: string = "BRL") => {
    const upper = currency.toUpperCase();
    const symbol = getCurrencySymbol(upper);
    
    // Usar Intl para moedas padrão, símbolo manual para outras
    const standardCurrencies = ["BRL", "USD", "EUR", "GBP"];
    
    if (standardCurrencies.includes(upper)) {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: upper,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    
    // Para moedas não padrão, usar símbolo manual
    return `${symbol} ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  };

  // Alias para compatibilidade
  const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => formatCurrencyValue(value, currency);
  const formatUSD = (value: number) => formatCurrencyValue(value, "USD");

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
          {/* forceMount mantém o componente no DOM; data-[state=inactive]:hidden esconde visualmente */}
          <TabsContent value="externo" className="mt-4 space-y-4 data-[state=inactive]:hidden" forceMount>
            {/* KPIs Multi-moeda */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
                <div className="flex items-center gap-2 text-emerald-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Aportes</span>
                  <KpiHelp text="Total de capital recebido de investidores no período selecionado" />
                </div>
                <div className="space-y-1">
                  {dadosCapitalExterno.moedasAtivas.length === 0 ? (
                    <span className="text-lg font-bold text-muted-foreground font-mono">R$ 0</span>
                  ) : (
                    dadosCapitalExterno.moedasAtivas.map((currency, idx) => {
                      const total = dadosCapitalExterno.totais[currency]?.aportes || 0;
                      if (total <= 0) return null;
                      return (
                        <div key={currency} className={cn("font-mono", idx === 0 ? "text-lg font-bold text-emerald-400" : "text-sm text-emerald-300/80")}>
                          {formatCurrencyValue(total, currency)}
                        </div>
                      );
                    })
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
                  {dadosCapitalExterno.moedasAtivas.length === 0 ? (
                    <span className="text-lg font-bold text-muted-foreground font-mono">R$ 0</span>
                  ) : (
                    dadosCapitalExterno.moedasAtivas.map((currency, idx) => {
                      const total = dadosCapitalExterno.totais[currency]?.liquidacoes || 0;
                      if (total <= 0) return null;
                      return (
                        <div key={currency} className={cn("font-mono", idx === 0 ? "text-lg font-bold text-amber-400" : "text-sm text-amber-300/80")}>
                          {formatCurrencyValue(total, currency)}
                        </div>
                      );
                    })
                  )}
                  {/* Mostrar zero se não houver liquidações */}
                  {dadosCapitalExterno.moedasAtivas.every(c => (dadosCapitalExterno.totais[c]?.liquidacoes || 0) <= 0) && (
                    <span className="text-lg font-bold text-muted-foreground font-mono">R$ 0</span>
                  )}
                </div>
              </div>
              <div className={`rounded-lg p-3 border ${
                (dadosCapitalExterno.totais.BRL?.aportes || 0) - (dadosCapitalExterno.totais.BRL?.liquidacoes || 0) >= 0 
                  ? "bg-emerald-500/10 border-emerald-500/20" 
                  : "bg-destructive/10 border-destructive/20"
              }`}>
                <div className={`flex items-center gap-2 mb-1 ${
                  (dadosCapitalExterno.totais.BRL?.aportes || 0) - (dadosCapitalExterno.totais.BRL?.liquidacoes || 0) >= 0 ? "text-emerald-500" : "text-destructive"
                }`}>
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saldo Líquido</span>
                  <KpiHelp text="Diferença entre aportes e liquidações. Positivo = mais capital entrando" />
                </div>
                <div className="space-y-1">
                  {dadosCapitalExterno.moedasAtivas.length === 0 ? (
                    <span className="text-lg font-bold text-muted-foreground font-mono">R$ 0</span>
                  ) : (
                    dadosCapitalExterno.moedasAtivas.map((currency, idx) => {
                      const aportes = dadosCapitalExterno.totais[currency]?.aportes || 0;
                      const liquidacoes = dadosCapitalExterno.totais[currency]?.liquidacoes || 0;
                      const liquido = aportes - liquidacoes;
                      if (aportes === 0 && liquidacoes === 0) return null;
                      return (
                        <div key={currency} className={cn(
                          "font-mono",
                          idx === 0 ? "text-lg font-bold" : "text-sm",
                          liquido >= 0 ? "text-emerald-400" : "text-destructive"
                        )}>
                          {liquido >= 0 ? "+" : ""}{formatCurrencyValue(liquido, currency)}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Gráfico dinâmico com barras para cada moeda ativa */}
            {dadosCapitalExterno.dados.length > 0 ? (
              <ModernBarChart
                data={dadosCapitalExterno.dados}
                categoryKey="periodo"
                disableAnimations
                hideYAxisTicks={dadosCapitalExterno.hasMultipleCurrencies}
                bars={dadosCapitalExterno.moedasAtivas.flatMap((currency) => {
                  const config = CURRENCY_CONFIG[currency];
                  const key = currency.toLowerCase();
                  return [
                    { 
                      dataKey: currency === "BRL" ? `aportes_brl` : `aportes_${key}_norm`, 
                      label: `Aportes ${currency}`,
                      labelValueKey: currency === "BRL" ? undefined : `aportes_${key}`,
                      gradientStart: config?.depositGradient[0] || "#22C55E", 
                      gradientEnd: config?.depositGradient[1] || "#16A34A",
                      currency: currency as any,
                    },
                    { 
                      dataKey: currency === "BRL" ? `liquidacoes_brl` : `liquidacoes_${key}_norm`, 
                      label: `Liquidações ${currency}`,
                      labelValueKey: currency === "BRL" ? undefined : `liquidacoes_${key}`,
                      gradientStart: config?.saqueGradient[0] || "#F97316", 
                      gradientEnd: config?.saqueGradient[1] || "#EA580C",
                      currency: currency as any,
                    },
                  ];
                })}
                height={300}
                barSize={24}
                showLabels={false}
                customTooltipContent={(payload, label) => {
                  const data = payload[0]?.payload;
                  
                  // Collect currencies with data
                  const currenciesWithData = dadosCapitalExterno.moedasAtivas.filter(currency => {
                    const key = currency.toLowerCase();
                    return (data?.[`aportes_${key}`] || 0) > 0 || (data?.[`liquidacoes_${key}`] || 0) > 0;
                  });
                  
                  if (currenciesWithData.length === 0) return <p className="text-sm text-muted-foreground">Sem dados</p>;
                  
                  return (
                    <>
                      <p className="font-medium text-sm mb-2">{label}</p>
                      {/* Header */}
                      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground uppercase font-medium mb-1.5">
                        <span></span>
                        <span className="text-right">Aportes</span>
                        <span className="text-right">Liquidações</span>
                        <span className="text-right">Delta</span>
                        <span className="text-right">Δ%</span>
                      </div>
                      {/* Rows per currency */}
                      {currenciesWithData.map(currency => {
                        const key = currency.toLowerCase();
                        const aportes = data?.[`aportes_${key}`] || 0;
                        const liquidacoes = data?.[`liquidacoes_${key}`] || 0;
                        const delta = aportes - liquidacoes;
                        const deltaPct = aportes > 0 ? (delta / aportes) * 100 : (delta !== 0 ? (delta > 0 ? 100 : -100) : 0);
                        const config = CURRENCY_CONFIG[currency];
                        const isBRL = currency === "BRL";
                        const aportesNorm = data?.[`aportes_${key}_norm`] || 0;
                        const liquidacoesNorm = data?.[`liquidacoes_${key}_norm`] || 0;
                        
                        return (
                          <div key={currency}>
                            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 items-center text-xs">
                              <span className={cn("font-semibold text-[11px]", config?.depositColor || "text-foreground")}>{currency}</span>
                              <span className="font-mono text-right">{formatCurrencyValue(aportes, currency)}</span>
                              <span className="font-mono text-right">{liquidacoes > 0 ? formatCurrencyValue(liquidacoes, currency) : "—"}</span>
                              <span className={cn("font-mono text-right font-medium", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                                {delta > 0 ? "+" : ""}{formatCurrencyValue(delta, currency)}
                              </span>
                              <span className={cn("font-mono text-right text-[10px]", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                                {delta > 0 ? "+" : ""}{deltaPct.toFixed(1)}%
                              </span>
                            </div>
                            {!isBRL && (
                              <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 text-[10px] text-muted-foreground/70">
                                <span></span>
                                <span className="text-right font-mono">≈ {formatCurrencyValue(aportesNorm, "BRL")}</span>
                                <span className="text-right font-mono">{liquidacoesNorm > 0 ? `≈ ${formatCurrencyValue(liquidacoesNorm, "BRL")}` : ""}</span>
                                <span></span>
                                <span></span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de investidores no período
              </div>
            )}

            {dadosCapitalExterno.hasMultipleCurrencies ? (
              <p className="text-xs text-muted-foreground text-center italic">
                Escala proporcional normalizada para comparação visual entre moedas. Os valores exibidos são reais; a altura das barras reflete equivalência em BRL.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Capital novo (aportes) vs devolvido (liquidações).
              </p>
            )}
          </TabsContent>

          {/* Aba 2: Fluxo de Caixa (Capital em Operação - Bookmakers) */}
          {/* forceMount mantém o componente no DOM; data-[state=inactive]:hidden esconde visualmente */}
          <TabsContent value="fluxo" className="mt-4 space-y-4 data-[state=inactive]:hidden" forceMount>
            {/* KPIs - Depósitos e Saques com todas as moedas ativas */}
            <div className="grid grid-cols-2 gap-4">
              {/* Card Depósitos */}
              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                <div className="flex items-center gap-2 text-blue-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Depósitos</span>
                  <KpiHelp text="Capital enviado às bookmakers no período selecionado" />
                </div>
                <div className="space-y-1">
                  {/* Moeda primária (BRL) */}
                  <span className="text-xl font-bold text-blue-400 font-mono">
                    {formatCurrencyValue(dadosCapitalOperacao.totais.BRL.depositos, "BRL")}
                  </span>
                  {/* Outras moedas com movimentação */}
                  {dadosCapitalOperacao.moedasAtivas
                    .filter(m => m !== "BRL" && dadosCapitalOperacao.totais[m].depositos > 0)
                    .map(moeda => (
                      <div key={moeda} className="text-sm font-mono text-muted-foreground">
                        + {formatCurrencyValue(dadosCapitalOperacao.totais[moeda].depositos, moeda)}
                      </div>
                    ))
                  }
                </div>
              </div>
              
              {/* Card Saques */}
              <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                <div className="flex items-center gap-2 text-purple-500 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">Saques</span>
                  <KpiHelp text="Capital retornado das bookmakers para o caixa no período" />
                </div>
                <div className="space-y-1">
                  {/* Moeda primária (BRL) */}
                  <span className="text-xl font-bold text-purple-400 font-mono">
                    {formatCurrencyValue(dadosCapitalOperacao.totais.BRL.saques, "BRL")}
                  </span>
                  {/* Outras moedas com movimentação */}
                  {dadosCapitalOperacao.moedasAtivas
                    .filter(m => m !== "BRL" && dadosCapitalOperacao.totais[m].saques > 0)
                    .map(moeda => (
                      <div key={moeda} className="text-sm font-mono text-muted-foreground">
                        + {formatCurrencyValue(dadosCapitalOperacao.totais[moeda].saques, moeda)}
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>

            {/* Gráfico com barras dinâmicas para cada moeda ativa */}
            {dadosCapitalOperacao.dados.length > 0 ? (
              <ModernBarChart
                data={dadosCapitalOperacao.dados}
                categoryKey="periodo"
                disableAnimations
                hideYAxisTicks={dadosCapitalOperacao.hasMultipleCurrencies}
                bars={
                  // Gerar barras dinamicamente baseado nas moedas ativas
                  dadosCapitalOperacao.moedasAtivas.flatMap(moeda => {
                    const config = CURRENCY_CONFIG[moeda];
                    const key = moeda.toLowerCase();
                    const hasDeposits = dadosCapitalOperacao.totais[moeda].depositos > 0;
                    const hasSaques = dadosCapitalOperacao.totais[moeda].saques > 0;
                    
                    const bars: Array<{
                      dataKey: string;
                      label: string;
                      labelValueKey?: string;
                      gradientStart: string;
                      gradientEnd: string;
                      currency: "BRL" | "USD" | "EUR" | "GBP" | "MXN" | "MYR" | "ARS" | "COP" | "none";
                    }> = [];
                    
                    if (hasDeposits) {
                      bars.push({
                        dataKey: moeda === "BRL" ? `depositos_${key}` : `depositos_${key}_norm`,
                        label: `Depósitos ${moeda}`,
                        labelValueKey: moeda !== "BRL" ? `depositos_${key}` : undefined,
                        gradientStart: config.depositGradient[0],
                        gradientEnd: config.depositGradient[1],
                        currency: moeda,
                      });
                    }
                    
                    if (hasSaques) {
                      bars.push({
                        dataKey: moeda === "BRL" ? `saques_${key}` : `saques_${key}_norm`,
                        label: `Saques ${moeda}`,
                        labelValueKey: moeda !== "BRL" ? `saques_${key}` : undefined,
                        gradientStart: config.saqueGradient[0],
                        gradientEnd: config.saqueGradient[1],
                        currency: moeda,
                      });
                    }
                    
                    return bars;
                  })
                }
                height={300}
                barSize={dadosCapitalOperacao.moedasAtivas.length > 2 ? 16 : 24}
                showLabels={false}
                customTooltipContent={(payload, label) => {
                  const data = payload[0]?.payload;
                  
                  const currenciesWithData = dadosCapitalOperacao.moedasAtivas.filter(moeda => {
                    const key = moeda.toLowerCase();
                    return (data?.[`depositos_${key}`] || 0) > 0 || (data?.[`saques_${key}`] || 0) > 0;
                  });
                  
                  if (currenciesWithData.length === 0) return <p className="text-sm text-muted-foreground">Sem dados</p>;
                  
                  return (
                    <>
                      <p className="font-medium text-sm mb-2">{label}</p>
                      {/* Header */}
                      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground uppercase font-medium mb-1.5">
                        <span></span>
                        <span className="text-right">Depósitos</span>
                        <span className="text-right">Saques</span>
                        <span className="text-right">Delta</span>
                        <span className="text-right">Δ%</span>
                      </div>
                      {/* Rows per currency */}
                      {currenciesWithData.map(moeda => {
                        const key = moeda.toLowerCase();
                        const depositos = data?.[`depositos_${key}`] || 0;
                        const saques = data?.[`saques_${key}`] || 0;
                        const delta = depositos - saques;
                        const deltaPct = depositos > 0 ? (delta / depositos) * 100 : (delta !== 0 ? (delta > 0 ? 100 : -100) : 0);
                        const config = CURRENCY_CONFIG[moeda];
                        const isBRL = moeda === "BRL";
                        const depositosNorm = data?.[`depositos_${key}_norm`] || 0;
                        const saquesNorm = data?.[`saques_${key}_norm`] || 0;
                        
                        return (
                          <div key={moeda}>
                            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 items-center text-xs">
                              <span className={cn("font-semibold text-[11px]", config?.depositColor || "text-foreground")}>{moeda}</span>
                              <span className="font-mono text-right">{formatCurrencyValue(depositos, moeda)}</span>
                              <span className="font-mono text-right">{saques > 0 ? formatCurrencyValue(saques, moeda) : "—"}</span>
                              <span className={cn("font-mono text-right font-medium", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                                {delta > 0 ? "+" : ""}{formatCurrencyValue(delta, moeda)}
                              </span>
                              <span className={cn("font-mono text-right text-[10px]", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                                {delta > 0 ? "+" : ""}{deltaPct.toFixed(1)}%
                              </span>
                            </div>
                            {!isBRL && (
                              <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 text-[10px] text-muted-foreground/70">
                                <span></span>
                                <span className="text-right font-mono">≈ {formatCurrencyValue(depositosNorm, "BRL")}</span>
                                <span className="text-right font-mono">{saquesNorm > 0 ? `≈ ${formatCurrencyValue(saquesNorm, "BRL")}` : ""}</span>
                                <span></span>
                                <span></span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                Nenhuma movimentação de bookmakers no período
              </div>
            )}

            {dadosCapitalOperacao.hasMultipleCurrencies ? (
              <p className="text-xs text-muted-foreground text-center italic">
                Escala proporcional normalizada para comparação visual entre moedas. Os valores exibidos são reais; a altura das barras reflete equivalência em BRL.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Fluxo financeiro efetivo: depósitos enviados e saques recebidos.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
