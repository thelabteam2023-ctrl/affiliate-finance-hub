import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { PieChart as PieChartIcon, Wallet, Building2, Coins, CreditCard, HelpCircle } from "lucide-react";

interface PosicaoCapitalProps {
  saldoCaixaFiat: number;
  saldoCaixaCrypto: number;
  saldoBookmakers: number;
  saldoContasParceiros: number;
  saldoWalletsParceiros: number;
  cotacaoUSD: number;
}

const CORES = [
  "hsl(142, 76%, 36%)", // Caixa Operacional - emerald
  "hsl(217, 91%, 60%)", // Bookmakers - blue
  "hsl(262, 83%, 58%)", // Contas Parceiros - purple
  "hsl(25, 95%, 53%)",  // Wallets Crypto - orange
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

  const tooltipStyle = {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(12px)",
    borderRadius: "12px",
    padding: "12px 16px",
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentual = dadosPosicao.total > 0 
        ? ((data.value / dadosPosicao.total) * 100).toFixed(1) 
        : "0";
      
      return (
        <div style={tooltipStyle}>
          <p className="font-medium text-sm mb-1">{data.name}</p>
          <div className="text-sm space-y-1">
            <p className="font-mono text-lg">{formatCurrency(data.value)}</p>
            <p className="text-muted-foreground">{percentual}% do patrimônio</p>
            <p className="text-xs text-muted-foreground">{data.detail}</p>
          </div>
        </div>
      );
    }
    return null;
  };

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
          {/* Gráfico de Pizza */}
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dadosPosicao.dados}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="transparent"
                >
                  {dadosPosicao.dados.map((_, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CORES[index % CORES.length]}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
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
                    style={{ backgroundColor: `${CORES[index]}20` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: CORES[index] }} />
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
                      <span className="font-mono text-sm font-medium" style={{ color: CORES[index] }}>
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
