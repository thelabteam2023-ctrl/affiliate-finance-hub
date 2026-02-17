import { useState, useRef, useCallback, useEffect } from "react";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { BookmakerSelectOption, type BookmakerOptionData } from "./BookmakerSelectOption";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const filtered = showSearch && search.trim()
    ? bookmakers.filter((bk) => {
        const term = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const nome = bk.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const parceiro = (bk.parceiro_nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return nome.includes(term) || parceiro.includes(term);
      })
    : bookmakers;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Impedir que o Select capture teclas do input de busca
    e.stopPropagation();
  }, []);

  return (
    <SelectContent className={cn("max-w-[400px]", className)}>
      {showSearch && (
        <div className="px-2 pt-2 pb-1 sticky top-0 bg-popover z-10">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar casa..."
              className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

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
    </SelectContent>
  );
}
