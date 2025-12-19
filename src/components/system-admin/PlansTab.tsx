import { useEffect, useState } from 'react';
import { usePlansAdmin, PlanWithDetails } from '@/hooks/usePlansAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  RefreshCw, Edit, DollarSign, Settings, 
  Users, Building2, Shield, Crown, Infinity, Plus
} from 'lucide-react';

const STATUS_LABELS = {
  active: { label: 'Ativo', class: 'bg-emerald-500/20 text-emerald-400' },
  hidden: { label: 'Oculto', class: 'bg-amber-500/20 text-amber-400' },
  legacy: { label: 'Legado', class: 'bg-muted text-muted-foreground' },
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  semiannual: 'Semestral',
  yearly: 'Anual',
  annual: 'Anual',
  lifetime: 'Vitalício',
};

export function PlansTab() {
  const { loading, plans, fetchPlans, updatePlan, updateEntitlements, updatePrice, createPrice } = usePlansAdmin();
  
  const [editPlanDialog, setEditPlanDialog] = useState<{ open: boolean; plan: PlanWithDetails | null }>({ open: false, plan: null });
  const [editEntitlementsDialog, setEditEntitlementsDialog] = useState<{ open: boolean; plan: PlanWithDetails | null }>({ open: false, plan: null });
  const [editPriceDialog, setEditPriceDialog] = useState<{ open: boolean; plan: PlanWithDetails | null; priceId: string | null }>({ open: false, plan: null, priceId: null });
  const [addPriceDialog, setAddPriceDialog] = useState<{ open: boolean; plan: PlanWithDetails | null }>({ open: false, plan: null });

  // Form states
  const [planForm, setPlanForm] = useState<{ name: string; description: string; status: 'active' | 'hidden' | 'legacy' }>({ name: '', description: '', status: 'active' });
  const [entitlementsForm, setEntitlementsForm] = useState({
    max_active_partners: '' as string,
    max_users: '' as string,
    custom_permissions_enabled: false,
    max_custom_permissions: '' as string,
    personalized_support: false,
  });
  const [priceForm, setPriceForm] = useState({ amount: '', is_active: true });
  const [newPriceForm, setNewPriceForm] = useState({ billing_period: 'yearly' as const, currency: 'BRL', amount: '' });

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openEditPlan = (plan: PlanWithDetails) => {
    setPlanForm({
      name: plan.name,
      description: plan.description || '',
      status: plan.status,
    });
    setEditPlanDialog({ open: true, plan });
  };

  const openEditEntitlements = (plan: PlanWithDetails) => {
    setEntitlementsForm({
      max_active_partners: plan.entitlements?.max_active_partners?.toString() || '',
      max_users: plan.entitlements?.max_users?.toString() || '',
      custom_permissions_enabled: plan.entitlements?.custom_permissions_enabled || false,
      max_custom_permissions: plan.entitlements?.max_custom_permissions?.toString() || '',
      personalized_support: plan.entitlements?.personalized_support || false,
    });
    setEditEntitlementsDialog({ open: true, plan });
  };

  const openEditPrice = (plan: PlanWithDetails, priceId: string) => {
    const price = plan.prices.find(p => p.id === priceId);
    if (!price) return;
    setPriceForm({
      amount: price.amount.toString(),
      is_active: price.is_active,
    });
    setEditPriceDialog({ open: true, plan, priceId });
  };

  const openAddPrice = (plan: PlanWithDetails) => {
    setNewPriceForm({ billing_period: 'yearly', currency: 'BRL', amount: '' });
    setAddPriceDialog({ open: true, plan });
  };

  const handleSavePlan = async () => {
    if (!editPlanDialog.plan) return;
    await updatePlan(editPlanDialog.plan.id, {
      name: planForm.name,
      description: planForm.description || null,
      status: planForm.status,
    });
    setEditPlanDialog({ open: false, plan: null });
  };

  const handleSaveEntitlements = async () => {
    if (!editEntitlementsDialog.plan) return;
    await updateEntitlements(editEntitlementsDialog.plan.id, {
      max_active_partners: entitlementsForm.max_active_partners ? parseInt(entitlementsForm.max_active_partners) : null,
      max_users: entitlementsForm.max_users ? parseInt(entitlementsForm.max_users) : null,
      custom_permissions_enabled: entitlementsForm.custom_permissions_enabled,
      max_custom_permissions: entitlementsForm.max_custom_permissions ? parseInt(entitlementsForm.max_custom_permissions) : null,
      personalized_support: entitlementsForm.personalized_support,
    });
    setEditEntitlementsDialog({ open: false, plan: null });
  };

  const handleSavePrice = async () => {
    if (!editPriceDialog.priceId) return;
    await updatePrice(editPriceDialog.priceId, {
      amount: parseFloat(priceForm.amount),
      is_active: priceForm.is_active,
    });
    setEditPriceDialog({ open: false, plan: null, priceId: null });
  };

  const handleAddPrice = async () => {
    if (!addPriceDialog.plan || !newPriceForm.amount) return;
    await createPrice(addPriceDialog.plan.id, {
      billing_period: newPriceForm.billing_period,
      currency: newPriceForm.currency,
      amount: parseFloat(newPriceForm.amount),
    });
    setAddPriceDialog({ open: false, plan: null });
  };

  const formatCurrency = (amount: number, currency: string = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount);
  };

  const formatLimit = (value: number | null | undefined) => {
    if (value === null || value === undefined) return <Infinity className="h-4 w-4 inline text-primary" />;
    return value;
  };

  return (
    <div className="space-y-6">
      {/* Plans Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                Catálogo de Planos
              </CardTitle>
              <CardDescription>Gerencie planos, limites e preços da plataforma</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchPlans()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Parceiros</TableHead>
                  <TableHead className="text-center">Usuários</TableHead>
                  <TableHead className="text-center">Permissões</TableHead>
                  <TableHead>Preço Mensal</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const monthlyPrice = plan.prices.find(p => p.billing_period === 'monthly' && p.is_active);
                  const statusConfig = STATUS_LABELS[plan.status];
                  
                  return (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{plan.name}</div>
                          <div className="text-sm text-muted-foreground">{plan.code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig.class}>{statusConfig.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {formatLimit(plan.entitlements?.max_active_partners)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatLimit(plan.entitlements?.max_users)}
                      </TableCell>
                      <TableCell className="text-center">
                        {plan.entitlements?.custom_permissions_enabled ? (
                          <span className="text-primary">{formatLimit(plan.entitlements?.max_custom_permissions)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {monthlyPrice ? (
                          <span className="font-medium">{formatCurrency(monthlyPrice.amount)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditPlan(plan)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEditEntitlements(plan)}>
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openAddPrice(plan)}>
                            <DollarSign className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Prices by Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Preços por Plano
          </CardTitle>
          <CardDescription>Visualize e gerencie todos os preços configurados</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={plans[0]?.code || 'free'}>
            <TabsList className="mb-4">
              {plans.map((plan) => (
                <TabsTrigger key={plan.code} value={plan.code}>
                  {plan.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {plans.map((plan) => (
              <TabsContent key={plan.code} value={plan.code}>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead>Moeda</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.prices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            Nenhum preço configurado
                          </TableCell>
                        </TableRow>
                      ) : (
                        plan.prices.map((price) => (
                          <TableRow key={price.id}>
                            <TableCell className="font-medium">
                              {PERIOD_LABELS[price.billing_period]}
                            </TableCell>
                            <TableCell>{price.currency}</TableCell>
                            <TableCell className="font-mono">
                              {formatCurrency(price.amount, price.currency)}
                            </TableCell>
                            <TableCell>
                              {price.is_active ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400">Ativo</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {price.provider || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => openEditPrice(plan, price.id)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Plan Dialog */}
      <Dialog open={editPlanDialog.open} onOpenChange={(open) => setEditPlanDialog({ ...editPlanDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Plano</DialogTitle>
            <DialogDescription>
              Editando: <strong>{editPlanDialog.plan?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={planForm.status} onValueChange={(v: any) => setPlanForm({ ...planForm, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="hidden">Oculto</SelectItem>
                  <SelectItem value="legacy">Legado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanDialog({ open: false, plan: null })}>
              Cancelar
            </Button>
            <Button onClick={handleSavePlan}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entitlements Dialog */}
      <Dialog open={editEntitlementsDialog.open} onOpenChange={(open) => setEditEntitlementsDialog({ ...editEntitlementsDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Limites</DialogTitle>
            <DialogDescription>
              Plano: <strong>{editEntitlementsDialog.plan?.name}</strong>
              <br />
              <span className="text-xs text-muted-foreground">Deixe vazio para ilimitado</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Máx. Parceiros
                </Label>
                <Input
                  type="number"
                  placeholder="Ilimitado"
                  value={entitlementsForm.max_active_partners}
                  onChange={(e) => setEntitlementsForm({ ...entitlementsForm, max_active_partners: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Máx. Usuários
                </Label>
                <Input
                  type="number"
                  placeholder="Ilimitado"
                  value={entitlementsForm.max_users}
                  onChange={(e) => setEntitlementsForm({ ...entitlementsForm, max_users: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Permissões Customizadas
                </Label>
                <p className="text-sm text-muted-foreground">Permite criar permissões personalizadas</p>
              </div>
              <Switch
                checked={entitlementsForm.custom_permissions_enabled}
                onCheckedChange={(checked) => setEntitlementsForm({ ...entitlementsForm, custom_permissions_enabled: checked })}
              />
            </div>
            {entitlementsForm.custom_permissions_enabled && (
              <div className="space-y-2">
                <Label>Máx. Permissões Customizadas</Label>
                <Input
                  type="number"
                  placeholder="Ilimitado"
                  value={entitlementsForm.max_custom_permissions}
                  onChange={(e) => setEntitlementsForm({ ...entitlementsForm, max_custom_permissions: e.target.value })}
                />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <Crown className="h-4 w-4" />
                  Suporte Personalizado
                </Label>
                <p className="text-sm text-muted-foreground">Atendimento prioritário e dedicado</p>
              </div>
              <Switch
                checked={entitlementsForm.personalized_support}
                onCheckedChange={(checked) => setEntitlementsForm({ ...entitlementsForm, personalized_support: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntitlementsDialog({ open: false, plan: null })}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEntitlements}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Price Dialog */}
      <Dialog open={editPriceDialog.open} onOpenChange={(open) => setEditPriceDialog({ ...editPriceDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Preço</DialogTitle>
            <DialogDescription>
              Plano: <strong>{editPriceDialog.plan?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                value={priceForm.amount}
                onChange={(e) => setPriceForm({ ...priceForm, amount: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Preço Ativo</Label>
                <p className="text-sm text-muted-foreground">Preço visível na landing page</p>
              </div>
              <Switch
                checked={priceForm.is_active}
                onCheckedChange={(checked) => setPriceForm({ ...priceForm, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPriceDialog({ open: false, plan: null, priceId: null })}>
              Cancelar
            </Button>
            <Button onClick={handleSavePrice}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Price Dialog */}
      <Dialog open={addPriceDialog.open} onOpenChange={(open) => setAddPriceDialog({ ...addPriceDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Preço</DialogTitle>
            <DialogDescription>
              Plano: <strong>{addPriceDialog.plan?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Período</Label>
                <Select value={newPriceForm.billing_period} onValueChange={(v: any) => setNewPriceForm({ ...newPriceForm, billing_period: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="semiannual">Semestral</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                    <SelectItem value="lifetime">Vitalício</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select value={newPriceForm.currency} onValueChange={(v) => setNewPriceForm({ ...newPriceForm, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newPriceForm.amount}
                onChange={(e) => setNewPriceForm({ ...newPriceForm, amount: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPriceDialog({ open: false, plan: null })}>
              Cancelar
            </Button>
            <Button onClick={handleAddPrice} disabled={!newPriceForm.amount}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
