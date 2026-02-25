import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * Badge especializado para exibir mercado/seleção com comportamento consistente.
 * - Largura adaptável ao conteúdo (fit-content)
 * - Altura mínima para alinhamento, mas cresce com quebra de linha
 * - Largura mínima e máxima definidas
 * - Texto quebra em múltiplas linhas quando excede o limite
 */
interface SelectionBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Texto a ser exibido no badge */
  children: React.ReactNode;
  /** Classes de cor/estilo - padrão: azul neutro informativo */
  colorClassName?: string;
  /** Largura máxima em pixels (padrão: 140) */
  maxWidth?: number;
  /** Largura mínima em pixels (padrão: 72) */
  minWidth?: number;
}

/** Cor padrão: Azul neutro/steel blue - informativo, sem conotação de P&L */
const SELECTION_BADGE_DEFAULT_COLOR = "bg-secondary text-muted-foreground border-border";

function SelectionBadge({ 
  children, 
  colorClassName = SELECTION_BADGE_DEFAULT_COLOR,
  maxWidth = 140,
  minWidth = 72,
  className,
  ...props 
}: SelectionBadgeProps) {
  return (
    <div 
      className={cn(
        // Base: inline-flex para adaptar ao conteúdo
        "inline-flex items-center justify-center",
        // Altura mínima mas permite crescer
        "min-h-5",
        // Padding consistente
        "px-2 py-0.5",
        // Borda e arredondamento
        "rounded-md border",
        // Texto compacto e centralizado
        "text-[10px] font-medium text-center leading-tight",
        // Permite quebra de linha
        "break-words",
        // Cores
        colorClassName,
        className
      )}
      style={{ 
        maxWidth: `${maxWidth}px`,
        minWidth: `${minWidth}px`
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export { Badge, badgeVariants, SelectionBadge };
