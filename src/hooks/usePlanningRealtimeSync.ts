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

    const scheduleRefresh = () => {
      // Debounce para evitar múltiplas invalidações em rajadas de eventos
      if (debounceRef.current) clearTimeout(debounceRef.current);
      
      debounceRef.current = setTimeout(() => {
        console.log("[PlanningRealtimeSync] Mudança detectada no workspace, invalidando queries...");
        
        // Invalida as queries principais do planejamento
        // Usamos refetchType: 'active' para não forçar refetch de tudo se não estiver visível
        qc.invalidateQueries({ queryKey: ["planning-campanhas"], refetchType: 'active' });
        qc.invalidateQueries({ queryKey: ["plano-celulas-agendadas"], refetchType: 'active' });
        qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"], refetchType: 'active' });

        // Opcional: só mostrar toast se não for o autor (mas não temos updated_by fácil)
        // Por enquanto, vamos omitir o toast para evitar redundância para o próprio usuário
        // ou deixar um toast bem discreto se for realmente necessário.
        
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
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "distribuicao_plano_celulas",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => scheduleRefresh()
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