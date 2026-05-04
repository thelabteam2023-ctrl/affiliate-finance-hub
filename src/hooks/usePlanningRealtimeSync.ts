import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

/**
 * Hook para sincronização em tempo real do Planejamento.
 * Escuta mudanças na tabela planning_campanhas e distribuicao_plano_celulas
 * e invalida os caches do React Query para todos os usuários do mesmo workspace.
 */
export function usePlanningRealtimeSync() {
  const { workspaceId, user } = useAuth();
  const qc = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workspaceId || !user) return;

    const scheduleRefresh = (payload: any) => {
      // Identifica quem causou a mudança para evitar refreshes desnecessários no próprio autor
      const row = payload.new || payload.old || {};
      const actorId = row.updated_by || row.created_by || row.user_id;
      
      if (actorId === user.id) return;

      // Debounce para evitar múltiplas invalidações em rajadas de eventos
      if (debounceRef.current) clearTimeout(debounceRef.current);
      
      debounceRef.current = setTimeout(() => {
        console.log("[PlanningRealtimeSync] Mudança detectada, invalidando queries...");
        
        // Invalida as queries principais do planejamento
        qc.invalidateQueries({ queryKey: ["planning-campanhas"] });
        qc.invalidateQueries({ queryKey: ["plano-celulas-agendadas"] });
        qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });

        toast("Planejamento atualizado", {
          description: "Dados sincronizados com outros usuários.",
          duration: 3000,
        });
        
        debounceRef.current = null;
      }, 1000);
    };

    // Configura o canal de tempo real filtrado pelo workspace_id
    const channel = supabase
      .channel(`planning-sync-${workspaceId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "planning_campanhas",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: any) => scheduleRefresh(payload)
      )
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "distribuicao_plano_celulas",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: any) => scheduleRefresh(payload)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[PlanningRealtimeSync] Inscrito no workspace ${workspaceId}`);
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user?.id, qc]);
}