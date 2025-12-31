import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseOpenOperationsCountOptions {
  projetoId: string;
  estrategia?: string;
  refreshTrigger?: number;
}

/**
 * Hook to count open operations (status = PENDENTE) for a project/strategy
 * This is the single source of truth for operation badges across the system
 */
export function useOpenOperationsCount({ 
  projetoId, 
  estrategia,
  refreshTrigger 
}: UseOpenOperationsCountOptions) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!projetoId) {
      setCount(0);
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from("apostas_unificada")
        .select("*", { count: "exact", head: true })
        .eq("projeto_id", projetoId)
        .eq("status", "PENDENTE")
        .is("cancelled_at", null);

      if (estrategia) {
        query = query.eq("estrategia", estrategia);
      }

      const { count: resultCount, error } = await query;

      if (error) {
        console.error("Error fetching open operations count:", error);
        setCount(0);
      } else {
        setCount(resultCount || 0);
      }
    } catch (error) {
      console.error("Error fetching open operations count:", error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [projetoId, estrategia]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount, refreshTrigger]);

  // Subscribe to realtime updates for immediate badge refresh
  useEffect(() => {
    if (!projetoId) return;

    const channel = supabase
      .channel(`open-ops-${projetoId}-${estrategia || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "apostas_unificada",
          filter: `projeto_id=eq.${projetoId}`,
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projetoId, estrategia, fetchCount]);

  return { count, loading, refetch: fetchCount };
}
