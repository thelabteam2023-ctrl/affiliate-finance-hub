import { useState } from "react";
import {
  AlertTriangle, Loader2, Trash2, PowerOff, RotateCcw,
  Target, Wallet, FolderKanban, Building2, CalendarRange,
  MessagesSquare, Handshake, StickyNote,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUserWorkspaces } from "@/hooks/useUserWorkspaces";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

type ResetModuleId =
  | "apostas" | "financeiro" | "projetos" | "bookmakers"
  | "planejamento" | "comunidade" | "parceiros" | "anotacoes";

const RESET_MODULES: {
  id: ResetModuleId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "apostas",      label: "Apostas & Surebets",      icon: Target,         description: "Apostas, pernas, surebets, liquidações e reservas de stake." },
  { id: "financeiro",   label: "Financeiro",              icon: Wallet,         description: "Ledger, eventos financeiros, transações de bookmakers, câmbio, snapshots e despesas." },
  { id: "projetos",     label: "Projetos & Ciclos",       icon: FolderKanban,   description: "Projetos, ciclos, baselines, investidores, operadores e pagamentos." },
  { id: "bookmakers",   label: "Bookmakers & Contas",     icon: Building2,      description: "Casas vinculadas, grupos, freebets, bônus, cashback e bancos." },
  { id: "planejamento", label: "Planejamento",            icon: CalendarRange,  description: "Campanhas, distribuição, cenários e calendário." },
  { id: "comunidade",   label: "Comunidade & Ocorrências",icon: MessagesSquare, description: "Chat, moderação, influência, ocorrências e solicitações." },
  { id: "parceiros",    label: "Parceiros & Fornecedores",icon: Handshake,      description: "Parceiros, fornecedores, indicações e movimentações de parceria." },
  { id: "anotacoes",    label: "Anotações",               icon: StickyNote,     description: "Notas livres, fluxos e colunas do quadro." },
];

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
  const { isOwner, isSystemOwner } = useRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [confirmResetName, setConfirmResetName] = useState("");
  const [selectedModules, setSelectedModules] = useState<Set<ResetModuleId>>(new Set());

  const toggleModule = (id: ResetModuleId) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedModules(new Set(RESET_MODULES.map((m) => m.id)));
  const clearAll = () => setSelectedModules(new Set());

  if (!workspace || !workspaceId) return null;

  const ws = workspace as typeof workspace & {
    is_active?: boolean | null;
    deactivated_at?: string | null;
  };
  const isActive = ws.is_active !== false && !ws.deactivated_at;
  const nameMatches = confirmName.trim() === workspace.name;
  const resetNameMatches = confirmResetName.trim() === workspace.name;
  const hasSelection = selectedModules.size > 0;

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      const { error } = await supabase.rpc("admin_set_workspace_active", {
        _workspace_id: workspaceId,
        _active: false,
        _reason: "Desativado via Zona de Perigo",
      });
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

  const handleResetData = async () => {
    if (!resetNameMatches || !hasSelection) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_workspace_data_partial", {
        _workspace_id: workspaceId,
        _confirm_name: confirmResetName.trim(),
        _modules: Array.from(selectedModules),
      });
      if (error) throw error;
      toast({
        title: "Reset concluído",
        description: `${(data as any)?.rows_deleted ?? 0} registros removidos em ${selectedModules.size} módulo(s). Membros e assinatura preservados.`,
      });
      queryClient.clear();
      setConfirmResetName("");
      setSelectedModules(new Set());
      // Reload so all caches/contexts repopulate from a clean state
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Falha no reset",
        description: err.message ?? String(err),
        variant: "destructive",
      });
      setResetting(false);
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
          Ações irreversíveis sobre este workspace.
          {isSystemOwner
            ? " Desativação e exclusão são restritas a administradores do sistema."
            : " O owner pode resetar os dados; desativação e exclusão são feitas pelo administrador do sistema."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Owner action: Reset workspace data */}
        {(isOwner || isSystemOwner) && (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-background/60 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 sm:max-w-xl">
              <p className="text-sm font-medium text-destructive">Resetar workspace</p>
              <p className="text-xs text-muted-foreground">
                Apaga seletivamente os dados do workspace. <strong>Você escolhe</strong> quais
                módulos limpar (ex.: apenas Parceiros, ou Apostas + Financeiro). Membros,
                convites, papéis e assinatura são <strong>sempre preservados</strong>. Irreversível.
              </p>
            </div>
            <AlertDialog onOpenChange={(open) => { if (!open) { setConfirmResetName(""); setSelectedModules(new Set()); } }}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={resetting}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Resetar dados…
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Reset seletivo do workspace
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-4 text-sm">
                      <p>
                        Selecione abaixo <strong>quais módulos</strong> do workspace{" "}
                        <strong>{workspace.name}</strong> devem ser apagados. Membros, papéis
                        e assinatura permanecem intactos.
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {selectedModules.size} de {RESET_MODULES.length} módulo(s) selecionado(s)
                        </span>
                        <div className="flex gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                            Selecionar todos
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                            Limpar
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {RESET_MODULES.map((mod) => {
                          const Icon = mod.icon;
                          const checked = selectedModules.has(mod.id);
                          return (
                            <label
                              key={mod.id}
                              htmlFor={`mod-${mod.id}`}
                              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                                checked
                                  ? "border-destructive/60 bg-destructive/5"
                                  : "border-border hover:bg-muted/40"
                              }`}
                            >
                              <Checkbox
                                id={`mod-${mod.id}`}
                                checked={checked}
                                onCheckedChange={() => toggleModule(mod.id)}
                                className="mt-0.5"
                              />
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  {mod.label}
                                </div>
                                <div className="text-xs text-muted-foreground">{mod.description}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                        <strong>Dica:</strong> alguns módulos têm dependências entre si.
                        Ex.: ao apagar <em>Projetos</em>, também é recomendável apagar
                        <em> Apostas</em> e <em>Financeiro</em>, pois eles referenciam projetos.
                        Se o reset falhar com erro de dependência, selecione os módulos relacionados juntos.
                      </div>

                      <p className="text-destructive">
                        Esta ação <strong>não pode ser desfeita</strong>.
                      </p>

                      <div className="space-y-2 pt-1">
                        <Label htmlFor="confirmResetName" className="text-foreground">
                          Digite o nome do workspace para confirmar:
                        </Label>
                        <Input
                          id="confirmResetName"
                          value={confirmResetName}
                          onChange={(e) => setConfirmResetName(e.target.value)}
                          placeholder={workspace.name}
                          autoComplete="off"
                          autoFocus
                        />
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleResetData}
                    disabled={!resetNameMatches || !hasSelection || resetting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Resetar {selectedModules.size > 0 ? `${selectedModules.size} módulo(s)` : "dados"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* System-owner-only: Deactivate */}
        {isSystemOwner && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Desativar workspace</p>
            <p className="text-xs text-muted-foreground">
              Marca o workspace como inativo. Necessário antes da exclusão definitiva. (System Owner)
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
        )}

        {/* System-owner-only: Permanent delete */}
        {isSystemOwner && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">
              Excluir permanentemente (System Owner)
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
        )}
      </CardContent>
    </Card>
  );
}