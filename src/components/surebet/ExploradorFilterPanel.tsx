import { useMemo, useState } from "react";
import { Filter, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  type ExploradorFilterState,
  type FilterOption,
  type FilterOptions,
} from "./utils/exploradorFilters";

interface ExploradorFilterPanelProps {
  filters: ExploradorFilterState;
  options: FilterOptions;
  onChange: (next: ExploradorFilterState) => void;
}

function FilterList({
  options,
  selected,
  onToggle,
  searchPlaceholder,
  emptyLabel,
}: {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const [term, setTerm] = useState("");
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => o.value.toLowerCase().includes(t));
  }, [options, term]);

  return (
    <div className="space-y-2">
      {options.length > 6 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 text-[11px] pl-6"
          />
        </div>
      )}
      <ScrollArea className="h-[200px] pr-2">
        {filtered.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-4 text-center">{emptyLabel}</div>
        ) : (
          <div className="space-y-1">
            {filtered.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/40 cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(opt.value)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[11px] flex-1 truncate">{opt.value}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {opt.count}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function ExploradorFilterPanel({ filters, options, onChange }: ExploradorFilterPanelProps) {
  const active = countActiveFilters(filters);

  const toggle = (key: keyof ExploradorFilterState, value: string) => {
    const cur = filters[key];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...filters, [key]: next });
  };

  const clearAll = () => onChange(EMPTY_FILTERS);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active > 0 ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5 shrink-0"
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {active > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
              {active}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0 pointer-events-auto" sideOffset={6}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
          <span className="text-xs font-semibold">Filtros avançados</span>
          {active > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={clearAll}
            >
              <X className="h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>
        <Accordion type="multiple" defaultValue={["sport"]} className="w-full">
          <AccordionItem value="sport" className="border-border/40">
            <AccordionTrigger className="px-3 py-2 text-xs hover:no-underline">
              <span className="flex items-center gap-2">
                Esporte
                {filters.sports.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {filters.sports.length}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-2">
              <FilterList
                options={options.sports}
                selected={filters.sports}
                onToggle={(v) => toggle("sports", v)}
                searchPlaceholder="Buscar esporte..."
                emptyLabel="Nenhum esporte disponível."
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="country" className="border-border/40">
            <AccordionTrigger className="px-3 py-2 text-xs hover:no-underline">
              <span className="flex items-center gap-2">
                País / Região
                {filters.countries.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {filters.countries.length}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-2">
              <FilterList
                options={options.countries}
                selected={filters.countries}
                onToggle={(v) => toggle("countries", v)}
                searchPlaceholder="Buscar país..."
                emptyLabel="Nenhum país disponível."
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="league" className="border-b-0">
            <AccordionTrigger className="px-3 py-2 text-xs hover:no-underline">
              <span className="flex items-center gap-2">
                Liga
                {filters.leagues.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {filters.leagues.length}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <FilterList
                options={options.leagues}
                selected={filters.leagues}
                onToggle={(v) => toggle("leagues", v)}
                searchPlaceholder="Buscar liga..."
                emptyLabel="Nenhuma liga disponível."
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </PopoverContent>
    </Popover>
  );
}