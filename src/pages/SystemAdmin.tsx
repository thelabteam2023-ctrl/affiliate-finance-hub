import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSystemAdmin } from '@/hooks/useSystemAdmin';
import { PageHeader } from '@/components/PageHeader';
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
  Eye, RefreshCw, Crown, AlertTriangle 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PLANS = [
  { value: 'free', label: 'Free', color: 'bg-muted text-muted-foreground' },
  { value: 'starter', label: 'Starter', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'pro', label: 'Pro', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'advanced', label: 'Advanced', color: 'bg-amber-500/20 text-amber-400' },
];

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'Usuário' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer', label: 'Visualizador' },
];

export default function SystemAdmin() {
  const { user } = useAuth();
  const {
    loading,
    users,
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

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchUsers.toLowerCase())
  );

  const filteredWorkspaces = workspaces.filter(w =>
    w.name?.toLowerCase().includes(searchWorkspaces.toLowerCase()) ||
    w.owner_email?.toLowerCase().includes(searchWorkspaces.toLowerCase())
  );

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

  const getUserStatus = (user: any) => {
    if (user.is_system_owner) {
      return <Badge className="gap-1 bg-primary/20 text-primary border-primary/30"><Crown className="h-3 w-3" /> System Owner</Badge>;
    }
    if (user.is_blocked) {
      return <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Bloqueado</Badge>;
    }
    if (!user.workspace_id) {
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">
              {users.filter(u => !u.workspace_id).length} sem workspace
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
            <CardTitle className="text-sm font-medium">Usuários Bloqueados</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter(u => u.is_blocked).length}</div>
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

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="gap-2">
            <Building2 className="h-4 w-4" />
            Workspaces
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
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
              <div className="mb-4">
                <SearchInput
                  placeholder="Buscar por nome ou email..."
                  value={searchUsers}
                  onChange={(e) => setSearchUsers(e.target.value)}
                />
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{u.full_name || 'Sem nome'}</div>
                            <div className="text-sm text-muted-foreground">{u.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getUserStatus(u)}</TableCell>
                        <TableCell>
                          {u.workspace_name || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {u.workspace_role ? (
                            <Badge variant="outline">{u.workspace_role}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(u.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {!u.workspace_id && (
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
                    ))}
                    {filteredUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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

        {/* Workspaces Tab */}
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
                          {format(new Date(w.created_at), 'dd/MM/yyyy', { locale: ptBR })}
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
