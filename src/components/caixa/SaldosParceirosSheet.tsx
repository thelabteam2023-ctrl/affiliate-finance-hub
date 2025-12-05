import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Users, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";

interface SaldoContaParceiro {
  parceiro_id: string;
  parceiro_nome: string;
  banco: string;
  titular: string;
  moeda: string;
  saldo: number;
}

interface SaldoWalletParceiro {
  parceiro_id: string;
  parceiro_nome: string;
  exchange: string;
  endereco: string;
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface ParceiroSaldoAgrupado {
  parceiro_id: string;
  parceiro_nome: string;
  saldos_fiat: Array<{ moeda: string; saldo: number; banco: string }>;
  saldos_crypto: Array<{ coin: string; saldo_coin: number; saldo_usd: number; exchange: string }>;
  total_fiat_brl: number;
  total_crypto_usd: number;
}

export function SaldosParceirosSheet() {
  const [open, setOpen] = useState(false);
  const [parceirosAgrupados, setParceirosAgrupados] = useState<ParceiroSaldoAgrupado[]>([]);
  const [loading, setLoading] = useState(false);
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);

  const fetchCryptoPrices = async (coins: string[]) => {
    if (coins.length === 0) return {};
    
    try {
      setPricesLoading(true);
      const uniqueCoins = [...new Set(coins)];
      
      const { data, error } = await supabase.functions.invoke("get-crypto-prices", {
        body: { symbols: uniqueCoins },
      });

      if (error) throw error;
      
      setCryptoPrices(data.prices || {});
      setLastPriceUpdate(new Date());
      return data.prices || {};
    } catch (error) {
      console.error("Erro ao buscar preços crypto:", error);
      return {};
    } finally {
      setPricesLoading(false);
    }
  };

  const fetchSaldosParceiros = async () => {
    try {
      setLoading(true);

      const { data: saldosContas, error: contasError } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("*");

      if (contasError) throw contasError;

      const { data: saldosWallets, error: walletsError } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("*");

      if (walletsError) throw walletsError;

      // Extrair coins únicos para buscar preços
      const uniqueCoins = [...new Set(
        (saldosWallets as SaldoWalletParceiro[] || [])
          .filter(w => w.coin)
          .map(w => w.coin)
      )];

      // Buscar preços atualizados da Binance
      const prices = await fetchCryptoPrices(uniqueCoins);

      const parceirosMap = new Map<string, ParceiroSaldoAgrupado>();

      (saldosContas as SaldoContaParceiro[] || []).forEach((conta) => {
        if (!conta.parceiro_id || conta.saldo === 0) return;

        if (!parceirosMap.has(conta.parceiro_id)) {
          parceirosMap.set(conta.parceiro_id, {
            parceiro_id: conta.parceiro_id,
            parceiro_nome: conta.parceiro_nome || "Parceiro",
            saldos_fiat: [],
            saldos_crypto: [],
            total_fiat_brl: 0,
            total_crypto_usd: 0,
          });
        }

        const parceiro = parceirosMap.get(conta.parceiro_id)!;
        parceiro.saldos_fiat.push({
          moeda: conta.moeda || "BRL",
          saldo: conta.saldo,
          banco: conta.banco,
        });
        if (conta.moeda === "BRL") {
          parceiro.total_fiat_brl += conta.saldo;
        }
      });

      (saldosWallets as SaldoWalletParceiro[] || []).forEach((wallet) => {
        if (!wallet.parceiro_id || wallet.saldo_coin === 0) return;

        if (!parceirosMap.has(wallet.parceiro_id)) {
          parceirosMap.set(wallet.parceiro_id, {
            parceiro_id: wallet.parceiro_id,
            parceiro_nome: wallet.parceiro_nome || "Parceiro",
            saldos_fiat: [],
            saldos_crypto: [],
            total_fiat_brl: 0,
            total_crypto_usd: 0,
          });
        }

        // Calcular USD com preço atual da Binance
        const currentPrice = prices[wallet.coin] || 0;
        const saldoUsdAtualizado = wallet.saldo_coin * currentPrice;

        const parceiro = parceirosMap.get(wallet.parceiro_id)!;
        parceiro.saldos_crypto.push({
          coin: wallet.coin,
          saldo_coin: wallet.saldo_coin,
          saldo_usd: saldoUsdAtualizado,
          exchange: wallet.exchange || "Wallet",
        });
        parceiro.total_crypto_usd += saldoUsdAtualizado;
      });

      const parceirosComSaldo = Array.from(parceirosMap.values())
        .filter((p) => p.saldos_fiat.length > 0 || p.saldos_crypto.length > 0)
        .sort((a, b) => (a.total_fiat_brl + a.total_crypto_usd) - (b.total_fiat_brl + b.total_crypto_usd));

      setParceirosAgrupados(parceirosComSaldo);
    } catch (error) {
      console.error("Erro ao carregar saldos dos parceiros:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSaldosParceiros();
    }
  }, [open]);

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const totalParceiros = parceirosAgrupados.length;

  const FiatHoverContent = ({ saldos }: { saldos: ParceiroSaldoAgrupado["saldos_fiat"] }) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground border-b border-border/50 pb-1.5">Saldo por Banco</p>
      {saldos.map((s, idx) => (
        <div key={idx} className="flex justify-between items-center gap-3 text-sm">
          <span className="text-foreground truncate max-w-[150px]">{s.banco}</span>
          <span className="font-mono text-emerald-400 whitespace-nowrap">{formatCurrency(s.saldo, s.moeda)}</span>
        </div>
      ))}
    </div>
  );

  const CryptoHoverContent = ({ saldos }: { saldos: ParceiroSaldoAgrupado["saldos_crypto"] }) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground border-b border-border/50 pb-1.5">Saldo por Moeda</p>
      {saldos.map((s, idx) => (
        <div key={idx} className="flex justify-between items-center gap-3 text-sm">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground">{s.coin}</span>
              <span className="text-xs text-muted-foreground">• {s.exchange}</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {s.saldo_coin.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {s.coin}
            </span>
          </div>
          <span className="font-mono text-blue-400 whitespace-nowrap">{formatCurrency(s.saldo_usd, "USD")}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-border/50 hover:bg-accent/50"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Saldos Parceiros</span>
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Ver saldos por parceiro</p>
        </TooltipContent>
      </Tooltip>

      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Saldos por Parceiro
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : totalParceiros === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum parceiro com saldo disponível</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm text-muted-foreground">
                  {totalParceiros} parceiro{totalParceiros !== 1 ? "s" : ""} com capital
                </span>
                {lastPriceUpdate && (
                  <Badge variant="outline" className="text-xs gap-1 font-normal">
                    {pricesLoading ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Binance {formatTime(lastPriceUpdate)}
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-[calc(100vh-180px)]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="text-xs font-medium">Parceiro</TableHead>
                      <TableHead className="text-xs font-medium text-right">FIAT</TableHead>
                      <TableHead className="text-xs font-medium text-right">Crypto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parceirosAgrupados.map((parceiro, index) => (
                      <TableRow 
                        key={parceiro.parceiro_id} 
                        className={`border-border/30 ${index % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'}`}
                      >
                        <TableCell className="py-2.5 font-medium text-sm max-w-[140px] truncate">
                          {parceiro.parceiro_nome}
                        </TableCell>
                        
                        {/* FIAT Cell */}
                        <TableCell className="py-2.5 text-right">
                          {parceiro.saldos_fiat.length > 0 ? (
                            <HoverCard openDelay={100} closeDelay={50}>
                              <HoverCardTrigger asChild>
                                <button className="inline-flex items-center gap-1 text-emerald-400 font-mono text-sm hover:text-emerald-300 transition-colors cursor-pointer">
                                  {formatCurrency(parceiro.total_fiat_brl, "BRL")}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent align="end" className="w-72">
                                <FiatHoverContent saldos={parceiro.saldos_fiat} />
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>

                        {/* Crypto Cell */}
                        <TableCell className="py-2.5 text-right">
                          {parceiro.saldos_crypto.length > 0 ? (
                            <HoverCard openDelay={100} closeDelay={50}>
                              <HoverCardTrigger asChild>
                                <button className="inline-flex items-center gap-1 text-blue-400 font-mono text-sm hover:text-blue-300 transition-colors cursor-pointer">
                                  {formatCurrency(parceiro.total_crypto_usd, "USD")}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent align="end" className="w-72">
                                <CryptoHoverContent saldos={parceiro.saldos_crypto} />
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
