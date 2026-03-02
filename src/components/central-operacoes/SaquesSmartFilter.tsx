import { useState, useMemo, useCallback } from "react";
import { Search, SortAsc, SortDesc, X, AlertTriangle, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

interface RiskConcentration {
  nome: string;
  count: number;
  total: number;
  moeda: string;
}

interface ActiveFilter {
  type: "projeto" | "parceiro" | "moeda";
  value: string;
  label: string;
}

interface SaquesSmartFilterProps {
  saques: SaquePendenteItem[];
  children: (filtered: SaquePendenteItem[]) => React.ReactNode;
}

export function SaquesSmartFilter({ saques, children }: SaquesSmartFilterProps) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("oldest");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Extract unique values for filter chips
  const filterOptions = useMemo(() => {
    const projetos = new Map<string, string>();
    const parceiros = new Map<string, string>();
    const moedas = new Set<string>();

    saques.forEach((s) => {
      if (s.projeto_nome) projetos.set(s.projeto_nome, s.projeto_nome);
      if (s.parceiro_nome) parceiros.set(s.parceiro_nome, s.parceiro_nome);
      moedas.add(s.moeda_origem || s.moeda);
    });

    return {
      projetos: Array.from(projetos.values()).sort(),
      parceiros: Array.from(parceiros.values()).sort(),
      moedas: Array.from(moedas).sort(),
    };
  }, [saques]);

  // Risk concentration detection
  const riskAlerts = useMemo((): RiskConcentration[] => {
    const byParceiro = new Map<string, { count: number; total: number; moeda: string }>();
    saques.forEach((s) => {
      const nome = s.parceiro_nome || "Desconhecido";
      const current = byParceiro.get(nome) || { count: 0, total: 0, moeda: s.moeda_origem || s.moeda };
      current.count += 1;
      current.total += s.valor_origem || s.valor;
      byParceiro.set(nome, current);
    });

    return Array.from(byParceiro.entries())
      .filter(([, v]) => v.count >= 3)
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [saques]);

  const addFilter = useCallback((type: ActiveFilter["type"], value: string) => {
    setActiveFilters((prev) => {
      if (prev.some((f) => f.type === type && f.value === value)) return prev;
      return [...prev, { type, value, label: value }];
    });
  }, []);

  const removeFilter = useCallback((type: string, value: string) => {
    setActiveFilters((prev) => prev.filter((f) => !(f.type === type && f.value === value)));
  }, []);

  // Apply search + filters + sort
  const filtered = useMemo(() => {
    let result = [...saques];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        const text = [
          s.bookmaker_nome,
          s.parceiro_nome,
          s.wallet_nome,
          s.wallet_exchange,
          s.banco_nome,
          s.projeto_nome,
          s.coin,
          s.descricao,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(q);
      });
    }

    // Filters
    const projetoFilters = activeFilters.filter((f) => f.type === "projeto").map((f) => f.value);
    const parceiroFilters = activeFilters.filter((f) => f.type === "parceiro").map((f) => f.value);
    const moedaFilters = activeFilters.filter((f) => f.type === "moeda").map((f) => f.value);

    if (projetoFilters.length > 0) {
      result = result.filter((s) => s.projeto_nome && projetoFilters.includes(s.projeto_nome));
    }
    if (parceiroFilters.length > 0) {
      result = result.filter((s) => s.parceiro_nome && parceiroFilters.includes(s.parceiro_nome));
    }
    if (moedaFilters.length > 0) {
      result = result.filter((s) => moedaFilters.includes(s.moeda_origem || s.moeda));
    }

    // Sort
    result.sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return new Date(a.data_transacao).getTime() - new Date(b.data_transacao).getTime();
        case "newest":
          return new Date(b.data_transacao).getTime() - new Date(a.data_transacao).getTime();
        case "highest":
          return (b.valor_origem || b.valor) - (a.valor_origem || a.valor);
        case "lowest":
          return (a.valor_origem || a.valor) - (b.valor_origem || b.valor);
        default:
          return 0;
      }
    });

    return result;
  }, [saques, search, activeFilters, sortMode]);

  const sortLabels: Record<SortMode, string> = {
    oldest: "Mais antigo",
    newest: "Mais recente",
    highest: "Maior valor",
    lowest: "Menor valor",
  };

  const hasAnyFilter = search.trim() || activeFilters.length > 0;

  return (
    <div className="space-y-2">
      {/* Search + Sort + Project filter row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar wallet, parceiro, casa..."
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
        {filterOptions.projetos.length > 0 && (
          <Select
            value={activeFilters.find((f) => f.type === "projeto")?.value || "all"}
            onValueChange={(v) => {
              setActiveFilters((prev) => prev.filter((f) => f.type !== "projeto"));
              if (v !== "all") {
                addFilter("projeto", v);
              }
            }}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
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

      {/* Quick filter chips */}
      {(filterOptions.projetos.length > 1 || filterOptions.parceiros.length > 1 || filterOptions.moedas.length > 1) && (
        <div className="flex flex-wrap gap-1">
          {filterOptions.projetos.length > 1 &&
            filterOptions.projetos.map((p) => {
              const isActive = activeFilters.some((f) => f.type === "projeto" && f.value === p);
              return (
                <button
                  key={`proj-${p}`}
                  onClick={() => isActive ? removeFilter("projeto", p) : addFilter("projeto", p)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                    isActive
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  {p}
                  {isActive && <X className="h-2.5 w-2.5" />}
                </button>
              );
            })}
          {filterOptions.parceiros.length > 1 &&
            filterOptions.parceiros.map((p) => {
              const isActive = activeFilters.some((f) => f.type === "parceiro" && f.value === p);
              return (
                <button
                  key={`parc-${p}`}
                  onClick={() => isActive ? removeFilter("parceiro", p) : addFilter("parceiro", p)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                    isActive
                      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                      : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  {p}
                  {isActive && <X className="h-2.5 w-2.5" />}
                </button>
              );
            })}
          {filterOptions.moedas.length > 1 &&
            filterOptions.moedas.map((m) => {
              const isActive = activeFilters.some((f) => f.type === "moeda" && f.value === m);
              return (
                <button
                  key={`moeda-${m}`}
                  onClick={() => isActive ? removeFilter("moeda", m) : addFilter("moeda", m)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                    isActive
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  {m}
                  {isActive && <X className="h-2.5 w-2.5" />}
                </button>
              );
            })}
        </div>
      )}

      {/* Risk concentration alerts */}
      {riskAlerts.length > 0 && (
        <div className="space-y-1">
          {riskAlerts.map((alert) => (
            <button
              key={alert.nome}
              onClick={() => addFilter("parceiro", alert.nome)}
              className="w-full flex items-center gap-2 p-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-[10px] hover:bg-red-500/15 transition-colors"
            >
              <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
              <span className="text-red-300">
                <span className="font-semibold">{alert.nome}</span>: {alert.count} saques pendentes
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Results count when filtered */}
      {hasAnyFilter && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length} de {saques.length} saques
          </span>
          {activeFilters.length > 0 && (
            <button
              onClick={() => setActiveFilters([])}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Render filtered list */}
      {children(filtered)}
    </div>
  );
}
