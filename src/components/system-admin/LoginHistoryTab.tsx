import { useState, useMemo } from 'react';
import { useLoginHistory } from '@/hooks/useLoginHistory';
import { useSystemAdmin } from '@/hooks/useSystemAdmin';
import { usePresence } from '@/contexts/PresenceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, LogIn, Calendar, Users, TrendingUp, Circle } from 'lucide-react';
import { format, formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { InactiveUsersCard } from './InactiveUsersCard';

export function LoginHistoryTab() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'recent' | 'online_first'>('online_first');
  const { workspaces, fetchWorkspaces } = useSystemAdmin();
  const { isUserOnline, onlineUserIds } = usePresence();
  const { loading, history, stats, inactiveUsers, fetchHistory, fetchStats, fetchInactiveUsers } = useLoginHistory({
    workspaceId: selectedWorkspaceId,
    limit: 100,
  });

  // Filtrar usuários inativos excluindo os que estão online agora
  const filteredInactiveUsers = useMemo(() => {
    return inactiveUsers.filter(user => !onlineUserIds.has(user.user_id));
  }, [inactiveUsers, onlineUserIds]);

  // Sort history based on selected order
  // REGRA: Apenas sessões com session_status='active' podem ser online
  const sortedHistory = useMemo(() => {
    if (sortOrder === 'online_first') {
      return [...history].sort((a, b) => {
        // Só considera online se session_status='active' E presença mostra online
        const aOnline = a.session_status === 'active' && a.is_active && isUserOnline(a.user_id);
        const bOnline = b.session_status === 'active' && b.is_active && isUserOnline(b.user_id);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        // Se ambos tem mesmo status, ordenar por login mais recente
        return new Date(b.login_at).getTime() - new Date(a.login_at).getTime();
      });
    }
    return [...history].sort((a, b) => 
      new Date(b.login_at).getTime() - new Date(a.login_at).getTime()
    );
  }, [history, sortOrder, isUserOnline]);

  // Format session display based on session_status
  // REGRA DE SEGURANÇA: Estados válidos são apenas: active, closed, expired
  // "logout pendente" NÃO existe mais após logout explícito
  const formatSessionTime = (record: { 
    login_at: string; 
    logout_at: string | null; 
    is_active: boolean; 
    session_status: string;
    user_id: string 
  }) => {
    const { login_at, logout_at, is_active, session_status, user_id } = record;
    const loginDate = new Date(login_at);

    // ESTADO 1: Sessão encerrada (closed ou expired)
    if (session_status === 'closed' || session_status === 'expired') {
      if (logout_at) {
        const logoutDate = new Date(logout_at);
        const sessionDuration = differenceInMinutes(logoutDate, loginDate);
        if (sessionDuration < 1) {
          return session_status === 'expired' ? 'expirada < 1 min' : 'sessão < 1 min';
        } else if (sessionDuration < 60) {
          return session_status === 'expired' ? `expirada ${sessionDuration} min` : `sessão de ${sessionDuration} min`;
        }
        const hours = Math.floor(sessionDuration / 60);
        const mins = sessionDuration % 60;
        const duration = mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
        return session_status === 'expired' ? `expirada ${duration}` : `sessão de ${duration}`;
      }
      // Sessão fechada mas sem logout_at (migração de dados antigos)
      return session_status === 'expired' ? 'sessão expirada' : 'sessão encerrada';
    }

    // ESTADO 2: Sessão marcada como não ativa (is_active = false)
    if (!is_active) {
      return 'sessão encerrada';
    }

    // ESTADO 3: Sessão ativa (session_status = 'active' E is_active = true)
    // Verificar presença real para determinar se está online agora
    const isOnlineNow = isUserOnline(user_id);
    
    if (isOnlineNow) {
      return 'online agora';
    }

    // Sessão ativa mas sem presença detectada
    // Pode ser usuário em outra aba ou conexão instável
    // NÃO mostrar como "pendente" - isso é estado técnico
    return formatDistanceToNow(loginDate, { locale: ptBR, addSuffix: true });
  };

  const handleRefresh = () => {
    fetchHistory();
    fetchStats();
    fetchWorkspaces();
    fetchInactiveUsers(5);
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Logins Hoje</CardTitle>
            <LogIn className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.today_logins || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.unique_users_today || 0} usuários únicos
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Últimos 7 dias</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.week_logins || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.unique_users_week || 0} usuários únicos
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Últimos 30 dias</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.month_logins || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média/Dia</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.month_logins ? Math.round(stats.month_logins / 30) : 0}
            </div>
            <p className="text-xs text-muted-foreground">logins por dia</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* History Table - 2/3 width */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Histórico de Logins</CardTitle>
                <CardDescription>Registro de acessos ao sistema</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={sortOrder}
                  onValueChange={(v) => setSortOrder(v as 'recent' | 'online_first')}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online_first">
                      <div className="flex items-center gap-2">
                        <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                        Online primeiro
                      </div>
                    </SelectItem>
                    <SelectItem value="recent">Mais recentes</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={selectedWorkspaceId || 'all'}
                  onValueChange={(v) => setSelectedWorkspaceId(v === 'all' ? null : v)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filtrar por workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os workspaces</SelectItem>
                    {workspaces.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Workspace (sessão)</TableHead>
                    <TableHead>Último Login Global</TableHead>
                    <TableHead>Esta Sessão</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHistory.map((record) => {
                    // REGRA: Só mostra online se session_status='active' E presença confirma
                    const canShowOnline = record.session_status === 'active' && record.is_active && isUserOnline(record.user_id);
                    return (
                      <TableRow key={record.id} className={cn(canShowOnline && 'bg-emerald-500/5')}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {canShowOnline && (
                                <span className="absolute -left-4 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{record.user_name || 'Sem nome'}</div>
                              <div className="text-sm text-muted-foreground">{record.user_email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {record.workspace_name ? (
                            <Badge variant="outline">{record.workspace_name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.last_login_global ? (
                            <span className="font-medium">
                              {format(parseLocalDateTime(record.last_login_global), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Nunca logou</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(parseLocalDateTime(record.login_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-sm",
                            canShowOnline ? "text-emerald-500 font-medium" : "text-muted-foreground"
                          )}>
                            {formatSessionTime(record)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sortedHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {loading ? 'Carregando...' : 'Nenhum registro de login encontrado'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Inactive Users Card - 1/3 width */}
        <InactiveUsersCard users={filteredInactiveUsers} loading={loading} />
      </div>
    </div>
  );
}
