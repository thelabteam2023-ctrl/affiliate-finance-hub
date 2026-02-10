import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Building2, Users, ChevronDown, Check, X } from "lucide-react";
import { cn, getFirstLastName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface BookmakerOption {
  id: string;
  nome: string;
  parceiroId?: string;
  parceiroNome?: string;
}

interface ParceiroOption {
  id: string;
  nome: string;
}

export interface HistoryDimensionalFilterState {
  bookmakerIds: string[];
  parceiroIds: string[];
}

interface HistoryDimensionalFilterProps {
  projetoId: string;
  value: HistoryDimensionalFilterState;
  onChange: (state: HistoryDimensionalFilterState) => void;
  className?: string;
}

/**
 * Filtro dimensional independente (Bookmaker + Parceiro)
 * para uso dentro de seções de histórico.
 * 
 * Este componente mantém estado via props (controlled),
 * garantindo isolamento total por seção.
 */
export function HistoryDimensionalFilter({
  projetoId,
  value,
  onChange,
  className,
}: HistoryDimensionalFilterProps) {
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [parceiros, setParceiros] = useState<ParceiroOption[]>([]);
  const [bookmakerOpen, setBookmakerOpen] = useState(false);
  const [parceiroOpen, setParceiroOpen] = useState(false);

  // Buscar bookmakers e parceiros do projeto
  useEffect(() => {
    const fetchOptions = async () => {
      const { data: bkData } = await supabase
        .from("bookmakers")
        .select("id, nome, parceiro:parceiros(id, nome)")
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (bkData) {
        const bkOptions: BookmakerOption[] = bkData.map((bk: any) => ({
          id: bk.id,
          nome: bk.nome,
          parceiroId: bk.parceiro?.id,
          parceiroNome: bk.parceiro?.nome,
        }));
        setBookmakers(bkOptions);

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

  const toggleBookmaker = (id: string) => {
    const newIds = value.bookmakerIds.includes(id)
      ? value.bookmakerIds.filter(x => x !== id)
      : [...value.bookmakerIds, id];
    onChange({ ...value, bookmakerIds: newIds });
  };

  const toggleParceiro = (id: string) => {
    const newIds = value.parceiroIds.includes(id)
      ? value.parceiroIds.filter(x => x !== id)
      : [...value.parceiroIds, id];
    onChange({ ...value, parceiroIds: newIds });
  };

  const clearAll = () => {
    onChange({ bookmakerIds: [], parceiroIds: [] });
  };

  const activeCount = (value.bookmakerIds.length > 0 ? 1 : 0) + (value.parceiroIds.length > 0 ? 1 : 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Bookmaker Filter */}
      <Popover open={bookmakerOpen} onOpenChange={setBookmakerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value.bookmakerIds.length > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-8 text-xs"
          >
            <Building2 className="h-3.5 w-3.5 mr-1" />
            Casas
            {value.bookmakerIds.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {value.bookmakerIds.length}
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
                  const isSelected = value.bookmakerIds.includes(bk.id);
                  return (
                    <CommandItem key={bk.id} onSelect={() => toggleBookmaker(bk.id)} className="py-2">
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
                            {getFirstLastName(bk.parceiroNome)}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {value.bookmakerIds.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => onChange({ ...value, bookmakerIds: [] })}
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

      {/* Parceiro Filter */}
      {parceiros.length > 0 && (
        <Popover open={parceiroOpen} onOpenChange={setParceiroOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={value.parceiroIds.length > 0 ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
            >
              <Users className="h-3.5 w-3.5 mr-1" />
              Parceiros
              {value.parceiroIds.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {value.parceiroIds.length}
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
                    const isSelected = value.parceiroIds.includes(p.id);
                    return (
                      <CommandItem key={p.id} onSelect={() => toggleParceiro(p.id)}>
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
                        <span>{getFirstLastName(p.nome)}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {value.parceiroIds.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => onChange({ ...value, parceiroIds: [] })}
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

      {/* Limpar todos */}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar ({activeCount})
        </Button>
      )}
    </div>
  );
}

/**
 * Hook para usar o filtro dimensional com estado local
 */
export function useHistoryDimensionalFilter() {
  const [state, setState] = useState<HistoryDimensionalFilterState>({
    bookmakerIds: [],
    parceiroIds: [],
  });

  return { dimensionalFilter: state, setDimensionalFilter: setState };
}
