import { useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const EXCHANGES = [
  { value: "binance", label: "Binance" },
  { value: "coinbase", label: "Coinbase" },
  { value: "kraken", label: "Kraken" },
  { value: "okx", label: "OKX" },
  { value: "bybit", label: "Bybit" },
  { value: "kucoin", label: "KuCoin" },
  { value: "bitget", label: "Bitget" },
  { value: "gate-io", label: "Gate.io" },
  { value: "gemini", label: "Gemini" },
  { value: "huobi", label: "Huobi (HTX)" },
  { value: "bitfinex", label: "Bitfinex" },
  { value: "mercado-bitcoin", label: "Mercado Bitcoin" },
  { value: "foxbit", label: "Foxbit" },
  { value: "novadax", label: "NovaDAX" },
  { value: "bitso", label: "Bitso" },
  { value: "bitpreco", label: "BitPreço" },
  { value: "ledger", label: "Ledger (hardware)" },
  { value: "trezor", label: "Trezor (hardware)" },
  { value: "trust-wallet", label: "Trust Wallet" },
  { value: "metamask", label: "MetaMask" },
  { value: "exodus", label: "Exodus" },
  { value: "mexc", label: "MEXC" },
  { value: "rabby", label: "Rabby" },
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
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedExchange ? selectedExchange.label : "Selecione a exchange/wallet"}
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
