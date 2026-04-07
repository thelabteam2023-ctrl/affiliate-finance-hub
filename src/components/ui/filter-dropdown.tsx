import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Building2, User, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";

export interface FilterDropdownItem {
  value: string;
  label: string;
  /** Logo URL for bookmaker items */
  logoUrl?: string | null;
  /** Subtitle line (e.g. partner name for bookmaker filter) */
  subtitle?: string | null;
}

interface FilterDropdownProps {
  /** Type controls icon + placeholder */
  type: "casas" | "parceiros";
  /** Items to display */
  items: FilterDropdownItem[];
  /** Currently selected values */
  selectedValues: string[];
  /** Callback on selection change */
  onSelectionChange: (values: string[]) => void;
  /** Custom trigger label */
  label?: string;
  /** Custom search placeholder */
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
  const placeholder = searchPlaceholder || (type === "casas" ? "Buscar casa..." : "Buscar parceiro...");

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
        ? selectedValues.filter((v) => v !== value)
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
          className={cn("gap-1.5 text-xs h-8", className)}
        >
          <Icon className="h-3.5 w-3.5" />
          {displayLabel}
          {selectedValues.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-4 min-w-4 px-1 text-[10px] bg-primary/15 text-primary"
            >
              {selectedValues.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] min-w-[280px] max-w-[calc(100vw-2rem)] p-0" align="start" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
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
              <X className="h-3 w-3 mr-1" />
              Limpar
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm bg-muted/30 border-border/50 focus-visible:ring-1"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-[300px] overflow-y-auto overscroll-contain">
          <div className="p-1.5 pb-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                {type === "casas" ? "Nenhuma casa encontrada" : "Nenhum parceiro encontrado"}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((item) => {
                  const isSelected = selectedValues.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => toggle(item.value)}
                      className={cn(
                        "flex items-start gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-all duration-150",
                        isSelected
                          ? "bg-primary/10 ring-1 ring-primary/20"
                          : "hover:bg-accent/60"
                      )}
                    >
                      {/* Checkbox indicator */}
                      <div
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>

                      {/* Logo */}
                      {type === "casas" && (
                        <BookmakerLogo
                          logoUrl={item.logoUrl}
                          alt={item.label}
                          size="h-7 w-7"
                          iconSize="h-3.5 w-3.5"
                        />
                      )}

                      {/* Text */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cn(
                            "text-sm leading-snug break-words text-left",
                            isSelected ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                          )}
                          title={item.label}
                        >
                          {item.label}
                        </span>
                        {item.subtitle && (
                          <span
                            className="text-[11px] leading-snug text-muted-foreground break-words text-left"
                            title={item.subtitle}
                          >
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer with count */}
        {items.length > 0 && (
          <div className="px-3 py-2 border-t border-border/50">
            <p className="text-[11px] text-muted-foreground text-center">
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
