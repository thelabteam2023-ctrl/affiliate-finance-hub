import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PublicPlanPrice {
  id: string;
  period: 'monthly' | 'yearly' | 'lifetime';
  currency: string;
  amount: number;
}

export interface PublicPlanEntitlements {
  max_partners: number | null;
  max_users: number | null;
  custom_permissions: boolean;
  max_custom_permissions: number | null;
  personalized_support: boolean;
}

export interface PublicPlan {
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  entitlements: PublicPlanEntitlements;
  prices: PublicPlanPrice[];
}

export function usePublicPlans() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_public_plans');
      
      if (rpcError) throw rpcError;
      
      setPlans((data as unknown as PublicPlan[]) || []);
    } catch (err: any) {
      console.error('Error fetching public plans:', err);
      setError(err.message);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const getPrice = (planCode: string, period: 'monthly' | 'yearly' = 'monthly', currency: string = 'BRL') => {
    const plan = plans.find(p => p.code === planCode);
    if (!plan) return null;
    
    const price = plan.prices.find(p => p.period === period && p.currency === currency);
    return price?.amount ?? null;
  };

  const getMonthlyPrice = (planCode: string) => getPrice(planCode, 'monthly', 'BRL');

  return {
    loading,
    plans,
    error,
    fetchPlans,
    getPrice,
    getMonthlyPrice,
  };
}
