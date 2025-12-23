import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stack vertically on overflow instead of wrapping */
  stack?: boolean;
}

/**
 * Container dedicado para badges, garantindo:
 * - Nenhuma sobreposição
 * - Gap consistente
 * - Wrap automático em múltiplas linhas
 * - Alinhamento correto
 */
const BadgeRow = React.forwardRef<HTMLDivElement, BadgeRowProps>(
  ({ className, stack = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-1.5",
          stack ? "flex-col items-start" : "flex-wrap",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
BadgeRow.displayName = "BadgeRow";

export { BadgeRow };
