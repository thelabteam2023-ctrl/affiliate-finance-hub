import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * LayoutContainer - Sistema de contenção de layout enterprise-grade
 * 
 * Garante:
 * - Contenção visual (nada vaza para fora)
 * - Scroll controlado (global vs interno)
 * - Breakpoints semânticos
 * - Consistência de comportamento
 */

interface LayoutPageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove padding padrão */
  noPadding?: boolean;
}

/**
 * Container principal da página - define limites de viewport
 * Deve ser usado como wrapper de toda a página
 */
const LayoutPage = React.forwardRef<HTMLDivElement, LayoutPageProps>(
  ({ className, noPadding, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex-1 flex flex-col min-h-0 w-full max-w-full overflow-x-hidden",
        !noPadding && "p-4 md:p-6 lg:p-8",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
LayoutPage.displayName = "LayoutPage";

interface LayoutSectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Gap entre elementos filhos */
  gap?: "none" | "sm" | "md" | "lg";
}

/**
 * Seção de conteúdo - agrupa elementos relacionados
 */
const LayoutSection = React.forwardRef<HTMLElement, LayoutSectionProps>(
  ({ className, gap = "md", children, ...props }, ref) => {
    const gapClasses = {
      none: "",
      sm: "space-y-2",
      md: "space-y-4",
      lg: "space-y-6",
    };

    return (
      <section
        ref={ref}
        className={cn("flex-shrink-0", gapClasses[gap], className)}
        {...props}
      >
        {children}
      </section>
    );
  }
);
LayoutSection.displayName = "LayoutSection";

interface LayoutGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Número de colunas por breakpoint */
  cols?: {
    base?: 1 | 2 | 3 | 4;
    sm?: 1 | 2 | 3 | 4;
    md?: 1 | 2 | 3 | 4;
    lg?: 1 | 2 | 3 | 4;
    xl?: 1 | 2 | 3 | 4 | 5 | 6;
  };
  /** Gap entre cards */
  gap?: "sm" | "md" | "lg";
}

/**
 * Grid responsivo com breakpoints semânticos
 */
const LayoutGrid = React.forwardRef<HTMLDivElement, LayoutGridProps>(
  ({ className, cols = {}, gap = "md", children, ...props }, ref) => {
    const { base = 1, sm = 1, md = 2, lg = 3, xl } = cols;

    const gapClasses = {
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6",
    };

    // Build grid classes based on breakpoints
    const colClasses = [
      `grid-cols-${base}`,
      sm !== base && `sm:grid-cols-${sm}`,
      md !== sm && `md:grid-cols-${md}`,
      lg !== md && `lg:grid-cols-${lg}`,
      xl && xl !== lg && `xl:grid-cols-${xl}`,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        className={cn("grid", gapClasses[gap], colClasses, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
LayoutGrid.displayName = "LayoutGrid";

interface LayoutCardContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Altura máxima antes de scroll interno */
  maxHeight?: string;
  /** Permite scroll interno no conteúdo */
  scrollable?: boolean;
}

/**
 * Container de card com contenção garantida
 * Impede vazamento de conteúdo e controla scroll
 */
const LayoutCardContainer = React.forwardRef<HTMLDivElement, LayoutCardContainerProps>(
  ({ className, maxHeight, scrollable, children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        "flex flex-col min-h-0 overflow-hidden",
        className
      )}
      style={{
        ...style,
        contain: "layout paint",
        maxHeight: maxHeight,
      }}
      {...props}
    >
      {scrollable ? (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  )
);
LayoutCardContainer.displayName = "LayoutCardContainer";

interface LayoutCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Impede shrink do header */
  sticky?: boolean;
}

/**
 * Header de card - sempre visível, nunca colapsa
 */
const LayoutCardHeader = React.forwardRef<HTMLDivElement, LayoutCardHeaderProps>(
  ({ className, sticky, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col space-y-1.5 p-4 md:p-6 flex-shrink-0",
        sticky && "sticky top-0 bg-card z-10 border-b",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
LayoutCardHeader.displayName = "LayoutCardHeader";

/**
 * Conteúdo do card - área scrollável se necessário
 */
const LayoutCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("p-4 md:p-6 pt-0 flex-1 min-h-0", className)}
    {...props}
  >
    {children}
  </div>
));
LayoutCardContent.displayName = "LayoutCardContent";

/**
 * Footer do card - sempre no fundo, nunca some
 */
const LayoutCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center p-4 md:p-6 pt-0 flex-shrink-0 mt-auto",
      className
    )}
    {...props}
  >
    {children}
  </div>
));
LayoutCardFooter.displayName = "LayoutCardFooter";

interface LayoutScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Direção do scroll */
  direction?: "vertical" | "horizontal" | "both";
  /** Altura máxima (para vertical) */
  maxHeight?: string;
}

/**
 * Área de scroll controlada - não interfere com scroll global
 */
const LayoutScrollArea = React.forwardRef<HTMLDivElement, LayoutScrollAreaProps>(
  ({ className, direction = "vertical", maxHeight, children, style, ...props }, ref) => {
    const scrollClasses = {
      vertical: "overflow-y-auto overflow-x-hidden",
      horizontal: "overflow-x-auto overflow-y-hidden",
      both: "overflow-auto",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "min-h-0 min-w-0",
          scrollClasses[direction],
          className
        )}
        style={{
          ...style,
          maxHeight: maxHeight,
          contain: "strict",
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
LayoutScrollArea.displayName = "LayoutScrollArea";

interface LayoutTabContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Permite scroll interno no conteúdo da aba */
  scrollable?: boolean;
}

/**
 * Container para conteúdo de abas - garante contenção
 */
const LayoutTabContent = React.forwardRef<HTMLDivElement, LayoutTabContentProps>(
  ({ className, scrollable, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "min-h-0 w-full",
        scrollable && "flex-1 overflow-y-auto overflow-x-hidden",
        className
      )}
      style={{ contain: "layout" }}
      {...props}
    >
      {children}
    </div>
  )
);
LayoutTabContent.displayName = "LayoutTabContent";

/**
 * Wrapper para KPIs - grid responsivo otimizado
 */
const LayoutKPIGrid = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "grid gap-3 md:gap-4",
      "grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
));
LayoutKPIGrid.displayName = "LayoutKPIGrid";

/**
 * Card de KPI com contenção
 */
const LayoutKPICard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      "p-3 md:p-4 flex flex-col min-h-0 overflow-hidden",
      className
    )}
    style={{ contain: "layout paint" }}
    {...props}
  >
    {children}
  </div>
));
LayoutKPICard.displayName = "LayoutKPICard";

export {
  LayoutPage,
  LayoutSection,
  LayoutGrid,
  LayoutCardContainer,
  LayoutCardHeader,
  LayoutCardContent,
  LayoutCardFooter,
  LayoutScrollArea,
  LayoutTabContent,
  LayoutKPIGrid,
  LayoutKPICard,
};
