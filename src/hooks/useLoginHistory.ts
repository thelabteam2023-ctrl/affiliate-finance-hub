import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LoginRecord {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  login_at: string;
}

interface LoginStats {
  today_logins: number;
  week_logins: number;
  month_logins: number;
  unique_users_today: number;
  unique_users_week: number;
}

interface UseLoginHistoryParams {
  workspaceId?: string | null;
  userId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  limit?: number;
}

export function useLoginHistory(params: UseLoginHistoryParams = {}) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<LoginRecord[]>([]);
  const [stats, setStats] = useState<LoginStats | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_login_history', {
        _limit: params.limit || 100,
        _offset: 0,
        _workspace_id: params.workspaceId || null,
        _user_id: params.userId || null,
        _start_date: params.startDate?.toISOString() || null,
        _end_date: params.endDate?.toISOString() || null,
      });

      if (error) throw error;
      setHistory(data || []);
    } catch (error: any) {
      console.error('Error fetching login history:', error);
      toast.error('Erro ao carregar histórico de logins');
    } finally {
      setLoading(false);
    }
  }, [params.workspaceId, params.userId, params.startDate, params.endDate, params.limit]);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_login_stats');
      if (error) throw error;
      if (data && data.length > 0) {
        setStats({
          today_logins: Number(data[0].today_logins) || 0,
          week_logins: Number(data[0].week_logins) || 0,
          month_logins: Number(data[0].month_logins) || 0,
          unique_users_today: Number(data[0].unique_users_today) || 0,
          unique_users_week: Number(data[0].unique_users_week) || 0,
        });
      }
    } catch (error: any) {
      console.error('Error fetching login stats:', error);
    }
  }, []);

  const recordLogin = useCallback(async (userId: string, email: string, name: string, workspaceId?: string, workspaceName?: string) => {
    try {
      await supabase.from('login_history').insert({
        user_id: userId,
        user_email: email,
        user_name: name,
        workspace_id: workspaceId || null,
        workspace_name: workspaceName || null,
      });
    } catch (error) {
      console.error('Error recording login:', error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchStats();
  }, [fetchHistory, fetchStats]);

  return {
    loading,
    history,
    stats,
    fetchHistory,
    fetchStats,
    recordLogin,
  };
}
