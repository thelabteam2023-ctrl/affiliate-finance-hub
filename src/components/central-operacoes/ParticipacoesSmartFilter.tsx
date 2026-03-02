import { useState, useMemo } from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getFirstLastName } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ParticipacaoFilterItem {
  id: string;
  investidor_nome?: string;
  projeto_nome?: string;
  ciclo_numero?: number;
  valor_participacao: number;
  [key: string]: any;
}

type SortMode = "highest" | "lowest" | "oldest" | "newest";

const SORT_LABELS: Record<SortMode, string> = {
  highest: "Maior valor",
  lowest: "Menor valor",
  oldest: "Mais antigo",
  newest: "Mais recente",
};

interface ParticipacoesSmartFilterProps<T extends ParticipacaoFilterItem> {
  participacoes: T[];
  children: (filtered: T[]) => React.ReactNode;
}

export function ParticipacoesSmartFilter<T extends ParticipacaoFilterItem>({
  participacoes,
  children,
}: ParticipacoesSmartFilterProps<T>) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("highest");
  const [investidorFilter, setInvestidorFilter] = useState("all");
  const [projetoFilter, setProjetoFilter] = useState("all");

  const filterOptions = useMemo(() => {
    const investidores = new Set<string>();
    const projetos = new Set<string>();
    participacoes.forEach((p) => {
      if (p.investidor_nome) investidores.add(p.investidor_nome);
      if (p.projeto_nome) projetos.add(p.projeto_nome);
    });
    return {
      investidores: Array.from(investidores).sort(),
      projetos: Array.from(projetos).sort(),
    };
  }, [participacoes]);

  const filtered = useMemo(() => {
    let result = [...participacoes];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        [p.investidor_nome, p.projeto_nome, p.ciclo_numero?.toString()]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if (investidorFilter !== "all") {
      result = result.filter((p) => p.investidor_nome === investidorFilter);
    }
    if (projetoFilter !== "all") {
      result = result.filter((p) => p.projeto_nome === projetoFilter);
    }

    result.sort((a, b) => {
      switch (sortMode) {
        case "highest": return b.valor_participacao - a.valor_participacao;
        case "lowest": return a.valor_participacao - b.valor_participacao;
        case "oldest": return (a.data_apuracao || "").localeCompare(b.data_apuracao || "");
        case "newest": return (b.data_apuracao || "").localeCompare(a.data_apuracao || "");
        default: return 0;
      }
    });

    return result;
  }, [participacoes, search, sortMode, investidorFilter, projetoFilter]);

  const totalPendente = useMemo(() => {
    return filtered.reduce((sum, p) => sum + p.valor_participacao, 0);
  }, [filtered]);

  const hasFilter = search.trim() || investidorFilter !== "all" || projetoFilter !== "all";

  return (
    <div className="space-y-2">
      {/* Total */}
      {totalPendente > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium">Total pendente:</span>
          <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border-indigo-500/30 text-indigo-400">
            R$ {totalPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Badge>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar investidor, projeto..."
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
        {filterOptions.investidores.length > 1 && (
          <Select value={investidorFilter} onValueChange={setInvestidorFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Investidor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {filterOptions.investidores.map((i) => (
                <SelectItem key={i} value={i}>{getFirstLastName(i)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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

      {/* Results count */}
      {hasFilter && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length} de {participacoes.length} participações
          </span>
          <button
            onClick={() => { setSearch(""); setInvestidorFilter("all"); setProjetoFilter("all"); }}
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
