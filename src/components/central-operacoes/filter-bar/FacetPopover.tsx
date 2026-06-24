import { useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, getFirstLastName } from "@/lib/utils";
import { FACET_LABELS, FacetKey, formatMoney } from "./types";
import type { FacetOption } from "./useOperacoesFilter";

interface FacetPopoverProps {
  facetKey: FacetKey;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  /** Quando true, renderiza como chip "ativo" (cor primária) em vez de neutro. */
  asChip?: boolean;
}

export function FacetPopover({
  facetKey,
  options,
  selected,
  onToggle,
  onClear,
  asChip = false,
}: FacetPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const label = FACET_LABELS[facetKey];
  const isActive = selected.length > 0;
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  const triggerLabel = (() => {
    if (selected.length === 0) return label;
    if (selected.length === 1) {
      const opt = options.find((o) => o.value === selected[0]);
      const text = opt?.label || selected[0];
      return `${label}: ${facetKey === "parceiro" ? getFirstLastName(text) : text}`;
    }
    return `${label}: ${selected.length}`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium transition-all duration-150 border",
            isActive || asChip
              ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"
              : "bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <span className="truncate max-w-[180px]">{triggerLabel}</span>
          {isActive ? (
            <X
              className="h-3 w-3 shrink-0 hover:opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border/50">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar ${label.toLowerCase()}...`}
            className="flex-1 h-6 text-xs bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
              Nenhum resultado
            </div>
          )}
          {filtered.map((opt) => {
            const checked = selected.includes(opt.value);
            const display =
              facetKey === "parceiro" ? getFirstLastName(opt.label) : opt.label;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-left hover:bg-muted/50 transition-colors",
                  checked && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                    checked ? "bg-primary border-primary" : "border-border",
                  )}
                >
                  {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </span>
                <span className="flex-1 truncate font-medium text-foreground">{display}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
        {isActive && (
          <div className="border-t border-border/50 px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {selected.length} selecionad{selected.length === 1 ? "o" : "os"}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] text-primary hover:text-primary/80 font-medium"
            >
              Limpar
            </button>
          </div>
        )}
        {/* Soma agregada (apenas se houver totais relevantes) */}
        {filtered.some((o) => o.totalsByMoeda.length > 0) && (
          <div className="border-t border-border/50 px-2.5 py-1.5 flex flex-wrap gap-1.5">
            {Array.from(
              filtered.reduce((acc, o) => {
                o.totalsByMoeda.forEach(({ moeda, total }) => {
                  acc.set(moeda, (acc.get(moeda) || 0) + total);
                });
                return acc;
              }, new Map<string, number>()),
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([moeda, total]) => (
                <span
                  key={moeda}
                  className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-muted/50 text-foreground"
                >
                  {formatMoney(total, moeda)}
                </span>
              ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}