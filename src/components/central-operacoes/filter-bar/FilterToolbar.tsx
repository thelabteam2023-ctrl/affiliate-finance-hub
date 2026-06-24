/**
 * FilterToolbar + FilterField
 *
 * Padrão visual unificado para barras de filtro nas abas Bookmakers
 * (Disponíveis, Livres, Não Criadas). Garante:
 *  - container consistente (bg-card sutil, borda, raio, padding)
 *  - alinhamento por `items-end` (rótulos topo / controles base)
 *  - rótulo padronizado (text-[10px] uppercase tracking-wider muted bold)
 *
 * Uso:
 *   <FilterToolbar>
 *     <FilterField label="Bookmaker"> ...controle... </FilterField>
 *     <FilterField label="Parceiro"  grow> ...controle... </FilterField>
 *     <FilterToolbarSpacer />
 *     <FilterField label="Contagem"> <Badge ... /> </FilterField>
 *   </FilterToolbar>
 */
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-card/40 p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterField({
  label,
  children,
  className,
  grow = false,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
  grow?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 min-w-0",
        grow && "flex-1 min-w-[180px]",
        className,
      )}
    >
      {label !== undefined && (
        <span className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
          {label}
        </span>
      )}
      <div className="flex items-center">{children}</div>
    </div>
  );
}

export function FilterToolbarSpacer() {
  return <div className="ml-auto" />;
}

export function FilterToolbarDivider() {
  return <div className="hidden h-9 w-px self-end bg-border/60 md:block" />;
}