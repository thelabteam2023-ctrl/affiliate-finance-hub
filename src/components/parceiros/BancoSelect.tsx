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

interface Banco {
  id: string;
  codigo: string;
  nome: string;
}

interface BancoSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function BancoSelect({ value, onValueChange, disabled }: BancoSelectProps) {
  const [open, setOpen] = useState(false);
  const [bancos, setBancos] = useState<Banco[]>([]);

  useEffect(() => {
    fetchBancos();
  }, []);

  const fetchBancos = async () => {
    const { data } = await supabase.from("bancos").select("*").order("nome");
    if (data) setBancos(data);
  };

  const selectedBanco = bancos.find((banco) => banco.id === value);

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
            {selectedBanco
              ? `${selectedBanco.codigo} - ${selectedBanco.nome}`
              : "Selecione um banco"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar banco..." className="text-center" />
          <CommandList>
            <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
            <CommandGroup>
              {bancos.map((banco) => (
                <CommandItem
                  key={banco.id}
                  value={`${banco.codigo} ${banco.nome}`}
                  onSelect={() => {
                    onValueChange(banco.id);
                    setOpen(false);
                  }}
                  className="justify-center text-center"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === banco.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {banco.codigo} - {banco.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
