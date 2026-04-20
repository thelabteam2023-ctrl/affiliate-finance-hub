import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useBookmakerGrupos, BookmakerGrupo, GrupoModoExecucao,
} from "@/hooks/useBookmakerGrupos";
import { useWorkspaceBookmakers } from "@/hooks/useWorkspaceBookmakers";
import { useCotacoes } from "@/hooks/useCotacoes";
import { BookmakerGrupoRegrasPanel } from "./BookmakerGrupoRegrasPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, Trash2, Edit2, Search, FolderOpen, X, ListChecks, Calendar, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BookmakerGruposDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  USD: "US$",
  EUR: "€",
  GBP: "£",
  MYR: "RM",
  MXN: "Mex$",
  ARS: "AR$",
  COP: "COL$",
};

function fmt(value: number, moeda: string) {
  const symbol = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${symbol} ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BookmakerGruposDialog({ open, onOpenChange }: BookmakerGruposDialogProps) {
  const {
    grupos, createGrupo, updateGrupo, deleteGrupo,
    addMembros, removeMembro, updateMembroDeposito,
    getCatalogoIdsByGrupo, getMembrosByGrupo,
  } = useBookmakerGrupos();
  const { data: catalogoBookmakers } = useWorkspaceBookmakers();
  const { convertToBRL, convertBRLtoUSD } = useCotacoes();

  const [selectedGrupo, setSelectedGrupo] = useState<BookmakerGrupo | null>(null);
  const [formMode, setFormMode] = useState<"idle" | "create" | "edit">("idle");
  const [formNome, setFormNome] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formCor, setFormCor] = useState("#6366f1");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Aba "Casas": modo padrão = "configurar", alternável para "editar"
  const [casasMode, setCasasMode] = useState<"configurar" | "editar">("configurar");
  const [bkSearch, setBkSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"TODAS" | "REGULAMENTADA" | "NAO_REGULAMENTADA">("TODAS");

  // Estado local para inputs de depósito (debounce manual no blur)
  const [depositoEdits, setDepositoEdits] = useState<Record<string, string>>({});

  const catalogoMap = useMemo(() => {
    const m = new Map<string, { nome: string; logo_url: string | null; moeda: string }>();
    (catalogoBookmakers ?? []).forEach((bk) =>
      m.set(bk.id, { nome: bk.nome, logo_url: bk.logo_url, moeda: bk.moeda_padrao })
    );
    return m;
  }, [catalogoBookmakers]);

  const membrosDoGrupoSet = selectedGrupo ? getCatalogoIdsByGrupo(selectedGrupo.id) : new Set<string>();
  const membrosDoGrupo = selectedGrupo ? getMembrosByGrupo(selectedGrupo.id) : [];

  // Quando trocar de grupo, sincronizar inputs e voltar ao modo configurar
  useEffect(() => {
    if (!selectedGrupo) {
      setDepositoEdits({});
      return;
    }
    const next: Record<string, string> = {};
    membrosDoGrupo.forEach((m) => {
      next[m.bookmaker_catalogo_id] = m.deposito_sugerido?.toString() ?? "0";
    });
    setDepositoEdits(next);
    setCasasMode("configurar");
    setBkSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrupo?.id]);

  const filteredBookmakers = useMemo(() => {
    if (!catalogoBookmakers) return [];
    const q = bkSearch.toLowerCase();
    return catalogoBookmakers.filter((bk) => {
      if (q && !bk.nome.toLowerCase().includes(q)) return false;
      if (statusFilter !== "TODAS" && bk.status !== statusFilter) return false;
      return true;
    });
  }, [catalogoBookmakers, bkSearch, statusFilter]);

  // Lista no modo configurar = só selecionadas, ordenadas por nome
  const membrosOrdenados = useMemo(() => {
    return [...membrosDoGrupo]
      .map((m) => ({
        ...m,
        info: catalogoMap.get(m.bookmaker_catalogo_id),
      }))
      .filter((m) => !!m.info)
      .sort((a, b) => (a.info!.nome > b.info!.nome ? 1 : -1));
  }, [membrosDoGrupo, catalogoMap]);

  const totalUSD = useMemo(() => {
    return membrosOrdenados.reduce((acc, m) => {
      const valor = Number(depositoEdits[m.bookmaker_catalogo_id] ?? m.deposito_sugerido) || 0;
      const moeda = m.info!.moeda;
      const brl = convertToBRL(valor, moeda);
      return acc + convertBRLtoUSD(brl);
    }, 0);
  }, [membrosOrdenados, depositoEdits, convertToBRL, convertBRLtoUSD]);

  const handleCreateGrupo = () => {
    if (!formNome.trim()) return;
    createGrupo.mutate(
      { nome: formNome.trim(), descricao: formDescricao.trim(), cor: formCor },
      {
        onSuccess: () => {
          setFormMode("idle");
          setFormNome("");
          setFormDescricao("");
        },
      }
    );
  };

  const handleUpdateGrupo = () => {
    if (!selectedGrupo || !formNome.trim()) return;
    updateGrupo.mutate(
      {
        id: selectedGrupo.id,
        nome: formNome.trim(),
        descricao: formDescricao.trim(),
        cor: formCor,
      },
      {
        onSuccess: () => {
          setFormMode("idle");
          setFormNome("");
          setFormDescricao("");
          // refletir mudanças localmente
          setSelectedGrupo({
            ...selectedGrupo,
            nome: formNome.trim(),
            descricao: formDescricao.trim() || null,
            cor: formCor,
          });
        },
      }
    );
  };

  const handleAddMembro = (bk: { id: string; moeda_padrao: string }) => {
    if (!selectedGrupo) return;
    addMembros.mutate({
      grupoId: selectedGrupo.id,
      catalogoIds: [bk.id],
      moedaPorCatalogo: { [bk.id]: bk.moeda_padrao },
    });
  };

  const handleRemoveMembro = (catalogoId: string) => {
    if (!selectedGrupo) return;
    removeMembro.mutate({ grupoId: selectedGrupo.id, catalogoId });
  };

  const handleDepositoBlur = (catalogoId: string, originalValue: number, moeda: string) => {
    if (!selectedGrupo) return;
    const raw = depositoEdits[catalogoId] ?? "";
    const parsed = parseFloat(raw.replace(",", ".")) || 0;
    if (parsed === originalValue) return;
    updateMembroDeposito.mutate({
      grupoId: selectedGrupo.id,
      catalogoId,
      deposito_sugerido: parsed,
      deposito_moeda: moeda,
    });
  };

  const handleToggleModoExecucao = (modo: GrupoModoExecucao) => {
    if (!selectedGrupo) return;
    updateGrupo.mutate(
      { id: selectedGrupo.id, modo_execucao: modo },
      { onSuccess: () => setSelectedGrupo({ ...selectedGrupo, modo_execucao: modo }) }
    );
  };

  const startCreate = () => {
    setFormMode("create");
    setFormNome("");
    setFormDescricao("");
    setFormCor("#6366f1");
    setSelectedGrupo(null);
  };

  const startEdit = (grupo: BookmakerGrupo) => {
    setFormMode("edit");
    setFormNome(grupo.nome);
    setFormDescricao(grupo.descricao || "");
    setFormCor(grupo.cor || "#6366f1");
    setSelectedGrupo(grupo);
  };

  const handleDeleteConfirm = () => {
    if (!deleteConfirmId) return;
    deleteGrupo.mutate(deleteConfirmId, {
      onSuccess: () => {
        if (selectedGrupo?.id === deleteConfirmId) {
          setSelectedGrupo(null);
          setFormMode("idle");
        }
        setDeleteConfirmId(null);
      },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Grupos de Bookmakers
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
            {/* Left panel: Groups list */}
            <div className="w-[260px] flex flex-col gap-2 shrink-0">
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={startCreate}>
                <Plus className="h-3.5 w-3.5" /> Novo Grupo
              </Button>

              {/* Create/Edit form */}
              {formMode !== "idle" && (
                <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
                  <Input
                    placeholder="Nome do grupo"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Descrição (opcional)"
                    value={formDescricao}
                    onChange={(e) => setFormDescricao(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-1 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setFormCor(c)}
                        className={cn(
                          "h-5 w-5 rounded-full border-2 transition-all",
                          formCor === c ? "border-foreground scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={formMode === "create" ? handleCreateGrupo : handleUpdateGrupo}
                      disabled={!formNome.trim()}
                    >
                      {formMode === "create" ? "Criar" : "Salvar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFormMode("idle")}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1">
                <div className="space-y-1 pr-2">
                  {grupos.map((g) => (
                    <div
                      key={g.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors group",
                        selectedGrupo?.id === g.id && "bg-accent"
                      )}
                      onClick={() => {
                        setSelectedGrupo(g);
                        setFormMode("idle");
                      }}
                    >
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: g.cor || "#6366f1" }} />
                      <span className="truncate flex-1">{g.nome}</span>
                      {g.modo_execucao === "SOB_DEMANDA" && (
                        <Clock className="h-3 w-3 text-muted-foreground" aria-label="Sob demanda" />
                      )}
                      <div className="hidden group-hover:flex gap-0.5">
                        <button
                          className="p-0.5 rounded hover:bg-muted"
                          onClick={(e) => { e.stopPropagation(); startEdit(g); }}
                        >
                          <Edit2 className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                          className="p-0.5 rounded hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(g.id); }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {grupos.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhum grupo criado ainda
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right panel: Bookmakers assignment */}
            <div className="flex-1 flex flex-col min-h-0 border-l border-border pl-4">
              {selectedGrupo ? (
                <>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: selectedGrupo.cor || "#6366f1" }} />
                    <h3 className="font-semibold text-sm">{selectedGrupo.nome}</h3>
                    <Badge variant="secondary" className="text-xs">{membrosDoGrupoSet.size} casas</Badge>

                    {/* Toggle modo execução */}
                    <div className="ml-auto flex gap-1 rounded-md border border-border p-0.5 bg-muted/40">
                      <button
                        onClick={() => handleToggleModoExecucao("AGENDADO")}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                          selectedGrupo.modo_execucao === "AGENDADO"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Calendar className="h-3 w-3" /> Agendado
                      </button>
                      <button
                        onClick={() => handleToggleModoExecucao("SOB_DEMANDA")}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                          selectedGrupo.modo_execucao === "SOB_DEMANDA"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Clock className="h-3 w-3" /> Sob demanda
                      </button>
                    </div>
                  </div>
                  {selectedGrupo.descricao && (
                    <p className="text-xs text-muted-foreground mb-3">{selectedGrupo.descricao}</p>
                  )}

                  <Tabs defaultValue="casas" className="flex-1 flex flex-col min-h-0">
                    <TabsList className="grid w-full grid-cols-2 h-8">
                      <TabsTrigger value="casas" className="text-xs">Casas</TabsTrigger>
                      <TabsTrigger value="regras" className="text-xs">Regras</TabsTrigger>
                    </TabsList>

                    <TabsContent value="casas" className="flex-1 flex flex-col min-h-0 mt-3">
                      {/* Header de modo */}
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="text-xs text-muted-foreground">
                          {casasMode === "configurar"
                            ? `${membrosDoGrupoSet.size} casa(s) selecionada(s)`
                            : "Marque/desmarque para adicionar ao grupo"}
                        </div>
                        <Button
                          size="sm"
                          variant={casasMode === "editar" ? "default" : "outline"}
                          className="h-7 text-xs gap-1.5"
                          onClick={() => setCasasMode(casasMode === "configurar" ? "editar" : "configurar")}
                        >
                          {casasMode === "configurar" ? (
                            <><ListChecks className="h-3.5 w-3.5" /> Adicionar/remover casas</>
                          ) : (
                            <><X className="h-3.5 w-3.5" /> Concluir seleção</>
                          )}
                        </Button>
                      </div>

                      {casasMode === "editar" ? (
                        <>
                          <div className="relative mb-3">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Buscar bookmaker..."
                              value={bkSearch}
                              onChange={(e) => setBkSearch(e.target.value)}
                              className="pl-8 h-8 text-sm"
                            />
                          </div>
                          <div className="flex gap-1.5 mb-3">
                            {([
                              { value: "TODAS", label: "Todas" },
                              { value: "REGULAMENTADA", label: "Regulamentadas" },
                              { value: "NAO_REGULAMENTADA", label: "Não Regulamentadas" },
                            ] as const).map((opt) => (
                              <Button
                                key={opt.value}
                                size="sm"
                                variant={statusFilter === opt.value ? "default" : "outline"}
                                className="h-7 text-xs"
                                onClick={() => setStatusFilter(opt.value)}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                          <ScrollArea className="flex-1">
                            <div className="space-y-0.5 pr-2">
                              {filteredBookmakers.map((bk) => {
                                const isMembro = membrosDoGrupoSet.has(bk.id);
                                return (
                                  <label
                                    key={bk.id}
                                    className={cn(
                                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors",
                                      isMembro && "bg-primary/5"
                                    )}
                                  >
                                    <Checkbox
                                      checked={isMembro}
                                      onCheckedChange={() =>
                                        isMembro ? handleRemoveMembro(bk.id) : handleAddMembro(bk)
                                      }
                                    />
                                    {bk.logo_url && (
                                      <img src={bk.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
                                    )}
                                    <span className="truncate flex-1">{bk.nome}</span>
                                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                                      {bk.moeda_padrao}
                                    </Badge>
                                  </label>
                                );
                              })}
                              {filteredBookmakers.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-6">
                                  Nenhuma casa encontrada
                                </p>
                              )}
                            </div>
                          </ScrollArea>
                        </>
                      ) : (
                        <>
                          {/* Modo Configurar — só selecionadas, com input de depósito */}
                          <ScrollArea className="flex-1">
                            <div className="space-y-1 pr-2">
                              {membrosOrdenados.map((m) => {
                                const info = m.info!;
                                const symbol = CURRENCY_SYMBOLS[info.moeda] || info.moeda;
                                return (
                                  <div
                                    key={m.id}
                                    className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary/40 transition-colors"
                                  >
                                    {info.logo_url ? (
                                      <img src={info.logo_url} alt="" className="h-6 w-6 rounded object-contain shrink-0" />
                                    ) : (
                                      <div className="h-6 w-6 rounded bg-muted shrink-0" />
                                    )}
                                    <span className="truncate flex-1 font-medium">{info.nome}</span>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                                        {symbol}
                                      </span>
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        min="0"
                                        value={depositoEdits[m.bookmaker_catalogo_id] ?? ""}
                                        onChange={(e) =>
                                          setDepositoEdits((prev) => ({
                                            ...prev,
                                            [m.bookmaker_catalogo_id]: e.target.value,
                                          }))
                                        }
                                        onBlur={() =>
                                          handleDepositoBlur(
                                            m.bookmaker_catalogo_id,
                                            m.deposito_sugerido,
                                            info.moeda
                                          )
                                        }
                                        placeholder="0,00"
                                        className="h-7 w-24 text-sm text-right"
                                      />
                                    </div>

                                    <button
                                      onClick={() => handleRemoveMembro(m.bookmaker_catalogo_id)}
                                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                                      aria-label="Remover do grupo"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                              {membrosOrdenados.length === 0 && (
                                <div className="text-center py-10 text-muted-foreground text-sm">
                                  <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                  Nenhuma casa neste grupo ainda.
                                  <br />
                                  <Button
                                    size="sm"
                                    variant="link"
                                    onClick={() => setCasasMode("editar")}
                                    className="text-xs mt-1"
                                  >
                                    Adicionar casas →
                                  </Button>
                                </div>
                              )}
                            </div>
                          </ScrollArea>

                          {/* Rodapé com total convertido em USD */}
                          {membrosOrdenados.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                Total estimado (convertido em USD)
                              </span>
                              <span className="font-mono font-semibold tabular-nums">
                                Σ {fmt(totalUSD, "USD")}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="regras" className="flex-1 min-h-0 mt-3">
                      <ScrollArea className="h-full">
                        <div className="pr-3 pb-2">
                          <BookmakerGrupoRegrasPanel grupoId={selectedGrupo.id} grupoNome={selectedGrupo.nome} />
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
                  <FolderOpen className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Selecione um grupo para gerenciar as bookmakers</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir grupo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este grupo? As bookmakers não serão afetadas, apenas o agrupamento será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
