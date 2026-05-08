import React, { useState } from "react";
import { Wallet, Network, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface WalletCryptoOption {
  id: string;
  label?: string | null;
  exchange?: string | null;
  endereco: string;
  network?: string | null;
  moeda?: string[] | null;
  saldo_coin?: number;
  saldo_usd?: number;
}

interface WalletCryptoSelectProps {
  wallets: WalletCryptoOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showBalance?: boolean;
  coinFilter?: string; // If provided, only shows balance for this coin
}

export function WalletCryptoSelect({
  wallets,
  value,
  onValueChange,
  placeholder = "Selecione uma carteira",
  disabled = false,
  className,
  showBalance = false,
  coinFilter,
}: WalletCryptoSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredWallets = wallets.filter((w) => {
    const search = searchTerm.toLowerCase();
    return (
      (w.label?.toLowerCase().includes(search)) ||
      (w.exchange?.toLowerCase().includes(search)) ||
      (w.network?.toLowerCase().includes(search)) ||
      (w.endereco.toLowerCase().includes(search))
    );
  });

  const selectedWallet = wallets.find((w) => w.id === value);

  const formatLabel = (w: WalletCryptoOption) => {
    if (w.label) return w.label;
    if (w.exchange && w.network) return `${w.exchange} (${w.network})`;
    if (w.exchange) return w.exchange;
    if (w.network) return w.network;
    return "Wallet sem nome";
  };

  const truncAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={cn("h-auto py-2", className)}>
        <SelectValue placeholder={placeholder}>
          {selectedWallet ? (
            <div className="flex flex-col items-start text-left gap-0.5 overflow-hidden">
              <div className="flex items-center gap-1.5 w-full">
                <span className="font-semibold text-sm truncate uppercase tracking-tight">
                  {formatLabel(selectedWallet)}
                </span>
                {selectedWallet.network && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 uppercase shrink-0">
                    {selectedWallet.network}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                <span className="truncate">{truncAddr(selectedWallet.endereco)}</span>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[400px] w-[var(--radix-select-trigger-width)]">
        <div className="flex items-center px-3 pb-2 pt-1 sticky top-0 bg-popover z-10 border-b border-border/50 mb-1">
          <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
          <Input
            placeholder="Buscar wallet, rede ou endereço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 text-xs border-none focus-visible:ring-0 px-0"
            autoFocus
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        {filteredWallets.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma carteira encontrada
          </div>
        ) : (
          filteredWallets.map((w) => (
            <SelectItem key={w.id} value={w.id} className="cursor-pointer py-3 focus:bg-accent/50">
              <div className="flex flex-col gap-1 w-full pr-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-primary/10 p-1.5 rounded-md shrink-0">
                      <Wallet className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="font-bold text-sm truncate uppercase tracking-tight">
                      {formatLabel(w)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {w.network && (
                      <div className="flex items-center gap-1 text-[10px] bg-muted/50 px-1.5 py-0.5 rounded border border-border/50 font-medium text-muted-foreground">
                        <Network className="h-3 w-3" />
                        {w.network.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-[11px] pl-8">
                  <span className="font-mono text-muted-foreground/80 truncate max-w-[180px]">
                    {w.endereco}
                  </span>
                  
                  {showBalance && w.saldo_coin !== undefined && (
                    <div className="text-right shrink-0 ml-2">
                      <span className="font-bold text-primary">
                        {w.saldo_coin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {coinFilter}
                      </span>
                      {w.saldo_usd !== undefined && (
                        <div className="text-[9px] text-muted-foreground">
                          ≈ ${w.saldo_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
