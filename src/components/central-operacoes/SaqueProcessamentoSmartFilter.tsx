import { useState, useMemo, useCallback } from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import { getFirstLastName } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Alerta } from "@/hooks/useCentralOperacoesData";

type SortMode = "oldest" | "newest" | "highest" | "lowest";

interface ActiveFilter {
  type: "projeto" | "parceiro";
  value: string;
  label: string;
}

interface Props {
  alertas: Alerta[];
  children: (filtered: Alerta[]) => React.ReactNode;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", MYR: "RM", USDT: "US$", USDC: "US$", MXN: "MX$",
};

export function SaqueProcessamentoSmartFilter({ alertas, children }: Props) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("oldest");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  const filterOptions = useMemo(() => {
    const projetos = new Map<string, string>();
    const parceiros = new Map<string, string>();
    alertas.forEach((a) => {
      if (a.projeto_nome) projetos.set(a.projeto_nome, a.projeto_nome);
      if (a.parceiro_nome) parceiros.set(a.parceiro_nome, a.parceiro_nome);
    });
    return {
      projetos: Array.from(projetos.values()).sort(),
      parceiros: Array.from(parceiros.values()).sort(),
    };
  }, [alertas]);

  const parceiroConcentration = useMemo(() => {
    const map = new Map<string, number>();
    alertas.forEach((a) => {
      const nome = a.parceiro_nome || "";
      if (nome) map.set(nome, (map.get(nome) || 0) + 1);
    });
    return map;
  }, [alertas]);

  const toggleParceiroFilter = useCallback((parceiro: string) => {
    setActiveFilters((prev) => {
      const exists = prev.some((f) => f.type === "parceiro" && f.value === parceiro);
      if (exists) return prev.filter((f) => !(f.type === "parceiro" && f.value === parceiro));
      return [...prev, { type: "parceiro" as const, value: parceiro, label: parceiro }];
    });
  }, []);

  const filtered = useMemo(() => {
    let result = [...alertas];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((a) => {
        const text = [a.titulo, a.parceiro_nome, a.projeto_nome, a.descricao]
          .filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      });
    }
    const projetoFilters = activeFilters.filter((f) => f.type === "projeto").map((f) => f.value);
    const parceiroFilters = activeFilters.filter((f) => f.type === "parceiro").map((f) => f.value);
    if (projetoFilters.length > 0) result = result.filter((a) => a.projeto_nome && projetoFilters.includes(a.projeto_nome));
    if (parceiroFilters.length > 0) result = result.filter((a) => a.parceiro_nome && parceiroFilters.includes(a.parceiro_nome));
    result.sort((a, b) => {
      switch (sortMode) {
        case "oldest": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "newest": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "highest": return (b.valor || 0) - (a.valor || 0);
        case "lowest": return (a.valor || 0) - (b.valor || 0);
        default: return 0;
      }
    });
    return result;
  }, [alertas, search, activeFilters, sortMode]);

  const totalsByMoeda = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((a) => {
      const moeda = a.moeda || "BRL";
      map.set(moeda, (map.get(moeda) || 0) + (a.valor || 0));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moeda, total]) => ({ moeda, total }));
  }, [filtered]);

  const parceiroTotals = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    alertas.forEach((a) => {
      const nome = a.parceiro_nome || "";
      if (!nome) return;
      const moeda = a.moeda || "BRL";
      if (!map.has(nome)) map.set(nome, new Map());
      const inner = map.get(nome)!;
      inner.set(moeda, (inner.get(moeda) || 0) + (a.valor || 0));
    });
    return map;
  }, [alertas]);

  const hasAnyFilter = search.trim() || activeFilters.length > 0;
  const activeParceiroFilters = activeFilters.filter((f) => f.type === "parceiro").map((f) => f.value);

  return (
    <div className="space-y-3">
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

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar casa, parceiro, projeto..."
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

      {filterOptions.parceiros.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {filterOptions.parceiros.map((p) => {
            const isActive = activeParceiroFilters.includes(p);
            const count = parceiroConcentration.get(p) || 0;
            const totals = parceiroTotals.get(p);
            const totalLabel = totals
              ? Array.from(totals.entries())
                  .map(([m, v]) => `${CURRENCY_SYMBOLS[m] || m} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                  .join(" · ")
              : "";
            return (
              <button
                key={`parc-${p}`}
                onClick={() => toggleParceiroFilter(p)}
                title={totalLabel}
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

      {hasAnyFilter && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length} de {alertas.length} saques
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