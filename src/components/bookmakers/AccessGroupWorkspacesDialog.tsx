import { useState, useEffect } from "react";
import { useAccessGroups, AccessGroup, GroupWorkspace, ResolvedWorkspace } from "@/hooks/useAccessGroups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Building2, Trash2, Upload, CheckCircle, XCircle, Loader2, AlertTriangle, User } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: AccessGroup;
}

export default function AccessGroupWorkspacesDialog({ open, onOpenChange, group }: Props) {
  const {
    fetchGroupWorkspaces,
    addWorkspacesToGroup,
    removeWorkspacesFromGroup,
    parseTokens,
    resolveWorkspacesByOwnerIdentifiers,
    fetchGroups,
  } = useAccessGroups();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<GroupWorkspace[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Batch import
  const [activeTab, setActiveTab] = useState<string>("list");
  const [inputText, setInputText] = useState("");
  const [batchResult, setBatchResult] = useState<{
    found: ResolvedWorkspace[];
    notFound: ResolvedWorkspace[];
    noWorkspace: ResolvedWorkspace[];
    invalid: ResolvedWorkspace[];
  } | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedForAdd, setSelectedForAdd] = useState<Set<string>>(new Set());

  const loadWorkspaces = async () => {
    try {
      setLoading(true);
      const data = await fetchGroupWorkspaces(group.id);
      setWorkspaces(data);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar workspaces",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadWorkspaces();
      setSelectedIds(new Set());
      setInputText("");
      setBatchResult(null);
      setSelectedForAdd(new Set());
      setActiveTab("list");
    }
  }, [open, group.id]);

  const handleToggle = (wsId: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(wsId)) {
      newSet.delete(wsId);
    } else {
      newSet.add(wsId);
    }
    setSelectedIds(newSet);
  };

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return;

    try {
      setSaving(true);
      await removeWorkspacesFromGroup(group.id, Array.from(selectedIds));
      toast({ title: `${selectedIds.size} workspace(s) removido(s)` });
      await loadWorkspaces();
      setSelectedIds(new Set());
    } catch (error: any) {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSearchTokens = async () => {
    const tokens = parseTokens(inputText);

    if (tokens.length === 0) {
      toast({
        title: "Nenhum ID ou email informado",
        variant: "destructive",
      });
      return;
    }

    try {
      setBatchLoading(true);
      const result = await resolveWorkspacesByOwnerIdentifiers(tokens);
      setBatchResult(result);
      
      // Pre-select all found workspaces that are not already in the group
      const existingIds = new Set(workspaces.map((w) => w.workspace_id));
      const newSelection = new Set<string>();
      result.found.forEach(f => {
        if (f.workspace_id && !existingIds.has(f.workspace_id)) {
          newSelection.add(f.workspace_id);
        }
      });
      setSelectedForAdd(newSelection);
    } catch (error: any) {
      toast({
        title: "Erro na busca",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleToggleSelectForAdd = (workspaceId: string) => {
    const newSet = new Set(selectedForAdd);
    if (newSet.has(workspaceId)) {
      newSet.delete(workspaceId);
    } else {
      newSet.add(workspaceId);
    }
    setSelectedForAdd(newSet);
  };

  const handleSelectAll = () => {
    if (!batchResult) return;
    const existingIds = new Set(workspaces.map((w) => w.workspace_id));
    const allNewIds = batchResult.found
      .filter(f => f.workspace_id && !existingIds.has(f.workspace_id))
      .map(f => f.workspace_id!);
    setSelectedForAdd(new Set(allNewIds));
  };

  const handleDeselectAll = () => {
    setSelectedForAdd(new Set());
  };

  const handleAddFromBatch = async () => {
    if (selectedForAdd.size === 0) {
      toast({
        title: "Nenhum workspace selecionado",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const workspaceIds = Array.from(selectedForAdd);
      await addWorkspacesToGroup(group.id, workspaceIds);
      
      const alreadyExisting = batchResult?.found.filter(
        f => f.workspace_id && !selectedForAdd.has(f.workspace_id)
      ).length || 0;
      
      toast({ 
        title: "Workspaces adicionados",
        description: `${workspaceIds.length} adicionado(s)${alreadyExisting > 0 ? `, ${alreadyExisting} já existia(m)` : ''}`,
      });
      
      await loadWorkspaces();
      setBatchResult(null);
      setInputText("");
      setSelectedForAdd(new Set());
      setActiveTab("list");
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredWorkspaces = workspaces.filter((ws) => {
    const name = ws.workspace?.name?.toLowerCase() || "";
    const email = ws.workspace?.owner_email?.toLowerCase() || "";
    const publicId = ws.workspace?.owner_public_id?.toLowerCase() || "";
    const term = searchTerm.toLowerCase();
    return name.includes(term) || email.includes(term) || publicId.includes(term);
  });

  // Calculate counts for batch result
  const existingIds = new Set(workspaces.map((w) => w.workspace_id));
  const newWorkspaces = batchResult?.found.filter(f => f.workspace_id && !existingIds.has(f.workspace_id)) || [];
  const alreadyInGroup = batchResult?.found.filter(f => f.workspace_id && existingIds.has(f.workspace_id)) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Workspaces do Grupo: {group.name}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Lista Atual ({workspaces.length})</TabsTrigger>
            <TabsTrigger value="batch">Adicionar em Lote</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 flex-1 min-h-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome, email ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoveSelected}
                  disabled={saving}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remover ({selectedIds.size})
                </Button>
              )}
            </div>

            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                Carregando...
              </div>
            ) : workspaces.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum workspace neste grupo.</p>
                <p className="text-sm">Use a aba "Adicionar em Lote" para incluir workspaces.</p>
              </div>
            ) : (
              <ScrollArea className="h-[350px] border rounded-md">
                <div className="divide-y">
                  {filteredWorkspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className="flex items-center gap-3 p-3 hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={selectedIds.has(ws.workspace_id)}
                        onCheckedChange={() => handleToggle(ws.workspace_id)}
                      />
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          {ws.workspace?.name || "—"}
                          {ws.workspace?.owner_public_id && (
                            <Badge variant="outline" className="text-xs">
                              #{ws.workspace.owner_public_id}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {ws.workspace?.owner_email || "Email não encontrado"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="batch" className="space-y-4 flex-1 min-h-0 overflow-auto">
            <div>
              <label className="text-sm font-medium">
                Cole IDs (4 dígitos) ou emails dos owners (um por linha ou separados por vírgula/espaço)
              </label>
              <Textarea
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  setBatchResult(null);
                }}
                placeholder="0257, 0310&#10;owner@email.com&#10;0123 outro@email.com"
                rows={4}
                className="mt-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Aceita IDs de 4 dígitos e emails misturados. Separadores: vírgula, espaço, ponto-e-vírgula ou nova linha.
              </p>
            </div>

            <Button
              onClick={handleSearchTokens}
              disabled={batchLoading || !inputText.trim()}
            >
              {batchLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar Workspaces
            </Button>

            {batchResult && (
              <div className="space-y-4">
                {/* Found workspaces - new */}
                {newWorkspaces.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        <span className="font-medium text-emerald-600">
                          Encontrados ({newWorkspaces.length})
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                          Selecionar todos
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                          Limpar seleção
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[180px] border rounded-md">
                      <div className="divide-y">
                        {newWorkspaces.map((f, i) => (
                          <div 
                            key={`${f.workspace_id}-${i}`} 
                            className="flex items-center gap-3 p-2 hover:bg-accent/50"
                          >
                            <Checkbox
                              checked={f.workspace_id ? selectedForAdd.has(f.workspace_id) : false}
                              onCheckedChange={() => f.workspace_id && handleToggleSelectForAdd(f.workspace_id)}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{f.workspace_name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {f.workspace_plan}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>#{f.owner_public_id}</span>
                                <span>•</span>
                                <span>{f.owner_email}</span>
                                <span className="text-muted-foreground/60">← {f.token}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button
                      className="mt-2 w-full"
                      onClick={handleAddFromBatch}
                      disabled={saving || selectedForAdd.size === 0}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Adicionar {selectedForAdd.size} ao Grupo
                    </Button>
                  </div>
                )}

                {/* Already in group */}
                {alreadyInGroup.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-blue-600">
                        Já no grupo ({alreadyInGroup.length})
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-2 rounded-md space-y-1 max-h-[100px] overflow-auto">
                      {alreadyInGroup.map((f, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="font-medium">{f.workspace_name}</span>
                          <span className="text-xs">({f.token})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* User exists but no workspace */}
                {batchResult.noWorkspace.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-amber-500" />
                      <span className="font-medium text-amber-600">
                        Usuário sem workspace como owner ({batchResult.noWorkspace.length})
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md space-y-1">
                      {batchResult.noWorkspace.map((n, i) => (
                        <div key={i}>
                          <span className="font-medium">{n.token}</span>
                          <span className="text-xs ml-2">
                            (encontrado: #{n.owner_public_id} - {n.owner_email})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Not found */}
                {batchResult.notFound.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="font-medium text-destructive">
                        Não encontrados ({batchResult.notFound.length})
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground bg-muted p-2 rounded-md">
                      {batchResult.notFound.map(n => n.token).join(", ")}
                    </div>
                  </div>
                )}

                {/* Invalid format */}
                {batchResult.invalid.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-orange-600">
                        Formato inválido ({batchResult.invalid.length})
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-950/30 p-2 rounded-md">
                      {batchResult.invalid.map(n => n.token).join(", ")}
                    </div>
                  </div>
                )}

                {/* No results at all */}
                {batchResult.found.length === 0 && 
                 batchResult.notFound.length === 0 && 
                 batchResult.noWorkspace.length === 0 && 
                 batchResult.invalid.length === 0 && (
                  <div className="py-4 text-center text-muted-foreground">
                    Nenhum resultado encontrado.
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
