import { useState, useMemo, useCallback } from "react";
import { Search, X, ArrowUpDown, User } from "lucide-react";
import { getFirstLastName } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SaquePendenteItem {
  id: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  destino_wallet_id: string | null;
  bookmaker_nome?: string;
  bookmaker_logo_url?: string | null;
  parceiro_nome?: string;
  banco_nome?: string;
  wallet_nome?: string;
  projeto_nome?: string;
  coin?: string;
  moeda_origem?: string;
  valor_origem?: number;
  wallet_exchange?: string;
  [key: string]: any;
}

type SortMode = "oldest" | "newest" | "highest" | "lowest";

interface ActiveFilter {
  type: "projeto" | "parceiro" | "moeda";
  value: string;
  label: string;
}

interface SaquesSmartFilterProps {
  saques: SaquePendenteItem[];
  children: (filtered: SaquePendenteItem[]) => React.ReactNode;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", MYR: "RM", USDT: "US$", USDC: "US$",
};

export function SaquesSmartFilter({ saques, children }: SaquesSmartFilterProps) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("oldest");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  const filterOptions = useMemo(() => {
    const projetos = new Map<string, string>();
    const parceiros = new Map<string, string>();
    saques.forEach((s) => {
      if (s.projeto_nome) projetos.set(s.projeto_nome, s.projeto_nome);
      if (s.parceiro_nome) parceiros.set(s.parceiro_nome, s.parceiro_nome);
    });
    return {
      projetos: Array.from(projetos.values()).sort(),
      parceiros: Array.from(parceiros.values()).sort(),
    };
  }, [saques]);

  const parceiroConcentration = useMemo(() => {
    const map = new Map<string, number>();
    saques.forEach((s) => {
      const nome = s.parceiro_nome || "";
      if (nome) map.set(nome, (map.get(nome) || 0) + 1);
    });
    return map;
  }, [saques]);

  const toggleParceiroFilter = useCallback((parceiro: string) => {
    setActiveFilters((prev) => {
      const exists = prev.some((f) => f.type === "parceiro" && f.value === parceiro);
      if (exists) return prev.filter((f) => !(f.type === "parceiro" && f.value === parceiro));
      return [...prev, { type: "parceiro" as const, value: parceiro, label: parceiro }];
    });
  }, []);

  const filtered = useMemo(() => {
    let result = [...saques];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        const text = [s.bookmaker_nome, s.parceiro_nome, s.wallet_nome, s.wallet_exchange, s.banco_nome, s.projeto_nome, s.coin, s.descricao]
          .filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      });
    }
    const projetoFilters = activeFilters.filter((f) => f.type === "projeto").map((f) => f.value);
    const parceiroFilters = activeFilters.filter((f) => f.type === "parceiro").map((f) => f.value);
    if (projetoFilters.length > 0) result = result.filter((s) => s.projeto_nome && projetoFilters.includes(s.projeto_nome));
    if (parceiroFilters.length > 0) result = result.filter((s) => s.parceiro_nome && parceiroFilters.includes(s.parceiro_nome));
    result.sort((a, b) => {
      switch (sortMode) {
        case "oldest": return new Date(a.data_transacao).getTime() - new Date(b.data_transacao).getTime();
        case "newest": return new Date(b.data_transacao).getTime() - new Date(a.data_transacao).getTime();
        case "highest": return (b.valor_origem || b.valor) - (a.valor_origem || a.valor);
        case "lowest": return (a.valor_origem || a.valor) - (b.valor_origem || b.valor);
        default: return 0;
      }
    });
    return result;
  }, [saques, search, activeFilters, sortMode]);

  const totalsByMoeda = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((s) => {
      const moeda = s.moeda_origem || s.moeda || "BRL";
      map.set(moeda, (map.get(moeda) || 0) + (s.valor_origem || s.valor));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moeda, total]) => ({ moeda, total }));
  }, [filtered]);

  const hasAnyFilter = search.trim() || activeFilters.length > 0;
  const activeParceiroFilters = activeFilters.filter((f) => f.type === "parceiro").map((f) => f.value);

  return (
    <div className="space-y-3">
      {/* Totals by currency — modern pill style */}
      {totalsByMoeda.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            Pendente:
          </span>
          {totalsByMoeda.map(({ moeda, total }) => (
            <div
              key={moeda}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted/50 border border-border/60"
            >
              <span className="text-[11px] font-bold text-foreground tabular-nums">
                {CURRENCY_SYMBOLS[moeda] || moeda}{" "}
                {total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-medium text-muted-foreground uppercase">{moeda}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search + Project dropdown + Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar wallet, parceiro, casa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-muted/20 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {filterOptions.projetos.length > 1 && (
          <Select
            value={activeFilters.find((f) => f.type === "projeto")?.value || "all"}
            onValueChange={(v) => {
              setActiveFilters((prev) => prev.filter((f) => f.type !== "projeto"));
              if (v !== "all") {
                setActiveFilters((prev) => [...prev, { type: "projeto", value: v, label: v }]);
              }
            }}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos projetos</SelectItem>
              {filterOptions.projetos.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="h-8 w-[140px] text-xs" icon={<ArrowUpDown className="h-3.5 w-3.5" />}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oldest">Mais antigo</SelectItem>
            <SelectItem value="newest">Mais recente</SelectItem>
            <SelectItem value="highest">Maior valor</SelectItem>
            <SelectItem value="lowest">Menor valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Parceiro filter chips — modern capsule style */}
      {filterOptions.parceiros.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {filterOptions.parceiros.map((p) => {
            const isActive = activeParceiroFilters.includes(p);
            const count = parceiroConcentration.get(p) || 0;
            return (
              <button
                key={`parc-${p}`}
                onClick={() => toggleParceiroFilter(p)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span className={cn(
                  "tabular-nums text-[10px] font-bold",
                  isActive ? "text-primary" : "text-muted-foreground/70"
                )}>
                  {count}
                </span>
                <span className="truncate max-w-[100px]">{getFirstLastName(p)}</span>
                {isActive && <X className="h-2.5 w-2.5 ml-0.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Results count when filtered */}
      {hasAnyFilter && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length} de {saques.length} saques
          </span>
          {activeFilters.length > 0 && (
            <button onClick={() => setActiveFilters([])} className="text-[10px] text-primary hover:text-primary/80 font-medium">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {children(filtered)}
    </div>
  );
}
