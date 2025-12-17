import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useRole } from "@/hooks/useRole";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Settings, UserPlus, Pencil, Trash2 } from "lucide-react";
import { MemberList } from "@/components/workspace/MemberList";
import { InviteMemberDialog } from "@/components/workspace/InviteMemberDialog";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface WorkspaceMember {
  id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  joined_at: string;
  email?: string;
  full_name?: string;
}

export default function Workspace() {
  const { user } = useAuth();
  const { workspace, workspaceId, refreshWorkspace } = useWorkspace();
  const { canManageWorkspace, isOwner, isMaster } = useRole();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  useEffect(() => {
    if (workspace) {
      setWorkspaceName(workspace.name);
    }
  }, [workspace]);

  useEffect(() => {
    if (workspaceId) {
      fetchMembers();
    }
  }, [workspaceId]);

  const fetchMembers = async () => {
    if (!workspaceId) return;
    
    try {
      setLoading(true);
      
      const { data: membersData, error: membersError } = await supabase
        .from('workspace_members')
        .select('id, user_id, role, is_active, joined_at')
        .eq('workspace_id', workspaceId)
        .order('joined_at', { ascending: true });

      if (membersError) throw membersError;

      // Fetch profile info for each member
      const membersWithProfiles: WorkspaceMember[] = [];
      
      for (const member of membersData || []) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', member.user_id)
          .single();

        membersWithProfiles.push({
          ...member,
          email: profile?.email || 'Email não disponível',
          full_name: profile?.full_name || '',
        });
      }

      setMembers(membersWithProfiles);
    } catch (error) {
      console.error("Error fetching members:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os membros.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!workspaceId || !workspaceName.trim()) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('workspaces')
        .update({ name: workspaceName.trim() })
        .eq('id', workspaceId);

      if (error) throw error;

      await refreshWorkspace();

      toast({
        title: "Sucesso",
        description: "Workspace atualizado com sucesso.",
      });
    } catch (error) {
      console.error("Error updating workspace:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o workspace.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: AppRole) => {
    try {
      const { error } = await supabase
        .from('workspace_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => 
        prev.map(m => m.id === memberId ? { ...m, role: newRole } : m)
      );

      toast({
        title: "Sucesso",
        description: "Role atualizada com sucesso.",
      });
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a role.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('workspace_members')
        .update({ is_active: false })
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== memberId));

      toast({
        title: "Sucesso",
        description: "Membro removido com sucesso.",
      });
    } catch (error) {
      console.error("Error removing member:", error);
      toast({
        title: "Erro",
        description: "Não foi possível remover o membro.",
        variant: "destructive",
      });
    }
  };

  const handleMemberInvited = () => {
    fetchMembers();
    setInviteDialogOpen(false);
  };

  if (!canManageWorkspace) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações do Workspace</h1>
        <p className="text-muted-foreground">
          Gerencie seu workspace e membros da equipe.
        </p>
      </div>

      {/* Workspace Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Informações do Workspace
          </CardTitle>
          <CardDescription>
            Configure as informações básicas do seu workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="workspaceName">Nome do Workspace</Label>
              <Input
                id="workspaceName"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Nome do workspace"
                disabled={!isOwner && !isMaster}
              />
            </div>
            {(isOwner || isMaster) && (
              <Button 
                onClick={handleSaveWorkspace} 
                disabled={saving || !workspaceName.trim()}
                className="w-fit"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membros do Workspace
            </CardTitle>
            <CardDescription>
              Gerencie quem tem acesso ao seu workspace e suas permissões.
            </CardDescription>
          </div>
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Convidar Membro
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MemberList
              members={members}
              currentUserId={user?.id || ''}
              onRoleChange={handleRoleChange}
              onRemove={handleRemoveMember}
              canEdit={isOwner || isMaster}
            />
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        workspaceId={workspaceId || ''}
        onMemberInvited={handleMemberInvited}
      />
    </div>
  );
}
