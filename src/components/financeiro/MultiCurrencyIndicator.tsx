/**
 * Indicador visual de operação multimoeda para o módulo Financeiro
 * Mostra badges e tooltips quando há valores em múltiplas moedas
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Globe, RefreshCcw, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BANNER_DISMISSED_KEY = "financeiro_multicurrency_banner_dismissed";

interface MultiCurrencyBadgeProps {
  moedas: string[];
  cotacaoUSD: number;
  className?: string;
  compact?: boolean;
}

export function MultiCurrencyBadge({
  moedas,
  cotacaoUSD,
  className,
  compact = false,
}: MultiCurrencyBadgeProps) {
  const moedasUnicas = [...new Set(moedas.filter(Boolean))];
  const hasMultiple = moedasUnicas.length > 1 || moedasUnicas.some(m => m !== "BRL");
  
  if (!hasMultiple) return null;

  const hasForeign = moedasUnicas.some(m => m !== "BRL");
  const hasUSD = moedasUnicas.includes("USD");
  const hasCrypto = moedasUnicas.some(m => ["USDT", "USDC", "BTC", "ETH"].includes(m));

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs gap-1 cursor-help",
              hasCrypto ? "border-orange-500/50 text-orange-600 dark:text-orange-400" :
              hasUSD ? "border-green-500/50 text-green-600 dark:text-green-400" :
              "border-primary/50 text-primary",
              className
            )}
          >
            <Globe className="h-3 w-3" />
            {!compact && (
              <span>
                {hasCrypto ? "Multi + Crypto" : hasUSD ? "Multi USD" : "Multimoeda"}
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          <div className="space-y-2">
            <p className="font-medium text-sm">Consolidação Multimoeda</p>
            <p className="text-xs text-muted-foreground">
              Valores consolidados em BRL usando:
            </p>
            <div className="text-xs space-y-1">
              {hasUSD && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">USD/BRL:</span>
                  <span className="font-medium">R$ {cotacaoUSD.toFixed(4)}</span>
                </div>
              )}
              {hasCrypto && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Crypto:</span>
                  <span className="font-medium">via USD × {cotacaoUSD.toFixed(2)}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
              Moedas: {moedasUnicas.join(", ")}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ConsolidationInfoProps {
  cotacaoUSD: number;
  fonte: string;
  lastUpdate: Date | null;
  totalBRL: number;
  totalUSD: number;
  totalCrypto: number;
  formatBRL: (value: number) => string;
  className?: string;
}

export function ConsolidationInfoCard({
  cotacaoUSD,
  fonte,
  lastUpdate,
  totalBRL,
  totalUSD,
  totalCrypto,
  formatBRL,
  className,
}: ConsolidationInfoProps) {
  const hasUSD = totalUSD > 0;
  const hasCrypto = totalCrypto > 0;
  const hasMultiple = hasUSD || hasCrypto;

  if (!hasMultiple) return null;

  return (
    <div className={cn(
      "p-3 rounded-lg border border-dashed",
      "bg-gradient-to-r from-primary/5 to-transparent",
      className
    )}>
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-full bg-primary/10">
          <Globe className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Consolidação Multimoeda</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valores convertidos para BRL em tempo real
          </p>
          
          <div className="grid grid-cols-2 gap-2 mt-2">
            {totalBRL > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">BRL:</span>
                <span className="ml-1 font-medium">{formatBRL(totalBRL)}</span>
              </div>
            )}
            {hasUSD && (
              <div className="text-xs">
                <span className="text-muted-foreground">USD:</span>
                <span className="ml-1 font-medium">
                  ${totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-muted-foreground ml-1">
                  (×{cotacaoUSD.toFixed(2)})
                </span>
              </div>
            )}
            {hasCrypto && (
              <div className="text-xs">
                <span className="text-muted-foreground">Crypto:</span>
                <span className="ml-1 font-medium">
                  ${totalCrypto.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">
              Fonte: {fonte}
            </span>
            {lastUpdate && (
              <span className="text-[10px] text-muted-foreground">
                • Atualizado às {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CurrencyBreakdownProps {
  brl: number;
  usd: number;
  crypto: number;
  cotacaoUSD: number;
  formatBRL: (value: number) => string;
  showAsPercentage?: boolean;
  className?: string;
}

export function CurrencyBreakdown({
  brl,
  usd,
  crypto,
  cotacaoUSD,
  formatBRL,
  showAsPercentage = false,
  className,
}: CurrencyBreakdownProps) {
  const usdInBRL = usd * cotacaoUSD;
  const cryptoInBRL = crypto * cotacaoUSD;
  const total = brl + usdInBRL + cryptoInBRL;

  if (total === 0) return null;

  const items = [
    { label: "BRL", value: brl, color: "bg-primary" },
    { label: "USD", value: usdInBRL, color: "bg-green-500" },
    { label: "Crypto", value: cryptoInBRL, color: "bg-orange-500" },
  ].filter(item => item.value > 0);

  if (items.length <= 1) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        {items.map((item, idx) => {
          const percent = (item.value / total) * 100;
          return (
            <div
              key={item.label}
              className={cn("h-full transition-all", item.color)}
              style={{ width: `${percent}%` }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs">
        {items.map((item) => {
          const percent = (item.value / total) * 100;
          return (
            <div key={item.label} className="flex items-center gap-1">
              <div className={cn("w-2 h-2 rounded-full", item.color)} />
              <span className="text-muted-foreground">{item.label}</span>
              {showAsPercentage ? (
                <span className="font-medium">{percent.toFixed(0)}%</span>
              ) : (
                <span className="font-medium">{formatBRL(item.value)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MultiCurrencyWarningBannerProps {
  hasUSD: boolean;
  hasCrypto: boolean;
  cotacaoUSD: number;
  className?: string;
}

export function MultiCurrencyWarningBanner({
  hasUSD,
  hasCrypto,
  cotacaoUSD,
  className,
}: MultiCurrencyWarningBannerProps) {
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
    setIsDismissed(dismissed === "true");
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, "true");
    setIsDismissed(true);
  };

  if (!hasUSD && !hasCrypto) return null;
  if (isDismissed) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg",
      "bg-amber-500/10 border border-amber-500/20",
      "text-xs text-amber-700 dark:text-amber-400",
      className
    )}>
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">
        Métricas consolidadas em BRL 
        {hasUSD && ` (USD @ R$ ${cotacaoUSD.toFixed(2)})`}
        {hasCrypto && " incluindo ativos crypto"}
      </span>
      <button
        onClick={handleDismiss}
        className="p-1 rounded hover:bg-amber-500/20 transition-colors"
        aria-label="Fechar aviso"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
