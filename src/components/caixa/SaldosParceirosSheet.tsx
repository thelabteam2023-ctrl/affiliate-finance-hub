import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Users, Wallet, Bitcoin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

  const fetchSaldosParceiros = async () => {
    try {
      setLoading(true);

      // Fetch FIAT balances per partner
      const { data: saldosContas, error: contasError } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("*");

      if (contasError) throw contasError;

      // Fetch Crypto balances per partner
      const { data: saldosWallets, error: walletsError } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("*");

      if (walletsError) throw walletsError;

      // Group by partner
      const parceirosMap = new Map<string, ParceiroSaldoAgrupado>();

      // Process FIAT balances
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

      // Process Crypto balances
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

        const parceiro = parceirosMap.get(wallet.parceiro_id)!;
        parceiro.saldos_crypto.push({
          coin: wallet.coin,
          saldo_coin: wallet.saldo_coin,
          saldo_usd: wallet.saldo_usd,
          exchange: wallet.exchange || "Wallet",
        });
        parceiro.total_crypto_usd += wallet.saldo_usd || 0;
      });

      // Filter only partners with balance and sort by total
      const parceirosComSaldo = Array.from(parceirosMap.values())
        .filter((p) => p.saldos_fiat.length > 0 || p.saldos_crypto.length > 0)
        .sort((a, b) => (b.total_fiat_brl + b.total_crypto_usd) - (a.total_fiat_brl + a.total_crypto_usd));

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

  const totalParceiros = parceirosAgrupados.length;

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

      <SheetContent className="w-full sm:max-w-lg">
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
              <div className="flex items-center justify-between mb-4 px-1">
                <span className="text-sm text-muted-foreground">
                  {totalParceiros} parceiro{totalParceiros !== 1 ? "s" : ""} com capital
                </span>
              </div>

              <ScrollArea className="h-[calc(100vh-180px)]">
                <div className="space-y-3 pr-4">
                  {parceirosAgrupados.map((parceiro) => (
                    <div
                      key={parceiro.parceiro_id}
                      className="rounded-lg border border-border/50 bg-card/30 p-4 space-y-3"
                    >
                      {/* Partner Name */}
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium truncate flex-1">{parceiro.parceiro_nome}</h3>
                      </div>

                      {/* FIAT Balances */}
                      {parceiro.saldos_fiat.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Wallet className="h-3 w-3" />
                            <span>FIAT</span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {parceiro.saldos_fiat.map((saldo, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground truncate max-w-[150px]" title={saldo.banco}>
                                  {saldo.banco}
                                </span>
                                <Badge 
                                  variant="outline" 
                                  className={`font-mono ${saldo.saldo >= 0 ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'}`}
                                >
                                  {formatCurrency(saldo.saldo, saldo.moeda)}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Crypto Balances */}
                      {parceiro.saldos_crypto.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Bitcoin className="h-3 w-3" />
                            <span>CRYPTO</span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {parceiro.saldos_crypto.map((saldo, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="font-medium text-foreground">{saldo.coin}</span>
                                  <span className="text-xs truncate max-w-[80px]" title={saldo.exchange}>
                                    ({saldo.exchange})
                                  </span>
                                </div>
                                <div className="text-right">
                                  <Badge 
                                    variant="outline" 
                                    className={`font-mono ${saldo.saldo_usd >= 0 ? 'text-blue-400 border-blue-500/30' : 'text-red-400 border-red-500/30'}`}
                                  >
                                    {formatCurrency(saldo.saldo_usd, "USD")}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Totals */}
                      <div className="pt-2 border-t border-border/30 flex items-center justify-end gap-3 text-xs">
                        {parceiro.total_fiat_brl > 0 && (
                          <span className="text-emerald-400 font-medium">
                            {formatCurrency(parceiro.total_fiat_brl, "BRL")}
                          </span>
                        )}
                        {parceiro.total_crypto_usd > 0 && (
                          <span className="text-blue-400 font-medium">
                            ≈ {formatCurrency(parceiro.total_crypto_usd, "USD")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
