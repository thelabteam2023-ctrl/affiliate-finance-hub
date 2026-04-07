import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { cn } from "@/lib/utils";
import { Building2, Check, Search, User, X } from "lucide-react";

export interface FilterDropdownItem {
  value: string;
  label: string;
  logoUrl?: string | null;
  subtitle?: string | null;
}

interface FilterDropdownProps {
  type: "casas" | "parceiros";
  items: FilterDropdownItem[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  label?: string;
  searchPlaceholder?: string;
  className?: string;
}

export function FilterDropdown({
  type,
  items,
  selectedValues,
  onSelectionChange,
  label,
  searchPlaceholder,
  className,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const Icon = type === "casas" ? Building2 : User;
  const displayLabel = label || (type === "casas" ? "Casas" : "Parceiros");
  const placeholder =
    searchPlaceholder ||
    (type === "casas" ? "Buscar casa..." : "Buscar parceiro...");

  const filtered = useMemo(() => {
    if (!search.trim()) return items;

    const term = search.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(term) ||
        item.subtitle?.toLowerCase().includes(term)
    );
  }, [items, search]);

  const toggle = (value: string) => {
    onSelectionChange(
      selectedValues.includes(value)
        ? selectedValues.filter((currentValue) => currentValue !== value)
        : [...selectedValues, value]
    );
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={selectedValues.length > 0 ? "secondary" : "outline"}
          size="sm"
          className={cn("h-8 gap-1.5 text-xs", className)}
        >
          <Icon className="h-3.5 w-3.5" />
          {displayLabel}
          {selectedValues.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-4 min-w-4 bg-primary/15 px-1 text-[10px] text-primary"
            >
              {selectedValues.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[420px] min-w-[300px] max-w-[calc(100vw-1rem)] p-0"
        align="start"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold text-foreground">
            Filtrar {displayLabel}
          </span>

          {selectedValues.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            >
              <X className="mr-1 h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>

        <div className="border-b border-border/50 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 bg-muted/30 pl-8 text-sm border-border/50 focus-visible:ring-1"
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
          <div className="space-y-0.5 p-1.5 pb-2">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {type === "casas"
                  ? "Nenhuma casa encontrada"
                  : "Nenhum parceiro encontrado"}
              </p>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedValues.includes(item.value);

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggle(item.value)}
                    className={cn(
                      "flex w-full items-start gap-2 px-2.5 py-2.5 rounded-lg text-left transition-colors duration-150",
                      isSelected
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>

                    {type === "casas" && (
                      <BookmakerLogo
                        logoUrl={item.logoUrl}
                        alt={item.label}
                        size="h-7 w-7"
                        iconSize="h-3.5 w-3.5"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block w-full whitespace-normal break-words text-left text-sm leading-snug",
                          isSelected
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground/90"
                        )}
                        title={item.label}
                      >
                        {item.label}
                      </span>

                      {item.subtitle && (
                        <span
                          className="mt-0.5 block w-full whitespace-normal break-words text-left text-[11px] leading-snug text-muted-foreground"
                          title={item.subtitle}
                        >
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="border-t border-border/50 px-3 py-2">
            <p className="text-center text-[11px] text-muted-foreground">
              {selectedValues.length > 0
                ? `${selectedValues.length} de ${items.length} selecionado${selectedValues.length > 1 ? "s" : ""}`
                : `${items.length} ${type === "casas" ? "casas" : "parceiros"} disponíveis`}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
