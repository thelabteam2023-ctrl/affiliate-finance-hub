import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Users, RefreshCw, ArrowUpDown, Wallet, Landmark, Bitcoin, Info, ArrowRightLeft, Truck, Building2, User, Search, SortAsc, LayoutGrid, List, Pin, Copy, Check, X } from "lucide-react";
 import { Input } from "@/components/ui/input";
 import { Switch } from "@/components/ui/switch";
 import { Label } from "@/components/ui/label";
import { SwapCryptoDialog } from "./SwapCryptoDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FIAT_CURRENCIES, CURRENCY_SYMBOLS } from "@/types/currency";
import { getFirstLastName } from "@/lib/utils";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";

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
  label?: string;
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
    status: string;
    total_brl: number;
  saldos_fiat: Array<{ moeda: string; saldo: number; banco: string }>;
  saldos_crypto: Array<{ 
    coin: string; 
    saldo_coin: number; 
    saldo_usd: number; 
    saldo_locked_usd: number;
    exchange: string;
    endereco: string;
    label?: string;
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

const BOOKMAKER_MOEDA_PRIORITY = ["BRL", "USD", "EUR"];

const sortMoedas = (moedas: string[]) =>
  [...moedas].sort((a, b) => {
    const priorityA = BOOKMAKER_MOEDA_PRIORITY.indexOf(a);
    const priorityB = BOOKMAKER_MOEDA_PRIORITY.indexOf(b);

    if (priorityA !== -1 || priorityB !== -1) {
      if (priorityA === -1) return 1;
      if (priorityB === -1) return -1;
      return priorityA - priorityB;
    }

    return a.localeCompare(b);
  });

const BookmakerListByMoeda = ({
  bookmakers,
  pendentes,
  ascending = false,
}: {
  bookmakers: ParceiroSaldoAgrupado["saldos_bookmakers"];
  pendentes: ParceiroSaldoAgrupado["pendentes_bookmakers"];
  ascending?: boolean;
}) => {
  const sorted = [...bookmakers].sort((a, b) =>
    ascending ? a.saldo_operavel - b.saldo_operavel : b.saldo_operavel - a.saldo_operavel,
  );

  return (
    <>
      {sorted.map((s, idx) => (
        <div key={`${s.nome}-${s.moeda}-${idx}`} className="flex justify-between items-start gap-4 py-1">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-[13px] font-medium tracking-wide uppercase text-foreground/90 leading-tight break-words">{s.nome}</span>
            {s.has_bonus && (
              <span className="text-[10px] text-primary shrink-0" title="Inclui bônus/freebet">🎁</span>
            )}
          </div>
          <span className="text-[13px] font-mono font-medium text-chart-4 whitespace-nowrap tabular-nums leading-tight mt-0.5">
            {CURRENCY_SYMBOLS[s.moeda] || s.moeda} {s.saldo_operavel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
      {pendentes.length > 0 && (
        <div className="pt-1.5 mt-1.5 border-t border-border/30">
          <p className="text-[11px] font-medium text-chart-3/80 mb-1">⏳ Em Trânsito</p>
          {pendentes.map((p, idx) => (
            <div key={`${p.bookmaker_nome}-${p.moeda}-${idx}`} className="flex justify-between items-center gap-4 py-0.5">
              <span className="text-[13px] tracking-wide uppercase text-muted-foreground/70 truncate max-w-[160px] leading-tight">{p.bookmaker_nome}</span>
              <span className="text-[13px] font-mono font-medium text-chart-3 whitespace-nowrap tabular-nums leading-tight">
                +{CURRENCY_SYMBOLS[p.moeda] || p.moeda} {p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

 const BookmakerDetailsContent = ({
  saldos,
  pendentes,
}: {
  saldos: ParceiroSaldoAgrupado["saldos_bookmakers"];
  pendentes: ParceiroSaldoAgrupado["pendentes_bookmakers"];
}) => {
   const [ascending, setAscending] = useState(false);
   const saldosFiltrados = useMemo(() => saldos.filter((s) => s.saldo_operavel > 0.5), [saldos]);
   const bookmakersPorMoeda = useMemo(() => saldosFiltrados.reduce<Record<string, typeof saldosFiltrados>>((acc, s) => {
     const moeda = s.moeda || "USD";
     if (!acc[moeda]) acc[moeda] = [];
     acc[moeda].push(s);
     return acc;
   }, {}), [saldosFiltrados]);
   const pendentesPorMoeda = useMemo(() => pendentes.reduce<Record<string, typeof pendentes>>((acc, p) => {
     const moeda = p.moeda || "USD";
     if (!acc[moeda]) acc[moeda] = [];
     acc[moeda].push(p);
     return acc;
   }, {}), [pendentes]);
   const moedas = useMemo(() => sortMoedas([...new Set([...Object.keys(bookmakersPorMoeda), ...Object.keys(pendentesPorMoeda)])]), [bookmakersPorMoeda, pendentesPorMoeda]);
   const defaultMoeda = moedas[0] || "USD";
   const [activeMoeda, setActiveMoeda] = useState(defaultMoeda);
   useEffect(() => { setActiveMoeda((current) => (moedas.includes(current) ? current : defaultMoeda)); }, [moedas, defaultMoeda]);
   const sortToggle = (
     <button type="button" onClick={() => setAscending(!ascending)} className="text-muted-foreground/60 hover:text-foreground transition-colors">
       <ArrowUpDown className="h-3 w-3" />
     </button>
   );
   if (moedas.length <= 1) {
     return (
       <div className="space-y-1">
         <div className="flex items-center justify-between pb-1 mb-1 border-b border-border/30">
           <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
             Saldo por Casa {moedas[0] && <span className="text-primary">• {moedas[0]}</span>}
           </p>
           {sortToggle}
         </div>
         <BookmakerListByMoeda bookmakers={saldosFiltrados} pendentes={pendentes} ascending={ascending} />
       </div>
     );
   }
   return (
     <div className="space-y-1">
       <div className="flex items-center justify-between pb-1">
         <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Saldo por Casa</p>
         {sortToggle}
       </div>
       <Tabs value={activeMoeda} onValueChange={setActiveMoeda} className="w-full">
         <TabsList className="w-full h-7 bg-muted/50 p-0.5 gap-0.5 border-none [&>span:last-child]:hidden">
           {moedas.map((moeda) => (
             <TabsTrigger key={moeda} value={moeda} className="flex-1 text-[10px] h-6 px-2 rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
               {CURRENCY_SYMBOLS[moeda] || moeda} {moeda}
               <span className="ml-1 opacity-60">({(bookmakersPorMoeda[moeda] || []).length})</span>
             </TabsTrigger>
           ))}
         </TabsList>
         {moedas.map((moeda) => (
           <TabsContent key={moeda} value={moeda} className="mt-2 space-y-2">
             <div className="flex justify-between items-center text-xs text-muted-foreground border-b border-border/30 pb-1">
               <span>Total {moeda}</span>
               <span className="font-mono font-medium text-foreground">
                 {CURRENCY_SYMBOLS[moeda] || moeda}{" "}
                 {(bookmakersPorMoeda[moeda] || []).reduce((sum, bookmaker) => sum + bookmaker.saldo_operavel, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
               </span>
             </div>
             <BookmakerListByMoeda bookmakers={bookmakersPorMoeda[moeda] || []} pendentes={pendentesPorMoeda[moeda] || []} ascending={ascending} />
           </TabsContent>
         ))}
       </Tabs>
     </div>
   );
 };

 function ParceiroSkeleton() {
   return (
     <Card className="bg-card/40 border-border/40 backdrop-blur-sm overflow-hidden">
       <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center gap-3">
         <Skeleton className="h-10 w-10 rounded-full" />
         <div className="space-y-2">
           <Skeleton className="h-4 w-24" />
           <Skeleton className="h-3 w-32" />
         </div>
       </CardHeader>
       <CardContent className="px-4 pb-4 pt-0 space-y-4">
         <div className="grid grid-cols-3 gap-2">
           <Skeleton className="h-12 rounded-lg" />
           <Skeleton className="h-12 rounded-lg" />
           <Skeleton className="h-12 rounded-lg" />
         </div>
         <div className="space-y-2">
           <Skeleton className="h-8 w-full rounded-md" />
           <Skeleton className="h-8 w-full rounded-md" />
         </div>
       </CardContent>
     </Card>
   );
 }
 
    import { useRef, MouseEvent as ReactMouseEvent } from "react";

    const InteractiveTooltip = ({ children, content, className, containerRef }: { children: React.ReactNode, content: React.ReactNode, className?: string, containerRef?: React.RefObject<any> }) => {
     const [isPinned, setIsPinned] = useState(false);
     const [isHovered, setIsHovered] = useState(false);
     const ref = useRef<HTMLDivElement>(null);

     useEffect(() => {
       const handleClickOutside = (event: MouseEvent) => {
         if (ref.current && !ref.current.contains(event.target as Node)) {
           setIsPinned(false);
         }
       };
       if (isPinned) {
         document.addEventListener("mousedown", handleClickOutside);
       }
       return () => {
         document.removeEventListener("mousedown", handleClickOutside);
       };
     }, [isPinned]);

     return (
       <TooltipProvider>
         <Tooltip open={isHovered || isPinned}>
           <TooltipTrigger asChild>
             <div 
               ref={ref}
               className={`cursor-help inline-block ${className}`}
               onMouseEnter={() => setIsHovered(true)}
               onMouseLeave={() => setIsHovered(false)}
               onClick={(e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 setIsPinned(!isPinned);
               }}
             >
               {children}
             </div>
           </TooltipTrigger>
            <TooltipContent 
              portal={false}
              className={`p-3 min-w-[260px] max-w-[380px] max-h-[300px] overflow-y-auto bg-popover border-border shadow-2xl z-50 transition-all duration-200 ${isPinned ? 'border-primary/50 ring-1 ring-primary/20' : ''}`}
             onMouseEnter={() => setIsHovered(true)}
             onMouseLeave={() => setIsHovered(false)}
             side="top"
             align="end"
           >
             {isPinned && (
               <div className="absolute top-2 right-2 flex items-center gap-1 bg-primary/10 px-1.5 py-0.5 rounded text-[9px] text-primary font-bold uppercase tracking-tighter">
                  <Pin className="h-2.5 w-2.5 fill-current" />
                  <span>Fixado</span>
               </div>
             )}
             <div className="pt-1">
              {content}
             </div>
           </TooltipContent>
         </Tooltip>
       </TooltipProvider>
     );
   };

    export function SaldosParceirosSheet() {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [cryptoPanel, setCryptoPanel] = useState<{
    open: boolean;
    parceiroId: string | null;
    parceiroNome: string;
    saldos: ParceiroSaldoAgrupado["saldos_crypto"];
    totalLocked: number;
    x: number;
    y: number;
  }>({
    open: false,
    parceiroId: null,
    parceiroNome: "",
    saldos: [],
    totalLocked: 0,
    x: 0,
    y: 0,
  });
  const [open, setOpen] = useState(false);
  const [parceirosAgrupados, setParceirosAgrupados] = useState<ParceiroSaldoAgrupado[]>([]);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenCryptoPanel = (e: React.MouseEvent, parceiro: ParceiroSaldoAgrupado) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    
    let x = rect.left - 350;
    if (x < 10) x = rect.right + 10;
    if (x + 340 > window.innerWidth) x = window.innerWidth - 350;
    
    let y = rect.top;
    if (y + 400 > window.innerHeight) y = window.innerHeight - 410;
    if (y < 10) y = 10;

    setCryptoPanel({
      open: true,
      parceiroId: parceiro.parceiro_id,
      parceiroNome: parceiro.parceiro_nome,
      saldos: parceiro.saldos_crypto,
      totalLocked: parceiro.total_crypto_locked_usd,
      x,
      y,
    });
  };

  const onMouseDownDrag = (e: ReactMouseEvent) => {
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - cryptoPanel.x,
      y: e.clientY - cryptoPanel.y,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        setCryptoPanel((prev) => ({
          ...prev,
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        }));
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    if (cryptoPanel.open) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [cryptoPanel.open]);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState<"balance" | "alphabetical">("balance");
    const [showAll, setShowAll] = useState(false);
    const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
      const saved = localStorage.getItem("parceiros-view-mode");
      return (saved as "grid" | "list") || "grid";
    });

    useEffect(() => {
      localStorage.setItem("parceiros-view-mode", viewMode);
    }, [viewMode]);
  const [fornecedores, setFornecedores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [swapDialog, setSwapDialog] = useState<{ open: boolean; parceiroId: string | null }>({
    open: false,
    parceiroId: null,
  });
  const { workspaceId } = useTabWorkspace();
  const { convertToBRL } = useExchangeRates();

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

  const fetchSaldosParceiros = useCallback(async () => {
    if (!workspaceId) return;
    
    try {
      setLoading(true);

      const { data: saldosContas, error: contasError } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (contasError) throw contasError;

      const { data: saldosWallets, error: walletsError } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (walletsError) throw walletsError;

      // Buscar bookmakers vinculadas aos parceiros COM saldo freebet
      const { data: bookmakers, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select("id, parceiro_id, nome, saldo_atual, saldo_usd, saldo_freebet, moeda")
        .eq("workspace_id", workspaceId)
        .not("parceiro_id", "is", null);

      if (bookmakersError) throw bookmakersError;

      // Buscar bônus creditados por bookmaker (saldo operável = saldo_real + bonus + freebet)
      const { data: bonusCreditados, error: bonusError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("bookmaker_id, saldo_atual")
        .eq("workspace_id", workspaceId)
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
        .eq("workspace_id", workspaceId)
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
 
       const { data: allParceiros } = await supabase
         .from("parceiros")
         .select("id, nome, is_caixa_operacional, status")
         .eq("workspace_id", workspaceId);

       const parceiroInfoMap = new Map<string, any>();
       if (allParceiros) {
         allParceiros.forEach(p => parceiroInfoMap.set(p.id, p));
       }

       const parceirosMap = new Map<string, ParceiroSaldoAgrupado>();

       const getOrCreateParceiro = (parceiroId: string, nome: string = "Parceiro"): ParceiroSaldoAgrupado => {
         if (!parceirosMap.has(parceiroId)) {
           const pInfo = parceiroInfoMap.get(parceiroId);
           parceirosMap.set(parceiroId, {
             parceiro_id: parceiroId,
             parceiro_nome: pInfo?.nome || nome,
             status: pInfo?.status || "ativo",
             total_brl: 0,
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
        const pInfo = parceiroInfoMap.get(conta.parceiro_id);

         const parceiro = getOrCreateParceiro(conta.parceiro_id, conta.parceiro_nome);
        const moeda = conta.moeda || "BRL";
        
        const saldoClamped = Math.max(0, conta.saldo);
        parceiro.saldos_fiat.push({
          moeda: moeda,
          saldo: saldoClamped,
          banco: conta.banco,
        });
        
        // Aggregate by currency
        parceiro.total_fiat_por_moeda[moeda] = (parceiro.total_fiat_por_moeda[moeda] || 0) + conta.saldo;
      });

      // Process crypto wallets (com saldo travado)
      (saldosWallets as SaldoWalletParceiro[] || []).forEach((wallet) => {
        if (!wallet.parceiro_id || wallet.saldo_coin === 0) return;
        const pInfo = parceiroInfoMap.get(wallet.parceiro_id);

         const parceiro = getOrCreateParceiro(wallet.parceiro_id, wallet.parceiro_nome);
        
        // Calcular USD com preço atual da Binance
        const currentPrice = prices[wallet.coin] || 0;
        const saldoUsdAtualizado = Math.max(0, wallet.saldo_coin * currentPrice);
        const saldoLockedUsd = Math.max(0, wallet.saldo_locked || 0);

        parceiro.saldos_crypto.push({
          coin: wallet.coin,
          saldo_coin: wallet.saldo_coin,
          saldo_usd: saldoUsdAtualizado,
          saldo_locked_usd: saldoLockedUsd,
          exchange: wallet.exchange || "Wallet",
          endereco: wallet.endereco || "",
          label: wallet.label,
        });
        parceiro.total_crypto_usd += saldoUsdAtualizado;
        parceiro.total_crypto_locked_usd += saldoLockedUsd;
      });

      // Process transações pendentes (em trânsito)
      (transacoesPendentes || []).forEach((tx: any) => {
        const bm = tx.bookmakers;
        if (!bm?.parceiro_id) return;
        const pInfo = parceiroInfoMap.get(bm.parceiro_id);

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
        const pInfo = parceiroInfoMap.get(bk.parceiro_id);

         const parceiro = getOrCreateParceiro(bk.parceiro_id, "Parceiro");
        const saldoReal = Math.max(0, bk.saldo_atual || 0);
        const saldoFreebet = Math.max(0, bk.saldo_freebet || 0);
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

       // Collect caixa operacional IDs to filter them out
      const caixaIds = new Set<string>();
      
      parceirosMap.forEach((parceiro, id) => {
        const pInfo = parceiroInfoMap.get(id);
        if (pInfo) {
          if (pInfo.is_caixa_operacional) caixaIds.add(id);
          if (parceiro.parceiro_nome === "Parceiro") {
            parceiro.parceiro_nome = pInfo.nome;
          }
        }
      });

      // Remove caixa operacional entries from the map
      caixaIds.forEach(id => parceirosMap.delete(id));

      // Helper to get total from multi-currency object
      const getTotalFromCurrencies = (saldos: SaldosPorMoeda): number => {
        return Object.values(saldos).reduce((sum, v) => sum + (v || 0), 0);
      };

       const finalParceiros = Array.from(parceirosMap.values())
         .filter((p) =>
           p.saldos_fiat.length > 0 ||
           p.saldos_crypto.length > 0 ||
           p.saldos_bookmakers.length > 0
         )
         .map(p => {
           let totalBRL = 0;
           Object.entries(p.total_fiat_por_moeda).forEach(([moeda, v]) => {
             if (v) totalBRL += convertToBRL(v, moeda);
           });
           const cryptoUsd = p.total_crypto_usd - p.total_crypto_locked_usd;
           if (cryptoUsd > 0) totalBRL += convertToBRL(cryptoUsd, "USD");
           Object.entries(p.total_bookmakers_por_moeda).forEach(([moeda, v]) => {
             if (v) totalBRL += convertToBRL(v, moeda);
           });
           return { ...p, total_brl: totalBRL };
         });

       setParceirosAgrupados(finalParceiros);
    } catch (error) {
      console.error("Erro ao carregar saldos dos parceiros:", error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

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

  const filteredAndSortedParceiros = useMemo(() => {
    let result = [...parceirosAgrupados];
    
    if (!showAll) {
      result = result.filter(p => p.status === "ativo");
    }
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => p.parceiro_nome.toLowerCase().includes(term));
    }
    
    if (sortBy === "balance") {
      result.sort((a, b) => b.total_brl - a.total_brl);
    } else {
      result.sort((a, b) => a.parceiro_nome.localeCompare(b.parceiro_nome));
    }
    
    return result;
  }, [parceirosAgrupados, searchTerm, sortBy, showAll]);

  const totalParceiros = filteredAndSortedParceiros.length;

  const FiatHoverContent = ({ saldos }: { saldos: ParceiroSaldoAgrupado["saldos_fiat"] }) => {
    const [ascending, setAscending] = useState(false);
    const sorted = [...saldos].sort((a, b) => ascending ? a.saldo - b.saldo : b.saldo - a.saldo);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between pb-1 mb-1 border-b border-border/30">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Saldo por Banco
          </p>
          <button onClick={() => setAscending(!ascending)} className="text-muted-foreground/60 hover:text-foreground transition-colors">
            <ArrowUpDown className="h-3 w-3" />
          </button>
        </div>
        {sorted.map((s, idx) => (
          <div key={idx} className="flex justify-between items-start gap-4 py-1">
            <span className="text-[13px] text-foreground/90 leading-tight flex-1 break-words">{s.banco}</span>
            <span className="text-[13px] font-mono font-medium text-chart-1 whitespace-nowrap tabular-nums mt-0.5">{formatCurrency(s.saldo, s.moeda)}</span>
          </div>
        ))}
      </div>
    );
  };

  const truncateAddr = (addr: string) => {
    if (!addr || addr.length <= 12) return addr || "";
    return `${addr.slice(0, 6)}...${addr.slice(-5)}`;
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

      <SheetContent className="w-full sm:max-w-2xl">
         <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <span>Saldos por Parceiro</span>
            </div>
            {!loading && parceirosAgrupados.length > 0 && (() => {
              // Consolidar total geral em BRL usando cotações do banco de dados
              let totalGeralBRL = 0;
              parceirosAgrupados.forEach(p => {
                // FIAT: converter cada moeda para BRL via cotação
                Object.entries(p.total_fiat_por_moeda).forEach(([moeda, v]) => {
                  if (v) totalGeralBRL += convertToBRL(v, moeda);
                });
                // Crypto: converter USD para BRL
                const cryptoUsd = p.total_crypto_usd - p.total_crypto_locked_usd;
                if (cryptoUsd > 0) totalGeralBRL += convertToBRL(cryptoUsd, "USD");
                // Bookmakers: converter cada moeda para BRL
                Object.entries(p.total_bookmakers_por_moeda).forEach(([moeda, v]) => {
                  if (v) totalGeralBRL += convertToBRL(v, moeda);
                });
              });
              return (
                <div className="relative group shrink-0">
                  <Badge variant="outline" className="text-xs font-mono tabular-nums cursor-help gap-1">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalGeralBRL)}
                    <Info className="h-3 w-3 opacity-50" />
                  </Badge>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-3 py-1.5 rounded-md border bg-popover text-popover-foreground shadow-md text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    Valor consolidado em Real, convertido pelas cotações do sistema
                  </div>
                </div>
              );
            })()}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col h-full overflow-hidden relative">
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
              {/* KPIs Consolidados (Cards de Totais) */}
              {(() => {
                const totalFiatPorMoeda: SaldosPorMoeda = {};
                let totalCryptoUsd = 0;
                const totalBkPorMoeda: SaldosPorMoeda = {};
                
                parceirosAgrupados.forEach(p => {
                  Object.entries(p.total_fiat_por_moeda).forEach(([m, v]) => {
                    if (v) totalFiatPorMoeda[m] = (totalFiatPorMoeda[m] || 0) + v;
                  });
                  totalCryptoUsd += (p.total_crypto_usd - p.total_crypto_locked_usd);
                  Object.entries(p.total_bookmakers_por_moeda).forEach(([m, v]) => {
                    if (v) totalBkPorMoeda[m] = (totalBkPorMoeda[m] || 0) + v;
                  });
                });

                const fiatEntries = Object.entries(totalFiatPorMoeda).filter(([_, v]) => v > 0).sort(([, a], [, b]) => b - a);
                const bkEntries = Object.entries(totalBkPorMoeda).filter(([_, v]) => v > 0).sort(([, a], [, b]) => b - a);
                
                return (
                  <div className="grid grid-cols-3 gap-2 mb-4 shrink-0">
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Landmark className="h-3.5 w-3.5 text-chart-1" />
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Fiat</span>
                      </div>
                      {fiatEntries.length > 0 ? fiatEntries.map(([moeda, valor]) => (
                        <div key={moeda} className="text-sm font-mono font-semibold text-chart-1 tabular-nums">
                          {formatCurrency(valor, moeda)}
                        </div>
                      )) : <span className="text-sm text-muted-foreground/50">—</span>}
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Bitcoin className="h-3.5 w-3.5 text-chart-2" />
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Crypto</span>
                      </div>
                      {totalCryptoUsd > 0 ? <div className="text-sm font-mono font-semibold text-chart-2 tabular-nums">{formatCurrency(totalCryptoUsd, "USD")}</div> : <span className="text-sm text-muted-foreground/50">—</span>}
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Wallet className="h-3.5 w-3.5 text-chart-4" />
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Casas</span>
                      </div>
                      {bkEntries.length > 0 ? bkEntries.map(([moeda, valor]) => (
                        <div key={moeda} className="text-sm font-mono font-semibold text-chart-4 tabular-nums">
                          {CURRENCY_SYMBOLS[moeda] || moeda} {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      )) : <span className="text-sm text-muted-foreground/50">—</span>}
                    </div>
                  </div>
                );
              })()}

              {/* Controls Bar (Search and Filters) */}
              {!loading && parceirosAgrupados.length > 0 && (
                <div className="flex flex-col gap-3 mb-4 p-3 rounded-lg border border-border/40 bg-muted/10 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar parceiro..."
                      className="pl-9 h-9 bg-background/50 border-border/40 focus:ring-primary/20"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Ordenar:</span>
                      <div className="flex rounded-md border border-border/40 overflow-hidden bg-background/30">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2.5 text-[10px] rounded-none ${sortBy === "balance" ? "bg-primary/20 text-primary hover:bg-primary/30" : "hover:bg-muted/50"}`}
                          onClick={() => setSortBy("balance")}
                        >
                          <ArrowUpDown className="h-3 w-3 mr-1" />
                          Saldo
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2.5 text-[10px] rounded-none ${sortBy === "alphabetical" ? "bg-primary/20 text-primary hover:bg-primary/30" : "hover:bg-muted/50"}`}
                          onClick={() => setSortBy("alphabetical")}
                        >
                          <SortAsc className="h-3 w-3 mr-1" />
                          A-Z
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex rounded-md border border-border/40 overflow-hidden bg-background/30">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 w-8 p-0 rounded-none ${viewMode === "grid" ? "bg-primary/20 text-primary" : "hover:bg-muted/50"}`}
                          onClick={() => setViewMode("grid")}
                          title="Modo Card"
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 w-8 p-0 rounded-none ${viewMode === "list" ? "bg-primary/20 text-primary" : "hover:bg-muted/50"}`}
                          onClick={() => setViewMode("list")}
                          title="Modo Lista"
                        >
                          <List className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="show-all"
                          checked={showAll}
                          onCheckedChange={setShowAll}
                          className="scale-75"
                        />
                        <Label htmlFor="show-all" className="text-xs cursor-pointer text-muted-foreground">
                          {showAll ? "Todos" : "Ativos"}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 opacity-50" />
                  {totalParceiros} parceiro{totalParceiros !== 1 ? "s" : ""} {searchTerm ? "encontrado" : "com capital"}
                  {!showAll && !searchTerm && <span className="text-[10px] opacity-60 bg-muted/50 px-1.5 py-0.5 rounded ml-1">filtrado por ativos</span>}
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

                <ScrollArea 
                  className="flex-1 pr-4 -mr-4 h-[calc(100vh-450px)] [&>[data-radix-scroll-area-viewport]]:overflow-y-scroll" 
                  ref={scrollContainerRef as any}
                >
                  <style>
                    {`
                      [data-radix-scroll-area-viewport]::-webkit-scrollbar { width: 6px; }
                      [data-radix-scroll-area-viewport]::-webkit-scrollbar-track { background: transparent; }
                      [data-radix-scroll-area-viewport]::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
                      [data-radix-scroll-area-viewport]::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
                    `}
                  </style>
                  <div className="h-full">
                 {loading ? (
                    <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-3 pb-8" : "flex flex-col gap-1 pb-8"}>
                     {[1, 2, 3, 4].map((i) => <ParceiroSkeleton key={i} />)}
                   </div>
                 ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-8">
                       {filteredAndSortedParceiros.map((parceiro) => {
                        const fiatEntries = Object.entries(parceiro.total_fiat_por_moeda).filter(([_, v]) => v > 0).sort(([, a], [, b]) => b - a);
                        const primaryFiat = fiatEntries[0];
                        const bookmakerEntries = Object.entries(parceiro.total_bookmakers_por_moeda).filter(([_, v]) => v > 0).sort(([, a], [, b]) => b - a);
                        const hasBookmakerBalance = bookmakerEntries.length > 0;
                        return (
                           <Card key={parceiro.parceiro_id} className="relative bg-card/40 border-border/40 backdrop-blur-sm hover:border-primary/20 transition-all duration-300 overflow-visible group">
                             <CardHeader className="pb-2.5 pt-3 px-4 bg-muted/10">
                               <CardTitle className="text-[13px] font-bold text-foreground truncate">{parceiro.parceiro_nome}</CardTitle>
                             </CardHeader>
                            <CardContent className="px-4 pb-4 pt-4 space-y-4">
                              <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col p-2 rounded-lg bg-muted/20 border border-border/20 items-center justify-center text-center">
                                  <Landmark className="h-3 w-3 text-chart-1 mb-1 opacity-70" />
                                  <span className="text-[11px] font-mono font-bold text-chart-1 truncate w-full">
                                    {primaryFiat ? formatCurrency(primaryFiat[1], primaryFiat[0]) : "—"}
                                  </span>
                                </div>
                                <div className="flex flex-col p-2 rounded-lg bg-muted/20 border border-border/20 items-center justify-center text-center">
                                  <Bitcoin className="h-3 w-3 text-chart-2 mb-1 opacity-70" />
                                  <span className="text-[11px] font-mono font-bold text-chart-2 truncate w-full">
                                    {parceiro.saldos_crypto.length > 0 ? formatCurrency(parceiro.total_crypto_usd - parceiro.total_crypto_locked_usd, "USD") : "—"}
                                  </span>
                                </div>
                                 <div className="flex flex-col p-2 rounded-lg bg-muted/20 border border-border/20 items-center justify-center text-center">
                                   <Wallet className="h-3 w-3 text-chart-4 mb-1 opacity-70" />
                                   <span className="text-[11px] font-mono font-bold text-chart-4 truncate w-full">
                                     {hasBookmakerBalance ? `${CURRENCY_SYMBOLS[bookmakerEntries[0][0]] || bookmakerEntries[0][0]} ${bookmakerEntries[0][1].toLocaleString('pt-BR', { minimumFractionDigits: 1 })}` : "—"}
                                   </span>
                                 </div>
                               </div>
                               <div className="space-y-2">
                                 {primaryFiat && (
                                   <InteractiveTooltip containerRef={scrollContainerRef} className="w-full" content={<FiatHoverContent saldos={parceiro.saldos_fiat} />}>
                                     <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2 bg-muted/10 hover:bg-muted/20 text-[11px] font-medium border border-border/10">
                                       <div className="flex items-center gap-1.5"><Landmark className="h-3 w-3 text-chart-1" /><span>Bancos</span></div>
                                       <div className="flex items-center gap-1 font-mono text-chart-1">{formatCurrency(primaryFiat[1], primaryFiat[0])}{fiatEntries.length > 1 && <span className="text-[9px] text-muted-foreground">+{fiatEntries.length - 1}</span>}</div>
                                     </Button>
                                   </InteractiveTooltip>
                                 )}
                                  {parceiro.saldos_crypto.length > 0 && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="w-full justify-between h-8 px-2 bg-muted/10 hover:bg-muted/20 text-[11px] font-medium border border-border/10"
                                      onClick={(e) => handleOpenCryptoPanel(e, parceiro)}
                                    >
                                      <div className="flex items-center gap-1.5"><Bitcoin className="h-3 w-3 text-chart-2" /><span>Wallets</span></div>
                                      <div className="flex items-center gap-1 font-mono text-chart-2">
                                        {formatCurrency(parceiro.total_crypto_usd - parceiro.total_crypto_locked_usd, "USD")}
                                        {parceiro.total_crypto_locked_usd > 0 && <span className="text-[9px] text-chart-3">⏳ {formatCurrency(parceiro.total_crypto_locked_usd, "USD")}</span>}
                                      </div>
                                    </Button>
                                  )}
                                 {(hasBookmakerBalance || parceiro.pendentes_bookmakers.length > 0) && (
                                   <InteractiveTooltip containerRef={scrollContainerRef} className="w-full" content={<BookmakerDetailsContent saldos={parceiro.saldos_bookmakers} pendentes={parceiro.pendentes_bookmakers} />}>
                                     <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2 bg-muted/10 hover:bg-muted/20 text-[11px] font-medium border border-border/10">
                                       <div className="flex items-center gap-1.5"><Wallet className="h-3 w-3 text-chart-4" /><span>Casas</span></div>
                                       <div className="flex items-center gap-1 font-mono text-chart-4">
                                         {bookmakerEntries.slice(0, 1).map(([moeda, valor]) => (<span key={moeda}>{CURRENCY_SYMBOLS[moeda] || moeda} {valor.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</span>))}
                                         {parceiro.pendentes_bookmakers.length > 0 && <span className="text-[9px] text-chart-3">⏳ +{formatCurrency(Object.values(parceiro.total_pendente_por_moeda).reduce((a, b) => a + b, 0), "USD")}</span>}
                                       </div>
                                     </Button>
                                   </InteractiveTooltip>
                                 )}
                               </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 pb-8 border border-border/20 rounded-lg bg-card/20 overflow-hidden">
                      <div className="grid grid-cols-[1fr,80px,80px,80px,100px] gap-2 px-4 py-2 border-b border-border/30 bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <div>Nome</div>
                        <div className="text-right">Fiat</div>
                        <div className="text-right">Crypto</div>
                        <div className="text-right">Casas</div>
                        <div className="text-right">Total</div>
                      </div>
                      {filteredAndSortedParceiros.map((parceiro) => {
                        const fiatEntries = Object.entries(parceiro.total_fiat_por_moeda).filter(([_, v]) => v > 0).sort(([, a], [, b]) => b - a);
                        const primaryFiat = fiatEntries[0];
                        const bookmakerEntries = Object.entries(parceiro.total_bookmakers_por_moeda).filter(([_, v]) => v > 0).sort(([, a], [, b]) => b - a);
                        const fiatTotalBRL = fiatEntries.reduce((sum, [m, v]) => sum + convertToBRL(v, m), 0);
                        const cryptoTotalUSD = parceiro.total_crypto_usd - parceiro.total_crypto_locked_usd;
                        const casasTotalBRL = bookmakerEntries.reduce((sum, [m, v]) => sum + convertToBRL(v, m), 0);

                        return (
                          <div key={parceiro.parceiro_id} className="grid grid-cols-[1fr,80px,80px,80px,100px] gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors items-center border-b border-border/10 last:border-0 group">
                            <div className="text-[12px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{parceiro.parceiro_nome}</div>
                             <div className="text-[11px] font-mono text-chart-1 text-right">
                               {fiatTotalBRL > 0 ? (
                                 <InteractiveTooltip containerRef={scrollContainerRef} content={<FiatHoverContent saldos={parceiro.saldos_fiat} />}>
                                   {formatCurrency(fiatTotalBRL, "BRL").split(",")[0]}
                                 </InteractiveTooltip>
                               ) : "—"}
                             </div>
                             <div className="text-[11px] font-mono text-chart-2 text-right cursor-pointer hover:text-primary transition-colors" onClick={(e) => handleOpenCryptoPanel(e, parceiro)}>
                               {cryptoTotalUSD > 0 ? formatCurrency(cryptoTotalUSD, "USD").split(",")[0] : "—"}
                             </div>
                             <div className="text-[11px] font-mono text-chart-4 text-right">
                               {casasTotalBRL > 0 ? (
                                 <InteractiveTooltip containerRef={scrollContainerRef} content={<BookmakerDetailsContent saldos={parceiro.saldos_bookmakers} pendentes={parceiro.pendentes_bookmakers} />}>
                                   {formatCurrency(casasTotalBRL, "BRL").split(",")[0]}
                                 </InteractiveTooltip>
                               ) : "—"}
                             </div>
                            <div className="text-[11px] font-mono font-bold text-foreground text-right">{formatCurrency(parceiro.total_brl, "BRL")}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                   </div>
                 </ScrollArea>
              <SwapCryptoDialog
                open={swapDialog.open}
                onClose={() => setSwapDialog({ open: false, parceiroId: null })}
                onSuccess={() => {
                  setSwapDialog({ open: false, parceiroId: null });
                  fetchSaldosParceiros();
                }}
               caixaParceiroId={swapDialog.parceiroId}
             />

              {cryptoPanel.open && (
                <div 
                  ref={panelRef}
                  style={{ 
                    position: 'fixed', 
                    left: cryptoPanel.x, 
                    top: cryptoPanel.y, 
                    zIndex: 9999,
                    width: 340,
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    boxShadow: 'var(--shadow-2xl)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '80vh'
                  }}
                  className="animate-in fade-in zoom-in-95 duration-200"
                >
                  {/* Header */}
                  <div 
                    className="flex items-center justify-between p-3 border-b border-border/50 cursor-grab active:cursor-grabbing bg-muted/30 rounded-t-[var(--radius)]"
                    onMouseDown={onMouseDownDrag}
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Saldo por Carteira</span>
                      <span className="text-[10px] font-medium text-primary/80 truncate max-w-[200px]">{cryptoPanel.parceiroNome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <button
                          type="button"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setSwapDialog({ open: true, parceiroId: cryptoPanel.parceiroId });
                          }}
                          className="p-1 text-muted-foreground/60 hover:text-primary transition-colors"
                          title="Swap entre moedas"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </button>
                      <button 
                        onClick={() => setCryptoPanel(prev => ({ ...prev, open: false }))}
                        className="p-1 hover:bg-muted rounded-full transition-colors"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <ScrollArea 
                    className="flex-1" 
                    style={{ 
                      maxHeight: cryptoPanel.saldos.length > 6 ? 'calc(80vh - 120px)' : 'auto',
                      overflowY: 'auto'
                    }}
                  >
                    <div className="p-4 space-y-4">
                      {(() => {
                        const grouped = cryptoPanel.saldos.reduce<Record<string, { exchange: string; endereco: string; label?: string; items: any[] }>>((acc, s) => {
                          const key = s.endereco || s.exchange || "Wallet";
                          if (!acc[key]) acc[key] = { exchange: s.exchange, endereco: s.endereco, label: s.label, items: [] };
                          acc[key].items.push(s);
                          return acc;
                        }, {});

                        const walletKeys = Object.keys(grouped).sort();
                        
                        return walletKeys.map((wKey, wIdx) => {
                          const wallet = grouped[wKey];
                          const items = [...wallet.items].sort((a, b) => b.saldo_usd - a.saldo_usd);
                          const walletTotal = items.reduce((sum, s) => sum + s.saldo_usd, 0);
                          const walletId = `panel-wallet-${wIdx}`;
                          
                          return (
                            <div key={wKey} className={`space-y-2 ${wIdx > 0 ? "pt-3 border-t border-border/20" : ""}`}>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-chart-2 uppercase tracking-wide">
                                    {wallet.label || wallet.exchange || "Wallet"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/50 font-medium uppercase">
                                    {wallet.exchange && wallet.exchange !== "Wallet" ? wallet.exchange : ""}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] font-mono text-foreground/80 tracking-tight leading-none">
                                      {truncateAddr(wallet.endereco)}
                                    </span>
                                    {wallet.endereco && (
                                      <button 
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopy(wallet.endereco, walletId);
                                        }}
                                        className="text-muted-foreground/40 hover:text-primary transition-colors"
                                      >
                                        {copiedId === walletId ? (
                                          <div className="flex items-center gap-1">
                                            <Check className="h-3 w-3 text-green-500" />
                                            <span className="text-[9px] font-bold text-green-500">Copiado!</span>
                                          </div>
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                  <span className="text-[12px] font-mono font-bold text-foreground">
                                    {formatCurrency(walletTotal, "USD")}
                                  </span>
                                </div>
                              </div>
                              <div className="pl-2 space-y-1">
                                {items.map((s, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-[11px]">
                                    <span className="text-muted-foreground font-medium">{s.coin}</span>
                                    <div className="flex items-center gap-2">
                                      {s.saldo_locked_usd > 0 && (
                                        <span className="text-[10px] text-chart-3/70 italic tabular-nums">
                                          (⏳ {formatCurrency(s.saldo_locked_usd, "USD")})
                                        </span>
                                      )}
                                      <span className="font-mono text-foreground/90 tabular-nums">
                                        {formatCurrency(s.saldo_usd, "USD")}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        });
                      })()}
                      
                      {cryptoPanel.totalLocked > 0 && (
                        <div className="pt-2 border-t border-border/30 flex justify-between items-center bg-chart-3/5 px-2 py-1 rounded">
                          <span className="text-[11px] text-chart-3 font-semibold uppercase tracking-tighter">⏳ Total em Trânsito</span>
                          <span className="text-[12px] font-mono font-bold text-chart-3 tabular-nums">{formatCurrency(cryptoPanel.totalLocked, "USD")}</span>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
