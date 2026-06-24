import { useState } from "react";
import { Check, Copy, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  formatNetworkName,
  truncateAddress,
  getWalletDisplayName,
} from "@/utils/cryptoUtils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DestinoConfirmadoCardProps {
  parceiroNome?: string | null;
  wallet: {
    label?: string | null;
    nickname?: string | null;
    identificacao_wallet?: string | null;
    exchange?: string | null;
    network?: string | null;
    endereco: string;
  };
  origemNetwork?: string | null;
  ackMismatch?: boolean;
  onAckMismatchChange?: (value: boolean) => void;
  sameWalletWarning?: boolean;
}

function normalizeNetwork(n?: string | null): string {
  if (!n) return "";
  return n.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function DestinoConfirmadoCard({
  parceiroNome,
  wallet,
  origemNetwork,
  ackMismatch = false,
  onAckMismatchChange,
  sameWalletWarning = false,
}: DestinoConfirmadoCardProps) {
  const [copied, setCopied] = useState(false);

  const walletName = getWalletDisplayName({
    label: wallet.label,
    nickname: wallet.nickname,
    identificacao_wallet: wallet.identificacao_wallet,
    exchange: wallet.exchange,
  });

  const networkLabel = formatNetworkName(wallet.network);
  const truncated = truncateAddress(wallet.endereco, 8, 6);

  const a = normalizeNetwork(origemNetwork);
  const b = normalizeNetwork(wallet.network);
  const hasOrigemNetwork = Boolean(a);
  const networkMatch = hasOrigemNetwork && a === b;
  const networkMismatch = hasOrigemNetwork && !networkMatch;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.endereco);
      setCopied(true);
      toast.success("Wallet copiada", {
        description: truncated,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar a wallet");
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/60 p-3 space-y-2 transition-colors",
        sameWalletWarning
          ? "border-destructive/60"
          : networkMismatch
          ? "border-amber-500/60"
          : "border-emerald-500/40"
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Destino confirmado
        </span>
        {!sameWalletWarning && networkMatch && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500">
            <ShieldCheck className="h-3 w-3" />
            Rede compatível
          </span>
        )}
        {!sameWalletWarning && networkMismatch && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            Redes diferentes
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        {parceiroNome && (
          <div className="text-sm font-semibold text-foreground leading-tight">
            {parceiroNome}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {walletName}
          {networkLabel && (
            <>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {networkLabel}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <code className="flex-1 font-mono text-xs text-foreground truncate select-all">
                {truncated}
              </code>
            </TooltipTrigger>
            <TooltipContent side="top" className="font-mono text-[11px] max-w-[420px] break-all">
              {wallet.endereco}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          type="button"
          size="sm"
          variant={copied ? "default" : "outline"}
          className="h-7 shrink-0 gap-1.5 text-xs"
          onClick={handleCopy}
          aria-label="Copiar endereço da wallet"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </>
          )}
        </Button>
      </div>

      {sameWalletWarning && (
        <div className="flex items-start gap-2 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Origem e destino não podem ser a mesma wallet.</span>
        </div>
      )}

      {!sameWalletWarning && networkMismatch && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-amber-500/90 leading-snug">
            A origem está em <strong>{formatNetworkName(origemNetwork) || origemNetwork}</strong> e
            o destino em <strong>{networkLabel || wallet.network}</strong>. Confirme antes de
            prosseguir — fundos enviados em rede incompatível podem ser perdidos.
          </p>
          {onAckMismatchChange && (
            <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
              <Checkbox
                checked={ackMismatch}
                onCheckedChange={(v) => onAckMismatchChange(Boolean(v))}
              />
              Estou ciente do risco e quero prosseguir
            </label>
          )}
        </div>
      )}
    </div>
  );
}