import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'active' | 'hidden' | 'legacy';
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlanEntitlement {
  id: string;
  plan_id: string;
  max_active_partners: number | null;
  max_users: number | null;
  custom_permissions_enabled: boolean;
  max_custom_permissions: number | null;
  personalized_support: boolean;
  extra_features: unknown;
  created_at: string;
  updated_at: string;
}

export interface PlanPrice {
  id: string;
  plan_id: string;
  billing_period: 'monthly' | 'yearly' | 'lifetime';
  currency: string;
  amount: number;
  is_active: boolean;
  provider: string | null;
  provider_price_id: string | null;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanWithDetails extends Plan {
  entitlements: PlanEntitlement | null;
  prices: PlanPrice[];
}

export function usePlansAdmin() {
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanWithDetails[]>([]);
  const { toast } = useToast();

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch plans
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .order('display_order');

      if (plansError) throw plansError;

      // Fetch entitlements
      const { data: entitlementsData, error: entError } = await supabase
        .from('plan_entitlements')
        .select('*');

      if (entError) throw entError;

      // Fetch prices
      const { data: pricesData, error: pricesError } = await supabase
        .from('plan_prices')
        .select('*')
        .order('billing_period');

      if (pricesError) throw pricesError;

      // Combine data
      const plansWithDetails = (plansData || []).map(plan => ({
        ...plan,
        status: plan.status as 'active' | 'hidden' | 'legacy',
        entitlements: entitlementsData?.find(e => e.plan_id === plan.id) || null,
        prices: pricesData?.filter(p => p.plan_id === plan.id) || [],
      })) as PlanWithDetails[];

      setPlans(plansWithDetails);
    } catch (error: any) {
      console.error('Error fetching plans:', error);
      toast({
        title: 'Erro ao carregar planos',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const updatePlan = useCallback(async (
    planId: string,
    updates: Partial<Pick<Plan, 'name' | 'description' | 'status' | 'display_order'>>
  ) => {
    try {
      const { error } = await supabase
        .from('plans')
        .update(updates)
        .eq('id', planId);

      if (error) throw error;

      toast({ title: 'Plano atualizado com sucesso' });
      fetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar plano',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast, fetchPlans]);

  const updateEntitlements = useCallback(async (
    planId: string,
    updates: {
      max_active_partners?: number | null;
      max_users?: number | null;
      custom_permissions_enabled?: boolean;
      max_custom_permissions?: number | null;
      personalized_support?: boolean;
    }
  ) => {
    try {
      const { error } = await supabase
        .from('plan_entitlements')
        .update(updates)
        .eq('plan_id', planId);

      if (error) throw error;

      toast({ title: 'Limites atualizados com sucesso' });
      fetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar limites',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast, fetchPlans]);

  const updatePrice = useCallback(async (
    priceId: string,
    updates: Partial<Pick<PlanPrice, 'amount' | 'is_active' | 'provider' | 'provider_price_id'>>
  ) => {
    try {
      const { error } = await supabase
        .from('plan_prices')
        .update(updates)
        .eq('id', priceId);

      if (error) throw error;

      toast({ title: 'Preço atualizado com sucesso' });
      fetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar preço',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast, fetchPlans]);

  const createPrice = useCallback(async (
    planId: string,
    price: Pick<PlanPrice, 'billing_period' | 'currency' | 'amount'>
  ) => {
    try {
      const { error } = await supabase
        .from('plan_prices')
        .insert({
          plan_id: planId,
          billing_period: price.billing_period,
          currency: price.currency,
          amount: price.amount,
          is_active: true,
        });

      if (error) throw error;

      toast({ title: 'Preço criado com sucesso' });
      fetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar preço',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast, fetchPlans]);

  return {
    loading,
    plans,
    fetchPlans,
    updatePlan,
    updateEntitlements,
    updatePrice,
    createPrice,
  };
}
