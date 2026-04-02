/**
 * Módulo Bookmakers Livres
 * 
 * Lista TODAS as bookmakers sem vínculo a projeto ativo (incluindo encerradas/bloqueadas).
 * Foco: visibilidade total de contas livres para reutilização operacional.
 */

import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBalance } from "@/utils/formatCurrency";
import { getFirstLastName, cn } from "@/lib/utils";
import {
  Search,
  Unlink,
  Building2,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  AlertTriangle,
  FolderKanban,
  DollarSign,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { BookmakerGrupoFilter } from "@/components/bookmakers/BookmakerGrupoFilter";
import { useBookmakerGrupos } from "@/hooks/useBookmakerGrupos";
interface BookmakerLivre {
  id: string;
  nome: string;
  status: string;
  estado_conta: string;
  saldo_atual: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  logo_url: string | null;
  ultimo_projeto_nome: string | null;
  ja_usada: boolean;
  catalogo_status: string;
  bookmaker_catalogo_id: string | null;
}

type SortColumn = "saldo" | null;
type SortDirection = "asc" | "desc";

interface BookmakersLivresModuleProps {
  onRegistrarPerda?: (bookmakerId: string, bookmakerNome: string, moeda: string, saldoAtual: number) => void;
  onVincularProjeto?: (bookmakerId: string, projetoId: string, projetoNome: string) => void;
  onNewTransacao?: (bookmakerId: string, bookmakerNome: string, moeda: string, saldoAtual: number, saldoUsd: number, tipo: "deposito" | "retirada") => void;
}

// Searchable select popover component
function SearchableSelectPopover({
  value,
  onValueChange,
  options,
  placeholder,
  allLabel,
  icon,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  allLabel: string;
  icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selectedLabel = value === "todas" || value === "todos"
    ? allLabel
    : options.find((o) => o.value === value)?.label || allLabel;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-9 px-3 text-sm gap-2 font-normal justify-between min-w-[160px]"
        >
          <span className="flex items-center gap-1.5 truncate">
            {icon}
            <span className="truncate max-w-[120px]">{selectedLabel}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[250px] overflow-y-auto p-1">
          <button
            onClick={() => { onValueChange(allLabel === "Todas as casas" ? "todas" : "todos"); setOpen(false); }}
            className={cn(
              "w-full text-left text-sm px-2 py-1.5 rounded-sm hover:bg-muted/50 transition-colors",
              (value === "todas" || value === "todos") && "bg-primary/10 text-primary font-medium"
            )}
          >
            {allLabel}
          </button>
          {filtered.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onValueChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left text-sm px-2 py-1.5 rounded-sm hover:bg-muted/50 transition-colors",
                value === opt.value && "bg-primary/10 text-primary font-medium"
              )}
            >
              {opt.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhum resultado</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BookmakersLivresModule({ onRegistrarPerda, onVincularProjeto, onNewTransacao }: BookmakersLivresModuleProps) {
  const { workspaceId } = useAuth();

  const [estadoContaFilter, setEstadoContaFilter] = useState("operacional");
  const [usoFilter, setUsoFilter] = useState("virgem");
  const [casaFilter, setCasaFilter] = useState("todas");
  const [parceiroFilter, setParceiroFilter] = useState("todos");
  const [regulamentacaoFilter, setRegulamentacaoFilter] = useState("todas");
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [grupoFilter, setGrupoFilter] = useState("todos");
  const { getCatalogoIdsByGrupo } = useBookmakerGrupos();

  // Query: all bookmakers without active project
  const { data: contas, isLoading } = useQuery({
    queryKey: ["bookmakers-livres", workspaceId],
    queryFn: async (): Promise<BookmakerLivre[]> => {
      const { data: bookmakers, error } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, status, estado_conta, saldo_atual, moeda,
          parceiro_id, bookmaker_catalogo_id,
          parceiro:parceiros!bookmakers_parceiro_id_fkey (nome),
          catalogo:bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url, status)
        `)
        .eq("workspace_id", workspaceId!)
        .is("projeto_id", null)
        .is("investidor_id", null) // Excluir contas de investidores - não pertencem ao pool interno
        .order("nome");

      if (error) throw error;

      const bookmakerIds = (bookmakers || []).map((b: any) => b.id);

      let usedSet = new Set<string>();
      let lastProjectMap = new Map<string, string>();

      if (bookmakerIds.length > 0) {
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

        const { data: apostas } = await supabase
          .from("apostas_unificada")
          .select("bookmaker_id")
          .in("bookmaker_id", bookmakerIds)
          .limit(1000);

        apostas?.forEach((a: any) => {
          if (a.bookmaker_id) usedSet.add(a.bookmaker_id);
        });

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
        estado_conta: b.estado_conta || "normal",
        saldo_atual: Number(b.saldo_atual) || 0,
        moeda: b.moeda || "BRL",
        parceiro_id: b.parceiro_id,
        parceiro_nome: b.parceiro?.nome || null,
        logo_url: b.catalogo?.logo_url || null,
        ultimo_projeto_nome: lastProjectMap.get(b.id) || null,
        ja_usada: usedSet.has(b.id),
        catalogo_status: b.catalogo?.status || "REGULAMENTADA",
        bookmaker_catalogo_id: b.bookmaker_catalogo_id || null,
      }));
    },
    enabled: !!workspaceId,
    staleTime: 30 * 1000,
  });

  // Fetch active projects for context menu
  const { data: projetos } = useQuery({
    queryKey: ["projetos-ativos-livres", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("workspace_id", workspaceId!)
        .in("status", ["PLANEJADO", "EM_ANDAMENTO"])
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });

  // Unique casas for filter
  const casasUnicas = useMemo(() => {
    if (!contas) return [];
    const set = new Set(contas.map((c) => c.nome));
    return [...set].sort().map((c) => ({ value: c, label: c }));
  }, [contas]);

  // Unique parceiros for filter
  const parceirosUnicos = useMemo(() => {
    if (!contas) return [];
    const map = new Map<string, string>();
    contas.forEach((c) => {
      if (c.parceiro_id && c.parceiro_nome) {
        map.set(c.parceiro_id, getFirstLastName(c.parceiro_nome));
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, nome]) => ({ value: id, label: nome }));
  }, [contas]);

  // Filtered
  const filtered = useMemo(() => {
    if (!contas) return [];
    return contas.filter((c) => {
      if (casaFilter !== "todas" && c.nome !== casaFilter) return false;
      if (parceiroFilter !== "todos" && c.parceiro_id !== parceiroFilter) return false;
      // Estado conta filter: "operacional" hides limitada/encerrada/bloqueada
      if (estadoContaFilter === "operacional") {
        if (["limitada", "encerrada", "bloqueada", "LIMITADA", "ENCERRADA", "BLOQUEADA"].includes(c.estado_conta)) return false;
      } else if (estadoContaFilter === "limitada") {
        if (!["limitada", "encerrada", "bloqueada", "LIMITADA", "ENCERRADA", "BLOQUEADA"].includes(c.estado_conta)) return false;
      }
      if (usoFilter === "virgem" && c.ja_usada) return false;
      if (usoFilter === "utilizada" && !c.ja_usada) return false;
      if (regulamentacaoFilter !== "todas" && c.catalogo_status !== regulamentacaoFilter) return false;
      if (grupoFilter !== "todos") {
        const grupoIds = getCatalogoIdsByGrupo(grupoFilter);
        if (!c.bookmaker_catalogo_id || !grupoIds.has(c.bookmaker_catalogo_id)) return false;
      }
      return true;
    });
  }, [contas, casaFilter, parceiroFilter, estadoContaFilter, usoFilter, regulamentacaoFilter, grupoFilter, getCatalogoIdsByGrupo]);

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
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Bookmaker</span>
          <SearchableSelectPopover
            value={casaFilter}
            onValueChange={setCasaFilter}
            options={casasUnicas}
            placeholder="Buscar casa..."
            allLabel="Todas as casas"
            icon={<Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Parceiro</span>
          <SearchableSelectPopover
            value={parceiroFilter}
            onValueChange={setParceiroFilter}
            options={parceirosUnicos}
            placeholder="Buscar parceiro..."
            allLabel="Todos parceiros"
            icon={<User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Estado Conta</span>
          <Select value={estadoContaFilter} onValueChange={setEstadoContaFilter}>
            <SelectTrigger className="w-auto min-w-[160px] h-9 text-sm" icon={<Filter className="h-3.5 w-3.5" />}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="operacional">Operacionais</SelectItem>
              <SelectItem value="limitada">Limitada / Encerrada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Histórico</span>
          <Select value={usoFilter} onValueChange={setUsoFilter}>
            <SelectTrigger className="w-auto min-w-[150px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas contas</SelectItem>
              <SelectItem value="virgem">Conta virgem</SelectItem>
              <SelectItem value="utilizada">Já utilizada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Regulamentação</span>
          <div className="flex items-center gap-1 h-9">
            <button
              onClick={() => setRegulamentacaoFilter(regulamentacaoFilter === "REGULAMENTADA" ? "todas" : "REGULAMENTADA")}
              className={cn(
                "h-8 px-3 rounded-md text-xs font-medium tracking-wide transition-colors uppercase border",
                regulamentacaoFilter === "REGULAMENTADA"
                  ? "bg-success/15 border-success/40 text-success"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Regulamentada
            </button>
            <button
              onClick={() => setRegulamentacaoFilter(regulamentacaoFilter === "NAO_REGULAMENTADA" ? "todas" : "NAO_REGULAMENTADA")}
              className={cn(
                "h-8 px-3 rounded-md text-xs font-medium tracking-wide transition-colors uppercase border",
                regulamentacaoFilter === "NAO_REGULAMENTADA"
                  ? "bg-warning/15 border-warning/40 text-warning"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Não Regulamentada
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Grupo</span>
          <BookmakerGrupoFilter value={grupoFilter} onChange={setGrupoFilter} className="w-[180px] h-9" />
        </div>

        <Badge variant="outline" className="h-9 px-3 text-sm font-mono self-end">
          {sorted.length} / {contas?.length || 0}
        </Badge>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto relative">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
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
                  <th className="text-center p-3 font-medium text-muted-foreground">Estado Conta</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Já Foi Usada</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Último Projeto</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((conta) => {
                  const estadoConta = conta.estado_conta?.toLowerCase() || "normal";
                  const isNormal = estadoConta === "normal" || estadoConta === "";
                  const isLimitada = estadoConta === "limitada";
                  const isEncerrada = estadoConta === "encerrada";
                  return (
                    <ContextMenu key={conta.id}>
                      <ContextMenuTrigger asChild>
                        <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-context-menu">
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
                            {formatBalance(conta.saldo_atual, conta.moeda)}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant="outline"
                              className={cn("text-xs",
                                isNormal && "border-emerald-500/30 text-emerald-400",
                                isLimitada && "border-amber-500/30 text-amber-400",
                                isEncerrada && "border-red-500/30 text-red-400",
                              )}
                            >
                              <span className="flex items-center gap-1">
                                {isNormal ? (
                                  <><CheckCircle2 className="h-3 w-3" /> Normal</>
                                ) : isLimitada ? (
                                  <><AlertTriangle className="h-3 w-3" /> Limitada</>
                                ) : isEncerrada ? (
                                  <><XCircle className="h-3 w-3" /> Encerrada</>
                                ) : (
                                  <>{estadoConta}</>
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
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="gap-2">
                            <DollarSign className="h-4 w-4" />
                            Financeiro
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="min-w-[180px]">
                            <ContextMenuItem
                              onClick={() => onNewTransacao?.(conta.id, conta.nome, conta.moeda, conta.saldo_atual, 0, "deposito")}
                              className="gap-2"
                              disabled={!onNewTransacao}
                            >
                              <Plus className="h-4 w-4 text-success" />
                              Depósito
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => onNewTransacao?.(conta.id, conta.nome, conta.moeda, conta.saldo_atual, 0, "retirada")}
                              className="gap-2"
                              disabled={!onNewTransacao}
                            >
                              <Minus className="h-4 w-4 text-destructive" />
                              Saque
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => onRegistrarPerda?.(conta.id, conta.nome, conta.moeda, conta.saldo_atual)}
                              className="gap-2 text-destructive focus:text-destructive"
                              disabled={!onRegistrarPerda}
                            >
                              <AlertTriangle className="h-4 w-4" />
                              Registrar perda
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="gap-2">
                            <FolderKanban className="h-4 w-4" />
                            Vincular a projeto
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="min-w-[180px]">
                            {projetos && projetos.length > 0 ? (
                              projetos.map((proj) => (
                                <ContextMenuItem
                                  key={proj.id}
                                  onClick={() => onVincularProjeto?.(conta.id, proj.id, proj.nome)}
                                  className="gap-2"
                                >
                                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                                  {proj.nome}
                                </ContextMenuItem>
                              ))
                            ) : (
                              <ContextMenuItem disabled className="text-muted-foreground text-xs">
                                Nenhum projeto disponível
                              </ContextMenuItem>
                            )}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      </ContextMenuContent>
                    </ContextMenu>
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
