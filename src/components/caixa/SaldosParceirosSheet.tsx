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
import { FIAT_CURRENCIES, CURRENCY_SYMBOLS } from "@/types/currency";

// Multi-currency type
type SaldosPorMoeda = Record<string, number>;

// Lista de moedas FIAT suportadas
const SUPPORTED_FIAT: string[] = FIAT_CURRENCIES.map(c => c.value);

// Helper para criar objeto de saldos vazio
function createEmptySaldos(): SaldosPorMoeda {
  const saldos: SaldosPorMoeda = {};
  SUPPORTED_FIAT.forEach(moeda => {
    saldos[moeda] = 0;
  });
  return saldos;
}

interface SaldoContaParceiro {
  parceiro_id: string;
  parceiro_nome: string;
  banco: string;
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

interface SaldoBookmakerParceiro {
  parceiro_id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  saldo_atual: number;
  moeda: string;
  saldo_freebet: number;
}

interface BonusCreditado {
  bookmaker_id: string;
  total_bonus: number;
}

interface ParceiroSaldoAgrupado {
  parceiro_id: string;
  parceiro_nome: string;
  saldos_fiat: Array<{ moeda: string; saldo: number; banco: string }>;
  saldos_crypto: Array<{ coin: string; saldo_coin: number; saldo_usd: number; exchange: string }>;
  saldos_bookmakers: Array<{ 
    nome: string; 
    saldo_operavel: number;  // saldo_real + bonus + freebet (in native currency)
    moeda: string;
    has_bonus: boolean;
  }>;
  // Multi-currency totals
  total_fiat_por_moeda: SaldosPorMoeda;
  total_crypto_usd: number;
  total_bookmakers_por_moeda: SaldosPorMoeda;
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

      // Buscar bookmakers vinculadas aos parceiros COM saldo freebet
      const { data: bookmakers, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select("id, parceiro_id, nome, saldo_atual, saldo_usd, saldo_freebet, moeda")
        .not("parceiro_id", "is", null);

      if (bookmakersError) throw bookmakersError;

      // Buscar bônus creditados por bookmaker (saldo operável = saldo_real + bonus + freebet)
      const { data: bonusCreditados, error: bonusError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("bookmaker_id, saldo_atual")
        .eq("status", "credited");

      if (bonusError) throw bonusError;

      // Criar mapa de bônus por bookmaker
      const bonusMap = new Map<string, number>();
      (bonusCreditados || []).forEach((bonus) => {
        if (!bonus.bookmaker_id) return;
        const current = bonusMap.get(bonus.bookmaker_id) || 0;
        bonusMap.set(bonus.bookmaker_id, current + (bonus.saldo_atual || 0));
      });

      // Extrair coins únicos para buscar preços
      const uniqueCoins = [...new Set(
        (saldosWallets as SaldoWalletParceiro[] || [])
          .filter(w => w.coin)
          .map(w => w.coin)
      )];

      // Buscar preços atualizados da Binance
      const prices = await fetchCryptoPrices(uniqueCoins);

      const parceirosMap = new Map<string, ParceiroSaldoAgrupado>();

      // Helper to get or create parceiro entry
      const getOrCreateParceiro = (parceiroId: string, nome: string = "Parceiro"): ParceiroSaldoAgrupado => {
        if (!parceirosMap.has(parceiroId)) {
          parceirosMap.set(parceiroId, {
            parceiro_id: parceiroId,
            parceiro_nome: nome,
            saldos_fiat: [],
            saldos_crypto: [],
            saldos_bookmakers: [],
            total_fiat_por_moeda: createEmptySaldos(),
            total_crypto_usd: 0,
            total_bookmakers_por_moeda: createEmptySaldos(),
          });
        }
        return parceirosMap.get(parceiroId)!;
      };

      // Process FIAT accounts (multi-currency)
      (saldosContas as SaldoContaParceiro[] || []).forEach((conta) => {
        if (!conta.parceiro_id || conta.saldo === 0) return;

        const parceiro = getOrCreateParceiro(conta.parceiro_id, conta.parceiro_nome);
        const moeda = conta.moeda || "BRL";
        
        parceiro.saldos_fiat.push({
          moeda: moeda,
          saldo: conta.saldo,
          banco: conta.banco,
        });
        
        // Aggregate by currency
        parceiro.total_fiat_por_moeda[moeda] = (parceiro.total_fiat_por_moeda[moeda] || 0) + conta.saldo;
      });

      // Process crypto wallets
      (saldosWallets as SaldoWalletParceiro[] || []).forEach((wallet) => {
        if (!wallet.parceiro_id || wallet.saldo_coin === 0) return;

        const parceiro = getOrCreateParceiro(wallet.parceiro_id, wallet.parceiro_nome);
        
        // Calcular USD com preço atual da Binance
        const currentPrice = prices[wallet.coin] || 0;
        const saldoUsdAtualizado = wallet.saldo_coin * currentPrice;

        parceiro.saldos_crypto.push({
          coin: wallet.coin,
          saldo_coin: wallet.saldo_coin,
          saldo_usd: saldoUsdAtualizado,
          exchange: wallet.exchange || "Wallet",
        });
        parceiro.total_crypto_usd += saldoUsdAtualizado;
      });

      // Process bookmakers (multi-currency)
      // SALDO OPERÁVEL = saldo_real + saldo_freebet + bônus_creditado
      (bookmakers || []).forEach((bk) => {
        if (!bk.parceiro_id) return;

        const parceiro = getOrCreateParceiro(bk.parceiro_id, "Parceiro");
        const saldoReal = bk.saldo_atual || 0;
        const saldoFreebet = bk.saldo_freebet || 0;
        const bonusCreditado = bonusMap.get(bk.id) || 0;
        const moeda = bk.moeda || "BRL";
        
        // Calculate operable balance in native currency
        const saldoOperavel = saldoReal + saldoFreebet + bonusCreditado;
        
        // Only add if has meaningful balance
        if (saldoOperavel > 0.50) {
          parceiro.saldos_bookmakers.push({
            nome: bk.nome,
            saldo_operavel: saldoOperavel,
            moeda: moeda,
            has_bonus: bonusCreditado > 0 || saldoFreebet > 0,
          });
          
          // Aggregate by currency
          parceiro.total_bookmakers_por_moeda[moeda] = (parceiro.total_bookmakers_por_moeda[moeda] || 0) + saldoOperavel;
        }
      });

      // Fetch partner names for those that only have bookmakers
      const parceirosIds = Array.from(parceirosMap.keys());
      const { data: parceirosData } = await supabase
        .from("parceiros")
        .select("id, nome")
        .in("id", parceirosIds);

      if (parceirosData) {
        parceirosData.forEach((p) => {
          const parceiro = parceirosMap.get(p.id);
          if (parceiro && parceiro.parceiro_nome === "Parceiro") {
            parceiro.parceiro_nome = p.nome;
          }
        });
      }

      // Helper to get total from multi-currency object
      const getTotalFromCurrencies = (saldos: SaldosPorMoeda): number => {
        return Object.values(saldos).reduce((sum, v) => sum + (v || 0), 0);
      };

      const parceirosComSaldo = Array.from(parceirosMap.values())
        .filter((p) => p.saldos_fiat.length > 0 || p.saldos_crypto.length > 0 || p.saldos_bookmakers.length > 0)
        .sort((a, b) => {
          const totalA = getTotalFromCurrencies(a.total_fiat_por_moeda) + a.total_crypto_usd + getTotalFromCurrencies(a.total_bookmakers_por_moeda);
          const totalB = getTotalFromCurrencies(b.total_fiat_por_moeda) + b.total_crypto_usd + getTotalFromCurrencies(b.total_bookmakers_por_moeda);
          return totalA - totalB;
        });

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

  const BookmakerHoverContent = ({ saldos }: { saldos: ParceiroSaldoAgrupado["saldos_bookmakers"] }) => {
    const saldosFiltrados = saldos.filter(s => s.saldo_operavel > 0.50);
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground border-b border-border/50 pb-1.5">Saldo por Bookmaker</p>
        {saldosFiltrados.map((s, idx) => (
          <div key={idx} className="flex justify-between items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 truncate max-w-[150px]">
              <span className="text-foreground truncate">{s.nome}</span>
              {s.has_bonus && (
                <span className="text-[10px] text-purple-400" title="Inclui bônus/freebet">🎁</span>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="font-mono text-amber-400 whitespace-nowrap">
                {CURRENCY_SYMBOLS[s.moeda] || s.moeda} {s.saldo_operavel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

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

      <SheetContent className="w-full sm:max-w-xl">
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
                      <TableHead className="text-xs font-medium text-right">Bookmaker</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parceirosAgrupados.map((parceiro, index) => {
                      // Get primary FIAT currency (highest value) for display
                      const fiatEntries = Object.entries(parceiro.total_fiat_por_moeda)
                        .filter(([_, v]) => v > 0)
                        .sort(([, a], [, b]) => b - a);
                      const primaryFiat = fiatEntries[0];
                      
                      // Get bookmaker entries by currency
                      const bookmakerEntries = Object.entries(parceiro.total_bookmakers_por_moeda)
                        .filter(([_, v]) => v > 0)
                        .sort(([, a], [, b]) => b - a);
                      const hasBookmakerBalance = bookmakerEntries.length > 0;
                      
                      return (
                        <TableRow 
                          key={parceiro.parceiro_id} 
                          className={`border-border/30 ${index % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'}`}
                        >
                          <TableCell className="py-2.5 font-medium text-sm max-w-[120px] truncate">
                            {parceiro.parceiro_nome}
                          </TableCell>
                          
                          {/* FIAT Cell - Multi-currency */}
                          <TableCell className="py-2.5 text-right">
                            {primaryFiat ? (
                              <HoverCard openDelay={100} closeDelay={50}>
                                <HoverCardTrigger asChild>
                                  <button className="inline-flex items-center gap-1 text-emerald-400 font-mono text-sm hover:text-emerald-300 transition-colors cursor-pointer">
                                    {formatCurrency(primaryFiat[1], primaryFiat[0])}
                                    {fiatEntries.length > 1 && (
                                      <span className="text-xs text-muted-foreground">+{fiatEntries.length - 1}</span>
                                    )}
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

                          {/* Bookmaker Cell - Multi-currency */}
                          <TableCell className="py-2.5 text-right">
                            {hasBookmakerBalance ? (
                              <HoverCard openDelay={100} closeDelay={50}>
                                <HoverCardTrigger asChild>
                                  <button className="inline-flex flex-col items-end gap-0.5 hover:opacity-80 transition-opacity cursor-pointer">
                                    {bookmakerEntries.slice(0, 2).map(([moeda, valor]) => (
                                      <span key={moeda} className="text-amber-400 font-mono text-sm">
                                        {CURRENCY_SYMBOLS[moeda] || moeda} {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    ))}
                                    {bookmakerEntries.length > 2 && (
                                      <span className="text-xs text-muted-foreground">+{bookmakerEntries.length - 2} moedas</span>
                                    )}
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent align="end" className="w-72">
                                  <BookmakerHoverContent saldos={parceiro.saldos_bookmakers} />
                                </HoverCardContent>
                              </HoverCard>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
