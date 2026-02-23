import { useEffect, useState } from 'react';
import { useBillingAdmin, SaleEvent } from '@/hooks/useBillingAdmin';
import { usePlansAdmin } from '@/hooks/usePlansAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ModernBarChart } from '@/components/ui/modern-bar-chart';
import { 
  RefreshCw, TrendingUp, DollarSign, CreditCard, Users, 
  XCircle, RotateCcw, Plus, MoreHorizontal, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { format } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  paid: { label: 'Pago', class: 'bg-emerald-500/20 text-emerald-400' },
  pending: { label: 'Pendente', class: 'bg-amber-500/20 text-amber-400' },
  refunded: { label: 'Reembolsado', class: 'bg-blue-500/20 text-blue-400' },
  canceled: { label: 'Cancelado', class: 'bg-destructive/20 text-destructive' },
};

const SOURCE_LABELS = {
  landing: 'Landing Page',
  referral: 'Indicação',
  manual: 'Manual',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
};

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

export function BillingDashboardTab() {
  const {
    loading,
    kpis,
    sales,
    dailyRevenue,
    revenueByPlan,
    fetchAll,
    fetchSales,
    createSale,
    updateSaleStatus,
  } = useBillingAdmin();

  const { plans, fetchPlans } = usePlansAdmin();

  const [filters, setFilters] = useState({
    status: '',
    plan_code: '',
  });

  const [createSaleDialog, setCreateSaleDialog] = useState(false);
  const [saleForm, setSaleForm] = useState({
    plan_code: '',
    amount: '',
    customer_email: '',
    customer_name: '',
    source: 'manual',
  });

  useEffect(() => {
    fetchAll();
    fetchPlans();
  }, [fetchAll, fetchPlans]);

  const handleApplyFilters = () => {
    fetchSales({
      status: filters.status || undefined,
      plan_code: filters.plan_code || undefined,
    });
  };

  const handleCreateSale = async () => {
    if (!saleForm.plan_code || !saleForm.amount) return;
    await createSale({
      plan_code: saleForm.plan_code,
      amount: parseFloat(saleForm.amount),
      customer_email: saleForm.customer_email || undefined,
      customer_name: saleForm.customer_name || undefined,
      source: saleForm.source,
    });
    setCreateSaleDialog(false);
    setSaleForm({ plan_code: '', amount: '', customer_email: '', customer_name: '', source: 'manual' });
    fetchAll();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatShortCurrency = (value: number) => {
    if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
    return formatCurrency(value);
  };

  // Calculate period comparison (mock for now)
  const periodGrowth = 12.5; // Would come from comparing periods

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatShortCurrency(kpis?.mrr || 0)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="text-emerald-500 flex items-center">
                <ArrowUpRight className="h-3 w-3" /> +{periodGrowth}%
              </span>
              vs. mês anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita do Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatShortCurrency(kpis?.month_revenue || 0)}</div>
            <p className="text-xs text-muted-foreground">
              ARR estimado: {formatShortCurrency(kpis?.arr_estimated || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Novas Assinaturas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.new_subscriptions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {kpis?.cancellations || 0} cancelamentos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.avg_ticket || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {kpis?.total_sales || 0} vendas totais
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Receita Diária</CardTitle>
            <CardDescription>Últimos 30 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => format(new Date(date), 'dd/MM')}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    tickFormatter={(value) => formatShortCurrency(value)}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Receita']}
                    labelFormatter={(date) => format(new Date(date), "dd 'de' MMMM", { locale: ptBR })}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Plan Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Receita por Plano</CardTitle>
            <CardDescription>Distribuição de receita</CardDescription>
          </CardHeader>
          <CardContent>
            <ModernBarChart
              data={revenueByPlan.map(item => ({
                plan: item.plan_name,
                receita: item.revenue,
              }))}
              categoryKey="plan"
              bars={[
                {
                  dataKey: 'receita',
                  label: 'Receita',
                  gradientStart: 'hsl(var(--primary))',
                  gradientEnd: 'hsl(142, 71%, 45%)',
                },
              ]}
              height={300}
              showLabels
              formatValue={(value) => formatCurrency(value)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Histórico de Vendas</CardTitle>
              <CardDescription>Todas as transações registradas</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchAll()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={() => setCreateSaleDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Registrar Venda
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.plan_code || "all"} onValueChange={(v) => setFilters({ ...filters, plan_code: v === "all" ? "" : v })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleApplyFilters}>
              Filtrar
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma venda registrada
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((sale) => {
                    const statusConfig = STATUS_CONFIG[sale.status];
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="text-muted-foreground">
                          {format(parseLocalDateTime(sale.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{sale.customer_name || '—'}</div>
                            <div className="text-sm text-muted-foreground">{sale.customer_email || '—'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{sale.plan_name}</Badge>
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          {formatCurrency(sale.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig.class}>{statusConfig.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {SOURCE_LABELS[sale.source] || sale.source}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {sale.status === 'paid' && (
                                <DropdownMenuItem onClick={() => updateSaleStatus(sale.id, 'refunded')}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Reembolsar
                                </DropdownMenuItem>
                              )}
                              {sale.status === 'pending' && (
                                <>
                                  <DropdownMenuItem onClick={() => updateSaleStatus(sale.id, 'paid')}>
                                    <DollarSign className="h-4 w-4 mr-2" />
                                    Marcar como Pago
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updateSaleStatus(sale.id, 'canceled')}>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Cancelar
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Sale Dialog */}
      <Dialog open={createSaleDialog} onOpenChange={setCreateSaleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Venda Manual</DialogTitle>
            <DialogDescription>
              Registre uma venda realizada fora do sistema
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={saleForm.plan_code} onValueChange={(v) => setSaleForm({ ...saleForm, plan_code: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={saleForm.amount}
                  onChange={(e) => setSaleForm({ ...saleForm, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Cliente</Label>
                <Input
                  placeholder="João Silva"
                  value={saleForm.customer_name}
                  onChange={(e) => setSaleForm({ ...saleForm, customer_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email do Cliente</Label>
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={saleForm.customer_email}
                  onChange={(e) => setSaleForm({ ...saleForm, customer_email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={saleForm.source} onValueChange={(v) => setSaleForm({ ...saleForm, source: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="landing">Landing Page</SelectItem>
                  <SelectItem value="referral">Indicação</SelectItem>
                  <SelectItem value="upgrade">Upgrade</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSaleDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateSale} disabled={!saleForm.plan_code || !saleForm.amount}>
              Registrar Venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
