import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WithdrawalLeadTime {
  bookmaker_catalogo_id: string;
  avg_days: number;
  total_saques: number;
  min_days: number;
  max_days: number;
}

/**
 * Fetches average withdrawal lead time per bookmaker CATALOG entry.
 * Aggregates ALL withdrawals across ALL users/instances in the workspace.
 * Uses SECURITY INVOKER function — scoped by RLS (workspace isolation).
 */
export function useWithdrawalLeadTime(catalogoIds: string[]) {
  const [leadTimes, setLeadTimes] = useState<Record<string, WithdrawalLeadTime>>({});
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!catalogoIds.length) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_bookmaker_withdrawal_lead_times", {
        _bookmaker_catalogo_ids: catalogoIds,
      });
      if (error) throw error;

      const map: Record<string, WithdrawalLeadTime> = {};
      (data || []).forEach((row: any) => {
        map[row.bookmaker_catalogo_id] = {
          bookmaker_catalogo_id: row.bookmaker_catalogo_id,
          avg_days: Number(row.avg_days),
          total_saques: Number(row.total_saques),
          min_days: Number(row.min_days),
          max_days: Number(row.max_days),
        };
      });
      setLeadTimes(map);
    } catch (err) {
      console.error("Error fetching withdrawal lead times:", err);
    } finally {
      setLoading(false);
    }
  }, [catalogoIds.join(",")]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { leadTimes, loading, refetch: fetch };
}

/**
 * Formats days as descriptive text: "~3 dias", "~1 dia", "<1 dia"
 */
export function formatLeadTimeDays(days: number): string {
  if (days < 1) return "<1 dia";
  const rounded = Math.round(days);
  return `~${rounded} ${rounded === 1 ? "dia" : "dias"}`;
}
