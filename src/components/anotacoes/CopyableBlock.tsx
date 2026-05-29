import { useState } from "react";
import { Copy, Check, CopyCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CopyableBlockProps {
  /** First non-empty line if it doesn't look like data, else undefined */
  label?: string;
  lines: string[];
  compact?: boolean;
}

/**
 * Bloco copiável — múltiplas linhas, cada uma com botão de cópia individual + "copiar tudo".
 */
export function CopyableBlock({ label, lines, compact }: CopyableBlockProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copy = async (text: string, onDone: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      onDone();
      toast.success("Copiado", { duration: 1500 });
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    copy(lines.join("\n"), () => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    });
  };

  const handleCopyLine = (e: React.MouseEvent, idx: number, text: string) => {
    e.stopPropagation();
    e.preventDefault();
    copy(text, () => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((curr) => (curr === idx ? null : curr)), 1800);
    });
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "my-1.5 rounded-md border border-border/40 bg-background/60 overflow-hidden",
        "max-w-full min-w-0"
      )}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-muted/30 border-b border-border/30">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/80 truncate">
          {label || "Copiável"}
        </span>
        {lines.length > 1 && (
          <button
            type="button"
            onClick={handleCopyAll}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/50"
            title="Copiar tudo"
          >
            {copiedAll ? <Check className="h-3 w-3 text-emerald-500" /> : <CopyCheck className="h-3 w-3" />}
            <span>{copiedAll ? "copiado" : "copiar tudo"}</span>
          </button>
        )}
      </div>
      <div className="divide-y divide-border/20">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="group/line flex items-center gap-2 px-2 py-1 min-w-0"
          >
            <code
              title={line}
              className={cn(
                "font-mono text-foreground/85 flex-1 min-w-0 truncate",
                compact ? "text-[11px]" : "text-xs"
              )}
            >
              {line}
            </code>
            <button
              type="button"
              onClick={(e) => handleCopyLine(e, idx, line)}
              className="shrink-0 inline-flex items-center justify-center rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors opacity-60 group-hover/line:opacity-100"
              title="Copiar linha"
            >
              {copiedIdx === idx ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}