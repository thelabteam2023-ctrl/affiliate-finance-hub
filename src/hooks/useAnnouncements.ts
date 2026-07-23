import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type AnnouncementPriority = "baixa" | "normal" | "alta" | "critica";
export type AnnouncementCategory =
  | "operacao" | "regras" | "produto" | "manutencao" | "programacao" | "orientacao" | "geral";
export type AnnouncementStatus = "rascunho" | "agendado" | "publicado" | "expirado" | "arquivado";

export interface Announcement {
  id: string;
  workspace_id: string;
  author_id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  is_pinned: boolean;
  publish_at: string;
  expires_at: string | null;
  allow_reactions: boolean;
  allow_comments: boolean;
  require_read_receipt: boolean;
  audience_roles: string[];
  created_at: string;
  updated_at: string;
  is_read?: boolean;
  reactions_count?: number;
  reads_count?: number;
}

export function useAnnouncements() {
  const { workspaceId, user } = useAuth();
  return useQuery({
    queryKey: ["announcements", workspaceId],
    enabled: !!workspaceId && !!user?.id,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from("workspace_announcements" as any)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .neq("status", "arquivado")
        .order("is_pinned", { ascending: false })
        .order("publish_at", { ascending: false });
      if (error) throw error;

      const list = (data ?? []) as unknown as Announcement[];
      if (list.length === 0) return [];

      const ids = list.map((a) => a.id);
      const { data: reads } = await supabase
        .from("workspace_announcement_reads" as any)
        .select("announcement_id")
        .eq("user_id", user!.id)
        .in("announcement_id", ids);
      const readSet = new Set(((reads ?? []) as any[]).map((r) => r.announcement_id));
      return list.map((a) => ({ ...a, is_read: readSet.has(a.id) }));
    },
    staleTime: 60_000,
  });
}

export function useUnreadAnnouncementsCount() {
  const { data } = useAnnouncements();
  return (data ?? []).filter((a) => !a.is_read && a.status === "publicado").length;
}

/**
 * Retorna comunicados de prioridade crítica que ainda não foram lidos
 * pelo usuário atual — usado pelo modal de acknowledge.
 */
export function useCriticalUnreadAnnouncements() {
  const { data } = useAnnouncements();
  return (data ?? []).filter(
    (a) => !a.is_read && a.status === "publicado" && a.priority === "critica",
  );
}

/**
 * Marca em lote todos os comunicados não lidos do workspace como lidos
 * para o usuário atual.
 */
export function useMarkAllAnnouncementsRead() {
  const qc = useQueryClient();
  const { user, workspaceId } = useAuth();
  const { data: announcements = [] } = useAnnouncements();
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const unread = announcements.filter((a) => !a.is_read);
      if (unread.length === 0) return;
      const rows = unread.map((a) => ({ announcement_id: a.id, user_id: user.id }));
      const { error } = await supabase
        .from("workspace_announcement_reads" as any)
        .upsert(rows, { onConflict: "announcement_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements", workspaceId] });
      toast.success("Comunicados marcados como lidos");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao marcar como lidos"),
  });
}

export function useMarkAnnouncementRead() {
  const qc = useQueryClient();
  const { user, workspaceId } = useAuth();
  return useMutation({
    mutationFn: async (announcementId: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("workspace_announcement_reads" as any)
        .upsert({ announcement_id: announcementId, user_id: user.id }, { onConflict: "announcement_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements", workspaceId] }),
  });
}

export interface AnnouncementInput {
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  is_pinned: boolean;
  publish_at?: string;
  expires_at?: string | null;
  allow_reactions: boolean;
  allow_comments: boolean;
  require_read_receipt: boolean;
  status?: AnnouncementStatus;
}

export function useSaveAnnouncement() {
  const qc = useQueryClient();
  const { user, workspaceId } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id?: string; input: AnnouncementInput }) => {
      if (!user?.id || !workspaceId) throw new Error("Sem workspace ativo");
      const row = {
        ...payload.input,
        workspace_id: workspaceId,
        author_id: user.id,
      };
      if (payload.id) {
        const { error } = await supabase
          .from("workspace_announcements" as any)
          .update(payload.input as any)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workspace_announcements" as any).insert(row as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements", workspaceId] });
      toast.success("Comunicado salvo");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar comunicado"),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  const { workspaceId } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_announcements" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements", workspaceId] });
      toast.success("Comunicado excluído");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  const { workspaceId } = useAuth();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from("workspace_announcements" as any)
        .update({ is_pinned: pinned } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements", workspaceId] }),
  });
}