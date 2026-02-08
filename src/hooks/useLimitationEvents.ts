import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────
export type LimitationType = "stake_limit" | "odds_limit" | "market_block" | "full_limit" | "unknown";
export type LimitationBucket = "early" | "mid" | "late";
export type StrategicProfile = "early_limiter" | "mid_limiter" | "late_limiter" | "low_risk";

export interface LimitationEvent {
  id: string;
  bookmaker_id: string;
  projeto_id: string;
  user_id: string;
  workspace_id: string;
  event_timestamp: string;
  total_bets_before_limitation: number;
  project_bets_before_limitation: number;
  limitation_type: LimitationType;
  limitation_bucket: LimitationBucket;
  observacoes: string | null;
  created_at: string;
  // Joined fields
  bookmaker_nome?: string;
  logo_url?: string | null;
}

export interface LimitationStats {
  workspace_id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  logo_url: string | null;
  projeto_id: string;
  projeto_nome: string;
  total_events: number;
  avg_bets_before_limitation: number;
  early_count: number;
  mid_count: number;
  late_count: number;
  early_pct: number;
  mid_pct: number;
  late_pct: number;
  most_common_type: LimitationType;
  last_limitation_at: string;
  strategic_profile: StrategicProfile;
}

export interface CreateLimitationEventInput {
  bookmaker_id: string;
  projeto_id: string;
  limitation_type: LimitationType;
  observacoes?: string;
}

// ─── Labels & Config ─────────────────────────────────────────────────
export const LIMITATION_TYPE_LABELS: Record<LimitationType, string> = {
  stake_limit: "Limite de Stake",
  odds_limit: "Restrição de Odds",
  market_block: "Bloqueio de Mercados",
  full_limit: "Limitação Total",
  unknown: "Desconhecido",
};

export const STRATEGIC_PROFILE_CONFIG: Record<StrategicProfile, { label: string; color: string; bgColor: string; description: string }> = {
  early_limiter: {
    label: "Early Limiter",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    description: "Limita em até 5 apostas",
  },
  mid_limiter: {
    label: "Mid Limiter",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    description: "Limita entre 6-10 apostas",
  },
  late_limiter: {
    label: "Late Limiter",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    description: "Limita após 10+ apostas",
  },
  low_risk: {
    label: "Low Risk",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    description: "Baixa taxa de limitação",
  },
};

export const BUCKET_LABELS: Record<LimitationBucket, string> = {
  early: "1-5 apostas",
  mid: "6-10 apostas",
  late: "10+ apostas",
};

// ─── Hook: Limitation Events for a Project ───────────────────────────
export function useLimitationEvents(projetoId: string) {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  // Fetch events
  const eventsQuery = useQuery({
    queryKey: ["limitation-events", projetoId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from("limitation_events")
        .select(`
          *,
          bookmakers!inner(nome, bookmaker_catalogo_id, bookmakers_catalogo(logo_url))
        `)
        .eq("projeto_id", projetoId)
        .eq("workspace_id", workspaceId)
        .order("event_timestamp", { ascending: false });

      if (error) throw error;

      return (data || []).map((e: any) => ({
        ...e,
        bookmaker_nome: e.bookmakers?.nome,
        logo_url: e.bookmakers?.bookmakers_catalogo?.logo_url || null,
      })) as LimitationEvent[];
    },
    enabled: !!projetoId && !!workspaceId,
  });

  // Fetch aggregated stats from view
  const statsQuery = useQuery({
    queryKey: ["limitation-stats", projetoId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from("v_limitation_stats")
        .select("*")
        .eq("projeto_id", projetoId)
        .eq("workspace_id", workspaceId);

      if (error) throw error;
      return (data || []) as LimitationStats[];
    },
    enabled: !!projetoId && !!workspaceId,
  });

  // Create event mutation
  const createEvent = useMutation({
    mutationFn: async (input: CreateLimitationEventInput) => {
      if (!workspaceId) throw new Error("Workspace não encontrado");

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      // Count total bets for this bookmaker in the workspace
      const { count: totalBets } = await supabase
        .from("apostas_unificada")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", input.bookmaker_id)
        .eq("workspace_id", workspaceId);

      // Count bets in this specific project
      const { count: projectBets } = await supabase
        .from("apostas_unificada")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", input.bookmaker_id)
        .eq("projeto_id", input.projeto_id);

      const { data, error } = await supabase
        .from("limitation_events")
        .insert({
          bookmaker_id: input.bookmaker_id,
          projeto_id: input.projeto_id,
          user_id: userData.user.id,
          workspace_id: workspaceId,
          limitation_type: input.limitation_type,
          total_bets_before_limitation: totalBets || 0,
          project_bets_before_limitation: projectBets || 0,
          observacoes: input.observacoes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["limitation-events", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["limitation-stats", projetoId] });
      toast.success("Evento de limitação registrado");
    },
    onError: (error: any) => {
      toast.error("Erro ao registrar limitação", { description: error.message });
    },
  });

  // Delete event mutation
  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("limitation_events")
        .delete()
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["limitation-events", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["limitation-stats", projetoId] });
      toast.success("Evento removido");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover evento", { description: error.message });
    },
  });

  return {
    events: eventsQuery.data || [],
    stats: statsQuery.data || [],
    isLoading: eventsQuery.isLoading || statsQuery.isLoading,
    createEvent,
    deleteEvent,
  };
}
