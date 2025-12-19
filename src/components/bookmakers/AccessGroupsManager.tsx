import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessGroups, AccessGroup } from "@/hooks/useAccessGroups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Users, FolderOpen, Archive, RotateCcw, Building2, Loader2, AlertTriangle } from "lucide-react";
import AccessGroupWorkspacesDialog from "./AccessGroupWorkspacesDialog";
import AccessGroupBookmakersDialog from "./AccessGroupBookmakersDialog";
import ArchiveGroupDialog from "./ArchiveGroupDialog";

export default function AccessGroupsManager() {
  const { groups, loading, createGroup, updateGroup, deleteGroup, fetchGroups } = useAccessGroups();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccessGroup | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<AccessGroup | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [workspacesDialogOpen, setWorkspacesDialogOpen] = useState(false);
  const [bookmakersDialogOpen, setBookmakersDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<AccessGroup | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [reactivating, setReactivating] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Filter groups by status
  const filteredGroups = groups.filter((g) => {
    if (statusFilter === "all") return true;
    return g.status === statusFilter;
  });

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setFormName("");
    setFormCode("");
    setFormDescription("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (group: AccessGroup) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormCode(group.code);
    setFormDescription(group.description || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCode.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e código são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      if (editingGroup) {
        await updateGroup(editingGroup.id, {
          name: formName.trim(),
          description: formDescription.trim() || null,
        });
        toast({ title: "Grupo atualizado!" });
      } else {
        await createGroup(formName.trim(), formCode.trim(), formDescription.trim() || undefined);
        toast({ title: "Grupo criado!" });
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (group: AccessGroup) => {
    setGroupToDelete(group);
    setDeleteConfirmed(false);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete || !deleteConfirmed) return;
    try {
      setDeleting(true);
      await deleteGroup(groupToDelete.id);
      toast({ title: "Grupo excluído permanentemente!" });
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
      setDeleteConfirmed(false);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleCloseDeleteDialog = (open: boolean) => {
    if (!open) {
      setDeleteConfirmed(false);
      setGroupToDelete(null);
    }
    setDeleteDialogOpen(open);
  };

  const handleOpenArchive = (group: AccessGroup) => {
    setSelectedGroup(group);
    setArchiveDialogOpen(true);
  };

  const handleReactivate = async (group: AccessGroup) => {
    try {
      setReactivating(group.id);
      const { error } = await supabase.rpc("admin_reactivate_group", {
        p_group_id: group.id,
      });
      if (error) throw error;
      toast({ title: "Grupo reativado!" });
      fetchGroups();
    } catch (error: any) {
      toast({
        title: "Erro ao reativar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReactivating(null);
    }
  };
  const handleOpenWorkspaces = (group: AccessGroup) => {
    setSelectedGroup(group);
    setWorkspacesDialogOpen(true);
  };

  const handleOpenBookmakers = (group: AccessGroup) => {
    setSelectedGroup(group);
    setBookmakersDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Carregando grupos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Grupos de Liberação</h3>
          <p className="text-sm text-muted-foreground">
            Controle acesso a bookmakers por grupos de workspaces
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Grupo
        </Button>
      </div>

      {/* Status Filter */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "archived")}>
        <TabsList>
          <TabsTrigger value="active">
            Ativos ({groups.filter(g => g.status === "active").length})
          </TabsTrigger>
          <TabsTrigger value="archived">
            Arquivados ({groups.filter(g => g.status === "archived").length})
          </TabsTrigger>
          <TabsTrigger value="all">
            Todos ({groups.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {groups.length === 0 
                ? "Nenhum grupo criado. Crie grupos para controlar acesso em lote."
                : `Nenhum grupo ${statusFilter === "active" ? "ativo" : statusFilter === "archived" ? "arquivado" : ""} encontrado.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map((group) => (
            <Card
              key={group.id}
              className={group.status === "archived" ? "opacity-60" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {group.name}
                      {group.status === "archived" && (
                        <Badge variant="secondary" className="text-xs">
                          <Archive className="h-3 w-3 mr-1" />
                          Arquivado
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Código: {group.code}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {group.description}
                  </p>
                )}

                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{group.workspace_count || 0}</span>
                    <span className="text-muted-foreground">workspaces</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{group.bookmaker_count || 0}</span>
                    <span className="text-muted-foreground">bookmakers</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenWorkspaces(group)}
                  >
                    <Users className="mr-1 h-4 w-4" />
                    Workspaces
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenBookmakers(group)}
                  >
                    <FolderOpen className="mr-1 h-4 w-4" />
                    Bookmakers
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(group)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {group.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenArchive(group)}
                      title="Arquivar grupo"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReactivate(group)}
                      disabled={reactivating === group.id}
                      title="Reativar grupo"
                    >
                      {reactivating === group.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {/* Only show delete for archived groups */}
                  {group.status === "archived" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(group)}
                      title="Excluir permanentemente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "Editar Grupo" : "Novo Grupo de Liberação"}
            </DialogTitle>
            <DialogDescription>
              Grupos permitem liberar acesso a bookmakers para múltiplos workspaces de uma vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Nome *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Grupo Bônus"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Código *</label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Ex: bonus"
                disabled={!!editingGroup}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Identificador único (não pode ser alterado depois)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descrição do grupo..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingGroup ? "Salvar" : "Criar Grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation - Only for archived groups */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={handleCloseDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir grupo permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Esta ação é <strong>irreversível</strong> e removerá permanentemente o grupo{" "}
                  <strong>{groupToDelete?.name}</strong> e todo seu histórico.
                </p>
                
                {groupToDelete && (groupToDelete.workspace_count > 0 || groupToDelete.bookmaker_count > 0) && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p className="font-medium text-destructive mb-2">Impacto da exclusão:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      {groupToDelete.workspace_count > 0 && (
                        <li>{groupToDelete.workspace_count} workspace(s) vinculado(s) perderão referência</li>
                      )}
                      {groupToDelete.bookmaker_count > 0 && (
                        <li>{groupToDelete.bookmaker_count} bookmaker(s) vinculada(s) serão desassociadas</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="flex items-start gap-3 pt-2">
                  <Checkbox
                    id="confirm-delete"
                    checked={deleteConfirmed}
                    onCheckedChange={(checked) => setDeleteConfirmed(checked === true)}
                  />
                  <label
                    htmlFor="confirm-delete"
                    className="text-sm cursor-pointer leading-relaxed"
                  >
                    Entendo que esta ação é <strong>irreversível</strong> e desejo excluir permanentemente este grupo.
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={!deleteConfirmed || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Permanentemente"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Workspaces Management Dialog */}
      {selectedGroup && (
        <AccessGroupWorkspacesDialog
          open={workspacesDialogOpen}
          onOpenChange={setWorkspacesDialogOpen}
          group={selectedGroup}
        />
      )}

      {/* Bookmakers Management Dialog */}
      {selectedGroup && (
        <AccessGroupBookmakersDialog
          open={bookmakersDialogOpen}
          onOpenChange={setBookmakersDialogOpen}
          group={selectedGroup}
        />
      )}

      {/* Archive Dialog */}
      {selectedGroup && (
        <ArchiveGroupDialog
          open={archiveDialogOpen}
          onOpenChange={setArchiveDialogOpen}
          group={selectedGroup}
          onArchived={fetchGroups}
        />
      )}
    </div>
  );
}
