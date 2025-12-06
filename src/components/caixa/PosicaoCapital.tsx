import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import { PieChart as PieChartIcon, Wallet, Building2, Coins, CreditCard, HelpCircle } from "lucide-react";

interface PosicaoCapitalProps {
  saldoCaixaFiat: number;
  saldoCaixaCrypto: number;
  saldoBookmakers: number;
  saldoContasParceiros: number;
  saldoWalletsParceiros: number;
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
  saldoCaixaFiat,
  saldoCaixaCrypto,
  saldoBookmakers,
  saldoContasParceiros,
  saldoWalletsParceiros,
  cotacaoUSD,
}: PosicaoCapitalProps) {
  const dadosPosicao = useMemo(() => {
    // Converter tudo para BRL para visualização unificada
    const caixaTotal = saldoCaixaFiat + (saldoCaixaCrypto * cotacaoUSD);
    const walletsTotal = saldoWalletsParceiros * cotacaoUSD;
    
    const dados = [
      { 
        name: "Caixa Operacional", 
        value: caixaTotal, 
        icon: Wallet,
        detail: `R$ ${saldoCaixaFiat.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} + $${saldoCaixaCrypto.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} crypto`,
        help: "Saldo disponível no caixa central para uso imediato (FIAT + Crypto)"
      },
      { 
        name: "Bookmakers", 
        value: saldoBookmakers, 
        icon: Building2,
        detail: "Em operação",
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
        detail: `$${saldoWalletsParceiros.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} USD`,
        help: "Capital em carteiras crypto de parceiros"
      },
    ].filter(item => item.value > 0);

    const total = dados.reduce((sum, item) => sum + item.value, 0);
    
    return { dados, total };
  }, [saldoCaixaFiat, saldoCaixaCrypto, saldoBookmakers, saldoContasParceiros, saldoWalletsParceiros, cotacaoUSD]);

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

      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Pizza Moderno */}
          <div className="h-[280px]">
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
