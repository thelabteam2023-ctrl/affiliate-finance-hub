import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import { PieChart as PieChartIcon, Wallet, Building2, Coins, CreditCard, HelpCircle } from "lucide-react";
import { useMultiCurrencyConversion } from "@/hooks/useMultiCurrencyConversion";
import { formatCurrencyValue, getCurrencySymbol } from "@/types/currency";

interface SaldoFiat {
  moeda: string;
  saldo: number;
}

interface SaldoBookmakerPorMoeda {
  moeda: string;
  saldo: number;
}

interface PosicaoCapitalProps {
  /** Saldos FIAT do caixa operacional (por moeda) */
  saldosFiat: SaldoFiat[];
  /** Saldo crypto do caixa em USD */
  saldoCaixaCrypto: number;
  /** Saldos de bookmakers por moeda */
  saldosBookmakers: SaldoBookmakerPorMoeda[];
  /** Saldo em contas bancárias de parceiros (BRL) */
  saldoContasParceiros: number;
  /** Saldo em wallets de parceiros (USD) */
  saldoWalletsParceiros: number;
  /** Cotação USD/BRL atual */
  cotacaoUSD: number;
}

// Modern gradient color pairs
const GRADIENT_COLORS = [
  ["#22C55E", "#16A34A"], // Caixa Operacional - emerald
  ["#3B82F6", "#2563EB"], // Bookmakers - blue
  ["#8B5CF6", "#7C3AED"], // Contas Parceiros - purple
  ["#F97316", "#EA580C"], // Wallets Crypto - orange
];

export function PosicaoCapital({
  saldosFiat,
  saldoCaixaCrypto,
  saldosBookmakers,
  saldoContasParceiros,
  saldoWalletsParceiros,
  cotacaoUSD,
}: PosicaoCapitalProps) {
  // Hook de conversão multi-moeda
  const { convert } = useMultiCurrencyConversion();

  const dadosPosicao = useMemo(() => {
    // Consolidar saldos FIAT do caixa para BRL
    let caixaFiatBRL = 0;
    const caixaFiatDetails: string[] = [];
    
    saldosFiat.forEach(sf => {
      if (sf.saldo === 0) return;
      
      if (sf.moeda === 'BRL') {
        caixaFiatBRL += sf.saldo;
        caixaFiatDetails.push(`R$ ${sf.saldo.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
      } else {
        // Converter para BRL usando hook
        const valorBRL = convert(sf.saldo, sf.moeda, 'BRL');
        caixaFiatBRL += valorBRL;
        const symbol = getCurrencySymbol(sf.moeda);
        caixaFiatDetails.push(`${symbol} ${sf.saldo.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
      }
    });
    
    // Adicionar crypto ao caixa
    const cryptoBRL = saldoCaixaCrypto * cotacaoUSD;
    const caixaTotal = caixaFiatBRL + cryptoBRL;
    
    // Montar detail string para caixa
    let caixaDetailStr = caixaFiatDetails.join(' + ');
    if (saldoCaixaCrypto > 0) {
      caixaDetailStr += (caixaDetailStr ? ' + ' : '') + `$${saldoCaixaCrypto.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} crypto`;
    }
    if (!caixaDetailStr) caixaDetailStr = 'Sem saldo';

    // Consolidar saldos de Bookmakers para BRL
    let bookmakersBRL = 0;
    const bookmakersDetails: string[] = [];
    
    saldosBookmakers.forEach(sb => {
      if (sb.saldo === 0) return;
      
      if (sb.moeda === 'BRL') {
        bookmakersBRL += sb.saldo;
        bookmakersDetails.push(`R$ ${sb.saldo.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
      } else {
        // Converter para BRL
        const valorBRL = convert(sb.saldo, sb.moeda, 'BRL');
        bookmakersBRL += valorBRL;
        const symbol = getCurrencySymbol(sb.moeda);
        bookmakersDetails.push(`${symbol} ${sb.saldo.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
      }
    });
    
    const bookmakersDetailStr = bookmakersDetails.length > 0 
      ? bookmakersDetails.join(' + ') 
      : 'Em operação';

    // Wallets parceiros (já em USD → converter para BRL)
    const walletsTotal = saldoWalletsParceiros * cotacaoUSD;

    const dados = [
      { 
        name: "Caixa Operacional", 
        value: caixaTotal, 
        icon: Wallet,
        detail: caixaDetailStr,
        help: "Saldo disponível no caixa central para uso imediato (FIAT + Crypto)"
      },
      { 
        name: "Bookmakers", 
        value: bookmakersBRL, 
        icon: Building2,
        detail: bookmakersDetailStr,
        help: "Capital alocado em casas de apostas para operações"
      },
      { 
        name: "Contas Parceiros", 
        value: saldoContasParceiros, 
        icon: CreditCard,
        detail: "Bancos",
        help: "Saldo em contas bancárias de parceiros disponível para movimentação"
      },
      { 
        name: "Wallets Parceiros", 
        value: walletsTotal, 
        icon: Coins,
        detail: `$${saldoWalletsParceiros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} USD`,
        help: "Capital em carteiras crypto de parceiros"
      },
    ].filter(item => item.value > 0);

    const total = dados.reduce((sum, item) => sum + item.value, 0);
    
    return { dados, total };
  }, [saldosFiat, saldoCaixaCrypto, saldosBookmakers, saldoContasParceiros, saldoWalletsParceiros, cotacaoUSD, convert]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Prepare data for modern donut chart
  const chartData = dadosPosicao.dados.map((item, index) => ({
    name: item.name,
    value: item.value,
    color: GRADIENT_COLORS[index]?.[0],
    detail: item.detail,
  }));

  const chartColors = GRADIENT_COLORS.slice(0, dadosPosicao.dados.length).map(pair => pair[0]);

  if (dadosPosicao.total === 0) {
    return null;
  }

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Posição de Capital
            </CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[280px] text-xs">
                  Mostra onde o patrimônio está distribuído. Todos os valores são convertidos para BRL usando a cotação atual.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Badge variant="outline" className="text-base font-mono">
            {formatCurrency(dadosPosicao.total)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Pizza Moderno */}
          <div className="h-[280px] overflow-hidden">
            <ModernDonutChart
              data={chartData}
              height={280}
              innerRadius={60}
              outerRadius={100}
              centerLabel="Total"
              centerValue={formatCurrency(dadosPosicao.total)}
              formatValue={formatCurrency}
              formatTooltip={(item, total) => {
                const percentual = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                const originalItem = dadosPosicao.dados.find(d => d.name === item.name);
                return (
                  <>
                    <p className="font-medium text-sm mb-1">{item.name}</p>
                    <div className="text-sm space-y-1">
                      <p className="font-mono text-lg">{formatCurrency(item.value)}</p>
                      <p className="text-muted-foreground">{percentual}% do patrimônio</p>
                      {originalItem && (
                        <p className="text-xs text-muted-foreground">{originalItem.detail}</p>
                      )}
                    </div>
                  </>
                );
              }}
            />
          </div>

          {/* Lista de Categorias */}
          <div className="space-y-3">
            {dadosPosicao.dados.map((item, index) => {
              const Icon = item.icon;
              const percentual = dadosPosicao.total > 0 
                ? ((item.value / dadosPosicao.total) * 100).toFixed(1) 
                : "0";
              
              return (
                <div 
                  key={item.name}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${GRADIENT_COLORS[index]?.[0]}20` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: GRADIENT_COLORS[index]?.[0] }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm">{item.name}</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px] text-xs">
                              {item.help}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-xs text-muted-foreground">{percentual}%</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">{item.detail}</span>
                      <span className="font-mono text-sm font-medium" style={{ color: GRADIENT_COLORS[index]?.[0] }}>
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
