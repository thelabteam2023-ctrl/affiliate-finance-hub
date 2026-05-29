import { useState } from "react";
import { AlertTriangle, Loader2, Trash2, PowerOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUserWorkspaces } from "@/hooks/useUserWorkspaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Danger Zone — owner-only.
 *
 * Two-step workspace removal:
 *   1. Deactivate (soft-delete): flips `is_active=false`, sets `deactivated_at`.
 *   2. Delete permanently: calls RPC `delete_workspace_cascade` which wipes
 *      every row tied to this workspace_id and the workspace itself.
 *      Requires typing the exact workspace name to confirm.
 */
export function DangerZone() {
  const { workspace, workspaceId, refreshWorkspace } = useWorkspace();
  const { workspaces, switchWorkspace } = useUserWorkspaces();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  if (!workspace || !workspaceId) return null;

  const isActive = workspace.is_active !== false && !workspace.deactivated_at;
  const nameMatches = confirmName.trim() === workspace.name;

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq("id", workspaceId);
      if (error) throw error;
      toast({
        title: "Workspace desativado",
        description: "Você já pode excluí-lo permanentemente abaixo.",
      });
      await refreshWorkspace();
    } catch (err: any) {
      toast({
        title: "Erro ao desativar",
        description: err.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setDeactivating(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!nameMatches) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc("delete_workspace_cascade", {
        _workspace_id: workspaceId,
        _confirm_name: confirmName.trim(),
      });
      if (error) throw error;

      toast({
        title: "Workspace excluído",
        description: `${(data as any)?.rows_deleted ?? 0} registros removidos.`,
      });

      queryClient.clear();

      // Switch to another workspace, or send to root if none left
      const remaining = workspaces.filter((w) => w.workspace_id !== workspaceId);
      if (remaining.length > 0) {
        await switchWorkspace(remaining[0].workspace_id);
        navigate("/");
      } else {
        navigate("/");
        window.location.reload();
      }
    } catch (err: any) {
      toast({
        title: "Falha na exclusão",
        description: err.message ?? String(err),
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Zona de Perigo
        </CardTitle>
        <CardDescription>
          Ações irreversíveis sobre este workspace. Disponível apenas para o owner.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: Deactivate */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Desativar workspace</p>
            <p className="text-xs text-muted-foreground">
              Marca o workspace como inativo. Necessário antes da exclusão definitiva.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleDeactivate}
            disabled={!isActive || deactivating}
            className="sm:w-auto"
          >
            {deactivating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PowerOff className="mr-2 h-4 w-4" />
            )}
            {isActive ? "Desativar" : "Já desativado"}
          </Button>
        </div>

        {/* Step 2: Permanent delete */}
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">
              Excluir permanentemente
            </p>
            <p className="text-xs text-muted-foreground">
              Apaga o workspace e <strong>todos os dados</strong> (apostas, financeiro,
              projetos, bookmakers, planejamento, comunidade, auditoria, membros e
              convites). Operação <strong>irreversível</strong>.
            </p>
          </div>

          <AlertDialog
            onOpenChange={(open) => {
              if (!open) setConfirmName("");
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isActive || deleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir permanentemente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Exclusão definitiva
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm">
                    <p>
                      Você está prestes a <strong>apagar permanentemente</strong> o
                      workspace <strong>{workspace.name}</strong> e todos os dados
                      associados.
                    </p>
                    <p className="text-destructive">
                      Esta ação <strong>não pode ser desfeita</strong>.
                    </p>
                    <div className="space-y-2 pt-2">
                      <Label htmlFor="confirmName" className="text-foreground">
                        Digite o nome do workspace para confirmar:
                      </Label>
                      <Input
                        id="confirmName"
                        value={confirmName}
                        onChange={(e) => setConfirmName(e.target.value)}
                        placeholder={workspace.name}
                        autoComplete="off"
                        autoFocus
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePermanentDelete}
                  disabled={!nameMatches || deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Excluir definitivamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}