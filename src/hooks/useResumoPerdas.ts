import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PerdaBreakdownItem {
  categoria: "PERDA_ATIVO" | "PERDA_SCAN" | "PERDA_CAMBIAL";
  total_usd: number;
  count: number;
}

export interface ResumoPerdas {
  total_usd: number;
  total_count: number;
  breakdown: PerdaBreakdownItem[];
}

const EMPTY: ResumoPerdas = { total_usd: 0, total_count: 0, breakdown: [] };

/**
 * Consolida perdas do workspace por categoria:
 *  - PERDA_ATIVO      (ativos perdidos em trânsito / envios incorretos)
 *  - PERDA_SCAN       (limitação, bloqueio — PERDA_OPERACIONAL no ledger)
 *  - PERDA_CAMBIAL    (diferenças cambiais realizadas)
 */
export function useResumoPerdas(workspaceId: string | null | undefined, start?: Date, end?: Date) {
  const [data, setData] = useState<ResumoPerdas>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: res, error: err } = await supabase.rpc("get_resumo_perdas", {
        p_workspace_id: workspaceId,
        p_start: start ? start.toISOString() : null,
        p_end: end ? end.toISOString() : null,
      });
      if (cancelled) return;
      if (err) {
        console.error("[useResumoPerdas] Falha ao consolidar perdas:", err.message);
        setError(err.message);
        setData(EMPTY);
      } else {
        setData((res as unknown as ResumoPerdas) ?? EMPTY);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, start?.getTime(), end?.getTime()]);

  return { data, loading, error };
}
