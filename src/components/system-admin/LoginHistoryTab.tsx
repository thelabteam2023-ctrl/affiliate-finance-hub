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
import { format, formatDistanceToNow, differenceInMinutes, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export function LoginHistoryTab() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'recent' | 'online_first'>('online_first');
  const { workspaces, fetchWorkspaces } = useSystemAdmin();
  const { loading, history, stats, fetchHistory, fetchStats } = useLoginHistory({
    workspaceId: selectedWorkspaceId,
    limit: 100,
  });
  const { isUserOnline, getUserOnlineInfo } = usePresence();

  // Sort history based on selected order
  const sortedHistory = useMemo(() => {
    if (sortOrder === 'online_first') {
      return [...history].sort((a, b) => {
        const aOnline = isUserOnline(a.user_id);
        const bOnline = isUserOnline(b.user_id);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        // If both have same online status, sort by most recent login
        return new Date(b.login_at).getTime() - new Date(a.login_at).getTime();
      });
    }
    return [...history].sort((a, b) => 
      new Date(b.login_at).getTime() - new Date(a.login_at).getTime()
    );
  }, [history, sortOrder, isUserOnline]);

  // Format session time based on online status
  const formatSessionTime = (loginAt: string, userId: string) => {
    const isOnline = isUserOnline(userId);
    const loginDate = new Date(loginAt);
    const now = new Date();
    const minutesDiff = differenceInMinutes(now, loginDate);
    const hoursDiff = differenceInHours(now, loginDate);

    if (isOnline) {
      if (minutesDiff < 1) {
        return 'online agora';
      } else if (minutesDiff < 60) {
        return `online há ${minutesDiff} min`;
      } else if (hoursDiff < 24) {
        return `online há ${hoursDiff}h ${minutesDiff % 60}min`;
      } else {
        return `online há ${Math.floor(hoursDiff / 24)}d ${hoursDiff % 24}h`;
      }
    }
    return formatDistanceToNow(loginDate, { locale: ptBR, addSuffix: true });
  };

  const handleRefresh = () => {
    fetchHistory();
    fetchStats();
    fetchWorkspaces();
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

      {/* History Table */}
      <Card>
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
                  <TableHead>Workspace</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Sessão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedHistory.map((record) => {
                  const isOnline = isUserOnline(record.user_id);
                  return (
                    <TableRow key={record.id} className={cn(isOnline && 'bg-emerald-500/5')}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {isOnline && (
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
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(record.login_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-sm",
                          isOnline ? "text-emerald-500 font-medium" : "text-muted-foreground"
                        )}>
                          {formatSessionTime(record.login_at, record.user_id)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sortedHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {loading ? 'Carregando...' : 'Nenhum registro de login encontrado'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
