import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { 
  CalendarIcon, 
  Building2, 
  Users, 
  Target, 
  X, 
  Filter,
  ChevronDown,
  Check
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { 
  type TabFiltersReturn,
  type StandardPeriodFilter,
  type EstrategiaFilter,
} from "@/hooks/useTabFilters";

interface TabFiltersBarProps {
  projetoId: string;
  /** Objeto de filtros retornado pelo useTabFilters */
  filters: TabFiltersReturn;
  showEstrategiaFilter?: boolean;
  showPeriodFilter?: boolean;
  showBookmakerFilter?: boolean;
  showParceiroFilter?: boolean;
  className?: string;
}

interface BookmakerOption {
  id: string;
  nome: string;
  parceiroNome?: string;
}

interface ParceiroOption {
  id: string;
  nome: string;
}

const PERIOD_OPTIONS: { value: StandardPeriodFilter; label: string }[] = [
  { value: "1dia", label: "1 dia" },
  { value: "7dias", label: "7 dias" },
  { value: "mes_atual", label: "Mês atual" },
  { value: "mes_anterior", label: "Mês anterior" },
];

const ESTRATEGIA_OPTIONS: { value: EstrategiaFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "PUNTER", label: "Punter" },
  { value: "SUREBET", label: "Surebet" },
  { value: "VALUEBET", label: "Value Bet" },
  { value: "DUPLO_GREEN", label: "Duplo Green" },
  { value: "EXTRACAO_FREEBET", label: "Freebet" },
  { value: "EXTRACAO_BONUS", label: "Bônus" },
];

/**
 * Barra de filtros que usa estado LOCAL da aba.
 * 
 * IMPORTANTE: Esta barra NÃO usa contexto global.
 * Os filtros aqui aplicados afetam APENAS a aba atual.
 */
export function TabFiltersBar({
  projetoId,
  filters,
  showEstrategiaFilter = false,
  showPeriodFilter = true,
  showBookmakerFilter = true,
  showParceiroFilter = true,
  className,
}: TabFiltersBarProps) {
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [parceiros, setParceiros] = useState<ParceiroOption[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bookmakerOpen, setBookmakerOpen] = useState(false);
  const [parceiroOpen, setParceiroOpen] = useState(false);
  const [estrategiaOpen, setEstrategiaOpen] = useState(false);

  // Buscar bookmakers e parceiros do projeto
  useEffect(() => {
    const fetchOptions = async () => {
      // Buscar bookmakers
      const { data: bkData } = await supabase
        .from("bookmakers")
        .select("id, nome, parceiro:parceiros(id, nome)")
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (bkData) {
        const bkOptions: BookmakerOption[] = bkData.map((bk: any) => ({
          id: bk.id,
          nome: bk.nome,
          parceiroNome: bk.parceiro?.nome,
        }));
        setBookmakers(bkOptions);

        // Extrair parceiros únicos
        const parceiroMap = new Map<string, string>();
        bkData.forEach((bk: any) => {
          if (bk.parceiro?.id && bk.parceiro?.nome) {
            parceiroMap.set(bk.parceiro.id, bk.parceiro.nome);
          }
        });
        setParceiros(
          Array.from(parceiroMap.entries()).map(([id, nome]) => ({ id, nome }))
        );
      }
    };

    fetchOptions();
  }, [projetoId]);

  // Nomes selecionados para badges
  const selectedBookmakerNames = useMemo(() => {
    return filters.bookmakerIds
      .map((id) => bookmakers.find((b) => b.id === id)?.nome)
      .filter(Boolean) as string[];
  }, [filters.bookmakerIds, bookmakers]);

  const selectedParceiroNames = useMemo(() => {
    return filters.parceiroIds
      .map((id) => parceiros.find((p) => p.id === id)?.nome)
      .filter(Boolean) as string[];
  }, [filters.parceiroIds, parceiros]);

  const selectedEstrategiaLabels = useMemo(() => {
    if (filters.estrategias.includes("all")) return ["Todas"];
    return filters.estrategias
      .map((e) => ESTRATEGIA_OPTIONS.find((opt) => opt.value === e)?.label)
      .filter(Boolean) as string[];
  }, [filters.estrategias]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Período */}
      {showPeriodFilter && (
        <div className="flex items-center gap-1">
          <ToggleGroup
            type="single"
            value={filters.period === "custom" ? undefined : filters.period}
            onValueChange={(value) => {
              if (value) filters.setPeriod(value as StandardPeriodFilter);
            }}
            className="flex"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                size="sm"
                variant="outline"
                className="text-xs h-8 px-2.5"
              >
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Calendário custom */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={filters.period === "custom" ? "default" : "outline"}
                size="sm"
                className="h-8 px-2.5 text-xs"
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                {filters.period === "custom" && filters.customDateRange?.from
                  ? `${format(filters.customDateRange.from, "dd/MM", { locale: ptBR })} - ${
                      filters.customDateRange.to
                        ? format(filters.customDateRange.to, "dd/MM", { locale: ptBR })
                        : "..."
                    }`
                  : "Período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={filters.customDateRange?.from}
                selected={filters.customDateRange}
                onSelect={(range) => {
                  filters.setCustomDateRange(range);
                  if (range?.from && range?.to) {
                    setCalendarOpen(false);
                  }
                }}
                numberOfMonths={2}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Separador visual */}
      {showPeriodFilter && (showBookmakerFilter || showParceiroFilter || showEstrategiaFilter) && (
        <div className="h-6 w-px bg-border mx-1" />
      )}

      {/* Bookmaker Filter */}
      {showBookmakerFilter && (
        <Popover open={bookmakerOpen} onOpenChange={setBookmakerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={filters.bookmakerIds.length > 0 ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
            >
              <Building2 className="h-3.5 w-3.5 mr-1" />
              Casas
              {filters.bookmakerIds.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {filters.bookmakerIds.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar casa..." />
              <CommandList>
                <CommandEmpty>Nenhuma casa encontrada.</CommandEmpty>
                <CommandGroup>
                  {bookmakers.map((bk) => {
                    const isSelected = filters.bookmakerIds.includes(bk.id);
                    return (
                      <CommandItem
                        key={bk.id}
                        onSelect={() => filters.toggleBookmaker(bk.id)}
                        className="py-2"
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary flex-shrink-0",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-sm tracking-wide uppercase truncate">
                            {bk.nome}
                          </span>
                          {bk.parceiroNome && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {bk.parceiroNome}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {filters.bookmakerIds.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => filters.setBookmakerIds([])}
                        className="justify-center text-center text-xs text-muted-foreground"
                      >
                        Limpar seleção
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Parceiro Filter */}
      {showParceiroFilter && parceiros.length > 0 && (
        <Popover open={parceiroOpen} onOpenChange={setParceiroOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={filters.parceiroIds.length > 0 ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
            >
              <Users className="h-3.5 w-3.5 mr-1" />
              Parceiros
              {filters.parceiroIds.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {filters.parceiroIds.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar parceiro..." />
              <CommandList>
                <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>
                <CommandGroup>
                  {parceiros.map((p) => {
                    const isSelected = filters.parceiroIds.includes(p.id);
                    return (
                      <CommandItem
                        key={p.id}
                        onSelect={() => filters.toggleParceiro(p.id)}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <span>{p.nome}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {filters.parceiroIds.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => filters.setParceiroIds([])}
                        className="justify-center text-center text-xs text-muted-foreground"
                      >
                        Limpar seleção
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Estratégia Filter */}
      {showEstrategiaFilter && (
        <Popover open={estrategiaOpen} onOpenChange={setEstrategiaOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={!filters.estrategias.includes("all") ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
            >
              <Target className="h-3.5 w-3.5 mr-1" />
              Estratégia
              {!filters.estrategias.includes("all") && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {filters.estrategias.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-0" align="start">
            <Command>
              <CommandList>
                <CommandGroup>
                  {ESTRATEGIA_OPTIONS.map((opt) => {
                    const isSelected = filters.estrategias.includes(opt.value);
                    return (
                      <CommandItem
                        key={opt.value}
                        onSelect={() => filters.toggleEstrategia(opt.value)}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <span>{opt.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Limpar todos os filtros */}
      {filters.activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={filters.clearFilters}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar ({filters.activeFiltersCount})
        </Button>
      )}
    </div>
  );
}
