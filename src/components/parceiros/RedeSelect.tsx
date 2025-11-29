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
    const { data } = await supabase.from("redes_crypto").select("*").order("nome");
    if (data) setRedes(data);
  };

  const selectedRede = redes.find((rede) => rede.id === value);

  return (
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
          <CommandInput placeholder="Buscar rede..." className="text-center" />
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
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
