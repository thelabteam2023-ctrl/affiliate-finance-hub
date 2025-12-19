import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'grace_period';
export type BillingPeriod = 'monthly' | 'semiannual' | 'annual' | 'lifetime';

export interface SubscriptionDetails {
  subscription_id: string;
  workspace_id: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  price_id: string | null;
  price_amount: number | null;
  price_currency: string | null;
  status: SubscriptionStatus;
  computed_status: SubscriptionStatus;
  current_period: BillingPeriod;
  started_at: string;
  expires_at: string | null;
  remaining_days: number | null;
  is_expiring: boolean;
  is_expired: boolean;
  is_in_grace_period: boolean;
  cancel_at_period_end: boolean;
  scheduled_downgrade: {
    target_price_id: string;
    target_plan_id: string;
    scheduled_at: string;
    reason: string | null;
  } | null;
  created_at: string;
}

export interface AdminSubscription {
  subscription_id: string;
  workspace_id: string;
  workspace_name: string;
  plan_code: string;
  plan_name: string;
  price_amount: number | null;
  status: SubscriptionStatus;
  computed_status: SubscriptionStatus;
  current_period: BillingPeriod;
  started_at: string;
  expires_at: string | null;
  remaining_days: number | null;
  is_expiring: boolean;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface PlanPrice {
  id: string;
  plan_id: string;
  plan_code?: string;
  plan_name?: string;
  billing_period: string;
  currency: string;
  amount: number;
  is_active: boolean;
}

export const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: 'Mensal',
  semiannual: 'Semestral',
  annual: 'Anual',
  lifetime: 'Vitalício',
};

export const PERIOD_DURATIONS: Record<BillingPeriod, string> = {
  monthly: '1 mês',
  semiannual: '6 meses',
  annual: '12 meses',
  lifetime: 'Para sempre',
};

export const STATUS_LABELS: Record<SubscriptionStatus, { label: string; class: string }> = {
  active: { label: 'Ativa', class: 'bg-emerald-500/20 text-emerald-400' },
  trialing: { label: 'Trial', class: 'bg-blue-500/20 text-blue-400' },
  past_due: { label: 'Pagamento Pendente', class: 'bg-amber-500/20 text-amber-400' },
  canceled: { label: 'Cancelada', class: 'bg-red-500/20 text-red-400' },
  expired: { label: 'Expirada', class: 'bg-muted text-muted-foreground' },
  grace_period: { label: 'Período de Graça', class: 'bg-orange-500/20 text-orange-400' },
};

export function useWorkspaceSubscription() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Get subscription details for a specific workspace
  const getSubscriptionDetails = useCallback(async (workspaceId: string): Promise<SubscriptionDetails | null> => {
    try {
      const { data, error } = await supabase.rpc('get_subscription_details', {
        p_workspace_id: workspaceId
      });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      return data[0] as SubscriptionDetails;
    } catch (error: any) {
      console.error('Error fetching subscription:', error);
      return null;
    }
  }, []);

  // List all subscriptions (admin)
  const listAllSubscriptions = useCallback(async (
    statusFilter?: SubscriptionStatus,
    expiringInDays?: number
  ): Promise<AdminSubscription[]> => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('admin_list_subscriptions', {
        p_status: statusFilter || null,
        p_expiring_in_days: expiringInDays || null
      });

      if (error) throw error;
      return (data || []) as AdminSubscription[];
    } catch (error: any) {
      console.error('Error listing subscriptions:', error);
      toast({
        title: 'Erro ao listar assinaturas',
        description: error.message,
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create a new subscription
  const createSubscription = useCallback(async (
    workspaceId: string,
    priceId: string,
    startedAt?: Date
  ): Promise<string | null> => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('create_subscription', {
        p_workspace_id: workspaceId,
        p_price_id: priceId,
        p_started_at: startedAt?.toISOString() || new Date().toISOString(),
      });

      if (error) throw error;

      toast({
        title: 'Assinatura criada',
        description: 'A assinatura foi ativada com sucesso.',
      });

      return data as string;
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      toast({
        title: 'Erro ao criar assinatura',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Renew subscription
  const renewSubscription = useCallback(async (
    workspaceId: string,
    newPriceId?: string
  ): Promise<string | null> => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('renew_subscription', {
        p_workspace_id: workspaceId,
        p_new_price_id: newPriceId || null,
      });

      if (error) throw error;

      toast({
        title: 'Assinatura renovada',
        description: 'A assinatura foi renovada com sucesso.',
      });

      return data as string;
    } catch (error: any) {
      console.error('Error renewing subscription:', error);
      toast({
        title: 'Erro ao renovar assinatura',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Schedule downgrade for end of period
  const scheduleDowngrade = useCallback(async (
    workspaceId: string,
    targetPriceId: string,
    reason?: string
  ): Promise<string | null> => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('schedule_downgrade', {
        p_workspace_id: workspaceId,
        p_target_price_id: targetPriceId,
        p_reason: reason || null,
      });

      if (error) throw error;

      toast({
        title: 'Downgrade agendado',
        description: 'O downgrade será aplicado ao final do período atual.',
      });

      return data as string;
    } catch (error: any) {
      console.error('Error scheduling downgrade:', error);
      toast({
        title: 'Erro ao agendar downgrade',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Apply immediate downgrade (admin only)
  const applyImmediateDowngrade = useCallback(async (
    workspaceId: string,
    targetPriceId: string,
    reason?: string
  ): Promise<string | null> => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('apply_immediate_downgrade', {
        p_workspace_id: workspaceId,
        p_target_price_id: targetPriceId,
        p_reason: reason || null,
      });

      if (error) throw error;

      toast({
        title: 'Downgrade aplicado',
        description: 'O plano foi alterado imediatamente.',
      });

      return data as string;
    } catch (error: any) {
      console.error('Error applying downgrade:', error);
      toast({
        title: 'Erro ao aplicar downgrade',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch all available prices with plan info
  const fetchAllPrices = useCallback(async (): Promise<PlanPrice[]> => {
    try {
      const { data: prices, error: pricesError } = await supabase
        .from('plan_prices')
        .select('*')
        .eq('is_active', true)
        .order('amount');

      if (pricesError) throw pricesError;

      const { data: plans, error: plansError } = await supabase
        .from('plans')
        .select('id, code, name')
        .eq('status', 'active');

      if (plansError) throw plansError;

      const planMap = new Map(plans?.map(p => [p.id, p]) || []);

      return (prices || []).map(price => ({
        ...price,
        plan_code: planMap.get(price.plan_id)?.code,
        plan_name: planMap.get(price.plan_id)?.name,
      }));
    } catch (error: any) {
      console.error('Error fetching prices:', error);
      return [];
    }
  }, []);

  // Helper: format remaining time
  const formatRemainingTime = useCallback((days: number | null): string => {
    if (days === null) return 'Vitalício';
    if (days < 0) return 'Expirado';
    if (days === 0) return 'Expira hoje';
    if (days === 1) return '1 dia restante';
    if (days <= 7) return `${days} dias restantes`;
    if (days <= 30) return `${Math.ceil(days / 7)} semanas restantes`;
    return `${Math.floor(days / 30)} meses restantes`;
  }, []);

  // Helper: check if subscription is in warning state
  const isWarningState = useCallback((subscription: SubscriptionDetails | AdminSubscription | null): boolean => {
    if (!subscription) return false;
    const { computed_status, remaining_days, is_expiring } = subscription;
    return computed_status === 'grace_period' || 
           computed_status === 'past_due' || 
           is_expiring ||
           (remaining_days !== null && remaining_days <= 7);
  }, []);

  return {
    loading,
    getSubscriptionDetails,
    listAllSubscriptions,
    createSubscription,
    renewSubscription,
    scheduleDowngrade,
    applyImmediateDowngrade,
    fetchAllPrices,
    formatRemainingTime,
    isWarningState,
    PERIOD_LABELS,
    STATUS_LABELS,
  };
}
