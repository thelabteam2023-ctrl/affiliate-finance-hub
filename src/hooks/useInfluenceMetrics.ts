import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type PeriodType = 'weekly' | 'monthly' | 'yearly';

export interface InfluenceRanking {
  id: string;
  user_id: string;
  workspace_id: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  influence_score: number;
  topics_created: number;
  comments_made: number;
  chat_messages: number;
  reviews_made: number;
  total_interactions: number;
  rank_position: number;
  calculated_at: string;
  // Joined data
  user_email?: string;
  user_name?: string;
  workspace_name?: string;
}

export interface InfluenceConfig {
  weight_topic: number;
  weight_comment: number;
  weight_chat: number;
  weight_review: number;
}

export interface InfluenceEvent {
  id: string;
  user_id: string;
  workspace_id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface DailyMetric {
  id: string;
  user_id: string;
  workspace_id: string;
  metric_date: string;
  topics_created: number;
  comments_made: number;
  chat_messages: number;
  reviews_made: number;
  total_interactions: number;
}

export function useInfluenceMetrics() {
  const queryClient = useQueryClient();
  const [selectedPeriodType, setSelectedPeriodType] = useState<PeriodType>('weekly');

  // Fetch available periods for a given type
  const useAvailablePeriods = (periodType: PeriodType) => {
    return useQuery({
      queryKey: ['influence-periods', periodType],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('user_influence_ranking')
          .select('period_start, period_end')
          .eq('period_type', periodType)
          .order('period_start', { ascending: false })
          .limit(52); // Last 52 periods (1 year of weeks, or years)

        if (error) throw error;

        // Deduplicate periods
        const uniquePeriods = data?.reduce((acc: { period_start: string; period_end: string }[], curr) => {
          if (!acc.find(p => p.period_start === curr.period_start)) {
            acc.push({ period_start: curr.period_start, period_end: curr.period_end });
          }
          return acc;
        }, []) || [];

        return uniquePeriods;
      },
    });
  };

  // Fetch rankings for a specific period
  const useRankings = (periodType: PeriodType, periodStart?: string) => {
    return useQuery({
      queryKey: ['influence-rankings', periodType, periodStart],
      queryFn: async () => {
        let query = supabase
          .from('user_influence_ranking')
          .select('*')
          .eq('period_type', periodType)
          .order('rank_position', { ascending: true });

        if (periodStart) {
          query = query.eq('period_start', periodStart);
        } else {
          // Get latest period
          query = query.order('period_start', { ascending: false }).limit(100);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Filter to only latest period if no specific period requested
        if (!periodStart && data && data.length > 0) {
          const latestPeriod = data[0].period_start;
          return data.filter(r => r.period_start === latestPeriod) as InfluenceRanking[];
        }

        return (data || []) as InfluenceRanking[];
      },
    });
  };

  // Fetch configuration
  const useConfig = () => {
    return useQuery({
      queryKey: ['influence-config'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('user_influence_config')
          .select('*')
          .eq('config_key', 'global')
          .single();

        if (error) throw error;
        return data as InfluenceConfig & { id: string };
      },
    });
  };

  // Update configuration
  const updateConfig = useMutation({
    mutationFn: async (config: InfluenceConfig) => {
      const { error } = await supabase.rpc('update_influence_config', {
        p_weight_topic: config.weight_topic,
        p_weight_comment: config.weight_comment,
        p_weight_chat: config.weight_chat,
        p_weight_review: config.weight_review,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['influence-config'] });
      toast.success('Configuração atualizada');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  // Fetch recent events (for monitoring)
  const useRecentEvents = (limit = 50) => {
    return useQuery({
      queryKey: ['influence-events', limit],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('user_influence_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return (data || []) as InfluenceEvent[];
      },
    });
  };

  // Fetch daily metrics (for activity monitoring)
  const useDailyMetrics = (days = 30) => {
    return useQuery({
      queryKey: ['influence-daily', days],
      queryFn: async () => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const { data, error } = await supabase
          .from('user_influence_daily')
          .select('*')
          .gte('metric_date', startDate.toISOString().split('T')[0])
          .order('metric_date', { ascending: false });

        if (error) throw error;
        return (data || []) as DailyMetric[];
      },
    });
  };

  // Trigger manual aggregation
  const triggerAggregation = useCallback(async () => {
    try {
      toast.info('Executando agregação diária...');
      
      const { data, error } = await supabase.functions.invoke('aggregate-daily-influence');
      
      if (error) throw error;
      
      toast.success(`Agregação concluída: ${data.usersProcessed} usuários processados`);
      queryClient.invalidateQueries({ queryKey: ['influence-daily'] });
      queryClient.invalidateQueries({ queryKey: ['influence-events'] });
      
      return data;
    } catch (error: any) {
      toast.error(`Erro na agregação: ${error.message}`);
      throw error;
    }
  }, [queryClient]);

  // Trigger manual ranking calculation
  const triggerRanking = useCallback(async (periodType?: PeriodType) => {
    try {
      toast.info('Calculando rankings...');
      
      const { data, error } = await supabase.functions.invoke('calculate-influence-rankings', {
        body: periodType ? { periodType, forceRecalc: true } : { forceRecalc: true },
      });
      
      if (error) throw error;
      
      const totalUsers = data.results?.reduce((sum: number, r: any) => sum + r.usersRanked, 0) || 0;
      toast.success(`Rankings calculados: ${totalUsers} usuários rankeados`);
      queryClient.invalidateQueries({ queryKey: ['influence-rankings'] });
      queryClient.invalidateQueries({ queryKey: ['influence-periods'] });
      
      return data;
    } catch (error: any) {
      toast.error(`Erro no cálculo: ${error.message}`);
      throw error;
    }
  }, [queryClient]);

  // Get stats summary
  const useStatsSummary = () => {
    return useQuery({
      queryKey: ['influence-stats-summary'],
      queryFn: async () => {
        // Get total events count
        const { count: eventsCount } = await supabase
          .from('user_influence_events')
          .select('*', { count: 'exact', head: true });

        // Get total daily records
        const { count: dailyCount } = await supabase
          .from('user_influence_daily')
          .select('*', { count: 'exact', head: true });

        // Get total rankings
        const { count: rankingsCount } = await supabase
          .from('user_influence_ranking')
          .select('*', { count: 'exact', head: true });

        // Get unique users with activity
        const { data: uniqueUsers } = await supabase
          .from('user_influence_daily')
          .select('user_id')
          .limit(1000);

        const uniqueUserCount = new Set(uniqueUsers?.map(u => u.user_id)).size;

        return {
          totalEvents: eventsCount || 0,
          totalDailyRecords: dailyCount || 0,
          totalRankings: rankingsCount || 0,
          uniqueActiveUsers: uniqueUserCount,
        };
      },
    });
  };

  return {
    selectedPeriodType,
    setSelectedPeriodType,
    useAvailablePeriods,
    useRankings,
    useConfig,
    updateConfig,
    useRecentEvents,
    useDailyMetrics,
    useStatsSummary,
    triggerAggregation,
    triggerRanking,
  };
}
