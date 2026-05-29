import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LabStats = {
  kpis: {
    total_bets: number;
    volume: number;
    profit: number;
    roi: number;
    win_rate: number;
  };
  markets: Array<{
    mercado_grupo: string;
    count: number;
    profit: number;
  }>;
  odds: Array<{
    faixa_odd: string;
    count: number;
    profit: number;
  }>;
  evolution: Array<{
    date: string;
    daily_profit: number;
  }>;
};

export function useLaboratorioValueBet(projectIds: string[] | null, startDate: string | null, endDate: string | null) {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ["laboratorio-valuebet", projectIds, startDate, endDate, workspaceId],
    queryFn: async () => {
      const startTime = performance.now();
      
      const { data, error } = await supabase.rpc("get_valuebet_lab_stats", {
        p_project_ids: projectIds && projectIds.length > 0 ? projectIds : null,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      if (error) {
        console.error("[useLaboratorioValueBet] RPC Error:", error);
        throw error;
      }

      const stats = data as LabStats;

      return {
        ...stats,
        _metadata: {
          fetch_duration_ms: duration,
          timestamp: new Date().toISOString()
        }
      } as LabStats & { _metadata: { fetch_duration_ms: number; timestamp: string } };
    },
    enabled: !!workspaceId,
    retry: 1,
  });
}
