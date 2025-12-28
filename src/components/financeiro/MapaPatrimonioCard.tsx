import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, HelpCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";

// Tipos para drill-down detalhado
export interface BookmakerPorProjeto {
  projetoId: string | null;
  projetoNome: string;
  saldo: number;
}

export interface ContaPorBanco {
  bancoNome: string;
  saldo: number;
  qtdContas: number;
}

export interface WalletPorExchange {
  exchange: string;
  saldoUsd: number;
}

export interface CaixaDetalhe {
  tipo: "BRL" | "USD" | "CRYPTO";
  nome: string;
  valor: number;
  valorBRL: number;
}

interface MapaPatrimonioCardProps {
  caixaOperacional: number;
  saldoBookmakers: number;
  saldoBookmakersBRL?: number;
  saldoBookmakersUSD?: number;
  contasParceiros: number;
  walletsCrypto: number;
  formatCurrency: (value: number, currency?: string) => string;
  // Dados detalhados para drill-down
  bookmakersPorProjeto?: BookmakerPorProjeto[];
  contasPorBanco?: ContaPorBanco[];
  walletsPorExchange?: WalletPorExchange[];
  caixaDetalhes?: CaixaDetalhe[];
  cotacaoUSD?: number;
}

export function MapaPatrimonioCard({
  caixaOperacional,
  saldoBookmakers,
  saldoBookmakersBRL = 0,
  saldoBookmakersUSD = 0,
  contasParceiros,
  walletsCrypto,
  formatCurrency,
  bookmakersPorProjeto = [],
  contasPorBanco = [],
  walletsPorExchange = [],
  caixaDetalhes = [],
  cotacaoUSD = 1,
}: MapaPatrimonioCardProps) {
  const hasBookmakersUSD = saldoBookmakersUSD > 0;
  const total = caixaOperacional + saldoBookmakers + contasParceiros + walletsCrypto;

  // Colors matching the reference pattern
  const colors = [
    "#3B82F6", // Blue - Caixa
    "#22C55E", // Green - Bookmakers
    "#F59E0B", // Amber - Contas Parceiros
    "#8B5CF6", // Violet - Wallets Crypto
  ];

  const rawData = [
    { name: "Caixa Operacional", value: caixaOperacional, key: "caixa" },
    { name: "Bookmakers", value: saldoBookmakers, key: "bookmakers" },
    { name: "Contas Parceiros", value: contasParceiros, key: "contas" },
    { name: "Wallets Crypto", value: walletsCrypto, key: "wallets" },
  ];

  // Filter out zero values and sort by value descending
  const data = rawData
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((d) => ({ ...d, color: colors[rawData.findIndex(r => r.name === d.name)] }));

  const donutData = data.map(d => ({
    name: d.name,
    value: d.value,
    color: d.color,
  }));

  // Componente de popover para Bookmakers
  const BookmakersPopover = () => {
    const [open, setOpen] = useState(false);
    
    // Agrupar por projeto
    const alocadosProjetos = bookmakersPorProjeto
      .filter(b => b.projetoId !== null && b.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);
    
    const naoAlocados = bookmakersPorProjeto
      .filter(b => b.projetoId === null)
      .reduce((acc, b) => acc + b.saldo, 0);
    
    const totalBookmakers = alocadosProjetos.reduce((acc, b) => acc + b.saldo, 0) + naoAlocados;
    
    if (bookmakersPorProjeto.length === 0) return null;
    
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <ChevronRight className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-3 border-b border-border/50">
            <p className="font-medium text-sm">Distribuição — Bookmakers</p>
            <p className="text-xs text-muted-foreground">Alocação por projeto</p>
          </div>
          <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
            {/* Projetos com saldo */}
            {alocadosProjetos.slice(0, 5).map((projeto) => {
              const percent = totalBookmakers > 0 ? (projeto.saldo / totalBookmakers) * 100 : 0;
              return (
                <div key={projeto.projetoId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate flex-1">{projeto.projetoNome}</span>
                    <span className="font-medium ml-2">{formatCurrency(projeto.saldo)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-success transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">
                      {percent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
            
            {/* Não alocado */}
            {naoAlocados > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Sem Projeto</span>
                  <span className="font-medium">{formatCurrency(naoAlocados)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-muted-foreground/50 transition-all duration-300"
                      style={{ width: `${totalBookmakers > 0 ? (naoAlocados / totalBookmakers) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-8 text-right">
                    {(totalBookmakers > 0 ? (naoAlocados / totalBookmakers) * 100 : 0).toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
            
            {alocadosProjetos.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center pt-2">
                +{alocadosProjetos.length - 5} projetos não exibidos
              </p>
            )}
          </div>
          <div className="p-3 border-t border-border/50 bg-muted/30">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Bookmakers</span>
              <span className="font-bold">{formatCurrency(totalBookmakers)}</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Componente de popover para Contas Parceiros
  const ContasPopover = () => {
    const [open, setOpen] = useState(false);
    
    const contasOrdenadas = [...contasPorBanco]
      .filter(c => c.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);
    
    const totalContas = contasOrdenadas.reduce((acc, c) => acc + c.saldo, 0);
    
    // Wallets com saldo
    const walletsComSaldo = walletsPorExchange.filter(w => w.saldoUsd > 0);
    const totalWalletsUSD = walletsComSaldo.reduce((acc, w) => acc + w.saldoUsd, 0);
    const totalWalletsBRL = totalWalletsUSD * cotacaoUSD;
    
    if (contasPorBanco.length === 0 && walletsPorExchange.length === 0) return null;
    
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <ChevronRight className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-3 border-b border-border/50">
            <p className="font-medium text-sm">Distribuição — Contas Parceiros</p>
            <p className="text-xs text-muted-foreground">Saldos por banco</p>
          </div>
          <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
            {/* Bancos */}
            {contasOrdenadas.slice(0, 5).map((conta, idx) => {
              const percent = totalContas > 0 ? (conta.saldo / totalContas) * 100 : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate flex-1">
                      {conta.bancoNome}
                      {conta.qtdContas > 1 && (
                        <span className="text-muted-foreground ml-1">({conta.qtdContas})</span>
                      )}
                    </span>
                    <span className="font-medium ml-2">{formatCurrency(conta.saldo)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">
                      {percent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
            
            {contasOrdenadas.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center">
                +{contasOrdenadas.length - 5} bancos não exibidos
              </p>
            )}
            
            {contasOrdenadas.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhuma conta com saldo
              </p>
            )}
          </div>
          <div className="p-3 border-t border-border/50 bg-muted/30">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Contas</span>
              <span className="font-bold">{formatCurrency(totalContas)}</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Componente de popover para Wallets Crypto
  const WalletsPopover = () => {
    const [open, setOpen] = useState(false);
    
    // Agrupar por exchange
    const walletsAgrupadas = walletsPorExchange
      .filter(w => w.saldoUsd > 0)
      .sort((a, b) => b.saldoUsd - a.saldoUsd);
    
    const totalWalletsUSD = walletsAgrupadas.reduce((acc, w) => acc + w.saldoUsd, 0);
    const totalWalletsBRL = totalWalletsUSD * cotacaoUSD;
    
    if (walletsPorExchange.length === 0) return null;
    
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <ChevronRight className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-3 border-b border-border/50">
            <p className="font-medium text-sm">Distribuição — Wallets Crypto</p>
            <p className="text-xs text-muted-foreground">Saldos por exchange/wallet</p>
          </div>
          <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
            {walletsAgrupadas.length > 0 ? (
              walletsAgrupadas.slice(0, 5).map((wallet, idx) => {
                const saldoBRL = wallet.saldoUsd * cotacaoUSD;
                const percent = totalWalletsUSD > 0 ? (wallet.saldoUsd / totalWalletsUSD) * 100 : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1">{wallet.exchange}</span>
                      <span className="font-medium ml-2">{formatCurrency(saldoBRL)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-violet-500 transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">
                        {percent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhuma wallet com saldo
              </p>
            )}
          </div>
          <div className="p-3 border-t border-border/50 bg-muted/30">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Wallets</span>
              <span className="font-bold">{formatCurrency(totalWalletsBRL)}</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Componente de popover para Caixa Operacional
  const CaixaPopover = () => {
    const [open, setOpen] = useState(false);
    
    const caixaOrdenado = [...caixaDetalhes]
      .filter(c => c.valorBRL > 0)
      .sort((a, b) => b.valorBRL - a.valorBRL);
    
    const totalCaixa = caixaOrdenado.reduce((acc, c) => acc + c.valorBRL, 0);
    
    if (caixaDetalhes.length === 0) return null;
    
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <ChevronRight className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-3 border-b border-border/50">
            <p className="font-medium text-sm">Distribuição — Caixa Operacional</p>
            <p className="text-xs text-muted-foreground">Composição por tipo de ativo</p>
          </div>
          <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
            {caixaOrdenado.length > 0 ? (
              caixaOrdenado.map((item, idx) => {
                const percent = totalCaixa > 0 ? (item.valorBRL / totalCaixa) * 100 : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1">
                        {item.nome}
                        {item.tipo !== "BRL" && item.valor > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({item.tipo === "USD" ? `$${item.valor.toFixed(2)}` : `${item.valor.toFixed(4)}`})
                          </span>
                        )}
                      </span>
                      <span className="font-medium ml-2">{formatCurrency(item.valorBRL)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">
                        {percent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                Caixa vazio
              </p>
            )}
          </div>
          <div className="p-3 border-t border-border/50 bg-muted/30">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Caixa</span>
              <span className="font-bold">{formatCurrency(totalCaixa)}</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Função para renderizar o popover correto baseado na categoria
  const renderPopover = (key: string) => {
    switch (key) {
      case "bookmakers":
        return bookmakersPorProjeto.length > 0 ? <BookmakersPopover /> : null;
      case "contas":
        return contasPorBanco.length > 0 ? <ContasPopover /> : null;
      case "wallets":
        return walletsPorExchange.length > 0 ? <WalletsPopover /> : null;
      case "caixa":
        return caixaDetalhes.length > 0 ? <CaixaPopover /> : null;
      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Mapa de Patrimônio
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                  <p className="font-medium mb-1">Mapa de Patrimônio</p>
                  <p>Distribuição do capital total:</p>
                  <p><strong>Caixa:</strong> BRL + USD + Crypto disponível</p>
                  <p><strong>Bookmakers:</strong> Capital em operação</p>
                  <p><strong>Contas Parceiros:</strong> Saldos em contas bancárias</p>
                  <p><strong>Wallets:</strong> Holdings em carteiras crypto</p>
                  <p className="mt-2 text-muted-foreground">
                    Clique em <ChevronRight className="h-3 w-3 inline" /> para ver detalhes
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 overflow-hidden">
        {/* Donut Chart */}
        <div className="h-[180px] overflow-hidden">
          <ModernDonutChart
            data={donutData}
            height={180}
            innerRadius={55}
            outerRadius={75}
            showLabels={false}
            centerValue={formatCurrency(total)}
            centerLabel="Total"
            formatValue={formatCurrency}
          />
        </div>

        {/* Legend with values - matching ComposicaoCustosCard exactly */}
        <div className="space-y-2">
          {data.map((item) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            const isBookmakers = item.key === "bookmakers";
            
            return (
              <div key={item.name} className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-sm truncate">{item.name}</span>
                      {renderPopover(item.key)}
                    </div>
                    <span className="text-sm font-bold ml-2">{formatCurrency(item.value)}</span>
                  </div>
                  {/* Breakdown BRL/USD para Bookmakers */}
                  {isBookmakers && hasBookmakersUSD && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>R$ {saldoBookmakersBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <span>•</span>
                      <span className="text-blue-400">$ {saldoBookmakersUSD.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} USD</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: item.color }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">
                      {percent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total footer */}
        <div className="pt-3 border-t border-border/50 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Patrimônio Total</p>
          <p className="text-lg font-bold">{formatCurrency(total)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
