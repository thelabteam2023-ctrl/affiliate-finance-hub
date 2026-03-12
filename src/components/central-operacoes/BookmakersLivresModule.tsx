/**
 * Módulo Bookmakers Livres
 * 
 * Lista TODAS as bookmakers sem vínculo a projeto ativo (incluindo encerradas/bloqueadas).
 * Foco: visibilidade total de contas livres para reutilização operacional.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/utils/formatCurrency";
import { getFirstLastName } from "@/lib/utils";
import {
  Search,
  Unlink,
  Building2,
  User,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  History,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

interface BookmakerLivre {
  id: string;
  nome: string;
  status: string;
  saldo_atual: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  logo_url: string | null;
  ultimo_projeto_nome: string | null;
  ja_usada: boolean;
}

type SortColumn = "saldo" | null;
type SortDirection = "asc" | "desc";

export function BookmakersLivresModule() {
  const { workspaceId } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [usoFilter, setUsoFilter] = useState("todos");
  const [casaFilter, setCasaFilter] = useState("todas");
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Query: all bookmakers without active project
  const { data: contas, isLoading } = useQuery({
    queryKey: ["bookmakers-livres", workspaceId],
    queryFn: async (): Promise<BookmakerLivre[]> => {
      // Get all bookmakers without projeto_id (livre = sem vínculo ativo)
      const { data: bookmakers, error } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, status, saldo_atual, moeda,
          parceiro_id,
          parceiro:parceiros!bookmakers_parceiro_id_fkey (nome),
          catalogo:bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .eq("workspace_id", workspaceId!)
        .is("projeto_id", null)
        .order("nome");

      if (error) throw error;

      const bookmakerIds = (bookmakers || []).map((b: any) => b.id);

      // Check usage history
      let usedSet = new Set<string>();
      let lastProjectMap = new Map<string, string>();

      if (bookmakerIds.length > 0) {
        // Check historico
        const { data: historico } = await supabase
          .from("projeto_bookmaker_historico")
          .select("bookmaker_id, projeto:projetos!projeto_bookmaker_historico_projeto_id_fkey (nome)")
          .in("bookmaker_id", bookmakerIds)
          .not("data_desvinculacao", "is", null)
          .order("data_desvinculacao", { ascending: false });

        if (historico) {
          for (const h of historico as any[]) {
            usedSet.add(h.bookmaker_id);
            if (!lastProjectMap.has(h.bookmaker_id)) {
              lastProjectMap.set(h.bookmaker_id, h.projeto?.nome || "N/A");
            }
          }
        }

        // Check apostas
        const { data: apostas } = await supabase
          .from("apostas_unificada")
          .select("bookmaker_id")
          .in("bookmaker_id", bookmakerIds)
          .limit(1000);

        apostas?.forEach((a: any) => {
          if (a.bookmaker_id) usedSet.add(a.bookmaker_id);
        });

        // Check ledger
        const { data: ledger } = await supabase
          .from("cash_ledger")
          .select("origem_bookmaker_id, destino_bookmaker_id")
          .or(`origem_bookmaker_id.in.(${bookmakerIds.join(",")}),destino_bookmaker_id.in.(${bookmakerIds.join(",")})`)
          .limit(1000);

        ledger?.forEach((l: any) => {
          if (l.origem_bookmaker_id && bookmakerIds.includes(l.origem_bookmaker_id)) usedSet.add(l.origem_bookmaker_id);
          if (l.destino_bookmaker_id && bookmakerIds.includes(l.destino_bookmaker_id)) usedSet.add(l.destino_bookmaker_id);
        });
      }

      return (bookmakers || []).map((b: any) => ({
        id: b.id,
        nome: b.nome,
        status: b.status || "ativo",
        saldo_atual: Number(b.saldo_atual) || 0,
        moeda: b.moeda || "BRL",
        parceiro_id: b.parceiro_id,
        parceiro_nome: b.parceiro?.nome || null,
        logo_url: b.catalogo?.logo_url || null,
        ultimo_projeto_nome: lastProjectMap.get(b.id) || null,
        ja_usada: usedSet.has(b.id),
      }));
    },
    enabled: !!workspaceId,
    staleTime: 30 * 1000,
  });

  // Unique casas for filter
  const casasUnicas = useMemo(() => {
    if (!contas) return [];
    const set = new Set(contas.map((c) => c.nome));
    return [...set].sort();
  }, [contas]);

  // Filtered
  const filtered = useMemo(() => {
    if (!contas) return [];
    return contas.filter((c) => {
      if (casaFilter !== "todas" && c.nome !== casaFilter) return false;
      if (statusFilter === "ativo" && !["ativo", "aguardando_saque", "AGUARDANDO_DECISAO"].includes(c.status)) return false;
      if (statusFilter === "inativo" && ["ativo", "aguardando_saque", "AGUARDANDO_DECISAO"].includes(c.status)) return false;
      if (usoFilter === "nunca" && c.ja_usada) return false;
      if (usoFilter === "ja_usada" && !c.ja_usada) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.nome.toLowerCase().includes(q) && !c.parceiro_nome?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [contas, search, casaFilter, statusFilter, usoFilter]);

  // Sorted
  const sorted = useMemo(() => {
    if (!sortColumn) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a.saldo_atual;
      const vb = b.saldo_atual;
      return sortDirection === "desc" ? vb - va : va - vb;
    });
  }, [filtered, sortColumn, sortDirection]);

  const handleSort = () => {
    if (!sortColumn) {
      setSortColumn("saldo");
      setSortDirection("desc");
    } else if (sortDirection === "desc") {
      setSortDirection("asc");
    } else {
      setSortColumn(null);
    }
  };

  const SortIcon = sortColumn === "saldo"
    ? sortDirection === "desc" ? ArrowDown : ArrowUp
    : ArrowUpDown;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-[220px] shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar casa ou parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {casasUnicas.length > 1 && (
          <Select value={casaFilter} onValueChange={setCasaFilter}>
            <SelectTrigger className="w-[175px] h-9 text-sm" icon={<Building2 className="h-3.5 w-3.5" />}>
              <SelectValue placeholder="Casa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as casas</SelectItem>
              {casasUnicas.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm" icon={<Filter className="h-3.5 w-3.5" />}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>

        <Select value={usoFilter} onValueChange={setUsoFilter}>
          <SelectTrigger className="w-[170px] h-9 text-sm" icon={<History className="h-3.5 w-3.5" />}>
            <SelectValue placeholder="Histórico" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="nunca">Nunca usada</SelectItem>
            <SelectItem value="ja_usada">Já usada</SelectItem>
          </SelectContent>
        </Select>

        <Badge variant="outline" className="h-9 px-3 text-sm">
          {sorted.length} / {contas?.length || 0}
        </Badge>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Casa</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Parceiro</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Moeda</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">
                    <button
                      onClick={handleSort}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Saldo Real
                      <SortIcon className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Status Usuário</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Já Foi Usada</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Último Projeto</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((conta) => {
                  const isAtivo = ["ativo", "aguardando_saque", "AGUARDANDO_DECISAO"].includes(conta.status);
                  return (
                    <tr
                      key={conta.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {conta.logo_url ? (
                            <img src={conta.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                          ) : (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium">{conta.nome}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {conta.parceiro_nome ? getFirstLastName(conta.parceiro_nome) : "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{conta.moeda}</Badge>
                      </td>
                      <td className="p-3 text-right font-mono font-medium">
                        {formatCurrency(conta.saldo_atual, conta.moeda)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            isAtivo
                              ? "border-emerald-500/30 text-emerald-400 text-xs"
                              : "border-red-500/30 text-red-400 text-xs"
                          }
                        >
                          <span className="flex items-center gap-1">
                            {isAtivo ? (
                              <><CheckCircle2 className="h-3 w-3" /> Ativo</>
                            ) : (
                              <><XCircle className="h-3 w-3" /> Inativo</>
                            )}
                          </span>
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            conta.ja_usada
                              ? "border-amber-500/30 text-amber-400 text-xs"
                              : "border-muted-foreground/30 text-muted-foreground text-xs"
                          }
                        >
                          {conta.ja_usada ? "Sim" : "Não"}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {conta.ultimo_projeto_nome ? (
                          <span>{conta.ultimo_projeto_nome}</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <Unlink className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>Nenhuma bookmaker livre encontrada</p>
                      <p className="text-xs mt-1">Ajuste os filtros ou todas as casas estão vinculadas a projetos</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
