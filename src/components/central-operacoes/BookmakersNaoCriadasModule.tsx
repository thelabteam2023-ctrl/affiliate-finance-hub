/**
 * Módulo "Bookmakers Não Criadas"
 *
 * Duas visões:
 * 1. Por Bookmaker: seleciona casa do catálogo → lista parceiros sem conta.
 * 2. Por Parceiro: seleciona parceiro → lista casas (filtradas por grupo) que o parceiro não possui.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/useRole";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceBookmakers } from "@/hooks/useWorkspaceBookmakers";
import { getFirstLastName, cn } from "@/lib/utils";
import {
  Search, UserPlus, Building2, Users, ChevronsUpDown, Check,
  Ban, Undo2, Eye, EyeOff, CheckSquare, ArrowUpDown, ArrowUp, ArrowDown, Clock,
  ToggleLeft, User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BookmakerDialog from "@/components/bookmakers/BookmakerDialog";
import type { VinculoCriadoContext } from "@/components/bookmakers/BookmakerDialog";
import { toast } from "sonner";
import { BookmakerGrupoFilter } from "@/components/bookmakers/BookmakerGrupoFilter";
import { useBookmakerGrupos } from "@/hooks/useBookmakerGrupos";

interface ParceiroSemConta {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  origem?: string;
  diasRestantes?: number | null;
}

interface IndisponibilidadeRecord {
  id: string;
  parceiro_id: string;
}

type ViewMode = "por-bookmaker" | "por-parceiro";

// ─── Sub-component: View "Por Parceiro" ───
function ViewPorParceiro() {
  const { workspaceId } = useAuth();
  const queryClient = useQueryClient();
  const [selectedParceiroId, setSelectedParceiroId] = useState("");
  const [parceiroSearch, setParceiroSearch] = useState("");
  const [parceiroPopoverOpen, setParceiroPopoverOpen] = useState(false);
  const [grupoFilter, setGrupoFilter] = useState("todos");
  const [regulamentacaoFilter, setRegulamentacaoFilter] = useState<"todas" | "REGULAMENTADA" | "NAO_REGULAMENTADA">("todas");
  const [search, setSearch] = useState("");
  const { getCatalogoIdsByGrupo, membros } = useBookmakerGrupos();

  // Set of all catalogo IDs that belong to at least one group
  const allGroupedCatalogoIds = useMemo(() => {
    const ids = new Set<string>();
    (membros ?? []).forEach((m) => ids.add(m.bookmaker_catalogo_id));
    return ids;
  }, [membros]);

  const [criarDialog, setCriarDialog] = useState<{
    open: boolean;
    parceiroId: string;
    catalogoId: string;
  }>({ open: false, parceiroId: "", catalogoId: "" });

  // Fetch all active parceiros
  const { data: parceiros, isLoading: loadingParceiros } = useQuery({
    queryKey: ["parceiros-ativos", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("parceiros")
        .select("id, nome, cpf, status")
        .eq("workspace_id", workspaceId)
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 2 * 60_000,
  });

  const selectedParceiro = parceiros?.find((p) => p.id === selectedParceiroId);

  // Fetch catalog bookmakers
  const { data: catalogoBookmakers, isLoading: loadingCatalogo } = useWorkspaceBookmakers();

  // Fetch existing accounts for the selected parceiro
  const { data: contasExistentes, isLoading: loadingContas } = useQuery({
    queryKey: ["parceiro-contas-existentes", workspaceId, selectedParceiroId],
    queryFn: async () => {
      if (!workspaceId || !selectedParceiroId) return [];
      const { data, error } = await supabase
        .from("bookmakers")
        .select("bookmaker_catalogo_id")
        .eq("workspace_id", workspaceId)
        .eq("parceiro_id", selectedParceiroId)
        .not("bookmaker_catalogo_id", "is", null);
      if (error) throw error;
      return (data ?? []).map((d: any) => d.bookmaker_catalogo_id as string);
    },
    enabled: !!workspaceId && !!selectedParceiroId,
    staleTime: 60_000,
  });

  const contasSet = useMemo(() => new Set(contasExistentes ?? []), [contasExistentes]);

  // Compute missing bookmakers
  const missingBookmakers = useMemo(() => {
    if (!catalogoBookmakers || !selectedParceiroId) return [];
    const grupoIds = grupoFilter !== "todos" ? getCatalogoIdsByGrupo(grupoFilter) : null;

    return catalogoBookmakers.filter((bk) => {
      if (contasSet.has(bk.id)) return false;
      if (!allGroupedCatalogoIds.has(bk.id)) return false;
      if (grupoIds && !grupoIds.has(bk.id)) return false;
      if (regulamentacaoFilter !== "todas" && bk.status !== regulamentacaoFilter) return false;
      return true;
    });
  }, [catalogoBookmakers, contasSet, grupoFilter, getCatalogoIdsByGrupo, selectedParceiroId, allGroupedCatalogoIds, regulamentacaoFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return missingBookmakers;
    const q = search.toLowerCase();
    return missingBookmakers.filter((bk) => bk.nome.toLowerCase().includes(q));
  }, [missingBookmakers, search]);

  const handleCriar = (catalogoId: string) => {
    setCriarDialog({ open: true, parceiroId: selectedParceiroId, catalogoId });
  };

  const handleDialogClose = () => setCriarDialog({ open: false, parceiroId: "", catalogoId: "" });

  const handleCreated = () => {
    handleDialogClose();
    queryClient.invalidateQueries({ queryKey: ["parceiro-contas-existentes", workspaceId, selectedParceiroId] });
  };

  const isLoading = loadingContas || loadingCatalogo;

  // Filtered parceiros for combobox
  const filteredParceiros = useMemo(() => {
    if (!parceiros) return [];
    if (!parceiroSearch.trim()) return parceiros;
    const q = parceiroSearch.toLowerCase();
    return parceiros.filter((p) => p.nome.toLowerCase().includes(q) || p.cpf?.includes(q));
  }, [parceiros, parceiroSearch]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <BookmakerGrupoFilter
          value={grupoFilter}
          onChange={(v) => { setGrupoFilter(v); }}
          className="w-[200px]"
        />

        <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium uppercase tracking-wide">
          <User className="h-4 w-4" />
          Parceiro
        </div>

        <Popover open={parceiroPopoverOpen} onOpenChange={(open) => { setParceiroPopoverOpen(open); if (!open) setParceiroSearch(""); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-[280px] justify-center font-normal">
              {selectedParceiro ? (
                <span className="truncate">{getFirstLastName(selectedParceiro.nome)}</span>
              ) : (
                <span className="text-muted-foreground">Selecionar parceiro</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="flex items-center border-b border-border px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                placeholder="Buscar parceiro..."
                value={parceiroSearch}
                onChange={(e) => setParceiroSearch(e.target.value)}
                className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto p-1">
              {loadingParceiros ? (
                <div className="p-2"><Skeleton className="h-6 w-full" /></div>
              ) : filteredParceiros.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Nenhum parceiro encontrado</div>
              ) : (
                filteredParceiros.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedParceiroId(p.id);
                      setParceiroPopoverOpen(false);
                      setParceiroSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors",
                      selectedParceiroId === p.id && "bg-accent"
                    )}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", selectedParceiroId === p.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{getFirstLastName(p.nome)}</span>
                    {p.cpf && <span className="text-xs text-muted-foreground ml-auto font-mono">{p.cpf.slice(-4)}</span>}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {selectedParceiroId && !isLoading && (
          <Badge variant="outline" className="text-xs font-mono gap-1">
            <Building2 className="h-3 w-3" />
            {filtered.length} casa{filtered.length !== 1 ? "s" : ""} não criada{filtered.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {!selectedParceiroId && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <User className="h-10 w-10 opacity-30" />
          <p className="text-sm">Selecione um parceiro para ver as bookmakers não criadas</p>
        </div>
      )}

      {selectedParceiroId && isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {selectedParceiroId && !isLoading && (
        <>
          {missingBookmakers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Building2 className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                <span className="font-semibold text-foreground">{getFirstLastName(selectedParceiro?.nome ?? "")}</span>
                {" "}já possui conta em todas as bookmakers{grupoFilter !== "todos" ? " deste grupo" : ""}
              </p>
            </div>
          ) : (
            <>
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar bookmaker..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">
                        Bookmaker
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide w-[180px]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((bk) => (
                      <tr key={bk.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            {bk.logo_url && (
                              <img src={bk.logo_url} alt="" className="h-6 w-6 rounded object-contain flex-shrink-0" />
                            )}
                            <span className="font-medium">{bk.nome}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {bk.status === "ativa" ? (
                            <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">Ativa</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">{bk.status}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={() => handleCriar(bk.id)}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Criar conta
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhuma bookmaker encontrada para a busca
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <BookmakerDialog
        open={criarDialog.open}
        onClose={handleDialogClose}
        onCreated={handleCreated}
        bookmaker={null}
        defaultParceiroId={criarDialog.parceiroId}
        defaultBookmakerId={criarDialog.catalogoId}
        lockParceiro
        lockBookmaker
      />
    </div>
  );
}


// ─── Main Module ───
export default function BookmakersNaoCriadasModule() {
  const [viewMode, setViewMode] = useState<ViewMode>("por-bookmaker");

  return (
    <div className="space-y-4">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList className="h-9">
          <TabsTrigger value="por-bookmaker" className="gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" />
            Por Bookmaker
          </TabsTrigger>
          <TabsTrigger value="por-parceiro" className="gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" />
            Por Parceiro
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === "por-bookmaker" ? <ViewPorBookmaker /> : <ViewPorParceiro />}
    </div>
  );
}