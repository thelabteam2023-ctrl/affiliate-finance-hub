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
  const { workspaceId, user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [selectedParceiroId, setSelectedParceiroId] = useState("");
  const [parceiroSearch, setParceiroSearch] = useState("");
  const [parceiroPopoverOpen, setParceiroPopoverOpen] = useState(false);
  const [grupoFilter, setGrupoFilter] = useState("todos");
  const [regulamentacaoFilter, setRegulamentacaoFilter] = useState<"todas" | "REGULAMENTADA" | "NAO_REGULAMENTADA">("todas");
  const [search, setSearch] = useState("");
  const [showDescartados, setShowDescartados] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  // Fetch indisponibilidade records for this parceiro
  const indisponiveisKey = ["bookmaker-indisponiveis-parceiro", workspaceId, selectedParceiroId];
  const { data: indisponiveisData } = useQuery({
    queryKey: indisponiveisKey,
    queryFn: async (): Promise<{ id: string; bookmaker_catalogo_id: string }[]> => {
      if (!workspaceId || !selectedParceiroId) return [];
      const { data, error } = await (supabase as any)
        .from("bookmaker_indisponiveis")
        .select("id, bookmaker_catalogo_id")
        .eq("workspace_id", workspaceId)
        .eq("parceiro_id", selectedParceiroId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId && !!selectedParceiroId,
    staleTime: 60_000,
  });

  const indisponiveisMap = useMemo(() => {
    const map = new Map<string, string>();
    (indisponiveisData ?? []).forEach((r) => map.set(r.bookmaker_catalogo_id, r.id));
    return map;
  }, [indisponiveisData]);

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

  // Split into disponiveis / descartados
  const { disponiveis, descartados } = useMemo(() => {
    const disp: typeof missingBookmakers = [];
    const desc: typeof missingBookmakers = [];
    missingBookmakers.forEach((bk) => {
      if (indisponiveisMap.has(bk.id)) desc.push(bk);
      else disp.push(bk);
    });
    return { disponiveis: disp, descartados: desc };
  }, [missingBookmakers, indisponiveisMap]);

  const visibleList = showDescartados ? descartados : disponiveis;

  const filtered = useMemo(() => {
    if (!search.trim()) return visibleList;
    const q = search.toLowerCase();
    return visibleList.filter((bk) => bk.nome.toLowerCase().includes(q));
  }, [visibleList, search]);

  const handleCriar = (catalogoId: string) => {
    setCriarDialog({ open: true, parceiroId: selectedParceiroId, catalogoId });
  };

  const handleDialogClose = () => setCriarDialog({ open: false, parceiroId: "", catalogoId: "" });

  const handleCreated = () => {
    handleDialogClose();
    queryClient.invalidateQueries({ queryKey: ["parceiro-contas-existentes", workspaceId, selectedParceiroId] });
  };

  const resetSelection = useCallback(() => setSelectedIds(new Set()), []);

  const marcarIndisponivel = useCallback(async (catalogoIds: string[]) => {
    if (!workspaceId || !selectedParceiroId || !userId) return;
    try {
      const rows = catalogoIds.map((cid) => ({
        workspace_id: workspaceId,
        parceiro_id: selectedParceiroId,
        bookmaker_catalogo_id: cid,
        marcado_por: userId,
      }));
      const { error } = await (supabase as any)
        .from("bookmaker_indisponiveis")
        .upsert(rows, { onConflict: "workspace_id,parceiro_id,bookmaker_catalogo_id" });
      if (error) throw error;
      toast.success(
        catalogoIds.length === 1
          ? "Bookmaker marcada como indisponível"
          : `${catalogoIds.length} bookmakers marcadas como indisponíveis`
      );
      queryClient.invalidateQueries({ queryKey: indisponiveisKey });
      resetSelection();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao marcar indisponibilidade");
    }
  }, [workspaceId, selectedParceiroId, userId, queryClient, indisponiveisKey, resetSelection]);

  const restaurarDisponibilidade = useCallback(async (catalogoIds: string[]) => {
    if (!workspaceId || !selectedParceiroId) return;
    try {
      const recordIds = catalogoIds
        .map((cid) => indisponiveisMap.get(cid))
        .filter(Boolean) as string[];
      if (recordIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("bookmaker_indisponiveis")
        .delete()
        .in("id", recordIds);
      if (error) throw error;
      toast.success(
        catalogoIds.length === 1
          ? "Bookmaker restaurada"
          : `${catalogoIds.length} bookmakers restauradas`
      );
      queryClient.invalidateQueries({ queryKey: indisponiveisKey });
      resetSelection();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao restaurar disponibilidade");
    }
  }, [workspaceId, selectedParceiroId, indisponiveisMap, queryClient, indisponiveisKey, resetSelection]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((bk) => bk.id)));
    }
  };

  const handleBatchAction = () => {
    const ids = Array.from(selectedIds);
    if (showDescartados) restaurarDisponibilidade(ids);
    else marcarIndisponivel(ids);
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
          onChange={(v) => { setGrupoFilter(v); resetSelection(); }}
          className="w-[200px]"
        />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Regulamentação</span>
          <div className="flex items-center gap-1 h-9">
            <button
              onClick={() => { setRegulamentacaoFilter(regulamentacaoFilter === "REGULAMENTADA" ? "todas" : "REGULAMENTADA"); resetSelection(); }}
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
              onClick={() => { setRegulamentacaoFilter(regulamentacaoFilter === "NAO_REGULAMENTADA" ? "todas" : "NAO_REGULAMENTADA"); resetSelection(); }}
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
                      resetSelection();
                      setShowDescartados(false);
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
            {disponiveis.length} casa{disponiveis.length !== 1 ? "s" : ""} não criada{disponiveis.length !== 1 ? "s" : ""}
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
              <div className="flex items-center justify-between gap-4">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar bookmaker..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {descartados.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={showDescartados ? "secondary" : "outline"}
                          className="gap-1.5 text-xs"
                          onClick={() => { setShowDescartados(!showDescartados); resetSelection(); }}
                        >
                          {showDescartados ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          {showDescartados ? "Ver disponíveis" : `Indisponíveis (${descartados.length})`}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{showDescartados ? "Voltar à lista de disponíveis" : "Ver bookmakers marcadas como indisponíveis"}</TooltipContent>
                    </Tooltip>
                  )}

                  {selectedIds.size > 0 && (
                    <Button
                      size="sm"
                      variant={showDescartados ? "outline" : "destructive"}
                      className="gap-1.5 text-xs"
                      onClick={handleBatchAction}
                    >
                      {showDescartados ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      {showDescartados ? `Restaurar (${selectedIds.size})` : `Indisponível (${selectedIds.size})`}
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="w-[40px] px-3 py-3">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">
                        Bookmaker
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide w-[240px]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((bk) => (
                      <tr key={bk.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selectedIds.has(bk.id)}
                            onCheckedChange={() => toggleSelect(bk.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            {bk.logo_url && (
                              <img src={bk.logo_url} alt="" className="h-6 w-6 rounded object-contain flex-shrink-0" />
                            )}
                            <span className="font-medium">{bk.nome}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {showDescartados ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs"
                                onClick={() => restaurarDisponibilidade([bk.id])}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Restaurar
                              </Button>
                            ) : (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                                      onClick={() => marcarIndisponivel([bk.id])}
                                    >
                                      <Ban className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Marcar como indisponível</TooltipContent>
                                </Tooltip>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-xs"
                                  onClick={() => handleCriar(bk.id)}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Criar conta
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                          {showDescartados ? "Nenhuma bookmaker indisponível" : "Nenhuma bookmaker encontrada para a busca"}
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


// ─── Sub-component: View "Por Bookmaker" (original) ───
function ViewPorBookmaker() {
  const { workspaceId, user } = useAuth();
  const { isOperator } = useRole();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [selectedCatalogoId, setSelectedCatalogoId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [bkSearch, setBkSearch] = useState("");
  const [bkPopoverOpen, setBkPopoverOpen] = useState(false);
  const [showDescartados, setShowDescartados] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [grupoFilter, setGrupoFilter] = useState("todos");
  const [regulamentacaoFilter, setRegulamentacaoFilter] = useState<"todas" | "REGULAMENTADA" | "NAO_REGULAMENTADA">("todas");
  const [sortOrigem, setSortOrigem] = useState<"asc" | "desc" | null>(null);
  const [sortDias, setSortDias] = useState<"asc" | "desc" | null>(null);
  const { getCatalogoIdsByGrupo, membros: membrosVPB } = useBookmakerGrupos();

  const allGroupedCatalogoIdsVPB = useMemo(() => {
    const ids = new Set<string>();
    (membrosVPB ?? []).forEach((m) => ids.add(m.bookmaker_catalogo_id));
    return ids;
  }, [membrosVPB]);

  const [criarDialog, setCriarDialog] = useState<{
    open: boolean;
    parceiroId: string;
    catalogoId: string;
  }>({ open: false, parceiroId: "", catalogoId: "" });

  const { data: catalogoBookmakers, isLoading: loadingCatalogo } = useWorkspaceBookmakers();

  const selectedBookmaker = catalogoBookmakers?.find(
    (b) => b.id === selectedCatalogoId
  );

  const indisponiveisKey = ["bookmaker-indisponiveis", workspaceId, selectedCatalogoId];
  const { data: indisponiveisData } = useQuery({
    queryKey: indisponiveisKey,
    queryFn: async (): Promise<IndisponibilidadeRecord[]> => {
      if (!workspaceId || !selectedCatalogoId) return [];
      const { data, error } = await (supabase as any)
        .from("bookmaker_indisponiveis")
        .select("id, parceiro_id")
        .eq("workspace_id", workspaceId)
        .eq("bookmaker_catalogo_id", selectedCatalogoId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId && !!selectedCatalogoId,
    staleTime: 60_000,
  });

  const indisponiveisMap = useMemo(() => {
    const map = new Map<string, string>();
    (indisponiveisData ?? []).forEach((r) => map.set(r.parceiro_id, r.id));
    return map;
  }, [indisponiveisData]);

  const { data: parceirosResult, isLoading: loadingParceiros, refetch } = useQuery({
    queryKey: ["parceiros-sem-bookmaker", workspaceId, selectedCatalogoId],
    queryFn: async (): Promise<ParceiroSemConta[]> => {
      if (!workspaceId || !selectedCatalogoId) return [];

      const [parceirosRes, accountsRes, parceriasRes, indicacoesRes] = await Promise.all([
        supabase
          .from("parceiros")
          .select("id, nome, cpf, status")
          .eq("workspace_id", workspaceId)
          .eq("status", "ativo")
          .order("nome"),
        supabase
          .from("bookmakers")
          .select("parceiro_id")
          .eq("workspace_id", workspaceId)
          .eq("bookmaker_catalogo_id", selectedCatalogoId)
          .not("parceiro_id", "is", null),
        (supabase as any)
          .from("parcerias")
          .select("parceiro_id, origem_tipo, data_fim_prevista, status, fornecedor_id, indicacao_id, fornecedor:fornecedores!parcerias_fornecedor_id_fkey(nome), indicacao:indicacoes!parcerias_indicacao_id_fkey(indicador:indicadores_referral!indicacoes_indicador_id_fkey(nome))")
          .eq("workspace_id", workspaceId),
        (supabase as any)
          .from("indicacoes")
          .select("parceiro_id, indicador:indicadores_referral!indicacoes_indicador_id_fkey(nome)")
          .eq("workspace_id", workspaceId),
      ]);

      if (parceirosRes.error) throw parceirosRes.error;
      if (accountsRes.error) throw accountsRes.error;

      const withAccount = new Set(
        (accountsRes.data ?? []).map((a: any) => a.parceiro_id)
      );

      const origemMap = new Map<string, string>();
      const diasRestantesMap = new Map<string, number | null>();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      (parceriasRes.data ?? []).forEach((p: any) => {
        if (!origemMap.has(p.parceiro_id)) {
          if (p.origem_tipo === "FORNECEDOR" && p.fornecedor) {
            origemMap.set(p.parceiro_id, p.fornecedor.nome);
          } else if (p.origem_tipo === "INDICADOR" && p.indicacao?.indicador) {
            origemMap.set(p.parceiro_id, p.indicacao.indicador.nome);
          } else if (p.origem_tipo === "DIRETO") {
            origemMap.set(p.parceiro_id, "Direto");
          }
        }
        if (p.status?.toUpperCase() === "ATIVA" && p.data_fim_prevista) {
          const fim = new Date(p.data_fim_prevista);
          fim.setHours(0, 0, 0, 0);
          const diff = Math.ceil((fim.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const current = diasRestantesMap.get(p.parceiro_id);
          if (current === undefined || current === null || diff < current) {
            diasRestantesMap.set(p.parceiro_id, diff);
          }
        }
      });

      (indicacoesRes.data ?? []).forEach((ind: any) => {
        if (!origemMap.has(ind.parceiro_id) && ind.indicador) {
          origemMap.set(ind.parceiro_id, ind.indicador.nome);
        }
      });

      return (parceirosRes.data ?? [])
        .filter((p: any) => !withAccount.has(p.id))
        .map((p: any) => ({
          ...p,
          origem: origemMap.get(p.id) || undefined,
          diasRestantes: diasRestantesMap.get(p.id) ?? null,
        }));
    },
    enabled: !!workspaceId && !!selectedCatalogoId,
    staleTime: 60_000,
  });

  const allParceiros = parceirosResult ?? [];

  const { disponiveis, descartados } = useMemo(() => {
    const disp: ParceiroSemConta[] = [];
    const desc: ParceiroSemConta[] = [];
    allParceiros.forEach((p) => {
      if (indisponiveisMap.has(p.id)) desc.push(p);
      else disp.push(p);
    });
    return { disponiveis: disp, descartados: desc };
  }, [allParceiros, indisponiveisMap]);

  const visibleList = showDescartados ? descartados : disponiveis;

  const filtered = useMemo(() => {
    let result = visibleList;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.nome.toLowerCase().includes(q) || p.cpf?.includes(q)
      );
    }
    if (sortOrigem) {
      result = [...result].sort((a, b) => {
        const oa = (a.origem || "").toLowerCase();
        const ob = (b.origem || "").toLowerCase();
        if (!oa && !ob) return 0;
        if (!oa) return 1;
        if (!ob) return -1;
        return sortOrigem === "asc" ? oa.localeCompare(ob) : ob.localeCompare(oa);
      });
    }
    if (sortDias) {
      result = [...result].sort((a, b) => {
        const da = a.diasRestantes;
        const db = b.diasRestantes;
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return sortDias === "asc" ? da - db : db - da;
      });
    }
    return result;
  }, [visibleList, search, sortOrigem, sortDias]);

  const resetSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleCriarConta = (parceiroId: string) => {
    setCriarDialog({ open: true, parceiroId, catalogoId: selectedCatalogoId });
  };

  const handleDialogClose = () => {
    setCriarDialog({ open: false, parceiroId: "", catalogoId: "" });
  };

  const handleCreated = (_ctx: VinculoCriadoContext) => {
    handleDialogClose();
    refetch();
  };

  const marcarIndisponivel = useCallback(async (parceiroIds: string[]) => {
    if (!workspaceId || !selectedCatalogoId || !userId) return;
    try {
      const rows = parceiroIds.map((pid) => ({
        workspace_id: workspaceId,
        parceiro_id: pid,
        bookmaker_catalogo_id: selectedCatalogoId,
        marcado_por: userId,
      }));
      const { error } = await (supabase as any)
        .from("bookmaker_indisponiveis")
        .upsert(rows, { onConflict: "workspace_id,parceiro_id,bookmaker_catalogo_id" });
      if (error) throw error;
      toast.success(
        parceiroIds.length === 1
          ? "Parceiro marcado como indisponível"
          : `${parceiroIds.length} parceiros marcados como indisponíveis`
      );
      queryClient.invalidateQueries({ queryKey: indisponiveisKey });
      resetSelection();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao marcar indisponibilidade");
    }
  }, [workspaceId, selectedCatalogoId, userId, queryClient, indisponiveisKey, resetSelection]);

  const restaurarDisponibilidade = useCallback(async (parceiroIds: string[]) => {
    if (!workspaceId || !selectedCatalogoId) return;
    try {
      const recordIds = parceiroIds
        .map((pid) => indisponiveisMap.get(pid))
        .filter(Boolean) as string[];
      if (recordIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("bookmaker_indisponiveis")
        .delete()
        .in("id", recordIds);
      if (error) throw error;
      toast.success(
        parceiroIds.length === 1
          ? "Parceiro restaurado"
          : `${parceiroIds.length} parceiros restaurados`
      );
      queryClient.invalidateQueries({ queryKey: indisponiveisKey });
      resetSelection();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao restaurar disponibilidade");
    }
  }, [workspaceId, selectedCatalogoId, indisponiveisMap, queryClient, indisponiveisKey, resetSelection]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleBatchAction = () => {
    const ids = Array.from(selectedIds);
    if (showDescartados) restaurarDisponibilidade(ids);
    else marcarIndisponivel(ids);
  };

  // Filter bookmakers in dropdown: must belong to a group + regulamentação
  const dropdownBookmakers = useMemo(() => {
    const grupoIds = grupoFilter !== "todos" ? getCatalogoIdsByGrupo(grupoFilter) : null;
    return (catalogoBookmakers ?? [])
      .filter((bk) => allGroupedCatalogoIdsVPB.has(bk.id))
      .filter((bk) => regulamentacaoFilter === "todas" || bk.status === regulamentacaoFilter)
      .filter((bk) => !grupoIds || grupoIds.has(bk.id));
  }, [catalogoBookmakers, allGroupedCatalogoIdsVPB, regulamentacaoFilter, grupoFilter, getCatalogoIdsByGrupo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {!isOperator && (
          <BookmakerGrupoFilter
            value={grupoFilter}
            onChange={(v) => { setGrupoFilter(v); setSelectedCatalogoId(""); resetSelection(); }}
            className="w-[200px]"
          />
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Regulamentação</span>
          <div className="flex items-center gap-1 h-9">
            <button
              onClick={() => { setRegulamentacaoFilter(regulamentacaoFilter === "REGULAMENTADA" ? "todas" : "REGULAMENTADA"); setSelectedCatalogoId(""); resetSelection(); }}
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
              onClick={() => { setRegulamentacaoFilter(regulamentacaoFilter === "NAO_REGULAMENTADA" ? "todas" : "NAO_REGULAMENTADA"); setSelectedCatalogoId(""); resetSelection(); }}
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

        <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium uppercase tracking-wide">
          <Building2 className="h-4 w-4" />
          Bookmaker
        </div>
        <Popover open={bkPopoverOpen} onOpenChange={(open) => { setBkPopoverOpen(open); if (!open) setBkSearch(""); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-[280px] justify-center font-normal">
              {selectedBookmaker ? (
                <span className="flex items-center gap-2 truncate">
                  {selectedBookmaker.logo_url && (
                    <img src={selectedBookmaker.logo_url} alt="" className="h-5 w-5 rounded object-contain flex-shrink-0" />
                  )}
                  {selectedBookmaker.nome}
                </span>
              ) : (
                <span className="text-muted-foreground">Selecionar</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="flex items-center border-b border-border px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                placeholder="Buscar bookmaker..."
                value={bkSearch}
                onChange={(e) => setBkSearch(e.target.value)}
                className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto p-1">
              {loadingCatalogo ? (
                <div className="p-2"><Skeleton className="h-6 w-full" /></div>
              ) : (
                dropdownBookmakers
                  .filter((bk) => bk.nome.toLowerCase().includes(bkSearch.toLowerCase()))
                  .map((bk) => (
                    <button
                      key={bk.id}
                      onClick={() => {
                        setSelectedCatalogoId(bk.id);
                        setBkPopoverOpen(false);
                        setBkSearch("");
                        resetSelection();
                        setShowDescartados(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors",
                        selectedCatalogoId === bk.id && "bg-accent"
                      )}
                    >
                      <Check className={cn("h-4 w-4 shrink-0", selectedCatalogoId === bk.id ? "opacity-100" : "opacity-0")} />
                      {bk.logo_url && (
                        <img src={bk.logo_url} alt="" className="h-5 w-5 rounded object-contain flex-shrink-0" />
                      )}
                      <span className="truncate">{bk.nome}</span>
                    </button>
                  ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {selectedCatalogoId && !loadingParceiros && (
          <>
            <Badge variant="outline" className="text-xs font-mono gap-1">
              <Users className="h-3 w-3" />
              {showDescartados
                ? `${filtered.length} descartado${filtered.length !== 1 ? "s" : ""}`
                : `${filtered.length} / ${disponiveis.length}`}
            </Badge>

            {descartados.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDescartados ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => { setShowDescartados(!showDescartados); resetSelection(); }}
                  >
                    {showDescartados ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showDescartados ? "Ocultar descartados" : `Descartados (${descartados.length})`}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showDescartados ? "Voltar à lista de disponíveis" : "Ver parceiros marcados como indisponíveis"}
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant={showDescartados ? "outline" : "destructive"}
            className="gap-1.5 text-xs"
            onClick={handleBatchAction}
          >
            {showDescartados ? (
              <><Undo2 className="h-3.5 w-3.5" /> Restaurar</>
            ) : (
              <><Ban className="h-3.5 w-3.5" /> Marcar indisponível</>
            )}
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={resetSelection}>
            Limpar seleção
          </Button>
        </div>
      )}

      {!selectedCatalogoId && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Building2 className="h-10 w-10 opacity-30" />
          <p className="text-sm">Selecione uma bookmaker para ver parceiros sem conta</p>
        </div>
      )}

      {selectedCatalogoId && loadingParceiros && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {selectedCatalogoId && !loadingParceiros && (
        <>
          {visibleList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                {showDescartados
                  ? "Nenhum parceiro descartado para esta bookmaker"
                  : <>Todos os parceiros já possuem conta na{" "}
                    <span className="font-semibold text-foreground">{selectedBookmaker?.nome}</span>
                  </>
                }
              </p>
            </div>
          ) : (
            <>
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar parceiro..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="w-[40px] px-3 py-3">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">
                        Parceiro
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">
                        CPF
                      </th>
                      <th
                        className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide cursor-pointer select-none hover:text-foreground transition-colors"
                        onClick={() => { setSortOrigem((prev) => prev === "asc" ? "desc" : prev === "desc" ? null : "asc"); setSortDias(null); }}
                      >
                        <span className="inline-flex items-center gap-1">
                          Origem
                          {sortOrigem === "asc" ? <ArrowUp className="h-3 w-3" /> : sortOrigem === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </span>
                      </th>
                      <th
                        className="text-center px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide w-[120px] cursor-pointer select-none hover:text-foreground transition-colors"
                        onClick={() => { setSortDias((prev) => prev === "desc" ? "asc" : prev === "asc" ? null : "desc"); setSortOrigem(null); }}
                      >
                        <span className="inline-flex items-center gap-1">
                          Dias Rest.
                          {sortDias === "desc" ? <ArrowDown className="h-3 w-3" /> : sortDias === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </span>
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide w-[220px]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.id}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/20 transition-colors",
                          selectedIds.has(p.id) && "bg-muted/30"
                        )}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={() => toggleSelect(p.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {getFirstLastName(p.nome)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {p.cpf ? `${p.cpf.slice(0, 3)}.***.***-${p.cpf.slice(-2)}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {p.origem ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              {p.origem}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.diasRestantes !== null && p.diasRestantes !== undefined ? (
                            <Badge
                              variant={p.diasRestantes <= 7 ? "destructive" : p.diasRestantes <= 30 ? "secondary" : "outline"}
                              className="text-xs font-mono gap-1"
                            >
                              <Clock className="h-3 w-3" />
                              {p.diasRestantes <= 0 ? "Expirado" : `${p.diasRestantes}d`}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {showDescartados ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => restaurarDisponibilidade([p.id])}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Restaurar
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs"
                                onClick={() => handleCriarConta(p.id)}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                Criar conta
                              </Button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                                    onClick={() => marcarIndisponivel([p.id])}
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Marcar como indisponível</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum parceiro encontrado para a busca
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