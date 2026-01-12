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
 * - Altura fixa para alinhamento vertical
 * - Largura mínima e máxima definidas
 * - Truncamento com ellipsis e tooltip para textos longos
 */
interface SelectionBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Texto a ser exibido no badge */
  children: React.ReactNode;
  /** Classes de cor/estilo (ex: "border-primary/30 text-primary bg-primary/10") */
  colorClassName?: string;
  /** Largura máxima em pixels (padrão: 180) */
  maxWidth?: number;
  /** Largura mínima em pixels (padrão: 48) */
  minWidth?: number;
}

function SelectionBadge({ 
  children, 
  colorClassName = "border-primary/30 text-primary bg-primary/10",
  maxWidth = 180,
  minWidth = 48,
  className,
  title,
  ...props 
}: SelectionBadgeProps) {
  // Extrair texto para tooltip
  const textContent = typeof children === 'string' ? children : 
    React.Children.toArray(children).find(child => typeof child === 'string') as string | undefined;
  
  return (
    <div 
      className={cn(
        // Base: inline-flex para adaptar ao conteúdo
        "inline-flex items-center justify-center",
        // Altura fixa para alinhamento vertical perfeito
        "h-5",
        // Padding consistente (horizontal > vertical)
        "px-2 py-0",
        // Borda e arredondamento
        "rounded-md border",
        // Texto
        "text-[10px] font-medium",
        // Truncamento
        "whitespace-nowrap overflow-hidden text-ellipsis",
        // Cores
        colorClassName,
        className
      )}
      style={{ 
        maxWidth: `${maxWidth}px`,
        minWidth: `${minWidth}px`
      }}
      title={title || textContent}
      {...props}
    >
      <span className="truncate">{children}</span>
    </div>
  );
}

export { Badge, badgeVariants, SelectionBadge };
