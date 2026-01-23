import { useState } from "react";
import { Check, ChevronsUpDown, Building2, UserPlus, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { getRoleLabel } from "@/lib/roleLabels";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { WorkspaceSwitchConfirmDialog } from "./WorkspaceSwitchConfirmDialog";

type AppRole = Database["public"]["Enums"]["app_role"];

interface WorkspaceItem {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  role: AppRole;
  plan: string;
  is_default: boolean;
}

interface PendingInvite {
  id: string;
  workspace_id: string;
  workspace_name: string;
  role: AppRole;
  token: string;
  inviter_name: string | null;
}

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceItem[];
  pendingInvites?: PendingInvite[];
  currentWorkspaceId: string | null;
  onSwitch: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  onAcceptInvite?: (token: string) => Promise<{ success: boolean; error?: string }>;
  isCollapsed?: boolean;
  loading?: boolean;
  switching?: boolean;
}

export function WorkspaceSwitcher({
  workspaces,
  pendingInvites = [],
  currentWorkspaceId,
  onSwitch,
  onAcceptInvite,
  isCollapsed = false,
  loading = false,
  switching = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  
  // Estado para modal de confirmação
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [targetWorkspace, setTargetWorkspace] = useState<WorkspaceItem | null>(null);

  const handleConfirmDialogChange = (nextOpen: boolean) => {
    setConfirmDialogOpen(nextOpen);
    // Segurança operacional: ao fechar o modal (cancel/esc/click-out), zera o alvo.
    if (!nextOpen) setTargetWorkspace(null);
  };

  const currentWorkspace = workspaces.find(
    (w) => w.workspace_id === currentWorkspaceId
  );

  const hasPendingInvites = pendingInvites.length > 0;
  const hasMultipleOptions = workspaces.length > 1 || hasPendingInvites;

  // Abre o modal de confirmação ao invés de trocar diretamente
  const handleSwitchRequest = (workspace: WorkspaceItem) => {
    if (workspace.workspace_id === currentWorkspaceId) {
      setOpen(false);
      return;
    }
    
    // Abrir modal de confirmação de forma determinística.
    // (Abrir primeiro evita condições de corrida com o fechamento do Popover.)
    setTargetWorkspace(workspace);
    setConfirmDialogOpen(true);
    setOpen(false);
  };

  // Executa a troca após confirmação
  const handleConfirmedSwitch = async () => {
    if (!targetWorkspace) return;
    
    const result = await onSwitch(targetWorkspace.workspace_id);
    if (result.success) {
      toast.success(`Workspace alterado para ${targetWorkspace.workspace_name}`);
      setConfirmDialogOpen(false);
      setTargetWorkspace(null);
    } else {
      toast.error(result.error || "Erro ao trocar de workspace");
    }
  };

  const handleAcceptInvite = async (invite: PendingInvite) => {
    if (!onAcceptInvite) return;

    setAcceptingId(invite.id);
    const result = await onAcceptInvite(invite.token);
    
    if (result.success) {
      toast.success(`Convite aceito! Bem-vindo ao ${invite.workspace_name}`);
      setOpen(false);
    } else {
      toast.error(result.error || "Erro ao aceitar convite");
    }
    setAcceptingId(null);
  };

  // Se só tem 1 workspace e sem convites, mostra apenas o nome sem dropdown
  if (!hasMultipleOptions && !isCollapsed) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium truncate">
            {currentWorkspace?.workspace_name || "Workspace"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {currentWorkspace ? getRoleLabel(currentWorkspace.role) : ""}
          </p>
        </div>
      </div>
    );
  }

  if (!hasMultipleOptions && isCollapsed) {
    return (
      <div className="flex items-center justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between hover:bg-accent/50 transition-colors relative",
            isCollapsed ? "h-8 w-8 p-0" : "w-full h-auto px-2 py-1.5"
          )}
          disabled={loading || switching}
        >
          {isCollapsed ? (
            <div className="relative">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              {hasPendingInvites && (
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-orange-500 rounded-full animate-pulse" />
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0 relative">
                  <Building2 className="h-4 w-4 text-primary" />
                  {hasPendingInvites && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-orange-500 rounded-full animate-pulse" />
                  )}
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium truncate">
                    {currentWorkspace?.workspace_name || "Selecionar..."}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {currentWorkspace ? getRoleLabel(currentWorkspace.role) : ""}
                  </p>
                </div>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar workspace..." />
          <CommandList>
            <CommandEmpty>Nenhum workspace encontrado.</CommandEmpty>

            {/* Convites Pendentes */}
            {hasPendingInvites && (
              <>
                <CommandGroup heading="Convites Pendentes">
                  {pendingInvites.map((invite) => (
                    <CommandItem
                      key={invite.id}
                      value={`invite-${invite.workspace_name}`}
                      onSelect={() => handleAcceptInvite(invite)}
                      className="cursor-pointer"
                      disabled={acceptingId === invite.id}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/20 shrink-0">
                          <UserPlus className="h-4 w-4 text-orange-500" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate">
                            {invite.workspace_name}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-600 border-orange-300">
                              Convite
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              • {getRoleLabel(invite.role)}
                            </span>
                          </div>
                          {invite.inviter_name && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" />
                              De: {invite.inviter_name}
                            </p>
                          )}
                        </div>
                      </div>
                      {acceptingId === invite.id ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          Aceitar
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Workspaces Atuais */}
            <CommandGroup heading="Seus Workspaces">
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.workspace_id}
                  value={workspace.workspace_name}
                  onSelect={() => handleSwitchRequest(workspace)}
                  className="cursor-pointer"
                  disabled={switching}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-medium truncate">
                        {workspace.workspace_name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {getRoleLabel(workspace.role)}
                        </Badge>
                        {workspace.is_default && (
                          <span className="text-[10px] text-muted-foreground">
                            • Padrão
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {switching && currentWorkspaceId !== workspace.workspace_id ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
                  ) : (
                    <Check
                      className={cn(
                        "ml-2 h-4 w-4",
                        currentWorkspaceId === workspace.workspace_id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    
    {/* Modal de confirmação de troca */}
    <WorkspaceSwitchConfirmDialog
      open={confirmDialogOpen}
      onOpenChange={handleConfirmDialogChange}
      currentWorkspaceName={currentWorkspace?.workspace_name || "Workspace Atual"}
      targetWorkspaceName={targetWorkspace?.workspace_name || ""}
      targetWorkspaceRole={targetWorkspace ? getRoleLabel(targetWorkspace.role) : ""}
      onConfirm={handleConfirmedSwitch}
      isLoading={switching}
    />
    </>
  );
}
