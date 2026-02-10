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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FIAT_CURRENCIES, CURRENCY_SYMBOLS } from "@/types/currency";
import { getFirstLastName } from "@/lib/utils";

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
  saldo_locked: number;
  saldo_disponivel: number;
  wallet_id: string;
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

// Transação pendente (em trânsito wallet → bookmaker)
interface TransacaoPendente {
  parceiro_id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  valor_origem: number;
  moeda_origem: string;
  moeda_destino: string;
}

interface ParceiroSaldoAgrupado {
  parceiro_id: string;
  parceiro_nome: string;
  saldos_fiat: Array<{ moeda: string; saldo: number; banco: string }>;
  saldos_crypto: Array<{ 
    coin: string; 
    saldo_coin: number; 
    saldo_usd: number; 
    saldo_locked_usd: number;
    exchange: string;
  }>;
  saldos_bookmakers: Array<{ 
    nome: string; 
    saldo_operavel: number;  // saldo_real + bonus + freebet (in native currency)
    moeda: string;
    has_bonus: boolean;
  }>;
  // Transações pendentes (em trânsito para bookmakers)
  pendentes_bookmakers: Array<{
    bookmaker_nome: string;
    valor: number;
    moeda: string;
  }>;
  // Multi-currency totals
  total_fiat_por_moeda: SaldosPorMoeda;
  total_crypto_usd: number;
  total_crypto_locked_usd: number;
  total_bookmakers_por_moeda: SaldosPorMoeda;
  total_pendente_por_moeda: SaldosPorMoeda;
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

      // Buscar transações pendentes (em trânsito wallet → bookmaker)
      const { data: transacoesPendentes, error: pendentesError } = await supabase
        .from("cash_ledger")
        .select(`
          id,
          valor_origem,
          moeda_origem,
          origem_wallet_id,
          destino_bookmaker_id,
          bookmakers!cash_ledger_destino_bookmaker_id_fkey (
            id,
            nome,
            moeda,
            parceiro_id
          )
        `)
        .eq("status", "PENDENTE")
        .not("origem_wallet_id", "is", null)
        .not("destino_bookmaker_id", "is", null);

      if (pendentesError) throw pendentesError;

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
            pendentes_bookmakers: [],
            total_fiat_por_moeda: createEmptySaldos(),
            total_crypto_usd: 0,
            total_crypto_locked_usd: 0,
            total_bookmakers_por_moeda: createEmptySaldos(),
            total_pendente_por_moeda: createEmptySaldos(),
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

      // Process crypto wallets (com saldo travado)
      (saldosWallets as SaldoWalletParceiro[] || []).forEach((wallet) => {
        if (!wallet.parceiro_id || wallet.saldo_coin === 0) return;

        const parceiro = getOrCreateParceiro(wallet.parceiro_id, wallet.parceiro_nome);
        
        // Calcular USD com preço atual da Binance
        const currentPrice = prices[wallet.coin] || 0;
        const saldoUsdAtualizado = wallet.saldo_coin * currentPrice;
        const saldoLockedUsd = (wallet.saldo_locked || 0);

        parceiro.saldos_crypto.push({
          coin: wallet.coin,
          saldo_coin: wallet.saldo_coin,
          saldo_usd: saldoUsdAtualizado,
          saldo_locked_usd: saldoLockedUsd,
          exchange: wallet.exchange || "Wallet",
        });
        parceiro.total_crypto_usd += saldoUsdAtualizado;
        parceiro.total_crypto_locked_usd += saldoLockedUsd;
      });

      // Process transações pendentes (em trânsito)
      (transacoesPendentes || []).forEach((tx: any) => {
        const bm = tx.bookmakers;
        if (!bm?.parceiro_id) return;

        const parceiro = getOrCreateParceiro(bm.parceiro_id, "Parceiro");
        const moedaDestino = bm.moeda || "USD";
        
        parceiro.pendentes_bookmakers.push({
          bookmaker_nome: bm.nome,
          valor: tx.valor_origem || 0,
          moeda: moedaDestino,
        });
        
        // Aggregate pendentes by currency
        parceiro.total_pendente_por_moeda[moedaDestino] = 
          (parceiro.total_pendente_por_moeda[moedaDestino] || 0) + (tx.valor_origem || 0);
      });

      // Process bookmakers (multi-currency)
      // SALDO OPERÁVEL = saldo_atual + saldo_freebet
      // NOTA: saldo_atual já inclui o bônus creditado (via financial_events BONUS),
      // portanto NÃO devemos somar project_bookmaker_link_bonuses novamente.
      (bookmakers || []).forEach((bk) => {
        if (!bk.parceiro_id) return;

        const parceiro = getOrCreateParceiro(bk.parceiro_id, "Parceiro");
        const saldoReal = bk.saldo_atual || 0;
        const saldoFreebet = bk.saldo_freebet || 0;
        const moeda = bk.moeda || "BRL";
        
        // Calculate operable balance in native currency
        // Bonus is already included in saldo_atual via the financial engine
        const saldoOperavel = saldoReal + saldoFreebet;
        
        // Only add if has meaningful balance
        if (saldoOperavel > 0.50) {
          parceiro.saldos_bookmakers.push({
            nome: bk.nome,
            saldo_operavel: saldoOperavel,
            moeda: moeda,
            has_bonus: (bonusMap.get(bk.id) || 0) > 0 || saldoFreebet > 0,
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

  // Reagir a mudanças financeiras (FINANCIAL_STATE) para manter dados atualizados
  useEffect(() => {
    const handleFinancialChange = () => {
      if (open) {
        fetchSaldosParceiros();
      }
    };

    window.addEventListener("lovable:financial-state-changed", handleFinancialChange);
    window.addEventListener("lovable:caixa-data-changed", handleFinancialChange);
    
    return () => {
      window.removeEventListener("lovable:financial-state-changed", handleFinancialChange);
      window.removeEventListener("lovable:caixa-data-changed", handleFinancialChange);
    };
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
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-1 mb-1 border-b border-border/30">
        Saldo por Banco
      </p>
      {saldos.map((s, idx) => (
        <div key={idx} className="flex justify-between items-center gap-4 py-0.5">
          <span className="text-[13px] text-foreground/90 truncate max-w-[160px] leading-tight">{s.banco}</span>
          <span className="text-[13px] font-mono font-medium text-chart-1 whitespace-nowrap tabular-nums">{formatCurrency(s.saldo, s.moeda)}</span>
        </div>
      ))}
    </div>
  );

  const CryptoHoverContent = ({ saldos, totalLocked }: { saldos: ParceiroSaldoAgrupado["saldos_crypto"]; totalLocked: number }) => (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-1 mb-0.5 border-b border-border/30">
        Saldo por Moeda
      </p>
      {saldos.map((s, idx) => (
        <div key={idx} className="flex justify-between items-start gap-4 py-0.5">
          <div className="flex flex-col gap-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-foreground leading-tight">{s.coin}</span>
              <span className="text-[11px] text-muted-foreground/60 leading-tight">• {s.exchange}</span>
            </div>
            <span className="text-[11px] text-muted-foreground/50 font-mono tabular-nums leading-tight">
              {s.saldo_coin.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {s.coin}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0">
            <span className="text-[13px] font-mono font-medium text-chart-2 whitespace-nowrap tabular-nums leading-tight">{formatCurrency(s.saldo_usd, "USD")}</span>
            {s.saldo_locked_usd > 0 && (
              <span className="text-[11px] font-mono text-chart-3/80 whitespace-nowrap tabular-nums leading-tight">
                -{formatCurrency(s.saldo_locked_usd, "USD")} trânsito
              </span>
            )}
          </div>
        </div>
      ))}
      {totalLocked > 0 && (
        <div className="pt-1.5 mt-1 border-t border-border/30 flex justify-between items-center">
          <span className="text-[11px] text-chart-3/80 font-medium">⏳ Em Trânsito</span>
          <span className="text-[13px] font-mono font-medium text-chart-3 tabular-nums">{formatCurrency(totalLocked, "USD")}</span>
        </div>
      )}
    </div>
  );

  const BookmakerHoverContent = ({ 
    saldos, 
    pendentes 
  }: { 
    saldos: ParceiroSaldoAgrupado["saldos_bookmakers"]; 
    pendentes: ParceiroSaldoAgrupado["pendentes_bookmakers"];
  }) => {
    const saldosFiltrados = saldos.filter(s => s.saldo_operavel > 0.50);
    
    // Group bookmakers by currency
    const bookmakersPorMoeda = saldosFiltrados.reduce<Record<string, typeof saldosFiltrados>>((acc, s) => {
      const moeda = s.moeda || "USD";
      if (!acc[moeda]) acc[moeda] = [];
      acc[moeda].push(s);
      return acc;
    }, {});

    // Group pendentes by currency
    const pendentesPorMoeda = pendentes.reduce<Record<string, typeof pendentes>>((acc, p) => {
      const moeda = p.moeda || "USD";
      if (!acc[moeda]) acc[moeda] = [];
      acc[moeda].push(p);
      return acc;
    }, {});

    const moedas = [...new Set([...Object.keys(bookmakersPorMoeda), ...Object.keys(pendentesPorMoeda)])];
    const defaultMoeda = moedas[0] || "USD";

    // If only one currency, show flat list (no tabs needed)
    if (moedas.length <= 1) {
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-1 mb-1 border-b border-border/30">
            Saldo por Bookmaker {moedas[0] && <span className="text-primary">• {moedas[0]}</span>}
          </p>
          <BookmakerListByMoeda 
            bookmakers={saldosFiltrados} 
            pendentes={pendentes} 
          />
        </div>
      );
    }

    // Multiple currencies: show tabs
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 pb-1">Saldo por Bookmaker</p>
        <Tabs defaultValue={defaultMoeda} className="w-full">
          <TabsList className="w-full h-7 bg-muted/50 p-0.5 gap-0.5">
            {moedas.map(moeda => {
              const totalMoeda = (bookmakersPorMoeda[moeda] || []).reduce((s, b) => s + b.saldo_operavel, 0);
              return (
                <TabsTrigger 
                  key={moeda} 
                  value={moeda} 
                  className="flex-1 text-[10px] h-6 px-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {CURRENCY_SYMBOLS[moeda] || moeda} {moeda}
                  <span className="ml-1 opacity-60">({(bookmakersPorMoeda[moeda] || []).length})</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {moedas.map(moeda => (
            <TabsContent key={moeda} value={moeda} className="mt-2 space-y-2">
              {/* Total da moeda */}
              <div className="flex justify-between items-center text-xs text-muted-foreground border-b border-border/30 pb-1">
                <span>Total {moeda}</span>
                <span className="font-mono font-medium text-foreground">
                  {CURRENCY_SYMBOLS[moeda] || moeda} {(bookmakersPorMoeda[moeda] || []).reduce((s, b) => s + b.saldo_operavel, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <BookmakerListByMoeda 
                bookmakers={bookmakersPorMoeda[moeda] || []} 
                pendentes={pendentesPorMoeda[moeda] || []} 
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  };

  const BookmakerListByMoeda = ({ 
    bookmakers, 
    pendentes 
  }: { 
    bookmakers: ParceiroSaldoAgrupado["saldos_bookmakers"]; 
    pendentes: ParceiroSaldoAgrupado["pendentes_bookmakers"];
  }) => (
    <>
      {bookmakers.map((s, idx) => (
        <div key={idx} className="flex justify-between items-center gap-4 py-0.5">
          <div className="flex items-center gap-1.5 truncate max-w-[160px]">
            <span className="text-[13px] font-medium tracking-wide uppercase text-foreground/90 truncate leading-tight">{s.nome}</span>
            {s.has_bonus && (
              <span className="text-[10px] text-primary" title="Inclui bônus/freebet">🎁</span>
            )}
          </div>
          <span className="text-[13px] font-mono font-medium text-chart-4 whitespace-nowrap tabular-nums leading-tight">
            {CURRENCY_SYMBOLS[s.moeda] || s.moeda} {s.saldo_operavel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
      {pendentes.length > 0 && (
        <div className="pt-1.5 mt-1.5 border-t border-border/30">
          <p className="text-[11px] font-medium text-chart-3/80 mb-1">⏳ Em Trânsito</p>
          {pendentes.map((p, idx) => (
            <div key={idx} className="flex justify-between items-center gap-4 py-0.5">
              <span className="text-[13px] tracking-wide uppercase text-muted-foreground/70 truncate max-w-[160px] leading-tight">{p.bookmaker_nome}</span>
              <span className="text-[13px] font-mono font-medium text-chart-3 whitespace-nowrap tabular-nums leading-tight">
                +{CURRENCY_SYMBOLS[p.moeda] || p.moeda} {p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
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

      <SheetContent className="w-full sm:max-w-2xl">
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
                          <TableCell className="py-2.5 font-medium text-sm whitespace-nowrap">
                            {getFirstLastName(parceiro.parceiro_nome)}
                          </TableCell>
                          
                          {/* FIAT Cell - Multi-currency */}
                          <TableCell className="py-2.5 text-right">
                            {primaryFiat ? (
                              <HoverCard openDelay={100} closeDelay={50}>
                                <HoverCardTrigger asChild>
                                  <button className="inline-flex items-center gap-1 text-chart-1 font-mono text-sm hover:opacity-80 transition-colors cursor-pointer">
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

                          {/* Crypto Cell - mostra disponível e locked */}
                          <TableCell className="py-2.5 text-right">
                            {parceiro.saldos_crypto.length > 0 ? (
                              <HoverCard openDelay={100} closeDelay={50}>
                                <HoverCardTrigger asChild>
                                  <button className="inline-flex flex-col items-end gap-0.5 hover:opacity-80 transition-opacity cursor-pointer">
                                    {/* Saldo disponível (total - locked) */}
                                    <span className="text-chart-2 font-mono text-sm">
                                      {formatCurrency(parceiro.total_crypto_usd - parceiro.total_crypto_locked_usd, "USD")}
                                    </span>
                                    {/* Saldo em trânsito */}
                                    {parceiro.total_crypto_locked_usd > 0 && (
                                      <span className="text-xs text-chart-3 font-mono">
                                        ⏳ {formatCurrency(parceiro.total_crypto_locked_usd, "USD")}
                                      </span>
                                    )}
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent align="end" className="w-80">
                                  <CryptoHoverContent 
                                    saldos={parceiro.saldos_crypto} 
                                    totalLocked={parceiro.total_crypto_locked_usd} 
                                  />
                                </HoverCardContent>
                              </HoverCard>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>

                          {/* Bookmaker Cell - Multi-currency + Pendentes */}
                          <TableCell className="py-2.5 text-right">
                            {hasBookmakerBalance || parceiro.pendentes_bookmakers.length > 0 ? (
                              <HoverCard openDelay={100} closeDelay={50}>
                                <HoverCardTrigger asChild>
                                  <button className="inline-flex flex-col items-end gap-0.5 hover:opacity-80 transition-opacity cursor-pointer">
                                    {/* Saldos confirmados */}
                                    {bookmakerEntries.slice(0, 2).map(([moeda, valor]) => (
                                      <span key={moeda} className="text-chart-4 font-mono text-sm">
                                        {CURRENCY_SYMBOLS[moeda] || moeda} {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    ))}
                                    {bookmakerEntries.length > 2 && (
                                      <span className="text-xs text-muted-foreground">+{bookmakerEntries.length - 2} moedas</span>
                                    )}
                                    {/* Pendentes em amarelo */}
                                    {parceiro.pendentes_bookmakers.length > 0 && (
                                      <span className="text-xs text-chart-3 font-mono">
                                        ⏳ +{formatCurrency(
                                          Object.values(parceiro.total_pendente_por_moeda).reduce((a, b) => a + b, 0), 
                                          "USD"
                                        )}
                                      </span>
                                    )}
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent align="end" className="w-80">
                                  <BookmakerHoverContent 
                                    saldos={parceiro.saldos_bookmakers} 
                                    pendentes={parceiro.pendentes_bookmakers}
                                  />
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
