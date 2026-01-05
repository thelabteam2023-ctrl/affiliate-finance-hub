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
  logout_at: string | null;
  is_active: boolean;
  session_status: 'active' | 'closed' | 'expired';
  last_login_global: string | null;  // Último login GLOBAL do usuário
}

interface LoginStats {
  today_logins: number;
  week_logins: number;
  month_logins: number;
  unique_users_today: number;
  unique_users_week: number;
}

interface InactiveUser {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  last_login: string;
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
  const [inactiveUsers, setInactiveUsers] = useState<InactiveUser[]>([]);

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
      
      // Map data to include new session fields with defaults for backwards compatibility
      const mappedData: LoginRecord[] = (data || []).map((record: any) => ({
        id: record.id,
        user_id: record.user_id,
        user_email: record.user_email,
        user_name: record.user_name,
        workspace_id: record.workspace_id,
        workspace_name: record.workspace_name,
        ip_address: record.ip_address,
        user_agent: record.user_agent,
        login_at: record.login_at,
        logout_at: record.logout_at || null,
        is_active: record.is_active ?? false,
        session_status: record.session_status || 'closed',
        last_login_global: record.last_login_global || null,  // NOVO: último login global
      }));
      
      setHistory(mappedData);
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

  const fetchInactiveUsers = useCallback(async (daysInactive: number = 5) => {
    try {
      // Query to get users who haven't logged in for X days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

      const { data, error } = await supabase
        .from('login_history')
        .select('user_id, user_email, user_name, login_at')
        .order('login_at', { ascending: false });

      if (error) throw error;

      // Group by user and get the most recent login for each
      const userLastLogin = new Map<string, InactiveUser>();
      
      (data || []).forEach((record) => {
        if (!userLastLogin.has(record.user_id)) {
          userLastLogin.set(record.user_id, {
            user_id: record.user_id,
            user_email: record.user_email,
            user_name: record.user_name,
            last_login: record.login_at,
          });
        }
      });

      // Filter users whose last login was before the cutoff date
      const inactive = Array.from(userLastLogin.values()).filter(user => {
        const lastLoginDate = new Date(user.last_login);
        return lastLoginDate < cutoffDate;
      });

      // Sort by last login (oldest first)
      inactive.sort((a, b) => 
        new Date(a.last_login).getTime() - new Date(b.last_login).getTime()
      );

      setInactiveUsers(inactive);
    } catch (error: any) {
      console.error('Error fetching inactive users:', error);
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
    fetchInactiveUsers(5);
  }, [fetchHistory, fetchStats, fetchInactiveUsers]);

  return {
    loading,
    history,
    stats,
    inactiveUsers,
    fetchHistory,
    fetchStats,
    fetchInactiveUsers,
    recordLogin,
  };
}
