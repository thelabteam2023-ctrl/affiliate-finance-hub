import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BillingKpis {
  mrr: number;
  arr_estimated: number;
  month_revenue: number;
  new_subscriptions: number;
  cancellations: number;
  refunds: number;
  avg_ticket: number;
  total_sales: number;
  total_revenue: number;
}

export interface SaleEvent {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  price_id: string | null;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'refunded' | 'canceled';
  source: 'landing' | 'referral' | 'manual' | 'upgrade' | 'downgrade';
  customer_email: string | null;
  customer_name: string | null;
  provider: string | null;
  provider_event_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DailyRevenue {
  date: string;
  revenue: number;
  sales_count: number;
}

export interface RevenueByPlan {
  plan_code: string;
  plan_name: string;
  revenue: number;
  sales_count: number;
}

export function useBillingAdmin() {
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<BillingKpis | null>(null);
  const [sales, setSales] = useState<SaleEvent[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [revenueByPlan, setRevenueByPlan] = useState<RevenueByPlan[]>([]);
  const { toast } = useToast();

  const fetchKpis = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_billing_kpis');
      if (error) throw error;
      setKpis(data as unknown as BillingKpis);
    } catch (error: any) {
      console.error('Error fetching KPIs:', error);
      // Set default values if function fails (no sales yet)
      setKpis({
        mrr: 0,
        arr_estimated: 0,
        month_revenue: 0,
        new_subscriptions: 0,
        cancellations: 0,
        refunds: 0,
        avg_ticket: 0,
        total_sales: 0,
        total_revenue: 0,
      });
    }
  }, []);

  const fetchSales = useCallback(async (filters?: {
    from_date?: string;
    to_date?: string;
    status?: string;
    plan_code?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_sales', {
        _from_date: filters?.from_date || null,
        _to_date: filters?.to_date || null,
        _status: filters?.status || null,
        _plan_code: filters?.plan_code || null,
        _limit: 100,
        _offset: 0,
      });

      if (error) throw error;
      setSales((data as SaleEvent[]) || []);
    } catch (error: any) {
      console.error('Error fetching sales:', error);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDailyRevenue = useCallback(async (days: number = 30) => {
    try {
      const { data, error } = await supabase.rpc('admin_get_daily_revenue', {
        _days: days,
      });

      if (error) throw error;
      setDailyRevenue((data as DailyRevenue[]) || []);
    } catch (error: any) {
      console.error('Error fetching daily revenue:', error);
      setDailyRevenue([]);
    }
  }, []);

  const fetchRevenueByPlan = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_revenue_by_plan');

      if (error) throw error;
      setRevenueByPlan((data as RevenueByPlan[]) || []);
    } catch (error: any) {
      console.error('Error fetching revenue by plan:', error);
      setRevenueByPlan([]);
    }
  }, []);

  const createSale = useCallback(async (sale: {
    plan_code: string;
    amount: number;
    currency?: string;
    status?: string;
    source?: string;
    customer_email?: string;
    customer_name?: string;
    workspace_id?: string;
  }) => {
    try {
      const { data, error } = await supabase.rpc('admin_create_sale', {
        _plan_code: sale.plan_code,
        _amount: sale.amount,
        _currency: sale.currency || 'BRL',
        _status: sale.status || 'paid',
        _source: sale.source || 'manual',
        _customer_email: sale.customer_email || null,
        _customer_name: sale.customer_name || null,
        _workspace_id: sale.workspace_id || null,
        _metadata: {},
      });

      if (error) throw error;

      toast({ title: 'Venda registrada com sucesso' });
      return data;
    } catch (error: any) {
      toast({
        title: 'Erro ao registrar venda',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const updateSaleStatus = useCallback(async (saleId: string, newStatus: string) => {
    try {
      const { error } = await supabase.rpc('admin_update_sale_status', {
        _sale_id: saleId,
        _new_status: newStatus,
      });

      if (error) throw error;

      toast({ title: 'Status atualizado com sucesso' });
      fetchSales();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast, fetchSales]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchKpis(),
      fetchSales(),
      fetchDailyRevenue(),
      fetchRevenueByPlan(),
    ]);
    setLoading(false);
  }, [fetchKpis, fetchSales, fetchDailyRevenue, fetchRevenueByPlan]);

  return {
    loading,
    kpis,
    sales,
    dailyRevenue,
    revenueByPlan,
    fetchKpis,
    fetchSales,
    fetchDailyRevenue,
    fetchRevenueByPlan,
    fetchAll,
    createSale,
    updateSaleStatus,
  };
}
