import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CopyableLineProps {
  value: string;
  label?: string;
  /** When true, truncates display but copies full value */
  truncate?: boolean;
  compact?: boolean;
}

/**
 * Linha copiável inline — renderiza um chip monoespaçado com botão de cópia.
 * O valor exibido pode ser truncado, mas o valor copiado é sempre completo.
 */
export function CopyableLine({ value, label, truncate = true, compact }: CopyableLineProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado", { duration: 1500 });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const display = truncate && value.length > 48
    ? `${value.slice(0, 24)}…${value.slice(-12)}`
    : value;

  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1.5 align-middle max-w-full min-w-0",
        "rounded-md border border-border/40 bg-background/60",
        "px-1.5 py-0.5 my-0.5",
        compact ? "text-[11px]" : "text-xs"
      )}
    >
      {label && (
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70 shrink-0">
          {label}
        </span>
      )}
      <code
        title={value}
        className="font-mono text-foreground/80 truncate min-w-0"
      >
        {display}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "shrink-0 inline-flex items-center justify-center rounded p-0.5",
          "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
        )}
        title="Copiar"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}