import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import { PieChart as PieChartIcon, Wallet, Building2, Coins, CreditCard, HelpCircle, CheckCircle2, AlertTriangle } from "lucide-react";
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
  // Hook de conversão multi-moeda com fontes e status de dados
  const { convert, sources, cotacoes, dataSource, isUsingFallback } = useMultiCurrencyConversion();

  // Helper para obter info da fonte de uma moeda
  // IMPORTANTE: isOfficial agora considera se os dados vieram do banco (não é fallback real)
  const getSourceInfo = (moeda: string) => {
    const upper = moeda.toUpperCase();
    const sourceMap: Record<string, { source: any; cotacao: number }> = {
      USD: { source: sources?.usd, cotacao: cotacoes?.USD || 0 },
      EUR: { source: sources?.eur, cotacao: cotacoes?.EUR || 0 },
      GBP: { source: sources?.gbp, cotacao: cotacoes?.GBP || 0 },
      MXN: { source: sources?.mxn, cotacao: cotacoes?.MXN || 0 },
      MYR: { source: sources?.myr, cotacao: cotacoes?.MYR || 0 },
      ARS: { source: sources?.ars, cotacao: cotacoes?.ARS || 0 },
      COP: { source: sources?.cop, cotacao: cotacoes?.COP || 0 },
    };
    const info = sourceMap[upper];
    if (!info) return null;
    
    // Se dados vieram do banco/edge/localStorage, não é fallback real
    // Só é fallback se dataSource === 'fallback' (hardcoded)
    return {
      ...info,
      // Override: se não estamos usando fallback hardcoded, a fonte é confiável
      isRealFallback: isUsingFallback,
    };
  };

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
                            <TooltipContent side="bottom" className="max-w-[400px] p-3">
                              <div className="space-y-3">
                                <p className="text-xs font-medium text-muted-foreground">Composição por moeda:</p>
                                
                                {/* Grid de chips verticais - 2 por linha */}
                                <div className="grid grid-cols-2 gap-2">
                                  {item.detailItems.map((d, i) => {
                                    const sourceInfo = d.moeda !== 'BRL' && d.moeda !== 'CRYPTO' ? getSourceInfo(d.moeda) : null;
                                    // NOVA LÓGICA: só mostra ⚠️ se REALMENTE usando fallback hardcoded
                                    // Se veio do banco/edge/localStorage, é confiável mesmo que source diga "FALLBACK"
                                    const isRealFallback = sourceInfo?.isRealFallback === true;
                                    const isBRL = d.moeda === 'BRL';
                                    const isCrypto = d.moeda === 'CRYPTO';
                                    
                                    return (
                                      <div 
                                        key={i} 
                                        className="flex flex-col items-center justify-between min-w-[90px] max-w-[110px] p-2.5 rounded-lg bg-muted/50 border border-border/50"
                                      >
                                        {/* Linha 1: Código da moeda + ícone de status */}
                                        <div className="flex items-center gap-1 mb-1">
                                          {sourceInfo && (
                                            isRealFallback ? (
                                              <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                                            ) : (
                                              <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                                            )
                                          )}
                                          <span className="text-xs font-semibold text-foreground">
                                            {isCrypto ? 'CRYPTO' : d.moeda}
                                          </span>
                                        </div>
                                        
                                        {/* Linha 2: Cotação */}
                                        <div className="text-[10px] text-muted-foreground mb-1.5">
                                          {isBRL ? (
                                            <span>base</span>
                                          ) : isCrypto ? (
                                            <span>@USD</span>
                                          ) : sourceInfo?.cotacao ? (
                                            <span>@{sourceInfo.cotacao.toFixed(4)}</span>
                                          ) : (
                                            <span>—</span>
                                          )}
                                        </div>
                                        
                                        {/* Linha 3: Saldo nativo */}
                                        <div className="text-sm font-mono font-medium text-foreground text-center break-all leading-tight">
                                          {d.symbol} {d.valorOriginal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                        </div>
                                        
                                        {/* Linha 4: Aproximação em BRL */}
                                        {!isBRL && (
                                          <div className="text-[10px] text-muted-foreground mt-1 text-center">
                                            ≈ R$ {d.valorBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                
                                {/* Legenda */}
                                <div className="border-t border-border/50 pt-2">
                                  <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-2">
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3 text-success" /> Oficial
                                    </span>
                                    <span className="text-border">•</span>
                                    <span className="flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3 text-warning" /> Fallback
                                    </span>
                                  </p>
                                </div>
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
