import React, { useState, useMemo } from "react";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WalletDisplayItem } from "./WalletDisplayItem";
import { getWalletDisplayName } from "@/utils/cryptoUtils";

export interface WalletCryptoOption {
  id: string;
  label?: string | null;
  nickname?: string | null;
  identificacao_wallet?: string | null;
  exchange?: string | null;
  exchangeWallet?: string | null;
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
  triggerRef?: React.Ref<HTMLButtonElement>;
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
  triggerRef,
}: WalletCryptoSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredWallets = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();
    if (!search) return wallets;
    return wallets.filter((w) => {
      const displayName = getWalletDisplayName({
        label: w.label,
        nickname: w.nickname,
        identificacao_wallet: w.identificacao_wallet,
        exchange: w.exchange,
        exchangeWallet: w.exchangeWallet
      }).toLowerCase();

      return (
        displayName.includes(search) ||
        (w.exchange?.toLowerCase().includes(search)) ||
        (w.exchangeWallet?.toLowerCase().includes(search)) ||
        (w.network?.toLowerCase().includes(search)) ||
        (w.endereco.toLowerCase().includes(search))
      );
    });
  }, [wallets, searchTerm]);

  const selectedWallet = useMemo(() => wallets.find((w) => w.id === value), [wallets, value]);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger ref={triggerRef} className={cn("h-auto py-2", className)}>
        <SelectValue placeholder={placeholder}>
          {selectedWallet ? (
            <WalletDisplayItem
              nickname={selectedWallet.label}
              exchange={selectedWallet.exchange}
              network={selectedWallet.network}
              address={selectedWallet.endereco}
              size="sm"
              showIcon={true}
            />
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
            <SelectItem key={w.id} value={w.id} className="cursor-pointer py-2 focus:bg-accent/50">
              <WalletDisplayItem
                nickname={w.label}
                exchange={w.exchange}
                network={w.network}
                address={w.endereco}
                balance={showBalance ? w.saldo_coin : undefined}
                balanceCoin={coinFilter}
                size="sm"
                variant="list"
              />
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
