import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface BookmakerProjetoData {
  id: string;
  nome: string;
  logo_url: string | null;
  moeda: string;
  saldo_atual?: number;
  saldo_usd?: number;
  status?: string;
}

interface BookmakerProjetoSelectProps {
  projetoId: string;
  value: string;
  onValueChange: (value: string) => void;
  onBookmakerData?: (data: BookmakerProjetoData | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export interface BookmakerProjetoSelectRef {
  focus: () => void;
  open: () => void;
}

const BookmakerProjetoSelect = forwardRef<BookmakerProjetoSelectRef, BookmakerProjetoSelectProps>(({
  projetoId,
  value,
  onValueChange,
  onBookmakerData,
  disabled,
  placeholder = "Selecione a casa..."
}, ref) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BookmakerProjetoData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayData, setDisplayData] = useState<BookmakerProjetoData | null>(null);
  
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastFetchedValue = useRef<string>("");

  // Expose focus and open methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      triggerRef.current?.focus();
    },
    open: () => {
      setOpen(true);
    }
  }));

  // Buscar casas vinculadas ao projeto
  useEffect(() => {
    if (!projetoId) {
      setItems([]);
      return;
    }

    const abortController = new AbortController();

    const fetchBookmakers = async () => {
      setLoading(true);
      
      try {
        const { data, error } = await supabase
          .from("bookmakers")
          .select(`
            id,
            nome,
            moeda,
            saldo_atual,
            saldo_usd,
            status,
            bookmakers_catalogo:bookmaker_catalogo_id (
              logo_url
            )
          `)
          .eq("projeto_id", projetoId)
          .order("nome");

        if (abortController.signal.aborted) return;
        if (error) throw error;

        const mapped: BookmakerProjetoData[] = (data || []).map((b: any) => ({
          id: b.id,
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
          moeda: b.moeda || "BRL",
          saldo_atual: b.saldo_atual,
          saldo_usd: b.saldo_usd,
          status: b.status,
        }));

        setItems(mapped);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Erro ao carregar casas do projeto:", error);
          setItems([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchBookmakers();
    
    return () => {
      abortController.abort();
    };
  }, [projetoId]);

  // Atualizar displayData quando value ou items mudam
  useEffect(() => {
    if (!value) {
      setDisplayData(null);
      onBookmakerData?.(null);
      return;
    }

    const selectedItem = items.find(item => item.id === value);
    if (selectedItem) {
      setDisplayData(selectedItem);
      onBookmakerData?.(selectedItem);
    } else if (value && items.length > 0) {
      // Value existe mas não está na lista - limpar
      onValueChange("");
      setDisplayData(null);
      onBookmakerData?.(null);
    }
  }, [value, items, onBookmakerData, onValueChange]);

  // Filtrar itens pela busca
  const filteredItems = items.filter((item) => 
    item.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (itemId: string) => {
    onValueChange(itemId);
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading || !projetoId}
          className="w-full h-12 justify-between"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {displayData?.logo_url ? (
              <img
                src={displayData.logo_url}
                alt=""
                className="h-6 w-6 rounded object-contain flex-shrink-0"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : displayData ? (
              <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            ) : null}
            <span className={cn(
              "uppercase truncate",
              !displayData && "text-muted-foreground"
            )}>
              {displayData?.nome 
                ? displayData.nome 
                : loading
                  ? "Carregando..." 
                  : !projetoId
                    ? "Aguardando projeto..."
                    : placeholder}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-[--radix-popover-trigger-width] min-w-[300px] p-0 z-[9999]"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar casa..."
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList className="max-h-[280px] overflow-y-auto">
            <CommandEmpty>
              {loading
                ? "Carregando casas..."
                : items.length === 0
                  ? "Nenhuma casa vinculada a este projeto"
                  : "Nenhuma casa encontrada"}
            </CommandEmpty>
            <CommandGroup>
              {filteredItems.map((item) => {
                const isSelected = value === item.id;
                
                return (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => handleSelect(item.id)}
                    className="py-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <Check
                        className={cn(
                          "h-4 w-4 flex-shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {item.logo_url ? (
                        <img
                          src={item.logo_url}
                          alt=""
                          className="h-6 w-6 rounded object-contain flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="uppercase text-sm font-medium truncate block">
                          {item.nome}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.moeda}
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

BookmakerProjetoSelect.displayName = "BookmakerProjetoSelect";

export default BookmakerProjetoSelect;
