import { useState, useEffect } from "react";
import { useAccessGroups, AccessGroup, GroupWorkspace } from "@/hooks/useAccessGroups";
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
import { Search, Building2, Trash2, Upload, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";

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
    findWorkspacesByEmails,
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
  const [emailsText, setEmailsText] = useState("");
  const [batchResult, setBatchResult] = useState<{
    found: Array<{ workspace_id: string; workspace_name: string; email: string }>;
    notFound: string[];
    membersNotOwners: Array<{ email: string; workspaces: string[] }>;
  } | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

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
      setEmailsText("");
      setBatchResult(null);
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

  const handleSearchEmails = async () => {
    const emails = emailsText
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) {
      toast({
        title: "Nenhum email informado",
        variant: "destructive",
      });
      return;
    }

    try {
      setBatchLoading(true);
      const result = await findWorkspacesByEmails(emails);
      setBatchResult(result);
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

  const handleAddFromBatch = async () => {
    if (!batchResult || batchResult.found.length === 0) return;

    // Filter out workspaces already in the group
    const existingIds = new Set(workspaces.map((w) => w.workspace_id));
    const newWorkspaceIds = batchResult.found
      .filter((f) => !existingIds.has(f.workspace_id))
      .map((f) => f.workspace_id);

    if (newWorkspaceIds.length === 0) {
      toast({
        title: "Todos já estão no grupo",
        description: "Os workspaces encontrados já fazem parte deste grupo.",
      });
      return;
    }

    try {
      setSaving(true);
      await addWorkspacesToGroup(group.id, newWorkspaceIds);
      toast({ title: `${newWorkspaceIds.length} workspace(s) adicionado(s)` });
      await loadWorkspaces();
      setBatchResult(null);
      setEmailsText("");
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
    const term = searchTerm.toLowerCase();
    return name.includes(term) || email.includes(term);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workspaces do Grupo: {group.name}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Lista Atual</TabsTrigger>
            <TabsTrigger value="batch">Adicionar em Lote</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome ou email..."
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
                        <div className="font-medium">{ws.workspace?.name || "—"}</div>
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

          <TabsContent value="batch" className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                Cole os emails dos owners (um por linha ou separados por vírgula)
              </label>
              <Textarea
                value={emailsText}
                onChange={(e) => {
                  setEmailsText(e.target.value);
                  setBatchResult(null);
                }}
                placeholder="owner1@email.com&#10;owner2@email.com&#10;owner3@email.com"
                rows={5}
                className="mt-2"
              />
            </div>

            <Button
              onClick={handleSearchEmails}
              disabled={batchLoading || !emailsText.trim()}
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
                {batchResult.found.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="font-medium text-emerald-600">
                        Encontrados ({batchResult.found.length})
                      </span>
                    </div>
                    <ScrollArea className="h-[150px] border rounded-md">
                      <div className="divide-y">
                        {batchResult.found.map((f, i) => (
                          <div key={i} className="p-2 text-sm">
                            <span className="font-medium">{f.workspace_name}</span>
                            <span className="text-muted-foreground ml-2">({f.email})</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button
                      className="mt-2"
                      onClick={handleAddFromBatch}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Adicionar {batchResult.found.length} ao Grupo
                    </Button>
                  </div>
                )}

                {batchResult.membersNotOwners && batchResult.membersNotOwners.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="font-medium text-amber-600">
                        Membros (não owners) ({batchResult.membersNotOwners.length})
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md space-y-1">
                      {batchResult.membersNotOwners.map((m, i) => (
                        <div key={i}>
                          <span className="font-medium">{m.email}</span>
                          <span className="text-xs ml-1">
                            → membro em: {m.workspaces.join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {batchResult.notFound.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="font-medium text-destructive">
                        Não encontrados ({batchResult.notFound.length})
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground bg-muted p-2 rounded-md">
                      {batchResult.notFound.join(", ")}
                    </div>
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
