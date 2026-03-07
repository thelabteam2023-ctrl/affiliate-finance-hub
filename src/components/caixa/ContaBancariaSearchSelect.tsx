import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/types/currency";
import { getFirstLastName } from "@/lib/utils";

export interface ContaBancariaOption {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
  parceiro_nome: string;
  moeda: string;
  saldo: number | null;
}

interface ContaBancariaSearchSelectProps {
  contas: ContaBancariaOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function ContaBancariaSearchSelect({
  contas,
  value,
  onValueChange,
  placeholder = "Selecione a conta",
}: ContaBancariaSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = contas.find((c) => c.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return contas;
    const q = search.toLowerCase();
    return contas.filter(
      (c) =>
        c.banco?.toLowerCase().includes(q) ||
        c.titular?.toLowerCase().includes(q) ||
        c.parceiro_nome?.toLowerCase().includes(q) ||
        c.moeda?.toLowerCase().includes(q)
    );
  }, [contas, search]);

  // Group by parceiro
  const grouped = useMemo(() => {
    const groups: Record<string, { parceiro_nome: string; contas: ContaBancariaOption[] }> = {};
    for (const conta of filtered) {
      const key = conta.parceiro_id;
      if (!groups[key]) {
        groups[key] = { parceiro_nome: conta.parceiro_nome, contas: [] };
      }
      groups[key].contas.push(conta);
    }
    return Object.entries(groups).sort((a, b) =>
      a[1].parceiro_nome.localeCompare(b[1].parceiro_nome)
    );
  }, [filtered]);

  const formatSaldo = (conta: ContaBancariaOption) => {
    if (conta.saldo === null || conta.saldo === undefined) return null;
    const symbol = getCurrencySymbol(conta.moeda);
    return `${symbol} ${conta.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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
                <span className="font-medium text-sm">{selected.banco}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {selected.moeda}
                </Badge>
                {formatSaldo(selected) && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatSaldo(selected)}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {getFirstLastName(selected.titular)} • {selected.parceiro_nome}
              </span>
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
            placeholder="Buscar por banco, titular ou parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1">
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma conta encontrada.
            </p>
          )}
          {grouped.map(([parceiroId, group]) => (
            <div key={parceiroId}>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 sticky top-0 bg-popover z-10">
                <Building2 className="h-3 w-3" />
                {group.parceiro_nome}
              </div>
              {group.contas.map((conta) => (
                <button
                  key={conta.id}
                  onClick={() => {
                    onValueChange(conta.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent/50 cursor-pointer transition-colors",
                    value === conta.id && "bg-accent"
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      value === conta.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{conta.banco}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {conta.moeda}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {getFirstLastName(conta.titular)}
                      </span>
                      {formatSaldo(conta) !== null && (
                        <span className={cn(
                          "text-[10px] font-medium",
                          (conta.saldo ?? 0) >= 0 ? "text-primary" : "text-destructive"
                        )}>
                          {formatSaldo(conta)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
