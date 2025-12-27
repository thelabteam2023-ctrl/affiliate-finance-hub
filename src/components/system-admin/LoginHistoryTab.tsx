import { useState } from 'react';
import { useLoginHistory } from '@/hooks/useLoginHistory';
import { useSystemAdmin } from '@/hooks/useSystemAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, LogIn, Calendar, Users, TrendingUp } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function LoginHistoryTab() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const { workspaces, fetchWorkspaces } = useSystemAdmin();
  const { loading, history, stats, fetchHistory, fetchStats } = useLoginHistory({
    workspaceId: selectedWorkspaceId,
    limit: 100,
  });

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
                  <TableHead>Tempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{record.user_name || 'Sem nome'}</div>
                        <div className="text-sm text-muted-foreground">{record.user_email}</div>
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
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(record.login_at), { locale: ptBR, addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
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
