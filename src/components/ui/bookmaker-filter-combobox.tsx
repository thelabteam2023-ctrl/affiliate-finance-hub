import { useState } from "react";
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
import { Building2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";

export interface BookmakerFilterOption {
  id: string;
  nome: string;
  parceiroNome?: string;
}

interface BookmakerFilterComboboxProps {
  /** Available bookmaker options */
  bookmakers: BookmakerFilterOption[];
  /** Currently selected bookmaker IDs */
  selectedIds: string[];
  /** Called when selection changes */
  onSelectionChange: (ids: string[]) => void;
  /** Allow multiple selection (default: true) */
  multiSelect?: boolean;
  /** Custom placeholder for search input */
  searchPlaceholder?: string;
  /** Custom label for the trigger button */
  label?: string;
  /** Additional className for the trigger button */
  className?: string;
  /** Button size */
  size?: "sm" | "default";
}

/**
 * Componente reutilizável de filtro de bookmakers com layout empilhado:
 * - Nome da casa (linha principal, destaque)
 * - Nome do parceiro/vínculo (linha secundária, menor, neutro)
 * 
 * Pesquisável, com destaque visual do item selecionado.
 */
export function BookmakerFilterCombobox({
  bookmakers,
  selectedIds,
  onSelectionChange,
  multiSelect = true,
  searchPlaceholder = "Buscar casa...",
  label = "Casas",
  className,
  size = "sm",
}: BookmakerFilterComboboxProps) {
  const [open, setOpen] = useState(false);

  const toggleBookmaker = (id: string) => {
    if (multiSelect) {
      const newIds = selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id];
      onSelectionChange(newIds);
    } else {
      onSelectionChange(selectedIds.includes(id) ? [] : [id]);
      setOpen(false);
    }
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={selectedIds.length > 0 ? "secondary" : "outline"}
          size={size}
          className={cn("h-8 text-xs", className)}
        >
          <Building2 className="h-3.5 w-3.5 mr-1" />
          {label}
          {selectedIds.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
              {selectedIds.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Nenhuma casa encontrada.</CommandEmpty>
            <CommandGroup>
              {bookmakers.map((bk) => {
                const isSelected = selectedIds.includes(bk.id);
                return (
                  <CommandItem
                    key={bk.id}
                    onSelect={() => toggleBookmaker(bk.id)}
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
                          {getFirstLastName(bk.parceiroNome)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedIds.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={clearSelection}
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
  );
}
