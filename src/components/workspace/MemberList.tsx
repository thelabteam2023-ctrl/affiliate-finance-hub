import { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Crown, Shield, User, DollarSign, Gamepad2, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

interface MemberListProps {
  members: Member[];
  currentUserId: string;
  onRoleChange: (memberId: string, newRole: AppRole) => void;
  onRemove: (memberId: string) => void;
  canEdit: boolean;
}

const roleConfig: Record<AppRole, { label: string; icon: any; color: string }> = {
  owner: { label: "Proprietário", icon: Crown, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  master: { label: "Master", icon: Shield, color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  admin: { label: "Administrador", icon: Shield, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  finance: { label: "Financeiro", icon: DollarSign, color: "bg-green-500/10 text-green-600 border-green-500/20" },
  operator: { label: "Operador", icon: Gamepad2, color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  user: { label: "Usuário", icon: User, color: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  viewer: { label: "Visualizador", icon: Eye, color: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
};

const availableRoles: AppRole[] = ['admin', 'finance', 'operator', 'viewer'];

export function MemberList({ members, currentUserId, onRoleChange, onRemove, canEdit }: MemberListProps) {
  const getInitials = (email?: string, fullName?: string) => {
    if (fullName) {
      return fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.charAt(0).toUpperCase() || 'U';
  };

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum membro encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((member) => {
        const roleInfo = roleConfig[member.role];
        const RoleIcon = roleInfo.icon;
        const isCurrentUser = member.user_id === currentUserId;
        const isOwnerOrMaster = member.role === 'owner' || member.role === 'master';
        const canEditMember = canEdit && !isCurrentUser && !isOwnerOrMaster;

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
                </div>
                <p className="text-sm text-muted-foreground">{member.email}</p>
                <p className="text-xs text-muted-foreground">
                  Desde {format(new Date(member.joined_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {canEditMember ? (
                <Select
                  value={member.role}
                  onValueChange={(value) => onRoleChange(member.id, value as AppRole)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => {
                      const config = roleConfig[role];
                      const Icon = config.icon;
                      return (
                        <SelectItem key={role} value={role}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span>{config.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className={roleInfo.color}>
                  <RoleIcon className="h-3 w-3 mr-1" />
                  {roleInfo.label}
                </Badge>
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
  );
}
