import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/types/currency";

export interface BookmakerOption {
  id: string;
  nome: string;
  saldo_atual: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome?: string;
  instance_identifier?: string | null;
}

interface BookmakerSearchSelectProps {
  bookmakers: BookmakerOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function BookmakerSearchSelect({
  bookmakers,
  value,
  onValueChange,
  placeholder = "Selecione o bookmaker",
}: BookmakerSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = bookmakers.find((b) => b.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return bookmakers;
    const q = search.toLowerCase();
    return bookmakers.filter(
      (b) =>
        b.nome?.toLowerCase().includes(q) ||
        b.parceiro_nome?.toLowerCase().includes(q) ||
        b.instance_identifier?.toLowerCase().includes(q) ||
        b.moeda?.toLowerCase().includes(q)
    );
  }, [bookmakers, search]);

  // Group by parceiro
  const grouped = useMemo(() => {
    const groups: Record<string, { parceiro_nome: string; bookmakers: BookmakerOption[] }> = {};
    for (const bk of filtered) {
      const key = bk.parceiro_id || "__sem_parceiro__";
      if (!groups[key]) {
        groups[key] = { parceiro_nome: bk.parceiro_nome || "Sem parceiro", bookmakers: [] };
      }
      groups[key].bookmakers.push(bk);
    }
    return Object.entries(groups).sort((a, b) =>
      a[1].parceiro_nome.localeCompare(b[1].parceiro_nome)
    );
  }, [filtered]);

  const formatSaldo = (bk: BookmakerOption) => {
    const symbol = getCurrencySymbol(bk.moeda);
    return `${symbol} ${bk.saldo_atual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getDisplayName = (bk: BookmakerOption) => {
    if (bk.instance_identifier) return `${bk.nome} (${bk.instance_identifier})`;
    return bk.nome;
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
                <span className="font-medium text-sm">{getDisplayName(selected)}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {selected.moeda}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {formatSaldo(selected)}
                </span>
              </div>
              {selected.parceiro_nome && (
                <span className="text-[10px] text-muted-foreground">
                  {selected.parceiro_nome}
                </span>
              )}
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
            placeholder="Buscar por casa, parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1">
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum bookmaker encontrado.
            </p>
          )}
          {grouped.map(([parceiroId, group]) => (
            <div key={parceiroId}>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 sticky top-0 bg-popover z-10">
                <User className="h-3 w-3" />
                {group.parceiro_nome}
              </div>
              {group.bookmakers.map((bk) => (
                <button
                  key={bk.id}
                  onClick={() => {
                    onValueChange(bk.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent/50 cursor-pointer transition-colors",
                    value === bk.id && "bg-accent"
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      value === bk.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{getDisplayName(bk)}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {bk.moeda}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {bk.parceiro_nome || "—"}
                      </span>
                      <span className={cn(
                        "text-[10px] font-medium",
                        bk.saldo_atual >= 0 ? "text-primary" : "text-destructive"
                      )}>
                        {formatSaldo(bk)}
                      </span>
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
