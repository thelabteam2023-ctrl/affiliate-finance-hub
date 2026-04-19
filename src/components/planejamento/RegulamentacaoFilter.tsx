import { cn } from "@/lib/utils";

export type RegFilterValue = "all" | "REGULAMENTADA" | "NAO_REGULAMENTADA";

interface Props {
  value: RegFilterValue;
  onChange: (v: RegFilterValue) => void;
  showAll?: boolean;
  totalAll?: number;
  totalReg?: number;
  totalNaoReg?: number;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Filtro de regulamentação no padrão visual usado em Gestão de Parceiros
 * (Desempenho por Casa): pills compactas em verde (REG) e âmbar (N/REG).
 */
export function RegulamentacaoFilter({
  value,
  onChange,
  showAll = true,
  totalAll,
  totalReg,
  totalNaoReg,
  size = "md",
  className,
}: Props) {
  const h = size === "sm" ? "h-5" : "h-6";
  const text = size === "sm" ? "text-[10px]" : "text-[11px]";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/50 p-0.5 shrink-0",
        className,
      )}
    >
      {showAll && (
        <button
          type="button"
          onClick={() => onChange("all")}
          className={cn(
            h, text,
            "px-2 rounded font-medium tracking-wide transition-colors uppercase",
            value === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          Todas{typeof totalAll === "number" ? ` (${totalAll})` : ""}
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange(value === "REGULAMENTADA" ? "all" : "REGULAMENTADA")}
        className={cn(
          h, text,
          "px-2 rounded font-medium tracking-wide transition-colors uppercase",
          value === "REGULAMENTADA"
            ? "bg-success/80 text-success-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        Regulamentada{typeof totalReg === "number" ? ` (${totalReg})` : ""}
      </button>
      <button
        type="button"
        onClick={() => onChange(value === "NAO_REGULAMENTADA" ? "all" : "NAO_REGULAMENTADA")}
        className={cn(
          h, text,
          "px-2 rounded font-medium tracking-wide transition-colors uppercase",
          value === "NAO_REGULAMENTADA"
            ? "bg-warning/80 text-warning-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        Não regulamentada{typeof totalNaoReg === "number" ? ` (${totalNaoReg})` : ""}
      </button>
    </div>
  );
}
