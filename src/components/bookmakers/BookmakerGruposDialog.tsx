import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useBookmakerGrupos, BookmakerGrupo } from "@/hooks/useBookmakerGrupos";
import { useWorkspaceBookmakers } from "@/hooks/useWorkspaceBookmakers";
import { BookmakerGrupoRegrasPanel } from "./BookmakerGrupoRegrasPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Edit2, Search, FolderOpen, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookmakerGruposDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

export function BookmakerGruposDialog({ open, onOpenChange }: BookmakerGruposDialogProps) {
  const { grupos, createGrupo, updateGrupo, deleteGrupo, addMembros, removeMembro, getCatalogoIdsByGrupo } = useBookmakerGrupos();
  const { data: catalogoBookmakers } = useWorkspaceBookmakers();
  
  const [selectedGrupo, setSelectedGrupo] = useState<BookmakerGrupo | null>(null);
  const [formMode, setFormMode] = useState<"idle" | "create" | "edit">("idle");
  const [formNome, setFormNome] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formCor, setFormCor] = useState("#6366f1");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bkSearch, setBkSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"TODAS" | "REGULAMENTADA" | "NAO_REGULAMENTADA">("TODAS");

  const membrosDoGrupo = selectedGrupo ? getCatalogoIdsByGrupo(selectedGrupo.id) : new Set<string>();

  const filteredBookmakers = useMemo(() => {
    if (!catalogoBookmakers) return [];
    const q = bkSearch.toLowerCase();
    return catalogoBookmakers.filter((bk) => {
      if (!bk.nome.toLowerCase().includes(q)) return false;
      if (statusFilter !== "TODAS" && bk.status !== statusFilter) return false;
      return true;
    });
  }, [catalogoBookmakers, bkSearch, statusFilter]);

  const handleCreateGrupo = () => {
    if (!formNome.trim()) return;
    createGrupo.mutate({ nome: formNome.trim(), descricao: formDescricao.trim(), cor: formCor }, {
      onSuccess: () => { setFormMode("idle"); setFormNome(""); setFormDescricao(""); },
    });
  };

  const handleUpdateGrupo = () => {
    if (!selectedGrupo || !formNome.trim()) return;
    updateGrupo.mutate({ id: selectedGrupo.id, nome: formNome.trim(), descricao: formDescricao.trim(), cor: formCor }, {
      onSuccess: () => { setFormMode("idle"); setFormNome(""); setFormDescricao(""); },
    });
  };

  const handleToggleMembro = (catalogoId: string) => {
    if (!selectedGrupo) return;
    if (membrosDoGrupo.has(catalogoId)) {
      removeMembro.mutate({ grupoId: selectedGrupo.id, catalogoId });
    } else {
      addMembros.mutate({ grupoId: selectedGrupo.id, catalogoIds: [catalogoId] });
    }
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
                        setBkSearch("");
                      }}
                    >
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: g.cor || "#6366f1" }} />
                      <span className="truncate flex-1">{g.nome}</span>
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
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: selectedGrupo.cor || "#6366f1" }} />
                    <h3 className="font-semibold text-sm">{selectedGrupo.nome}</h3>
                    <Badge variant="secondary" className="text-xs">{membrosDoGrupo.size} casas</Badge>
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
                            const isMembro = membrosDoGrupo.has(bk.id);
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
                                  onCheckedChange={() => handleToggleMembro(bk.id)}
                                />
                                {bk.logo_url && (
                                  <img src={bk.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
                                )}
                                <span className="truncate">{bk.nome}</span>
                                {isMembro && <Check className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />}
                              </label>
                            );
                          })}
                        </div>
                      </ScrollArea>
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

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
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
