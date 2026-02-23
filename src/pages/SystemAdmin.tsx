import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSystemAdmin, isDeletedUser, AdminUserGrouped, AdminDeletedUser } from '@/hooks/useSystemAdmin';
import { CleanupTab } from '@/components/system-admin/CleanupTab';
import { CommunityResetTab } from '@/components/system-admin/CommunityResetTab';
import { PlansTab } from '@/components/system-admin/PlansTab';
import { BillingDashboardTab } from '@/components/system-admin/BillingDashboardTab';
import { SubscriptionsTab } from '@/components/system-admin/SubscriptionsTab';
import { OnlineUsersCard } from '@/components/system-admin/OnlineUsersCard';
import { LoginHistoryTab } from '@/components/system-admin/LoginHistoryTab';
import { InfluenceMetricsTab } from '@/components/system-admin/InfluenceMetricsTab';
import { OnlineStatusIndicator } from '@/components/system-admin/OnlineStatusIndicator';
import { UserWorkspacesList } from '@/components/system-admin/UserWorkspacesList';
import { usePresence } from '@/contexts/PresenceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Users, Building2, Shield, Ban, Check, Plus, UserPlus, Settings2, 
  Eye, RefreshCw, Crown, AlertTriangle, Trash2, Archive, MessagesSquare, DollarSign, CreditCard, History, BarChart3, ArrowUpDown
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const PLANS = [
  { value: 'free', label: 'Free', color: 'bg-muted text-muted-foreground' },
  { value: 'starter', label: 'Starter', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'pro', label: 'Pro', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'advanced', label: 'Advanced', color: 'bg-amber-500/20 text-amber-400' },
];

import { getRoleLabel } from '@/lib/roleLabels';

const ROLES = [
  { value: 'owner', label: getRoleLabel('owner') },
  { value: 'admin', label: getRoleLabel('admin') },
  { value: 'user', label: getRoleLabel('user') },
  { value: 'finance', label: getRoleLabel('finance') },
  { value: 'operator', label: getRoleLabel('operator') },
  { value: 'viewer', label: getRoleLabel('viewer') },
];

export default function SystemAdmin() {
  const { user } = useAuth();
  const { isUserOnline } = usePresence();
  const {
    loading,
    users,
    deletedUsers,
    workspaces,
    fetchUsers,
    fetchWorkspaces,
    createWorkspaceForUser,
    addUserToWorkspace,
    setUserBlocked,
    updateWorkspacePlan,
    setWorkspaceActive,
    getWorkspaceMembers,
  } = useSystemAdmin();

  const [searchUsers, setSearchUsers] = useState('');
  const [searchWorkspaces, setSearchWorkspaces] = useState('');
  const [showArchivedUsers, setShowArchivedUsers] = useState(false);
  const [sortOnlineFirst, setSortOnlineFirst] = useState(true);
  
  // Dialogs
  const [createWorkspaceDialog, setCreateWorkspaceDialog] = useState<{ open: boolean; userId: string; userName: string }>({ open: false, userId: '', userName: '' });
  const [addToWorkspaceDialog, setAddToWorkspaceDialog] = useState<{ open: boolean; userId: string; userName: string }>({ open: false, userId: '', userName: '' });
  const [blockUserDialog, setBlockUserDialog] = useState<{ open: boolean; userId: string; userName: string; currentlyBlocked: boolean }>({ open: false, userId: '', userName: '', currentlyBlocked: false });
  const [changePlanDialog, setChangePlanDialog] = useState<{ open: boolean; workspaceId: string; workspaceName: string; currentPlan: string }>({ open: false, workspaceId: '', workspaceName: '', currentPlan: '' });
  const [viewMembersDialog, setViewMembersDialog] = useState<{ open: boolean; workspaceId: string; workspaceName: string; members: any[] }>({ open: false, workspaceId: '', workspaceName: '', members: [] });
  
  // Form states
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspacePlan, setNewWorkspacePlan] = useState('free');
  const [newWorkspaceRole, setNewWorkspaceRole] = useState('owner');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedRole, setSelectedRole] = useState('user');
  const [blockReason, setBlockReason] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchWorkspaces();
  }, [fetchUsers, fetchWorkspaces]);

  // Filtrar usuários ativos
  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.public_id?.toLowerCase().includes(searchUsers.toLowerCase())
  );

  // Filtrar usuários arquivados
  const filteredDeletedUsers = deletedUsers.filter(u => 
    u.email?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.public_id?.toLowerCase().includes(searchUsers.toLowerCase())
  );

  // Helper para calcular dias desde último login
  const getDaysSinceLastLogin = (lastLogin: string | null): number | null => {
    if (!lastLogin) return null;
    return differenceInDays(new Date(), new Date(lastLogin));
  };

  // Helper para determinar status de inatividade visual (somente para usuários OFFLINE)
  const getInactivityLevel = (user: AdminUserGrouped): 'normal' | 'warning' | 'danger' => {
    // Se usuário está online, não mostrar alerta de inatividade
    if (isUserOnline(user.id)) return 'normal';
    
    const days = getDaysSinceLastLogin(user.last_login_global);
    if (days === null) return 'normal';
    if (days > 5) return 'danger'; // Vermelho: mais de 5 dias
    if (days > 3) return 'warning'; // Amarelo: mais de 3 dias
    return 'normal';
  };

  // Contador de usuários sem workspace (para indicador visual)
  const usersWithoutWorkspaceCount = users.filter(u => u.workspaces_count === 0).length;

  // Ordenar usuários ativos:
  // PRIORIDADE 1: Sem workspace (aguardando ação)
  // PRIORIDADE 2: Online (se sortOnlineFirst ativo)
  // PRIORIDADE 3: Demais
  const sortedFilteredUsers = [...filteredUsers].sort((a, b) => {
    // Prioridade absoluta: sem workspace sempre no topo
    const aNoWs = a.workspaces_count === 0;
    const bNoWs = b.workspaces_count === 0;
    
    if (aNoWs && !bNoWs) return -1;
    if (!aNoWs && bNoWs) return 1;
    
    // Se ambos têm ou não têm workspace, aplicar ordenação online
    if (!sortOnlineFirst) return 0;
    
    const aOnline = isUserOnline(a.id);
    const bOnline = isUserOnline(b.id);
    
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return 0;
  });

  const filteredWorkspaces = workspaces.filter(w =>
    w.name?.toLowerCase().includes(searchWorkspaces.toLowerCase()) ||
    w.owner_email?.toLowerCase().includes(searchWorkspaces.toLowerCase())
  );
  
  // Contadores para stats
  const activeUsersCount = users.length;
  const blockedUsersCount = users.filter(u => u.is_blocked).length;
  const archivedUsersCount = deletedUsers.length;

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    await createWorkspaceForUser(createWorkspaceDialog.userId, newWorkspaceName, newWorkspacePlan, newWorkspaceRole);
    setCreateWorkspaceDialog({ open: false, userId: '', userName: '' });
    setNewWorkspaceName('');
    setNewWorkspacePlan('free');
    setNewWorkspaceRole('owner');
  };

  const handleAddToWorkspace = async () => {
    if (!selectedWorkspaceId) return;
    await addUserToWorkspace(addToWorkspaceDialog.userId, selectedWorkspaceId, selectedRole);
    setAddToWorkspaceDialog({ open: false, userId: '', userName: '' });
    setSelectedWorkspaceId('');
    setSelectedRole('user');
  };

  const handleBlockUser = async () => {
    await setUserBlocked(blockUserDialog.userId, !blockUserDialog.currentlyBlocked, blockReason);
    setBlockUserDialog({ open: false, userId: '', userName: '', currentlyBlocked: false });
    setBlockReason('');
  };

  const handleChangePlan = async () => {
    if (!selectedPlan) return;
    await updateWorkspacePlan(changePlanDialog.workspaceId, selectedPlan);
    setChangePlanDialog({ open: false, workspaceId: '', workspaceName: '', currentPlan: '' });
    setSelectedPlan('');
  };

  const handleViewMembers = async (workspaceId: string, workspaceName: string) => {
    const members = await getWorkspaceMembers(workspaceId);
    setViewMembersDialog({ open: true, workspaceId, workspaceName, members });
  };

  const getPlanBadge = (plan: string) => {
    const planConfig = PLANS.find(p => p.value === plan) || PLANS[0];
    return <Badge className={planConfig.color}>{planConfig.label}</Badge>;
  };

  const getUserStatus = (user: AdminUserGrouped | AdminDeletedUser, isDeleted: boolean = false) => {
    if (isDeleted) {
      return <Badge variant="outline" className="gap-1 text-muted-foreground border-muted-foreground/30"><Archive className="h-3 w-3" /> Removido</Badge>;
    }
    if (user.is_system_owner) {
      return <Badge className="gap-1 bg-primary/20 text-primary border-primary/30"><Crown className="h-3 w-3" /> System Owner</Badge>;
    }
    if (user.is_blocked) {
      return <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Bloqueado</Badge>;
    }
    // Para AdminUserGrouped, verificar workspaces_count
    if ('workspaces_count' in user && user.workspaces_count === 0) {
      return <Badge variant="outline" className="gap-1 text-amber-400 border-amber-400/30"><AlertTriangle className="h-3 w-3" /> Sem Workspace</Badge>;
    }
    return <Badge variant="secondary" className="gap-1 bg-emerald-500/20 text-emerald-400"><Check className="h-3 w-3" /> Ativo</Badge>;
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Administração do Sistema</h1>
          </div>
          <p className="text-muted-foreground mt-1">Gerencie usuários, workspaces e planos da plataforma</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <OnlineUsersCard />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeUsersCount}</div>
            <p className="text-xs text-muted-foreground">
              {archivedUsersCount > 0 && <span className="text-muted-foreground">{archivedUsersCount} arquivados</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workspaces.length}</div>
            <p className="text-xs text-muted-foreground">
              {workspaces.filter(w => w.is_active).length} ativos
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bloqueados</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{blockedUsersCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planos Pro+</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {workspaces.filter(w => w.plan === 'pro' || w.plan === 'advanced').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList className="h-auto">
          <TabsTrigger value="usuarios" className="gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Financeiro
          </TabsTrigger>
          <TabsTrigger value="sistema" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Sistema
          </TabsTrigger>
          <TabsTrigger value="metricas" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Métricas
          </TabsTrigger>
        </TabsList>

        {/* =============== ABA USUÁRIOS =============== */}
        <TabsContent value="usuarios" className="space-y-4">
          <Tabs defaultValue="gestao" className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="gestao" className="gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                Gestão
              </TabsTrigger>
              <TabsTrigger value="workspaces" className="gap-1.5 text-xs">
                <Building2 className="h-3.5 w-3.5" />
                Workspaces
              </TabsTrigger>
              <TabsTrigger value="logins" className="gap-1.5 text-xs">
                <History className="h-3.5 w-3.5" />
                Logins
              </TabsTrigger>
            </TabsList>

            {/* Sub-aba: Gestão de Usuários */}
            <TabsContent value="gestao" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Gestão de Usuários</CardTitle>
                      <CardDescription>Gerencie todos os usuários cadastrados na plataforma</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchUsers()} disabled={loading}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Alerta de usuários aguardando workspace - só aparece se houver pendências */}
                  {usersWithoutWorkspaceCount > 0 && !showArchivedUsers && (
                    <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-400">
                          {usersWithoutWorkspaceCount} {usersWithoutWorkspaceCount === 1 ? 'usuário aguardando' : 'usuários aguardando'} workspace
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Aparecem no topo da lista para ação rápida
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Toggle Ativos / Arquivados + Filtro Online Primeiro */}
                  <div className="flex items-center gap-4 mb-4 flex-wrap">
                    <div className="flex rounded-lg border p-1 bg-muted/30">
                      <Button
                        variant={!showArchivedUsers ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setShowArchivedUsers(false)}
                        className="gap-1"
                      >
                        <Users className="h-3.5 w-3.5" />
                        Ativos ({activeUsersCount})
                      </Button>
                      <Button
                        variant={showArchivedUsers ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setShowArchivedUsers(true)}
                        className="gap-1"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Arquivados ({archivedUsersCount})
                      </Button>
                    </div>
                    
                    {/* Toggle Online Primeiro - descreve que sem workspace tem prioridade */}
                    <Button
                      variant={sortOnlineFirst ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setSortOnlineFirst(!sortOnlineFirst)}
                      className="gap-1.5"
                      title="Sem workspace sempre aparece primeiro. Este toggle ordena online após."
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      Online primeiro
                    </Button>
                    
                    <div className="flex-1">
                      <SearchInput
                        placeholder="Buscar por nome ou email..."
                        value={searchUsers}
                        onChange={(e) => setSearchUsers(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">ID</TableHead>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Workspaces & Papéis</TableHead>
                          <TableHead>Último Login</TableHead>
                          <TableHead>Cadastro</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Renderizar usuários ativos */}
                        {!showArchivedUsers && sortedFilteredUsers.map((u) => {
                          const inactivityLevel = getInactivityLevel(u);
                          const rowClasses = cn(
                            inactivityLevel === 'warning' && 'bg-amber-500/5 hover:bg-amber-500/10',
                            inactivityLevel === 'danger' && 'bg-destructive/5 hover:bg-destructive/10'
                          );
                          
                          return (
                          <TableRow key={u.id} className={rowClasses}>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">
                                {u.public_id || '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-start gap-2">
                                <OnlineStatusIndicator 
                                  userId={u.id} 
                                  isOnline={isUserOnline(u.id)} 
                                />
                                <div>
                                  <div className="font-medium">{u.full_name || 'Sem nome'}</div>
                                  <div className="text-sm text-muted-foreground">{u.email}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{getUserStatus(u)}</TableCell>
                            <TableCell className="align-top py-3">
                              <UserWorkspacesList workspaces={u.workspaces || []} />
                            </TableCell>
                            <TableCell className="text-sm">
                              {u.last_login_global ? (
                                <span className="text-muted-foreground">
                                  {format(new Date(u.last_login_global), "dd/MM/yy HH:mm", { locale: ptBR })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50 italic">Nunca</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(parseLocalDateTime(u.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {/* Botões para usuários sem workspace */}
                                {u.workspaces_count === 0 && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setCreateWorkspaceDialog({ open: true, userId: u.id, userName: u.full_name || u.email })}
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Novo WS
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setAddToWorkspaceDialog({ open: true, userId: u.id, userName: u.full_name || u.email })}
                                    >
                                      <UserPlus className="h-4 w-4 mr-1" />
                                      Vincular
                                    </Button>
                                  </>
                                )}
                                {!u.is_system_owner && (
                                  <Button
                                    variant={u.is_blocked ? 'default' : 'destructive'}
                                    size="sm"
                                    onClick={() => setBlockUserDialog({ 
                                      open: true, 
                                      userId: u.id, 
                                      userName: u.full_name || u.email,
                                      currentlyBlocked: u.is_blocked 
                                    })}
                                  >
                                    {u.is_blocked ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })}

                        {/* Renderizar usuários arquivados */}
                        {showArchivedUsers && filteredDeletedUsers.map((u) => (
                          <TableRow key={u.id} className="opacity-60">
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">
                                {u.public_id || '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{u.full_name || 'Sem nome'}</div>
                                <div className="text-sm text-muted-foreground">{u.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>{getUserStatus(u, true)}</TableCell>
                            <TableCell>
                              <span className="text-muted-foreground text-sm">-</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {u.last_login_global ? (
                                <span className="text-muted-foreground">
                                  {format(new Date(u.last_login_global), "dd/MM/yy HH:mm", { locale: ptBR })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50 italic">Nunca</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(parseLocalDateTime(u.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-muted-foreground text-xs">Removido</span>
                            </TableCell>
                          </TableRow>
                        ))}

                        {/* Mensagem de vazio */}
                        {((!showArchivedUsers && sortedFilteredUsers.length === 0) || 
                          (showArchivedUsers && filteredDeletedUsers.length === 0)) && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Nenhum usuário encontrado
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sub-aba: Workspaces */}
            <TabsContent value="workspaces" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Gestão de Workspaces</CardTitle>
                      <CardDescription>Gerencie todos os workspaces e planos</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchWorkspaces()} disabled={loading}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <SearchInput
                      placeholder="Buscar por nome ou owner..."
                      value={searchWorkspaces}
                      onChange={(e) => setSearchWorkspaces(e.target.value)}
                    />
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Workspace</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Plano</TableHead>
                          <TableHead>Membros</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Criado</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWorkspaces.map((w) => (
                          <TableRow key={w.id}>
                            <TableCell>
                              <div className="font-medium">{w.name}</div>
                              <div className="text-sm text-muted-foreground">{w.slug}</div>
                            </TableCell>
                            <TableCell>
                              <div>{w.owner_name || 'Sem owner'}</div>
                              <div className="text-sm text-muted-foreground">{w.owner_email}</div>
                            </TableCell>
                            <TableCell>{getPlanBadge(w.plan)}</TableCell>
                            <TableCell>{w.member_count}</TableCell>
                            <TableCell>
                              {w.is_active ? (
                                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400">Ativo</Badge>
                              ) : (
                                <Badge variant="destructive">Inativo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(parseLocalDateTime(w.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewMembers(w.id, w.name)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPlan(w.plan);
                                    setChangePlanDialog({ open: true, workspaceId: w.id, workspaceName: w.name, currentPlan: w.plan });
                                  }}
                                >
                                  <Settings2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant={w.is_active ? 'destructive' : 'default'}
                                  size="sm"
                                  onClick={() => setWorkspaceActive(w.id, !w.is_active)}
                                >
                                  {w.is_active ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredWorkspaces.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Nenhum workspace encontrado
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sub-aba: Logins */}
            <TabsContent value="logins">
              <LoginHistoryTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* =============== ABA FINANCEIRO =============== */}
        <TabsContent value="financeiro" className="space-y-4">
          <Tabs defaultValue="assinaturas" className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="assinaturas" className="gap-1.5 text-xs">
                <CreditCard className="h-3.5 w-3.5" />
                Assinaturas
              </TabsTrigger>
              <TabsTrigger value="planos" className="gap-1.5 text-xs">
                <Crown className="h-3.5 w-3.5" />
                Planos & Preços
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-1.5 text-xs">
                <DollarSign className="h-3.5 w-3.5" />
                Billing & Growth
              </TabsTrigger>
            </TabsList>

            <TabsContent value="assinaturas">
              <SubscriptionsTab />
            </TabsContent>

            <TabsContent value="planos">
              <PlansTab />
            </TabsContent>

            <TabsContent value="billing">
              <BillingDashboardTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* =============== ABA SISTEMA =============== */}
        <TabsContent value="sistema" className="space-y-4">
          <Tabs defaultValue="limpeza" className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="limpeza" className="gap-1.5 text-xs">
                <Trash2 className="h-3.5 w-3.5" />
                Limpeza de Testes
              </TabsTrigger>
              <TabsTrigger value="comunidade" className="gap-1.5 text-xs">
                <MessagesSquare className="h-3.5 w-3.5" />
                Reset Comunidade
              </TabsTrigger>
            </TabsList>

            <TabsContent value="limpeza">
              <CleanupTab />
            </TabsContent>

            <TabsContent value="comunidade">
              <CommunityResetTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* =============== ABA MÉTRICAS =============== */}
        <TabsContent value="metricas" className="space-y-4">
          <InfluenceMetricsTab />
        </TabsContent>
      </Tabs>

      {/* Create Workspace Dialog */}
      <Dialog open={createWorkspaceDialog.open} onOpenChange={(open) => setCreateWorkspaceDialog({ ...createWorkspaceDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Workspace</DialogTitle>
            <DialogDescription>
              Criando workspace para: <strong>{createWorkspaceDialog.userName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Workspace</Label>
              <Input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Nome do workspace"
              />
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={newWorkspacePlan} onValueChange={setNewWorkspacePlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Papel do Usuário</Label>
              <Select value={newWorkspaceRole} onValueChange={setNewWorkspaceRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWorkspaceDialog({ open: false, userId: '', userName: '' })}>
              Cancelar
            </Button>
            <Button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim()}>
              Criar Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Workspace Dialog */}
      <Dialog open={addToWorkspaceDialog.open} onOpenChange={(open) => setAddToWorkspaceDialog({ ...addToWorkspaceDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular a Workspace</DialogTitle>
            <DialogDescription>
              Vinculando: <strong>{addToWorkspaceDialog.userName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.filter(w => w.is_active).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddToWorkspaceDialog({ open: false, userId: '', userName: '' })}>
              Cancelar
            </Button>
            <Button onClick={handleAddToWorkspace} disabled={!selectedWorkspaceId}>
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block User Dialog */}
      <Dialog open={blockUserDialog.open} onOpenChange={(open) => setBlockUserDialog({ ...blockUserDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blockUserDialog.currentlyBlocked ? 'Desbloquear' : 'Bloquear'} Usuário</DialogTitle>
            <DialogDescription>
              {blockUserDialog.currentlyBlocked 
                ? `Deseja desbloquear ${blockUserDialog.userName}?`
                : `Deseja bloquear ${blockUserDialog.userName}?`
              }
            </DialogDescription>
          </DialogHeader>
          {!blockUserDialog.currentlyBlocked && (
            <div className="space-y-2 py-4">
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Motivo do bloqueio..."
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockUserDialog({ open: false, userId: '', userName: '', currentlyBlocked: false })}>
              Cancelar
            </Button>
            <Button 
              variant={blockUserDialog.currentlyBlocked ? 'default' : 'destructive'}
              onClick={handleBlockUser}
            >
              {blockUserDialog.currentlyBlocked ? 'Desbloquear' : 'Bloquear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanDialog.open} onOpenChange={(open) => setChangePlanDialog({ ...changePlanDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Plano</DialogTitle>
            <DialogDescription>
              Workspace: <strong>{changePlanDialog.workspaceName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Novo Plano</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialog({ open: false, workspaceId: '', workspaceName: '', currentPlan: '' })}>
              Cancelar
            </Button>
            <Button onClick={handleChangePlan}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Members Dialog */}
      <Dialog open={viewMembersDialog.open} onOpenChange={(open) => setViewMembersDialog({ ...viewMembersDialog, open })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Membros do Workspace</DialogTitle>
            <DialogDescription>{viewMembersDialog.workspaceName}</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewMembersDialog.members.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell>{m.full_name || 'Sem nome'}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell><Badge variant="outline">{m.role}</Badge></TableCell>
                    <TableCell>
                      {m.is_active ? (
                        <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
