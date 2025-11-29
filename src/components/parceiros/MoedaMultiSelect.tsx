import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface MoedaMultiSelectProps {
  moedas: string[];
  onChange: (moedas: string[]) => void;
  disabled?: boolean;
}

const MOEDAS_DISPONIVEIS = [
  { value: "USDT", label: "Tether (USDT)" },
  { value: "USDC", label: "USD Coin (USDC)" },
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
  { value: "BNB", label: "Binance Coin (BNB)" },
  { value: "TRX", label: "Tron (TRX)" },
  { value: "SOL", label: "Solana (SOL)" },
  { value: "MATIC", label: "Polygon (MATIC)" },
  { value: "ADA", label: "Cardano (ADA)" },
  { value: "DOT", label: "Polkadot (DOT)" },
  { value: "AVAX", label: "Avalanche (AVAX)" },
  { value: "LINK", label: "Chainlink (LINK)" },
  { value: "UNI", label: "Uniswap (UNI)" },
  { value: "LTC", label: "Litecoin (LTC)" },
  { value: "XRP", label: "Ripple (XRP)" },
];

export function MoedaMultiSelect({ moedas = [], onChange, disabled = false }: MoedaMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleMoeda = (moedaValue: string) => {
    if (moedas.includes(moedaValue)) {
      onChange(moedas.filter(m => m !== moedaValue));
    } else {
      onChange([...moedas, moedaValue]);
    }
  };

  const getDisplayText = () => {
    if (moedas.length === 0) return "Selecione uma moeda";
    if (moedas.length === 1) {
      const moeda = MOEDAS_DISPONIVEIS.find(m => m.value === moedas[0]);
      return moeda?.label || moedas[0];
    }
    return `${moedas.length} moedas selecionadas`;
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-center block">Moeda(s) *</Label>
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-center h-11 bg-background/50 border-border/50"
            disabled={disabled}
          >
            <span className="flex-1 text-center">{getDisplayText()}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 bg-popover border-border" align="center">
          <Command className="bg-popover">
            <CommandInput placeholder="Buscar moeda..." />
            <CommandList className="bg-popover max-h-[300px]">
              <CommandEmpty>Nenhuma moeda encontrada.</CommandEmpty>
              <CommandGroup>
                {MOEDAS_DISPONIVEIS.map((moeda) => (
                  <CommandItem
                    key={moeda.value}
                    value={moeda.label}
                    onSelect={() => !disabled && toggleMoeda(moeda.value)}
                    className="justify-between hover:bg-accent focus:bg-accent cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          moedas.includes(moeda.value)
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50 [&_svg]:invisible"
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span>{moeda.label}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {moedas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {moedas.map((moeda) => {
            const moedaInfo = MOEDAS_DISPONIVEIS.find(m => m.value === moeda);
            return (
              <Badge
                key={moeda}
                variant="secondary"
                className="text-xs px-2 py-0.5"
              >
                {moedaInfo?.value || moeda}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}