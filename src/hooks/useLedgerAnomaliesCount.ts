import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Conta anomalias de paridade do ledger ainda não reconhecidas no workspace atual.
 * Atualiza a cada 60s. Retorna 0 enquanto carrega ou em caso de erro.
 */
export function useLedgerAnomaliesCount(): number {
  const { workspaceId } = useWorkspace();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!workspaceId) {
      setCount(0);
      return;
    }
    let cancelled = false;

    const fetchCount = async () => {
      const { count: n, error } = await (supabase as any)
        .from("ledger_parity_anomalies")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("acknowledged_at", null);
      if (!cancelled && !error) setCount(n ?? 0);
    };

    fetchCount();
    const id = window.setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [workspaceId]);

  return count;
}