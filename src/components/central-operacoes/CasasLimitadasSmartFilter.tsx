import { useState, useMemo } from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CasaLimitadaItem {
  entidade_id: string;
  titulo: string;
  valor: number | null;
  moeda: string;
  parceiro_nome: string | null;
  projeto_nome: string | null;
  [key: string]: any;
}

type SortMode = "highest" | "lowest" | "alpha";

const SORT_LABELS: Record<SortMode, string> = {
  highest: "Maior valor",
  lowest: "Menor valor",
  alpha: "A → Z",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", MYR: "RM", USDT: "US$", USDC: "US$",
};

interface CasasLimitadasSmartFilterProps<T extends CasaLimitadaItem> {
  casas: T[];
  children: (filtered: T[]) => React.ReactNode;
}

export function CasasLimitadasSmartFilter<T extends CasaLimitadaItem>({ casas, children }: CasasLimitadasSmartFilterProps<T>) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("highest");
  const [projetoFilter, setProjetoFilter] = useState("all");
  const [parceiroFilter, setParceiroFilter] = useState("all");

  const filterOptions = useMemo(() => {
    const projetos = new Set<string>();
    const parceiros = new Set<string>();
    casas.forEach((c) => {
      if (c.projeto_nome) projetos.add(c.projeto_nome);
      if (c.parceiro_nome) parceiros.add(c.parceiro_nome);
    });
    return {
      projetos: Array.from(projetos).sort(),
      parceiros: Array.from(parceiros).sort(),
    };
  }, [casas]);

  const filtered = useMemo(() => {
    let result = [...casas];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        [c.titulo, c.parceiro_nome, c.projeto_nome]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if (projetoFilter !== "all") {
      result = result.filter((c) => c.projeto_nome === projetoFilter);
    }
    if (parceiroFilter !== "all") {
      result = result.filter((c) => c.parceiro_nome === parceiroFilter);
    }

    result.sort((a, b) => {
      switch (sortMode) {
        case "highest": return (b.valor ?? 0) - (a.valor ?? 0);
        case "lowest": return (a.valor ?? 0) - (b.valor ?? 0);
        case "alpha": return (a.titulo || "").localeCompare(b.titulo || "");
        default: return 0;
      }
    });

    return result;
  }, [casas, search, sortMode, projetoFilter, parceiroFilter]);

  // Totals grouped by currency (from filtered results)
  const totalsByMoeda = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => {
      if (c.valor) {
        const moeda = c.moeda || "BRL";
        map.set(moeda, (map.get(moeda) || 0) + c.valor);
      }
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moeda, total]) => ({ moeda, total }));
  }, [filtered]);

  const hasFilter = search.trim() || projetoFilter !== "all" || parceiroFilter !== "all";

  return (
    <div className="space-y-2">
      {/* Totals by currency */}
      {totalsByMoeda.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium">Saldo pendente:</span>
          {totalsByMoeda.map(({ moeda, total }) => (
            <Badge key={moeda} variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border-orange-500/30 text-orange-400">
              {CURRENCY_SYMBOLS[moeda] || moeda} {total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1 text-[9px] font-normal text-muted-foreground">{moeda}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Search + Filters row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar casa, parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {filterOptions.projetos.length > 1 && (
          <Select value={projetoFilter} onValueChange={setProjetoFilter}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {filterOptions.projetos.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {filterOptions.parceiros.length > 1 && (
          <Select value={parceiroFilter} onValueChange={setParceiroFilter}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Parceiro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {filterOptions.parceiros.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="h-8 w-[130px] text-xs" icon={<ArrowUpDown className="h-3.5 w-3.5" />}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count when filtered */}
      {hasFilter && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length} de {casas.length} casas
          </span>
          <button
            onClick={() => { setSearch(""); setProjetoFilter("all"); setParceiroFilter("all"); }}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {children(filtered)}
    </div>
  );
}
