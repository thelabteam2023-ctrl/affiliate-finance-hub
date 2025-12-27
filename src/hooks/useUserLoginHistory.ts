import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LoginRecord {
  id: string;
  login_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export function useUserLoginHistory() {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Record<string, LoginRecord[]>>({});

  const fetchUserHistory = useCallback(async (userId: string) => {
    // If already loaded, don't fetch again
    if (history[userId]) return history[userId];

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('login_history')
        .select('id, login_at, ip_address, user_agent')
        .eq('user_id', userId)
        .order('login_at', { ascending: false })
        .limit(8);

      if (error) throw error;

      const records = data || [];
      setHistory(prev => ({ ...prev, [userId]: records }));
      return records;
    } catch (error) {
      console.error('Error fetching user login history:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [history]);

  const getUserHistory = useCallback((userId: string): LoginRecord[] | undefined => {
    return history[userId];
  }, [history]);

  return {
    loading,
    fetchUserHistory,
    getUserHistory,
  };
}
