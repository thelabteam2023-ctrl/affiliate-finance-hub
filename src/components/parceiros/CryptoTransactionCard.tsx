import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Info, Wallet, Copy, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * ARQUITETURA: Card de Transação Crypto Institucional
 * 
 * Este componente implementa uma visão financeira de nível institucional para
 * movimentações crypto, seguindo as regras:
 * 
 * 1️⃣ IDENTIDADE: Pessoa → Wallet → Endereço (3 níveis obrigatórios)
 * 2️⃣ ATIVO E REDE: [Tipo] [Ativo] [Rede] - nunca apenas "CRYPTO"
 * 3️⃣ FLUXO: Origem → Valor → Destino com informações completas
 * 
 * Compatível com: multi-chain, multi-token, auditoria, reconciliação contábil
 */

// ============================================================================
// TIPOS
// ============================================================================

export interface CryptoParty {
  owner_name: string | null;
  wallet_name: string | null;
  address: string | null;
  logo_url?: string | null;
}

export interface CryptoTransactionData {
  id: string;
  type: "sent" | "received";
  asset: string | null;
  network: string | null;
  amount: number;
  amount_usd: number | null;
  date: string;
  description: string | null;
  status: string;
  from: CryptoParty;
  to: CryptoParty;
}

interface CryptoTransactionCardProps {
  transaction: CryptoTransactionData;
  showSensitiveData: boolean;
  formatDate: (date: string) => string;
}

// ============================================================================
// HELPERS
// ============================================================================

const abbreviateAddress = (address: string | null): string => {
  if (!address) return "Endereço desconhecido";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
};

const getNetworkDisplayName = (network: string | null): string => {
  if (!network) return "N/A";
  
  // Mapear abreviações comuns
  const networkMap: Record<string, string> = {
    "ETH": "Ethereum",
    "ERC20": "Ethereum",
    "Ethereum (ERC20)": "ERC20",
    "BSC": "BNB Chain",
    "BEP20": "BNB Chain",
    "TRC20": "Tron",
    "TRON": "Tron",
    "SOL": "Solana",
    "POLYGON": "Polygon",
    "MATIC": "Polygon",
    "ARBITRUM": "Arbitrum",
    "ARB": "Arbitrum",
    "OPTIMISM": "Optimism",
    "OP": "Optimism",
    "AVAX": "Avalanche",
    "AVALANCHE": "Avalanche",
  };
  
  return networkMap[network.toUpperCase()] || network;
};

const getNetworkBadgeColor = (network: string | null): string => {
  if (!network) return "bg-muted text-muted-foreground border-muted";
  
  const colorMap: Record<string, string> = {
    "ETH": "bg-blue-500/10 text-blue-400 border-blue-500/30",
    "ERC20": "bg-blue-500/10 text-blue-400 border-blue-500/30",
    "ETHEREUM": "bg-blue-500/10 text-blue-400 border-blue-500/30",
    "BSC": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    "BEP20": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    "TRC20": "bg-red-500/10 text-red-400 border-red-500/30",
    "TRON": "bg-red-500/10 text-red-400 border-red-500/30",
    "SOL": "bg-purple-500/10 text-purple-400 border-purple-500/30",
    "SOLANA": "bg-purple-500/10 text-purple-400 border-purple-500/30",
    "POLYGON": "bg-violet-500/10 text-violet-400 border-violet-500/30",
    "MATIC": "bg-violet-500/10 text-violet-400 border-violet-500/30",
    "ARBITRUM": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    "ARB": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  };
  
  // Check for network in string (e.g., "Ethereum (ERC20)")
  const normalizedNetwork = network.toUpperCase();
  for (const [key, color] of Object.entries(colorMap)) {
    if (normalizedNetwork.includes(key)) return color;
  }
  
  return "bg-slate-500/10 text-slate-400 border-slate-500/30";
};

const getAssetBadgeColor = (asset: string | null): string => {
  if (!asset) return "bg-muted text-muted-foreground border-muted";
  
  const colorMap: Record<string, string> = {
    "USDT": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    "USDC": "bg-blue-500/10 text-blue-400 border-blue-500/30",
    "ETH": "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    "BTC": "bg-orange-500/10 text-orange-400 border-orange-500/30",
    "BNB": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    "SOL": "bg-purple-500/10 text-purple-400 border-purple-500/30",
    "MATIC": "bg-violet-500/10 text-violet-400 border-violet-500/30",
    "DAI": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };
  
  return colorMap[asset.toUpperCase()] || "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
};

// ============================================================================
// SUB-COMPONENTES
// ============================================================================

const CopyableAddress = memo(function CopyableAddress({ 
  address 
}: { 
  address: string | null 
}) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };
  
  if (!address) {
    return (
      <span className="text-[10px] text-muted-foreground/50 italic">
        Endereço não informado
      </span>
    );
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span className="font-mono">{abbreviateAddress(address)}</span>
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="font-mono text-[10px]">
        {address}
      </TooltipContent>
    </Tooltip>
  );
});

const PartyIdentity = memo(function PartyIdentity({
  party,
  align = "left",
  label,
}: {
  party: CryptoParty;
  align?: "left" | "right";
  label: string;
}) {
  const isRight = align === "right";
  
  return (
    <div className={cn(
      "flex flex-col min-w-0 flex-1",
      isRight ? "items-end text-right" : "items-start text-left"
    )}>
      {/* Label */}
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">
        {label}
      </span>
      
      {/* Nível 1: Pessoa (Owner) + Logo */}
      <div className={cn(
        "flex items-center gap-1.5",
        isRight && "flex-row-reverse"
      )}>
        {party.logo_url && (
          <img 
            src={party.logo_url} 
            alt="" 
            className="h-4 w-4 rounded-sm object-contain shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
          {party.owner_name || "Proprietário desconhecido"}
        </span>
      </div>
      
      {/* Nível 2: Wallet */}
      <div className={cn(
        "flex items-center gap-1",
        isRight && "flex-row-reverse"
      )}>
        <Wallet className="h-3 w-3 text-muted-foreground/70" />
        <span className="text-[11px] text-muted-foreground truncate max-w-[130px]">
          {party.wallet_name || "Wallet desconhecida"}
        </span>
      </div>
      
      {/* Nível 3: Endereço */}
      <CopyableAddress address={party.address} />
    </div>
  );
});

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export const CryptoTransactionCard = memo(function CryptoTransactionCard({
  transaction,
  showSensitiveData,
  formatDate,
}: CryptoTransactionCardProps) {
  const { type, asset, network, amount, amount_usd, date, description, status, from, to } = transaction;
  
  // Format value
  const formatValue = () => {
    const value = amount_usd ?? amount;
    if (!showSensitiveData) return "$ ••••";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };
  
  // Type badge color
  const getTypeBadgeColor = () => {
    if (status === "RECUSADO") {
      return "bg-muted text-muted-foreground border-muted line-through";
    }
    return type === "received"
      ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
      : "bg-blue-500/20 text-blue-500 border-blue-500/30";
  };
  
  const typeLabel = type === "received" ? "Transferência Recebida" : "Transferência Enviada";
  
  return (
    <div className="p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors">
      {/* Header: Badges + Data */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Badge: Tipo */}
          <Badge variant="outline" className={cn("text-[10px]", getTypeBadgeColor())}>
            {typeLabel}
          </Badge>
          
          {/* Badge: Ativo */}
          {asset ? (
            <Badge variant="outline" className={cn("text-[10px] font-mono", getAssetBadgeColor(asset))}>
              {asset}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
              Ativo N/A
            </Badge>
          )}
          
          {/* Badge: Rede */}
          {network ? (
            <Badge variant="outline" className={cn("text-[10px]", getNetworkBadgeColor(network))}>
              {getNetworkDisplayName(network)}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
              Rede N/A
            </Badge>
          )}
          
          {/* Info icon for description */}
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="text-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatDate(date)}
        </span>
      </div>
      
      {/* Flow: Origem → Valor → Destino */}
      <div className="flex items-stretch gap-3">
        {/* Origem (From) */}
        <PartyIdentity party={from} align="left" label="Origem" />
        
        {/* Arrow + Value */}
        <div className="flex flex-col items-center justify-center shrink-0 px-2">
          <ArrowRight className="h-4 w-4 text-muted-foreground mb-1" />
          <span className="text-sm font-bold text-foreground whitespace-nowrap">
            {formatValue()}
          </span>
          {asset && (
            <span className="text-[9px] text-muted-foreground">
              {amount.toFixed(asset === "ETH" || asset === "BTC" ? 6 : 2)} {asset}
            </span>
          )}
        </div>
        
        {/* Destino (To) */}
        <PartyIdentity party={to} align="right" label="Destino" />
      </div>
      
      {/* Footer: Status Badge */}
      {status !== "CONFIRMADO" && (
        <div className="mt-2 flex justify-end">
          <Badge
            variant="outline"
            className={cn(
              "text-[9px]",
              status === "PENDENTE"
                ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                : status === "RECUSADO"
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-muted text-muted-foreground border-muted"
            )}
          >
            {status}
          </Badge>
        </div>
      )}
    </div>
  );
});
