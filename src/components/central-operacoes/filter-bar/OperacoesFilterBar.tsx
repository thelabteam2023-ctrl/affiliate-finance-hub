import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownNarrowWide, ArrowUpWideNarrow, Calendar, DollarSign, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { FacetKey, FACET_LABELS, FilterState, ItemAdapter, formatMoney } from "./types";
import { useOperacoesFilter } from "./useOperacoesFilter";
import { FacetPopover } from "./FacetPopover";
import { SavedViewsBar } from "./SavedViewsBar";
import { useSavedViews } from "./useSavedViews";

interface OperacoesFilterBarProps<T> {
  cardId: string;
  items: T[];
  adapter: ItemAdapter<T>;
  facets?: FacetKey[];
  /** Texto do totalizador (padrão: "Pendente"). */
  totalLabel?: string;
  /** Rótulos customizados por faceta (sobrescreve o padrão). */
  facetLabels?: Partial<Record<FacetKey, string>>;
  children: (filtered: T[]) => ReactNode;
}

const DEFAULT_FACETS: FacetKey[] = ["parceiro", "casa", "moeda", "projeto", "idade"];

export function OperacoesFilterBar<T>({
  cardId,
  items,
  adapter,
  facets = DEFAULT_FACETS,
  totalLabel = "Pendente",
  facetLabels,
  children,
}: OperacoesFilterBarProps<T>) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const f = useOperacoesFilter(cardId, items, adapter, userId);
  const { views, saveView, deleteView } = useSavedViews(cardId, userId);

  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mantém input aberto se já houver texto.
  useEffect(() => {
    if (f.state.search) setSearchOpen(true);
  }, [f.state.search]);

  // Atalho "/" foca busca quando o card está visível e nada está em foco editável.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!containerRef.current?.offsetParent) return;
      e.preventDefault();
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeViewId = useMemo(() => {
    const match = views.find((v) => JSON.stringify(v.state) === JSON.stringify(f.state));
    return match?.id || null;
  }, [views, f.state]);

  const SortIcon = f.state.sort.dir === "asc" ? ArrowUpWideNarrow : ArrowDownNarrowWide;

  return (
    <div ref={containerRef} className="space-y-2.5">
      {/* Totalizador */}
      {f.totalsByMoeda.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {totalLabel}:
          </span>
          {f.totalsByMoeda.map(({ moeda, total }) => (
            <div
              key={moeda}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted/50 border border-border/60"
            >
              <span className="text-[11px] font-bold text-foreground tabular-nums">
                {formatMoney(total, moeda)}
              </span>
              <span className="text-[9px] font-medium text-muted-foreground uppercase">
                {moeda}
              </span>
            </div>
          ))}
          {f.hasActiveFilters && (
            <span className="text-[10px] text-muted-foreground">
              {f.filtered.length} de {f.totalItems}
            </span>
          )}
        </div>
      )}

      {/* Saved views */}
      <SavedViewsBar
        views={views}
        currentState={f.state}
        activeViewId={activeViewId}
        hasActiveFilters={f.hasActiveFilters}
        onApply={(v) => f.applyState(v.state)}
        onSave={(name) => saveView(name, f.state)}
        onDelete={deleteView}
      />

      {/* Faceta bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {facets.map((key) => {
          const opts = f.facetOptions[key];
          if (!opts || opts.length <= 1) {
            const selected = f.state.facets[key] || [];
            if (selected.length === 0) return null;
          }
          return (
            <FacetPopover
              key={key}
              facetKey={key}
              options={f.facetOptions[key] || []}
              selected={f.state.facets[key] || []}
              onToggle={(v) => f.toggleFacet(key, v)}
              onClear={() => f.clearFacet(key)}
              labelOverride={facetLabels?.[key]}
            />
          );
        })}

        <div className="flex-1" />

        {/* Busca textual (secundária, colapsável) */}
        {searchOpen ? (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              autoFocus
              value={f.state.search}
              onChange={(e) => f.setSearch(e.target.value)}
              onBlur={() => !f.state.search && setSearchOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  f.setSearch("");
                  setSearchOpen(false);
                }
              }}
              placeholder="Buscar..."
              className="w-[200px] h-7 pl-7 pr-7 text-[11px] rounded-full border border-border bg-muted/20 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
            {f.state.search && (
              <button
                type="button"
                onClick={() => f.setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Buscar (/)"
            className="inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Toggles de ordenação */}
        <div className="inline-flex items-center rounded-full bg-muted/30 border border-border/40 p-0.5">
          <button
            type="button"
            onClick={() => f.toggleSort("data")}
            title={`Data ${f.state.sort.field === "data" ? (f.state.sort.dir === "asc" ? "(mais antigo)" : "(mais recente)") : ""}`}
            className={cn(
              "inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[10px] font-medium transition-colors",
              f.state.sort.field === "data"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Calendar className="h-3 w-3" />
            {f.state.sort.field === "data" && (
              <SortIcon className="h-2.5 w-2.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => f.toggleSort("valor")}
            title={`Valor ${f.state.sort.field === "valor" ? (f.state.sort.dir === "asc" ? "(menor)" : "(maior)") : ""}`}
            className={cn(
              "inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[10px] font-medium transition-colors",
              f.state.sort.field === "valor"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <DollarSign className="h-3 w-3" />
            {f.state.sort.field === "valor" && (
              <SortIcon className="h-2.5 w-2.5" />
            )}
          </button>
        </div>

        {f.hasActiveFilters && (
          <button
            type="button"
            onClick={f.clearAll}
            className="text-[10px] text-primary hover:text-primary/80 font-medium ml-1"
          >
            Limpar
          </button>
        )}
      </div>

      {children(f.filtered)}
    </div>
  );
}

export type { FilterState };