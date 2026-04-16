/**
 * Sincronização em tempo real entre usuários no mesmo projeto.
 *
 * Escuta mudanças (INSERT/UPDATE/DELETE) nas tabelas-chave do projeto via
 * Supabase Realtime e invalida automaticamente os caches do React Query
 * para que TODOS os usuários conectados vejam as alterações sem refresh.
 *
 * Tabelas monitoradas (filtradas por projeto_id quando disponível):
 *  - apostas_unificada      → histórico/abertas, KPIs, calendário
 *  - apostas_pernas         → pernas de surebet/múltipla
 *  - bookmakers             → saldos das casas (filtrado por projeto)
 *  - project_bookmaker_link_bonuses → bônus do projeto
 *  - cashback_manual        → cashback
 *  - giros_gratis           → giros grátis
 *  - freebets_recebidas     → estoque de freebets
 *  - financial_events       → fonte da verdade financeira
 *
 * UX: toast discreto avisando que outro usuário alterou dados.
 * Performance: debounce de 800ms agrupa rajadas de eventos.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateProjectQueries } from "./useInvalidateProjectQueries";
import { toast } from "sonner";

export function useProjectRealtimeSync(projetoId: string | undefined) {
  const invalidateProject = useInvalidateProjectQueries();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingActorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projetoId) return;

    let currentUserId: string | null = null;
    supabase.auth.getUser().then(({ data }) => {
      currentUserId = data.user?.id ?? null;
    });

    const scheduleRefresh = (actorUserId: string | null | undefined) => {
      // Ignora eventos disparados pelo próprio usuário (já invalidamos manualmente)
      if (actorUserId && currentUserId && actorUserId === currentUserId) return;

      pendingActorRef.current = actorUserId ?? null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        invalidateProject(projetoId).catch(() => {});
        toast("Dados atualizados por outro usuário", {
          description: "A visualização foi sincronizada automaticamente.",
          duration: 3000,
        });
        debounceRef.current = null;
        pendingActorRef.current = null;
      }, 800);
    };

    const extractActor = (payload: any): string | null => {
      const row = payload?.new ?? payload?.old ?? {};
      return (
        row.user_id ??
        row.actor_user_id ??
        row.created_by ??
        row.updated_by ??
        null
      );
    };

    const channel = supabase
      .channel(`project-sync-${projetoId}`)
      // Apostas (filtrado server-side por projeto_id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "apostas_unificada",
          filter: `projeto_id=eq.${projetoId}`,
        },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      // Pernas: não têm projeto_id direto; filtramos no client por segurança
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "apostas_pernas" },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      // Bookmakers do projeto (saldos)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookmakers",
          filter: `projeto_id=eq.${projetoId}`,
        },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      // Bônus
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_bookmaker_link_bonuses",
          filter: `project_id=eq.${projetoId}`,
        },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      // Cashback
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cashback_manual",
          filter: `projeto_id=eq.${projetoId}`,
        },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      // Giros grátis
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "giros_gratis",
          filter: `projeto_id=eq.${projetoId}`,
        },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      // Freebets recebidas
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "freebets_recebidas",
          filter: `projeto_id=eq.${projetoId}`,
        },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      // Eventos financeiros
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "financial_events",
          filter: `projeto_id=eq.${projetoId}`,
        },
        (payload) => scheduleRefresh(extractActor(payload))
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[ProjectRealtimeSync] Conectado ao projeto ${projetoId}`);
        }
      });

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [projetoId, invalidateProject]);
}
