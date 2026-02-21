import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { SelectItem, SelectScrollUpButton, SelectScrollDownButton } from "@/components/ui/select";
import { BookmakerSelectOption, type BookmakerOptionData } from "./BookmakerSelectOption";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExchangeRatesSafe } from "@/contexts/ExchangeRatesContext";

/** Aceita parceiro_nome como opcional para compatibilidade com BookmakerOption */
type BookmakerInput = Omit<BookmakerOptionData, 'parceiro_nome'> & { parceiro_nome?: string | null };

const SEARCH_THRESHOLD = 7;

interface BookmakerSearchableSelectContentProps {
  bookmakers: BookmakerInput[];
  className?: string;
  itemClassName?: string;
  emptyMessage?: string;
}

/**
 * SelectContent com busca condicional para bookmakers.
 * Mostra campo de busca apenas quando há mais de 7 itens.
 * Ordena por saldo operável convertido para BRL (moeda pivot) decrescente.
 * 
 * Usa e.stopPropagation() no onKeyDown do input para evitar
 * que o Radix Select capture as teclas (typeahead).
 */
export function BookmakerSearchableSelectContent({
  bookmakers,
  className,
  itemClassName,
  emptyMessage = "Nenhuma bookmaker com saldo disponível",
}: BookmakerSearchableSelectContentProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const showSearch = bookmakers.length > SEARCH_THRESHOLD;
  const rates = useExchangeRatesSafe();

  // Reset search when list changes (e.g., dialog reopen)
  useEffect(() => {
    setSearch("");
  }, [bookmakers.length]);

  // Auto-focus search input when mounted
  useEffect(() => {
    if (showSearch && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [showSearch]);

  // Ordenar por saldo operável convertido para BRL (moeda pivot) - maior primeiro
  const sorted = useMemo(() => {
    const convertToBRL = rates?.convertToBRL;
    return [...bookmakers].sort((a, b) => {
      const aVal = convertToBRL ? convertToBRL(a.saldo_operavel, a.moeda) : a.saldo_operavel;
      const bVal = convertToBRL ? convertToBRL(b.saldo_operavel, b.moeda) : b.saldo_operavel;
      return bVal - aVal;
    });
  }, [bookmakers, rates?.convertToBRL]);

  const filtered = showSearch && search.trim()
    ? sorted.filter((bk) => {
        const term = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const nome = bk.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const parceiro = (bk.parceiro_nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return nome.includes(term) || parceiro.includes(term);
      })
    : sorted;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Impedir que o Select capture teclas do input de busca
    e.stopPropagation();
  }, []);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          "relative z-[9999] max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          "min-w-[280px] w-[var(--radix-select-trigger-width)]",
          className,
        )}
        position="popper"
        side="bottom"
        sideOffset={4}
        avoidCollisions={true}
      >
        {/* Search input OUTSIDE viewport so it stays fixed */}
        {showSearch && (
          <div className="px-2 pt-2 pb-2 bg-popover border-b border-border shadow-md">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar casa..."
                className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className="p-1 h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        >
          {filtered.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              {search.trim() ? "Nenhuma casa encontrada" : emptyMessage}
            </div>
          ) : (
            filtered.map((bk) => (
              <SelectItem key={bk.id} value={bk.id} className={cn("py-2", itemClassName)}>
                <BookmakerSelectOption bookmaker={{ ...bk, parceiro_nome: bk.parceiro_nome ?? null }} />
              </SelectItem>
            ))
          )}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
