import { useEffect, useState } from 'react';
import { useWorkspaceSubscription, AdminSubscription, PlanPrice, PERIOD_LABELS, STATUS_LABELS, BillingPeriod } from '@/hooks/useWorkspaceSubscription';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchInput } from '@/components/ui/search-input';
import { 
  RefreshCw, Calendar, Clock, AlertTriangle, 
  ArrowUpCircle, ArrowDownCircle, RotateCcw, Plus, CreditCard
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';

export function SubscriptionsTab() {
  const {
    loading,
    listAllSubscriptions,
    createSubscription,
    renewSubscription,
    scheduleDowngrade,
    applyImmediateDowngrade,
    fetchAllPrices,
    formatRemainingTime,
    isWarningState,
  } = useWorkspaceSubscription();

  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [prices, setPrices] = useState<PlanPrice[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expiringFilter, setExpiringFilter] = useState<string>('all');

  // Dialogs
  const [createDialog, setCreateDialog] = useState<{ open: boolean; workspaceId: string; workspaceName: string }>({ 
    open: false, workspaceId: '', workspaceName: '' 
  });
  const [renewDialog, setRenewDialog] = useState<{ open: boolean; sub: AdminSubscription | null }>({ 
    open: false, sub: null 
  });
  const [downgradeDialog, setDowngradeDialog] = useState<{ open: boolean; sub: AdminSubscription | null; immediate: boolean }>({ 
    open: false, sub: null, immediate: false 
  });

  // Form states
  const [selectedPriceId, setSelectedPriceId] = useState('');
  const [downgradeReason, setDowngradeReason] = useState('');

  const loadData = async () => {
    const [subs, allPrices] = await Promise.all([
      listAllSubscriptions(),
      fetchAllPrices(),
    ]);
    setSubscriptions(subs);
    setPrices(allPrices);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSubscriptions = subscriptions.filter(sub => {
    const matchesSearch = 
      sub.workspace_name?.toLowerCase().includes(search.toLowerCase()) ||
      sub.plan_name?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || sub.computed_status === statusFilter;
    
    const matchesExpiring = 
      expiringFilter === 'all' ||
      (expiringFilter === 'expiring' && sub.is_expiring) ||
      (expiringFilter === '7days' && sub.remaining_days !== null && sub.remaining_days <= 7) ||
      (expiringFilter === '30days' && sub.remaining_days !== null && sub.remaining_days <= 30);

    return matchesSearch && matchesStatus && matchesExpiring;
  });

  const handleCreateSubscription = async () => {
    if (!selectedPriceId || !createDialog.workspaceId) return;
    await createSubscription(createDialog.workspaceId, selectedPriceId);
    setCreateDialog({ open: false, workspaceId: '', workspaceName: '' });
    setSelectedPriceId('');
    loadData();
  };

  const handleRenew = async () => {
    if (!renewDialog.sub) return;
    await renewSubscription(renewDialog.sub.workspace_id, selectedPriceId || undefined);
    setRenewDialog({ open: false, sub: null });
    setSelectedPriceId('');
    loadData();
  };

  const handleDowngrade = async () => {
    if (!downgradeDialog.sub || !selectedPriceId) return;
    
    if (downgradeDialog.immediate) {
      await applyImmediateDowngrade(downgradeDialog.sub.workspace_id, selectedPriceId, downgradeReason);
    } else {
      await scheduleDowngrade(downgradeDialog.sub.workspace_id, selectedPriceId, downgradeReason);
    }
    
    setDowngradeDialog({ open: false, sub: null, immediate: false });
    setSelectedPriceId('');
    setDowngradeReason('');
    loadData();
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_LABELS[status as keyof typeof STATUS_LABELS] || STATUS_LABELS.active;
    return <Badge className={config.class}>{config.label}</Badge>;
  };

  const getPeriodBadge = (period: BillingPeriod) => {
    return (
      <Badge variant="outline" className="text-xs">
        {PERIOD_LABELS[period] || period}
      </Badge>
    );
  };

  const getRemainingDaysDisplay = (sub: AdminSubscription) => {
    if (sub.remaining_days === null) {
      return <span className="text-muted-foreground">∞</span>;
    }

    const isWarning = sub.remaining_days <= 7;
    const isExpired = sub.remaining_days < 0;

    return (
      <div className={`flex items-center gap-1 ${isExpired ? 'text-destructive' : isWarning ? 'text-amber-500' : ''}`}>
        {isWarning && <AlertTriangle className="h-3 w-3" />}
        <span>{formatRemainingTime(sub.remaining_days)}</span>
      </div>
    );
  };

  const formatCurrency = (amount: number | null, currency: string = 'BRL') => {
    if (amount === null) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount);
  };

  // Group prices by plan for selectors
  const pricesByPlan = prices.reduce((acc, price) => {
    const key = price.plan_code || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(price);
    return acc;
  }, {} as Record<string, PlanPrice[]>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Assinaturas de Workspaces
              </CardTitle>
              <CardDescription>
                Gerencie assinaturas, renovações e alterações de plano
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                placeholder="Buscar workspace ou plano..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="grace_period">Período de Graça</SelectItem>
                <SelectItem value="expired">Expiradas</SelectItem>
                <SelectItem value="canceled">Canceladas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={expiringFilter} onValueChange={setExpiringFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Expiração" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="expiring">Expirando (≤7 dias)</SelectItem>
                <SelectItem value="7days">Próximos 7 dias</SelectItem>
                <SelectItem value="30days">Próximos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-bold">{subscriptions.length}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="rounded-lg border p-3 border-emerald-500/30">
              <div className="text-2xl font-bold text-emerald-500">
                {subscriptions.filter(s => s.computed_status === 'active').length}
              </div>
              <div className="text-xs text-muted-foreground">Ativas</div>
            </div>
            <div className="rounded-lg border p-3 border-amber-500/30">
              <div className="text-2xl font-bold text-amber-500">
                {subscriptions.filter(s => s.is_expiring).length}
              </div>
              <div className="text-xs text-muted-foreground">Expirando</div>
            </div>
            <div className="rounded-lg border p-3 border-red-500/30">
              <div className="text-2xl font-bold text-red-500">
                {subscriptions.filter(s => s.computed_status === 'expired' || s.computed_status === 'grace_period').length}
              </div>
              <div className="text-xs text-muted-foreground">Atenção</div>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tempo Restante</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhuma assinatura encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscriptions.map((sub) => (
                    <TableRow key={sub.subscription_id} className={isWarningState(sub) ? 'bg-amber-500/5' : ''}>
                      <TableCell className="font-medium">
                        {sub.workspace_name}
                        {sub.cancel_at_period_end && (
                          <Badge variant="outline" className="ml-2 text-xs text-orange-500 border-orange-500/30">
                            Downgrade agendado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sub.plan_name}</Badge>
                      </TableCell>
                      <TableCell>
                        {getPeriodBadge(sub.current_period)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(sub.computed_status)}
                      </TableCell>
                      <TableCell>
                        {getRemainingDaysDisplay(sub)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sub.expires_at 
                          ? format(parseLocalDateTime(sub.expires_at), 'dd/MM/yyyy', { locale: ptBR })
                          : '—'
                        }
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatCurrency(sub.price_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRenewDialog({ open: true, sub });
                              setSelectedPriceId('');
                            }}
                            title="Renovar"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDowngradeDialog({ open: true, sub, immediate: false });
                              setSelectedPriceId('');
                              setDowngradeReason('');
                            }}
                            title="Alterar Plano"
                          >
                            <ArrowDownCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Renew Dialog */}
      <Dialog open={renewDialog.open} onOpenChange={(open) => setRenewDialog({ ...renewDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Renovar Assinatura
            </DialogTitle>
            <DialogDescription>
              Workspace: <strong>{renewDialog.sub?.workspace_name}</strong>
              <br />
              Plano atual: <strong>{renewDialog.sub?.plan_name}</strong> ({PERIOD_LABELS[renewDialog.sub?.current_period || 'monthly']})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Selecione o plano/período para renovação</Label>
              <p className="text-sm text-muted-foreground">
                Deixe em branco para renovar com o mesmo plano e período
              </p>
              <Select value={selectedPriceId} onValueChange={setSelectedPriceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Manter plano atual" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(pricesByPlan).map(([planCode, planPrices]) => (
                    <div key={planCode}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                        {planPrices[0]?.plan_name || planCode}
                      </div>
                      {planPrices.map(price => (
                        <SelectItem key={price.id} value={price.id}>
                          {PERIOD_LABELS[price.billing_period as BillingPeriod] || price.billing_period} - {formatCurrency(price.amount, price.currency)}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg bg-muted/50 p-4">
              <h4 className="font-medium mb-2">O que acontece:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• A assinatura será renovada a partir de hoje</li>
                <li>• O período anterior não é estendido</li>
                <li>• O workspace terá acesso imediato aos recursos do plano</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialog({ open: false, sub: null })}>
              Cancelar
            </Button>
            <Button onClick={handleRenew} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              Renovar Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Downgrade/Change Plan Dialog */}
      <Dialog open={downgradeDialog.open} onOpenChange={(open) => setDowngradeDialog({ ...downgradeDialog, open })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5" />
              Alterar Plano
            </DialogTitle>
            <DialogDescription>
              Workspace: <strong>{downgradeDialog.sub?.workspace_name}</strong>
              <br />
              Plano atual: <strong>{downgradeDialog.sub?.plan_name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Novo plano</Label>
              <Select value={selectedPriceId} onValueChange={setSelectedPriceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o novo plano" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(pricesByPlan).map(([planCode, planPrices]) => (
                    <div key={planCode}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                        {planPrices[0]?.plan_name || planCode}
                      </div>
                      {planPrices.map(price => (
                        <SelectItem key={price.id} value={price.id}>
                          {PERIOD_LABELS[price.billing_period as BillingPeriod] || price.billing_period} - {formatCurrency(price.amount, price.currency)}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                placeholder="Descreva o motivo da alteração..."
                value={downgradeReason}
                onChange={(e) => setDowngradeReason(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-4">
              <input
                type="checkbox"
                id="immediate"
                checked={downgradeDialog.immediate}
                onChange={(e) => setDowngradeDialog({ ...downgradeDialog, immediate: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <div>
                <Label htmlFor="immediate" className="cursor-pointer">Aplicar imediatamente</Label>
                <p className="text-sm text-muted-foreground">
                  {downgradeDialog.immediate 
                    ? 'A alteração será aplicada agora. Os limites do novo plano entrarão em vigor imediatamente.'
                    : 'A alteração será aplicada ao final do período atual.'
                  }
                </p>
              </div>
            </div>

            {downgradeDialog.immediate && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <strong className="text-amber-500">Atenção!</strong>
                    <p className="text-muted-foreground mt-1">
                      Se o novo plano tiver limites menores, recursos excedentes podem ser bloqueados.
                      Dados não serão apagados, apenas o acesso será limitado.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDowngradeDialog({ open: false, sub: null, immediate: false })}>
              Cancelar
            </Button>
            <Button 
              onClick={handleDowngrade} 
              disabled={loading || !selectedPriceId}
              variant={downgradeDialog.immediate ? 'destructive' : 'default'}
            >
              {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              {downgradeDialog.immediate ? 'Aplicar Agora' : 'Agendar Alteração'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
