import { useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const EXCHANGES = [
  { value: "BINANCE", label: "Binance" },
  { value: "COINBASE", label: "Coinbase" },
  { value: "KRAKEN", label: "Kraken" },
  { value: "OKX", label: "OKX" },
  { value: "BYBIT", label: "Bybit" },
  { value: "KUCOIN", label: "KuCoin" },
  { value: "BITGET", label: "Bitget" },
  { value: "GATE.IO", label: "Gate.io" },
  { value: "GEMINI", label: "Gemini" },
  { value: "HUOBI (HTX)", label: "Huobi (HTX)" },
  { value: "BITFINEX", label: "Bitfinex" },
  { value: "MERCADO BITCOIN", label: "Mercado Bitcoin" },
  { value: "FOXBIT", label: "Foxbit" },
  { value: "NOVADAX", label: "NovaDAX" },
  { value: "BITSO", label: "Bitso" },
  { value: "BITPRECO", label: "BitPreço" },
  { value: "LEDGER (HARDWARE)", label: "Ledger (hardware)" },
  { value: "TREZOR (HARDWARE)", label: "Trezor (hardware)" },
  { value: "TRUST WALLET", label: "Trust Wallet" },
  { value: "METAMASK", label: "MetaMask" },
  { value: "EXODUS", label: "Exodus" },
  { value: "MEXC", label: "MEXC" },
  { value: "RABBY", label: "Rabby" },
];

interface ExchangeSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function ExchangeSelect({ value, onValueChange, disabled }: ExchangeSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedExchange = EXCHANGES.find((ex) => ex.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-center text-center"
          disabled={disabled}
        >
          <span className="flex-1 text-center">
            {selectedExchange ? selectedExchange.label : "Selecione a exchange/wallet"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 bg-popover" align="start">
        <Command>
          <CommandInput placeholder="Buscar exchange/wallet..." />
          <CommandList>
            <CommandEmpty>Nenhuma exchange encontrada.</CommandEmpty>
            <CommandGroup>
              {EXCHANGES.map((exchange) => (
                <CommandItem
                  key={exchange.value}
                  value={exchange.value}
                  onSelect={() => {
                    onValueChange(exchange.value);
                    setOpen(false);
                  }}
                  className="hover:bg-accent/40"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === exchange.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {exchange.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
