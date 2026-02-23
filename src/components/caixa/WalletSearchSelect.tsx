import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface WalletOption {
  id: string;
  exchange: string;
  endereco: string;
  parceiro_nome?: string;
  moeda: string[];
}

interface WalletSearchSelectProps {
  wallets: WalletOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function WalletSearchSelect({
  wallets,
  value,
  onValueChange,
  placeholder = "Selecione a wallet",
}: WalletSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = wallets.find((w) => w.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return wallets;
    const q = search.toLowerCase();
    return wallets.filter(
      (w) =>
        w.exchange?.toLowerCase().includes(q) ||
        w.parceiro_nome?.toLowerCase().includes(q) ||
        w.endereco?.toLowerCase().includes(q) ||
        w.moeda?.some((m) => m.toLowerCase().includes(q))
    );
  }, [wallets, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10 font-normal"
        >
          {selected ? (
            <div className="flex flex-col items-start gap-0.5 text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium uppercase text-sm">{selected.exchange}</span>
                <div className="flex gap-1">
                  {selected.moeda.slice(0, 3).map((m) => (
                    <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {m}
                    </Badge>
                  ))}
                  {selected.moeda.length > 3 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      +{selected.moeda.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {selected.parceiro_nome && <span>{selected.parceiro_nome}</span>}
                {selected.parceiro_nome && <span>•</span>}
                <span className="font-mono">
                  {selected.endereco.slice(0, 6)}...{selected.endereco.slice(-4)}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar por nome, parceiro ou endereço..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma wallet encontrada.
            </p>
          )}
          {filtered.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => {
                onValueChange(wallet.id);
                setOpen(false);
                setSearch("");
              }}
              className={cn(
                "w-full flex items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent/50 cursor-pointer transition-colors",
                value === wallet.id && "bg-accent"
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  value === wallet.id ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium uppercase">{wallet.exchange}</span>
                  <div className="flex gap-1">
                    {wallet.moeda.slice(0, 3).map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {m}
                      </Badge>
                    ))}
                    {wallet.moeda.length > 3 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        +{wallet.moeda.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {wallet.parceiro_nome && <span>{wallet.parceiro_nome}</span>}
                  {wallet.parceiro_nome && <span>•</span>}
                  <span className="font-mono">
                    {wallet.endereco.slice(0, 6)}...{wallet.endereco.slice(-4)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
