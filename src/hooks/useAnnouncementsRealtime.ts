import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { createElement } from "react";

type IncomingRow = {
  id: string;
  title: string;
  priority: "baixa" | "normal" | "alta" | "critica";
  status: string;
  author_id: string;
  workspace_id: string;
};

/**
 * Escuta inserts de comunicados do workspace em realtime.
 * - Invalida cache de announcements imediatamente.
 * - Coalesce toasts: se >1 comunicado chega em 30s, mostra um único
 *   toast agregado. Autor não recebe toast do próprio comunicado.
 * - Nunca dispara toast para prioridade "critica" (o modal de ack cuida).
 */
export function useAnnouncementsRealtime() {
  const qc = useQueryClient();
  const { user, workspaceId } = useAuth();
  const bufferRef = useRef<IncomingRow[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workspaceId || !user?.id) return;

    const flushToast = () => {
      const items = bufferRef.current;
      bufferRef.current = [];
      timerRef.current = null;
      const toasted = items.filter((i) => i.priority !== "critica");
      if (toasted.length === 0) return;
      if (toasted.length === 1) {
        const t = toasted[0];
        toast(t.title, {
          description: "Novo comunicado publicado",
          icon: createElement(Megaphone, { className: "h-4 w-4" }),
          duration: 6000,
          action: {
            label: "Abrir",
            onClick: () => (window.location.href = "/comunicados"),
          },
        });
      } else {
        toast(`${toasted.length} novos comunicados publicados`, {
          icon: createElement(Megaphone, { className: "h-4 w-4" }),
          duration: 6000,
          action: {
            label: "Ver",
            onClick: () => (window.location.href = "/comunicados"),
          },
        });
      }
    };

    const channel = supabase
      .channel(`workspace-announcements-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workspace_announcements",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = payload.new as IncomingRow;
          qc.invalidateQueries({ queryKey: ["announcements", workspaceId] });
          // Autor não recebe toast do próprio comunicado
          if (row.author_id === user.id) return;
          if (row.status !== "publicado") return;
          bufferRef.current.push(row);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(flushToast, 30_000);
          // Primeira mensagem sai rápido (2s) para não parecer travado;
          // o buffer segue coalescendo os próximos 30s.
          if (bufferRef.current.length === 1) {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(flushToast, 2_000);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "workspace_announcements",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["announcements", workspaceId] }),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "workspace_announcements",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["announcements", workspaceId] }),
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user?.id, qc]);
}