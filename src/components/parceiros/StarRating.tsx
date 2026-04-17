import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number | null | undefined;
  onChange?: (value: number | null) => void;
  readOnly?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  allowClear?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-6 w-6",
} as const;

const LABELS: Record<number, string> = {
  1: "Ruim",
  2: "Regular",
  3: "Bom",
  4: "Muito bom",
  5: "Excelente",
};

/**
 * Avaliação de qualidade em 5 estrelas.
 * - readOnly: apenas exibição
 * - allowClear: clicar na mesma estrela limpa a nota
 */
export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = "md",
  showLabel = false,
  allowClear = true,
  className,
}: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const sizeClass = SIZE_MAP[size];
  const current = value ?? 0;
  const display = hover ?? current;

  const handleClick = (n: number) => {
    if (readOnly || !onChange) return;
    if (allowClear && value === n) {
      onChange(null);
    } else {
      onChange(n);
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div
        className="inline-flex items-center gap-0.5"
        onMouseLeave={() => !readOnly && setHover(null)}
        role={readOnly ? "img" : "radiogroup"}
        aria-label={
          current > 0
            ? `Qualidade ${current} de 5 estrelas`
            : "Sem avaliação"
        }
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= display;
          return (
            <button
              key={n}
              type="button"
              disabled={readOnly}
              onMouseEnter={() => !readOnly && setHover(n)}
              onClick={() => handleClick(n)}
              className={cn(
                "rounded-sm transition-transform",
                !readOnly && "cursor-pointer hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/40",
                readOnly && "cursor-default"
              )}
              aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            >
              <Star
                className={cn(
                  sizeClass,
                  "transition-colors",
                  filled
                    ? "fill-warning text-warning"
                    : "fill-transparent text-muted-foreground/40"
                )}
              />
            </button>
          );
        })}
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-muted-foreground">
          {display > 0 ? LABELS[display] : "Sem avaliação"}
        </span>
      )}
    </div>
  );
}

export default StarRating;
