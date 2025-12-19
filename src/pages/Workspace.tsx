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
import { Loader2, Users, Settings, UserPlus, Shield, DollarSign, Gamepad2, Eye, Check, X, Info, Mail } from "lucide-react";
import { MemberList } from "@/components/workspace/MemberList";
import { InviteMemberDialog } from "@/components/workspace/InviteMemberDialog";
import { PendingInvitesList } from "@/components/workspace/PendingInvitesList";
import { PlanUsageCard } from "@/components/workspace/PlanUsageCard";
import { SubscriptionInfoCard } from "@/components/workspace/SubscriptionInfoCard";
import { Database } from "@/integrations/supabase/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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

const rolePermissions = [
  {
    role: 'admin',
    label: 'Administrador',
    icon: Shield,
    color: 'text-blue-600',
    description: 'Acesso total ao workspace, exceto transferência de propriedade',
    permissions: [
      { name: 'Gerenciar membros', allowed: true },
      { name: 'Configurar workspace', allowed: true },
      { name: 'Acessar todos os módulos', allowed: true },
      { name: 'Criar/editar projetos', allowed: true },
      { name: 'Operações financeiras', allowed: true },
      { name: 'Transferir propriedade', allowed: false },
    ],
  },
  {
    role: 'finance',
    label: 'Financeiro',
    icon: DollarSign,
    color: 'text-green-600',
    description: 'Foco em operações financeiras e relatórios',
    permissions: [
      { name: 'Ver Caixa e saldos', allowed: true },
      { name: 'Transações financeiras', allowed: true },
      { name: 'Relatórios financeiros', allowed: true },
      { name: 'Gestão de investidores', allowed: true },
      { name: 'Criar projetos', allowed: false },
      { name: 'Gerenciar membros', allowed: false },
    ],
  },
  {
    role: 'operator',
    label: 'Operador',
    icon: Gamepad2,
    color: 'text-orange-600',
    description: 'Execução operacional do dia a dia',
    permissions: [
      { name: 'Registrar apostas', allowed: true },
      { name: 'Ver projetos vinculados', allowed: true },
      { name: 'Operações de bookmakers', allowed: true },
      { name: 'Criar parceiros', allowed: false },
      { name: 'Operações financeiras', allowed: false },
      { name: 'Gerenciar membros', allowed: false },
    ],
  },
  {
    role: 'viewer',
    label: 'Visualizador',
    icon: Eye,
    color: 'text-gray-600',
    description: 'Apenas visualização, sem ações',
    permissions: [
      { name: 'Visualizar dados', allowed: true },
      { name: 'Criar/editar', allowed: false },
      { name: 'Deletar', allowed: false },
      { name: 'Permissões extras', allowed: false },
    ],
  },
];

export default function Workspace() {
  const { user } = useAuth();
  const { workspace, workspaceId, refreshWorkspace } = useWorkspace();
  const { canManageWorkspace, isOwner, isSystemOwner } = useRole();
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
      
      // Usar RPC que retorna dados enriquecidos com email e nome
      const { data: membersData, error: membersError } = await supabase
        .rpc('get_workspace_members_enriched', { _workspace_id: workspaceId });

      if (membersError) throw membersError;

      setMembers(membersData || []);
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

  // Callback chamado pelo MemberList após confirmar a mudança de role via RPC
  const handleRoleChange = (memberId: string, newRole: AppRole) => {
    // Apenas atualizar o estado local - a RPC já fez o update no banco
    setMembers(prev => 
      prev.map(m => m.id === memberId ? { ...m, role: newRole } : m)
    );
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

      {/* Plan Usage Card */}
      <div className="grid gap-6 md:grid-cols-2">
        <PlanUsageCard />
        <SubscriptionInfoCard />
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
                disabled={!isOwner && !isSystemOwner}
              />
            </div>
            {(isOwner || isSystemOwner) && (
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
              canEdit={isOwner || isSystemOwner}
            />
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Convites Enviados
          </CardTitle>
          <CardDescription>
            Gerencie os convites pendentes e histórico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PendingInvitesList workspaceId={workspaceId || ''} />
        </CardContent>
      </Card>

      {/* Roles Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Funções e Permissões
          </CardTitle>
          <CardDescription>
            Entenda o que cada função pode fazer no workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {rolePermissions.map((roleInfo) => {
              const Icon = roleInfo.icon;
              return (
                <AccordionItem key={roleInfo.role} value={roleInfo.role}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${roleInfo.color}`} />
                      <div className="text-left">
                        <span className="font-medium">{roleInfo.label}</span>
                        <p className="text-sm text-muted-foreground font-normal">
                          {roleInfo.description}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-2 pl-8 pt-2">
                      {roleInfo.permissions.map((perm, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          {perm.allowed ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                          <span className={perm.allowed ? '' : 'text-muted-foreground'}>
                            {perm.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {/* Permission Overrides Info */}
          <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm">Permissões Customizadas</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Além da função base, você pode conceder permissões adicionais específicas para cada membro.
                  Clique no ícone de engrenagem <Settings className="h-3.5 w-3.5 inline mx-1" /> ao lado do membro
                  para gerenciar permissões extras.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Ideal para:</strong> Operadores que precisam executar tarefas administrativas ou financeiras
                  em escritórios pequenos.
                </p>
              </div>
            </div>
          </div>
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
