import { useState, useEffect } from "react";
import { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Crown, Shield, User, DollarSign, Gamepad2, Eye, Settings2, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { ptBR } from "date-fns/locale";
import { getRoleLabel } from "@/lib/roleLabels";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MemberPermissionsDialog } from "./MemberPermissionsDialog";
import { RoleChangeConfirmDialog } from "./RoleChangeConfirmDialog";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Member {
  id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  joined_at: string;
  email?: string;
  full_name?: string;
}

interface PendingRoleChange {
  memberId: string;
  member: Member;
  newRole: AppRole;
}

interface MemberListProps {
  members: Member[];
  currentUserId: string;
  onRoleChange: (memberId: string, newRole: AppRole) => void;
  onRemove: (memberId: string) => void;
  canEdit: boolean;
}

// Roles disponíveis para seleção (excluindo owner que é fixo)
const roleConfig: Record<string, { icon: any; color: string }> = {
  owner: { icon: Crown, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  admin: { icon: Shield, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  finance: { icon: DollarSign, color: "bg-green-500/10 text-green-600 border-green-500/20" },
  operator: { icon: Gamepad2, color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  user: { icon: User, color: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  viewer: { icon: Eye, color: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
};

const availableRoles: AppRole[] = ['admin', 'finance', 'operator', 'viewer'];

export function MemberList({ members, currentUserId, onRoleChange, onRemove, canEdit }: MemberListProps) {
  const { workspaceId } = useWorkspace();
  const { toast } = useToast();
  const [permissionsDialogMember, setPermissionsDialogMember] = useState<Member | null>(null);
  const [memberOverrideCounts, setMemberOverrideCounts] = useState<Record<string, number>>({});
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [localRoles, setLocalRoles] = useState<Record<string, AppRole>>({});

  // Inicializar roles locais quando members mudar
  useEffect(() => {
    const roles: Record<string, AppRole> = {};
    members.forEach(m => {
      roles[m.id] = m.role;
    });
    setLocalRoles(roles);
  }, [members]);

  // Fetch override counts for all members
  useEffect(() => {
    const fetchOverrideCounts = async () => {
      if (!workspaceId || members.length === 0) return;

      const userIds = members.map(m => m.user_id);
      
      const { data, error } = await supabase
        .from('user_permission_overrides')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .eq('granted', true)
        .in('user_id', userIds);

      if (error) {
        console.error('Error fetching override counts:', error);
        return;
      }

      // Count overrides per user
      const counts: Record<string, number> = {};
      data?.forEach(override => {
        counts[override.user_id] = (counts[override.user_id] || 0) + 1;
      });
      setMemberOverrideCounts(counts);
    };

    fetchOverrideCounts();
  }, [workspaceId, members]);

  const getInitials = (email?: string, fullName?: string) => {
    if (fullName) {
      return fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.charAt(0).toUpperCase() || 'U';
  };

  const handlePermissionsChanged = async () => {
    // Refresh override counts
    if (!workspaceId || members.length === 0) return;

    const userIds = members.map(m => m.user_id);
    
    const { data } = await supabase
      .from('user_permission_overrides')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('granted', true)
      .in('user_id', userIds);

    const counts: Record<string, number> = {};
    data?.forEach(override => {
      counts[override.user_id] = (counts[override.user_id] || 0) + 1;
    });
    setMemberOverrideCounts(counts);
  };

  // Handler para quando usuário seleciona uma nova role no dropdown
  const handleRoleSelect = (memberId: string, newRole: AppRole) => {
    const member = members.find(m => m.id === memberId);
    if (!member || member.role === newRole) return;
    
    // Abrir dialog de confirmação
    setPendingRoleChange({ memberId, member, newRole });
  };

  // Handler para confirmar a mudança de role
  const handleConfirmRoleChange = async () => {
    if (!pendingRoleChange) return;
    
    setIsChangingRole(true);
    try {
      const { data, error } = await supabase.rpc('change_member_role', {
        _member_id: pendingRoleChange.memberId,
        _new_role: pendingRoleChange.newRole,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; old_role?: string; new_role?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao alterar permissão');
      }

      // Atualizar estado local
      setLocalRoles(prev => ({
        ...prev,
        [pendingRoleChange.memberId]: pendingRoleChange.newRole,
      }));
      
      // Notificar componente pai
      onRoleChange(pendingRoleChange.memberId, pendingRoleChange.newRole);
      
      toast({
        title: "Permissão alterada",
        description: `${pendingRoleChange.member.full_name || pendingRoleChange.member.email} agora é ${getRoleLabel(pendingRoleChange.newRole)}.`,
      });
      
      setPendingRoleChange(null);
    } catch (error: any) {
      console.error("Error changing role:", error);
      toast({
        title: "Erro ao alterar permissão",
        description: error.message || "Não foi possível alterar a permissão.",
        variant: "destructive",
      });
      // Reverter o dropdown pro valor anterior (já está correto pois usamos localRoles)
    } finally {
      setIsChangingRole(false);
    }
  };

  // Handler para cancelar mudança de role
  const handleCancelRoleChange = () => {
    setPendingRoleChange(null);
  };

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum membro encontrado.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {members.map((member) => {
          const currentRole = localRoles[member.id] || member.role;
          const roleInfo = roleConfig[currentRole] || roleConfig['user'];
          const RoleIcon = roleInfo.icon;
          const isCurrentUser = member.user_id === currentUserId;
          const isOwner = currentRole === 'owner';
          const canEditMember = canEdit && !isCurrentUser && !isOwner;
          const overrideCount = memberOverrideCounts[member.user_id] || 0;
          const canHaveOverrides = currentRole !== 'viewer' && currentRole !== 'owner';
          const isChangingThisMember = pendingRoleChange?.memberId === member.id && isChangingRole;

          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(member.email, member.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {member.full_name || member.email}
                    </span>
                    {isCurrentUser && (
                      <Badge variant="outline" className="text-xs">
                        Você
                      </Badge>
                    )}
                    {overrideCount > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary gap-1">
                              <Sparkles className="h-3 w-3" />
                              +{overrideCount}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{overrideCount} permissão(ões) customizada(s)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {format(parseLocalDateTime(member.joined_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {canEditMember ? (
                  <Select
                    value={currentRole}
                    onValueChange={(value) => handleRoleSelect(member.id, value as AppRole)}
                    disabled={isChangingThisMember}
                  >
                    <SelectTrigger className="w-[160px]">
                      {isChangingThisMember ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Alterando...</span>
                        </div>
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => {
                        const config = roleConfig[role];
                        if (!config) return null;
                        const Icon = config.icon;
                        return (
                          <SelectItem key={role} value={role}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{getRoleLabel(role)}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={roleInfo.color}>
                    <RoleIcon className="h-3 w-3 mr-1" />
                    {getRoleLabel(currentRole)}
                  </Badge>
                )}

                {canEdit && canHaveOverrides && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setPermissionsDialogMember(member)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Gerenciar permissões adicionais</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {canEditMember && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja remover {member.full_name || member.email} do workspace?
                          Esta ação pode ser revertida convidando o usuário novamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onRemove(member.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Permissions Dialog */}
      {permissionsDialogMember && (
        <MemberPermissionsDialog
          open={!!permissionsDialogMember}
          onOpenChange={(open) => !open && setPermissionsDialogMember(null)}
          member={permissionsDialogMember}
          onPermissionsChanged={handlePermissionsChanged}
        />
      )}

      {/* Role Change Confirmation Dialog */}
      {pendingRoleChange && (
        <RoleChangeConfirmDialog
          open={!!pendingRoleChange}
          onOpenChange={(open) => !open && handleCancelRoleChange()}
          memberName={pendingRoleChange.member.full_name || ''}
          memberEmail={pendingRoleChange.member.email || ''}
          currentRole={pendingRoleChange.member.role}
          newRole={pendingRoleChange.newRole}
          onConfirm={handleConfirmRoleChange}
          isLoading={isChangingRole}
        />
      )}
    </>
  );
}
