import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface WalletOption {
  id: string;
  exchange: string;
  endereco: string;
  parceiro_id?: string;
  parceiro_nome?: string;
  moeda: string[];
}

export interface WalletCoinBalance {
  wallet_id: string;
  coin: string;
  saldo_coin: number;
  saldo_usd?: number;
}

 interface WalletSearchSelectProps {
   wallets: WalletOption[];
   value: string;
   onValueChange: (value: string) => void;
   placeholder?: string;
   saldos?: WalletCoinBalance[];
   usdToBrlRate?: number;
   cryptoPrices?: Record<string, number>;
 }

export function WalletSearchSelect({
  wallets,
  value,
  onValueChange,
  placeholder = "Selecione a wallet",
   saldos = [],
   usdToBrlRate = 0,
   cryptoPrices = {},
 }: WalletSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = wallets.find((w) => w.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return wallets;
    const q = search.toLowerCase();
    return wallets.filter(
      (w) =>
        w.exchange?.toLowerCase().includes(q) ||
        w.parceiro_nome?.toLowerCase().includes(q) ||
        w.endereco?.toLowerCase().includes(q) ||
        w.moeda?.some((m) => m.toLowerCase().includes(q))
    );
  }, [wallets, search]);

  // Group saldos by wallet_id
  const saldosByWallet = useMemo(() => {
    const map: Record<string, WalletCoinBalance[]> = {};
    for (const s of saldos) {
      if (!map[s.wallet_id]) map[s.wallet_id] = [];
      map[s.wallet_id].push(s);
    }
    return map;
  }, [saldos]);

  // Group wallets by parceiro
  const grouped = useMemo(() => {
    const groups: Record<string, { parceiro_nome: string; wallets: WalletOption[] }> = {};
    for (const w of filtered) {
      const key = w.parceiro_id || "__sem_parceiro__";
      if (!groups[key]) {
        groups[key] = { parceiro_nome: w.parceiro_nome || "Sem parceiro", wallets: [] };
      }
      groups[key].wallets.push(w);
    }
    return Object.entries(groups).sort((a, b) =>
      a[1].parceiro_nome.localeCompare(b[1].parceiro_nome)
    );
  }, [filtered]);

   const renderCoinBalances = (walletId: string) => {
     const balances = saldosByWallet[walletId];
     if (!balances || balances.length === 0) return null;
     
     // Calcula o total em USD usando os preços atuais (cotação real) se disponível
     const totalUsdRealTime = balances.reduce((sum, b) => {
      const coin = (b.coin ?? "").toUpperCase();
      if (!coin) return sum;
       let price = 0;
       if (coin === "USDT" || coin === "USDC") {
         price = 1.0;
       } else {
         price = cryptoPrices[coin] || 0;
       }
       
       // Se não temos preço atual, tentamos usar o saldo_usd histórico como fallback
       if (price === 0 && b.saldo_usd) {
         return sum + b.saldo_usd;
       }
       
       return sum + (b.saldo_coin * price);
     }, 0);
     
     return (
       <div className="flex flex-col gap-0.5 mt-0.5">
         <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
           {balances.map((b) => (
             <span key={b.coin} className="text-[10px] text-muted-foreground">
               <span className="font-medium text-foreground/70">{b.coin}</span>{" "}
               {b.saldo_coin.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
             </span>
           ))}
         </div>
         {totalUsdRealTime !== 0 && (
           <div className="flex items-center gap-1">
             <span className="text-[10px] text-primary font-bold">
               Consolidado: US$ {totalUsdRealTime.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </span>
             <span className="text-[9px] text-muted-foreground font-normal italic">
               (Cotação Real)
             </span>
           </div>
         )}
       </div>
     );
   };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10 font-normal"
        >
          {selected ? (
            <div className="flex flex-col items-start gap-0.5 text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium uppercase text-sm">{selected.exchange}</span>
                <div className="flex gap-1">
                  {selected.moeda.slice(0, 3).map((m) => (
                    <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {m}
                    </Badge>
                  ))}
                  {selected.moeda.length > 3 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      +{selected.moeda.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {selected.parceiro_nome && <span>{selected.parceiro_nome}</span>}
                {selected.parceiro_nome && <span>•</span>}
                <span className="font-mono">
                  {selected.endereco.slice(0, 6)}...{selected.endereco.slice(-4)}
                </span>
              </div>
              {renderCoinBalances(selected.id)}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar por exchange, parceiro ou endereço..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1">
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma wallet encontrada.
            </p>
          )}
          {grouped.map(([parceiroId, group]) => (
            <div key={parceiroId}>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 sticky top-0 bg-popover z-10">
                <User className="h-3 w-3" />
                {group.parceiro_nome}
              </div>
              {group.wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => {
                    onValueChange(wallet.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent/50 cursor-pointer transition-colors",
                    value === wallet.id && "bg-accent"
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      value === wallet.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium uppercase">{wallet.exchange}</span>
                      <div className="flex gap-1">
                        {wallet.moeda.slice(0, 3).map((m) => (
                          <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {m}
                          </Badge>
                        ))}
                        {wallet.moeda.length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            +{wallet.moeda.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {wallet.endereco.slice(0, 6)}...{wallet.endereco.slice(-4)}
                      </span>
                    </div>
                    {renderCoinBalances(wallet.id)}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
