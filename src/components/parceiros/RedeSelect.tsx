import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

interface RedeCrypto {
  id: string;
  codigo: string;
  nome: string;
  usage_count?: number;
}

interface RedeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function RedeSelect({ value, onValueChange, disabled }: RedeSelectProps) {
  const [open, setOpen] = useState(false);
  const [redes, setRedes] = useState<RedeCrypto[]>([]);

  useEffect(() => {
    fetchRedes();
  }, []);

  const fetchRedes = async () => {
    // Buscar redes com contagem de uso
    const { data: redesData } = await supabase.from("redes_crypto").select("*");
    const { data: walletsData } = await supabase
      .from("wallets_crypto")
      .select("network");

    if (redesData && walletsData) {
      // Contar uso de cada rede
      const usageMap = walletsData.reduce((acc: Record<string, number>, wallet) => {
        acc[wallet.network] = (acc[wallet.network] || 0) + 1;
        return acc;
      }, {});

      // Adicionar contagem de uso e ordenar
      const redesWithUsage = redesData.map(rede => ({
        ...rede,
        usage_count: usageMap[rede.codigo] || 0
      }));

      // Ordem de prioridade das principais redes
      const priorityOrder = ["ERC20", "BNB Smart Chain", "TRON", "Bitcoin"];
      
      // Ordenar por: 1º prioridade default, 2º uso, 3º nome
      const sorted = redesWithUsage.sort((a, b) => {
        const aPriority = priorityOrder.indexOf(a.nome);
        const bPriority = priorityOrder.indexOf(b.nome);
        
        // Se ambos estão na lista de prioridade, ordenar pela ordem da lista
        if (aPriority !== -1 && bPriority !== -1) {
          return aPriority - bPriority;
        }
        // Se apenas A está na prioridade, A vem primeiro
        if (aPriority !== -1) return -1;
        // Se apenas B está na prioridade, B vem primeiro
        if (bPriority !== -1) return 1;
        
        // Para os demais, ordenar por uso (maior primeiro), depois por nome
        if (b.usage_count !== a.usage_count) {
          return b.usage_count - a.usage_count;
        }
        return a.nome.localeCompare(b.nome);
      });

      setRedes(sorted);
    }
  };

  const selectedRede = redes.find((rede) => rede.id === value);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between text-center"
              disabled={disabled}
            >
              <span className="flex-1 text-center">
                {selectedRede ? selectedRede.nome : "Selecione uma rede"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0 bg-popover border-border" align="start">
            <Command className="bg-popover">
              <CommandInput placeholder="Buscar rede..." />
              <CommandList className="bg-popover">
                <CommandEmpty>Nenhuma rede encontrada.</CommandEmpty>
                <CommandGroup>
                  {redes.map((rede) => (
                    <CommandItem
                      key={rede.id}
                      value={rede.nome}
                      onSelect={() => {
                        onValueChange(rede.id);
                        setOpen(false);
                      }}
                      className="justify-center text-center hover:bg-accent focus:bg-accent"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === rede.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {rede.nome}
                      {rede.usage_count! > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          ({rede.usage_count})
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
    </>
  );
}
