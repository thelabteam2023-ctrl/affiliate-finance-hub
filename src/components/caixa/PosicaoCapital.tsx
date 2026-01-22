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
    let caixaBRLValue = 0;
    const caixaFiatDetails: Array<{ moeda: string; valorOriginal: number; valorBRL: number; symbol: string }> = [];
    let caixaOtherCurrenciesCount = 0;
    
    saldosFiat.forEach(sf => {
      if (sf.saldo === 0) return;
      
      if (sf.moeda === 'BRL') {
        caixaFiatBRL += sf.saldo;
        caixaBRLValue = sf.saldo;
        caixaFiatDetails.push({ 
          moeda: 'BRL', 
          valorOriginal: sf.saldo, 
          valorBRL: sf.saldo, 
          symbol: 'R$' 
        });
      } else {
        const valorBRL = convert(sf.saldo, sf.moeda, 'BRL');
        caixaFiatBRL += valorBRL;
        const symbol = getCurrencySymbol(sf.moeda);
        caixaFiatDetails.push({ 
          moeda: sf.moeda, 
          valorOriginal: sf.saldo, 
          valorBRL, 
          symbol 
        });
        caixaOtherCurrenciesCount++;
      }
    });
    
    // Adicionar crypto ao caixa
    const cryptoBRL = saldoCaixaCrypto * cotacaoUSD;
    const caixaTotal = caixaFiatBRL + cryptoBRL;
    
    // Adicionar crypto aos detalhes se existir
    if (saldoCaixaCrypto > 0) {
      caixaFiatDetails.push({
        moeda: 'CRYPTO',
        valorOriginal: saldoCaixaCrypto,
        valorBRL: cryptoBRL,
        symbol: '$'
      });
      caixaOtherCurrenciesCount++;
    }
    
    // Montar string resumida: "R$ X + N moedas"
    const caixaDetailStr = caixaBRLValue > 0 || caixaOtherCurrenciesCount > 0
      ? `R$ ${caixaBRLValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}${caixaOtherCurrenciesCount > 0 ? ` + ${caixaOtherCurrenciesCount} ${caixaOtherCurrenciesCount === 1 ? 'moeda' : 'moedas'}` : ''}`
      : 'Sem saldo';

    // Consolidar saldos de Bookmakers para BRL
    let bookmakersBRL = 0;
    let bookmakersBRLValue = 0;
    const bookmakersDetails: Array<{ moeda: string; valorOriginal: number; valorBRL: number; symbol: string }> = [];
    let bookmakersOtherCount = 0;
    
    saldosBookmakers.forEach(sb => {
      if (sb.saldo === 0) return;
      
      if (sb.moeda === 'BRL') {
        bookmakersBRL += sb.saldo;
        bookmakersBRLValue = sb.saldo;
        bookmakersDetails.push({ 
          moeda: 'BRL', 
          valorOriginal: sb.saldo, 
          valorBRL: sb.saldo, 
          symbol: 'R$' 
        });
      } else {
        const valorBRL = convert(sb.saldo, sb.moeda, 'BRL');
        bookmakersBRL += valorBRL;
        const symbol = getCurrencySymbol(sb.moeda);
        bookmakersDetails.push({ 
          moeda: sb.moeda, 
          valorOriginal: sb.saldo, 
          valorBRL, 
          symbol 
        });
        bookmakersOtherCount++;
      }
    });
    
    const bookmakersDetailStr = bookmakersDetails.length > 0
      ? `R$ ${bookmakersBRLValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}${bookmakersOtherCount > 0 ? ` + ${bookmakersOtherCount} ${bookmakersOtherCount === 1 ? 'moeda' : 'moedas'}` : ''}`
      : 'Em operação';

    // Wallets parceiros (já em USD → converter para BRL)
    const walletsTotal = saldoWalletsParceiros * cotacaoUSD;

    const dados = [
      { 
        name: "Caixa Operacional", 
        value: caixaTotal, 
        icon: Wallet,
        detail: caixaDetailStr,
        detailItems: caixaFiatDetails,
        help: "Saldo disponível no caixa central para uso imediato (FIAT + Crypto)"
      },
      { 
        name: "Bookmakers", 
        value: bookmakersBRL, 
        icon: Building2,
        detail: bookmakersDetailStr,
        detailItems: bookmakersDetails,
        help: "Capital alocado em casas de apostas para operações"
      },
      { 
        name: "Contas Parceiros", 
        value: saldoContasParceiros, 
        icon: CreditCard,
        detail: "Bancos",
        detailItems: [] as Array<{ moeda: string; valorOriginal: number; valorBRL: number; symbol: string }>,
        help: "Saldo em contas bancárias de parceiros disponível para movimentação"
      },
      { 
        name: "Wallets Parceiros", 
        value: walletsTotal, 
        icon: Coins,
        detail: `$${saldoWalletsParceiros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} USD`,
        detailItems: [{ moeda: 'USD', valorOriginal: saldoWalletsParceiros, valorBRL: walletsTotal, symbol: '$' }],
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
                      {item.detailItems.length > 1 ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground cursor-help hover:text-foreground transition-colors">
                                {item.detail}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[280px]">
                              <div className="space-y-1.5 py-1">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Composição por moeda:</p>
                                {item.detailItems.map((d, i) => (
                                  <div key={i} className="flex items-center justify-between gap-4 text-xs">
                                    <span className="font-medium">{d.moeda === 'CRYPTO' ? 'Crypto (USD)' : d.moeda}</span>
                                    <div className="text-right">
                                      <span className="font-mono">{d.symbol} {d.valorOriginal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                                      {d.moeda !== 'BRL' && (
                                        <span className="text-muted-foreground ml-1">
                                          (≈ R$ {d.valorBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">{item.detail}</span>
                      )}
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
