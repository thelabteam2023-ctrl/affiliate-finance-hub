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
  useOperationalFilters,
  type StandardPeriodFilter,
  type EstrategiaFilter,
} from "@/contexts/OperationalFiltersContext";

interface OperationalFiltersBarProps {
  projetoId: string;
  showEstrategiaFilter?: boolean;
  preselectedEstrategia?: EstrategiaFilter;
  className?: string;
}

interface BookmakerOption {
  id: string;
  nome: string;
  parceiroNome?: string;
  instanceIdentifier?: string | null;
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

export function OperationalFiltersBar({
  projetoId,
  showEstrategiaFilter = true,
  preselectedEstrategia,
  className,
}: OperationalFiltersBarProps) {
  const filters = useOperationalFilters();
  
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [parceiros, setParceiros] = useState<ParceiroOption[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bookmakerOpen, setBookmakerOpen] = useState(false);
  const [parceiroOpen, setParceiroOpen] = useState(false);
  const [estrategiaOpen, setEstrategiaOpen] = useState(false);

  // Atualizar pré-seleção quando a aba muda
  useEffect(() => {
    if (preselectedEstrategia && preselectedEstrategia !== "all") {
      filters.setPreselectedEstrategia(preselectedEstrategia);
      // Pré-selecionar a estratégia se nenhuma estiver selecionada
      if (filters.estrategias.includes("all")) {
        filters.setEstrategias([preselectedEstrategia]);
      }
    }
  }, [preselectedEstrategia]);

  // Buscar bookmakers e parceiros do projeto
  useEffect(() => {
    const fetchOptions = async () => {
      // Buscar bookmakers
      const { data: bkData } = await supabase
        .from("bookmakers")
        .select("id, nome, instance_identifier, parceiro:parceiros(id, nome)")
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (bkData) {
        const bkOptions: BookmakerOption[] = bkData.map((bk: any) => ({
          id: bk.id,
          nome: bk.nome,
          parceiroNome: bk.parceiro?.nome,
          instanceIdentifier: bk.instance_identifier,
        }));
        setBookmakers(bkOptions);

        // Extrair parceiros únicos
        const parceiroMap = new Map<string, string>();
        bkData.forEach((bk: any) => {
          if (bk.parceiro?.id && bk.parceiro?.nome) {
            parceiroMap.set(bk.parceiro.id, bk.parceiro.nome);
          }
        });
        const parceiroOptions: ParceiroOption[] = Array.from(parceiroMap.entries()).map(
          ([id, nome]) => ({ id, nome })
        );
        setParceiros(parceiroOptions);
      }
    };

    fetchOptions();
  }, [projetoId]);

  const handlePeriodChange = (value: string) => {
    if (value) {
      filters.setPeriod(value as StandardPeriodFilter);
    }
  };

  const formatDateRange = () => {
    if (filters.customDateRange?.from) {
      if (filters.customDateRange.to) {
        return `${format(filters.customDateRange.from, "dd/MM/yy", { locale: ptBR })} - ${format(filters.customDateRange.to, "dd/MM/yy", { locale: ptBR })}`;
      }
      return format(filters.customDateRange.from, "dd/MM/yyyy", { locale: ptBR });
    }
    return "Período";
  };

  // Labels para filtros selecionados
  const selectedBookmakerLabel = useMemo(() => {
    if (filters.bookmakerIds.length === 0) return "Casas";
    if (filters.bookmakerIds.length === 1) {
      const bk = bookmakers.find(b => b.id === filters.bookmakerIds[0]);
      const label = bk ? (bk.instanceIdentifier ? `${bk.nome} (${bk.instanceIdentifier})` : bk.nome) : "1 casa";
      return label;
    }
    return `${filters.bookmakerIds.length} casas`;
  }, [filters.bookmakerIds, bookmakers]);

  const selectedParceiroLabel = useMemo(() => {
    if (filters.parceiroIds.length === 0) return "Parceiros";
    if (filters.parceiroIds.length === 1) {
      const p = parceiros.find(par => par.id === filters.parceiroIds[0]);
      return p?.nome || "1 parceiro";
    }
    return `${filters.parceiroIds.length} parceiros`;
  }, [filters.parceiroIds, parceiros]);

  const selectedEstrategiaLabel = useMemo(() => {
    if (filters.estrategias.includes("all")) return "Estratégia";
    if (filters.estrategias.length === 1) {
      const e = ESTRATEGIA_OPTIONS.find(opt => opt.value === filters.estrategias[0]);
      return e?.label || "1 estratégia";
    }
    return `${filters.estrategias.length} estratégias`;
  }, [filters.estrategias]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Period Toggle */}
      <ToggleGroup
        type="single"
        value={filters.period === "custom" ? undefined : filters.period}
        onValueChange={handlePeriodChange}
        className="bg-muted/50 p-0.5 rounded-lg"
      >
        {PERIOD_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            className={cn(
              "text-xs px-3 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm",
              filters.period === option.value && "bg-background shadow-sm"
            )}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Calendar Date Range Picker */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={filters.period === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5",
              filters.period === "custom" && "bg-primary text-primary-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {filters.period === "custom" ? formatDateRange() : "Período"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={filters.customDateRange}
            onSelect={(range) => {
              filters.setCustomDateRange(range);
              if (range?.from && range?.to) {
                setCalendarOpen(false);
              }
            }}
            numberOfMonths={2}
            locale={ptBR}
            className="pointer-events-auto"
            disabled={(date) => date > new Date()}
          />
          {filters.customDateRange?.from && (
            <div className="p-3 border-t">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {filters.customDateRange.from && filters.customDateRange.to
                    ? `${format(filters.customDateRange.from, "dd/MM/yyyy", { locale: ptBR })} até ${format(filters.customDateRange.to, "dd/MM/yyyy", { locale: ptBR })}`
                    : "Selecione a data final"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    filters.setCustomDateRange(undefined);
                    filters.setPeriod("mes_atual");
                  }}
                >
                  Limpar
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Separator */}
      <div className="h-5 w-px bg-border/50 mx-1" />

      {/* Bookmaker Filter */}
      <Popover open={bookmakerOpen} onOpenChange={setBookmakerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={filters.bookmakerIds.length > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
          >
            <Building2 className="h-3.5 w-3.5" />
            {selectedBookmakerLabel}
            {filters.bookmakerIds.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                {filters.bookmakerIds.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar casa..." className="h-9" />
            <CommandList>
              <CommandEmpty>Nenhuma casa encontrada.</CommandEmpty>
              <CommandGroup>
                {bookmakers.map((bk) => {
                  const isSelected = filters.bookmakerIds.includes(bk.id);
                  return (
                    <CommandItem
                      key={bk.id}
                      onSelect={() => filters.toggleBookmaker(bk.id)}
                      className="gap-2"
                    >
                      <div className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center",
                        isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {bk.nome}
                          {bk.instanceIdentifier && (
                            <span className="text-primary/80 ml-1 text-xs normal-case">({bk.instanceIdentifier})</span>
                          )}
                        </div>
                        {bk.parceiroNome && (
                          <div className="text-xs text-muted-foreground truncate">
                            {bk.parceiroNome}
                          </div>
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
                      className="justify-center text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Limpar seleção
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Parceiro Filter */}
      <Popover open={parceiroOpen} onOpenChange={setParceiroOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={filters.parceiroIds.length > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
          >
            <Users className="h-3.5 w-3.5" />
            {selectedParceiroLabel}
            {filters.parceiroIds.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                {filters.parceiroIds.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar parceiro..." className="h-9" />
            <CommandList>
              <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>
              <CommandGroup>
                {parceiros.map((p) => {
                  const isSelected = filters.parceiroIds.includes(p.id);
                  return (
                    <CommandItem
                      key={p.id}
                      onSelect={() => filters.toggleParceiro(p.id)}
                      className="gap-2"
                    >
                      <div className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center",
                        isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="truncate">{p.nome}</span>
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
                      className="justify-center text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Limpar seleção
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Estratégia Filter */}
      {showEstrategiaFilter && (
        <Popover open={estrategiaOpen} onOpenChange={setEstrategiaOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={!filters.estrategias.includes("all") ? "secondary" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
            >
              <Target className="h-3.5 w-3.5" />
              {selectedEstrategiaLabel}
              {!filters.estrategias.includes("all") && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                  {filters.estrategias.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 opacity-50" />
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
                        className="gap-2"
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center",
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
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

      {/* Clear All Button */}
      {filters.activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
          onClick={filters.clearFilters}
        >
          <X className="h-3.5 w-3.5" />
          Limpar ({filters.activeFiltersCount})
        </Button>
      )}
    </div>
  );
}
