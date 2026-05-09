import React from "react";
import { Wallet, Network } from "lucide-react";
import { truncateAddress, formatNetworkName } from "@/utils/cryptoUtils";
import { cn } from "@/lib/utils";

interface WalletDisplayItemProps {
  nickname?: string | null;
  name?: string | null;
  exchange?: string | null;
  network?: string | null;
  address: string;
  balance?: string | number | null;
  balanceCoin?: string | null;
  balanceUsd?: number | null;
  showIcon?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "list" | "card";
}

export function WalletDisplayItem({
  nickname,
  name,
  exchange,
  network,
  address,
  balance,
  balanceCoin,
  balanceUsd,
  showIcon = true,
  className,
  size = "md",
  variant = "default",
}: WalletDisplayItemProps) {
  // Primary line: Nickname > Name > Exchange > "Sem nome"
  const primaryLabel = nickname || name || exchange || "Carteira sem nome";
  
  // Secondary line: Network + Truncated Address
  const formattedNetwork = formatNetworkName(network);
  const truncatedAddr = truncateAddress(address, 6, 4);
  
  const isCard = variant === "card";
  const isList = variant === "list";

  return (
    <div className={cn("flex items-center gap-3 w-full min-w-0", className)}>
      {showIcon && (
        <div className={cn(
          "shrink-0 rounded-md bg-primary/10 flex items-center justify-center",
          size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8"
        )}>
          <Wallet className={cn(
            "text-primary",
            size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4"
          )} />
        </div>
      )}
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 justify-between w-full">
          <span className={cn(
            "font-semibold truncate text-foreground",
            size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm"
          )}>
            {primaryLabel}
          </span>
          
          {balance !== undefined && balance !== null && !isCard && (
            <span className={cn(
              "shrink-0 font-bold text-primary tabular-nums",
              size === "sm" ? "text-[10px]" : "text-xs"
            )}>
              {typeof balance === "number" 
                ? balance.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) 
                : balance}
              {balanceCoin ? ` ${balanceCoin}` : ""}
            </span>
          )}
        </div>
        
        <div className={cn(
          "flex items-center gap-1.5 text-muted-foreground truncate",
          size === "sm" ? "text-[10px]" : "text-xs"
        )}>
          {formattedNetwork && (
            <>
              <span className="truncate">{formattedNetwork}</span>
              <span className="opacity-40">•</span>
            </>
          )}
          <span className="font-mono">{truncatedAddr}</span>
        </div>

        {isCard && balanceUsd !== undefined && balanceUsd !== null && (
          <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo</span>
            <div className="text-right">
              <div className="text-sm font-bold text-primary">
                {typeof balance === "number" 
                  ? balance.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) 
                  : balance}
                {balanceCoin ? ` ${balanceCoin}` : ""}
              </div>
              {balanceUsd > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  ≈ ${balanceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}