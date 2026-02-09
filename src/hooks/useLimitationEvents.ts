import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────
export type LimitationType = "stake_limit" | "odds_limit" | "market_block" | "full_limit" | "unknown";
export type LimitationBucket = "early" | "mid" | "late";
export type StrategicProfile = "early_limiter" | "mid_limiter" | "late_limiter" | "low_risk" | "mixed" | "low_data";
export type ConfidenceScore = "HIGH" | "MEDIUM" | "LOW";

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

export interface GlobalLimitationStats {
  workspace_id: string;
  bookmaker_catalogo_id: string;
  bookmaker_nome: string;
  logo_url: string | null;
  total_events: number;
  total_projects: number;
  total_vinculos: number;
  avg_bets_before_limitation: number;
  stddev_bets: number | null;
  early_count: number;
  mid_count: number;
  late_count: number;
  early_pct: number;
  mid_pct: number;
  late_pct: number;
  most_common_type: LimitationType;
  last_limitation_at: string;
  first_limitation_at: string;
  strategic_profile: StrategicProfile;
  confidence_score: ConfidenceScore;
  // Withdrawal duration stats
  avg_withdrawal_days?: number | null;
  total_confirmed_withdrawals?: number;
  // Volume & P&L stats
  volume_total?: number;
  lucro_prejuizo_total?: number;
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
  mixed: {
    label: "Inconsistente",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "Distribuição mista entre buckets",
  },
  low_data: {
    label: "Dados Insuficientes",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    description: "Poucos eventos para classificar",
  },
};

export const CONFIDENCE_CONFIG: Record<ConfidenceScore, { label: string; color: string; bgColor: string }> = {
  HIGH: { label: "Alta", color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  MEDIUM: { label: "Média", color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  LOW: { label: "Baixa", color: "text-muted-foreground", bgColor: "bg-muted/50" },
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

  // Fetch aggregated stats from view (per-project)
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

  // Fetch global longitudinal stats
  const globalStatsQuery = useQuery({
    queryKey: ["limitation-stats-global", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      // Fetch global limitation stats, withdrawal duration, and volume/PL in parallel
      const [globalResult, withdrawalResult, volumeResult] = await Promise.all([
        supabase
          .from("v_limitation_stats_global")
          .select("*")
          .eq("workspace_id", workspaceId),
        supabase.rpc("get_avg_withdrawal_duration_by_catalogo" as any, {
          p_workspace_id: workspaceId,
        }),
        supabase
          .from("apostas_pernas")
          .select(`
            bookmakers!inner(bookmaker_catalogo_id, workspace_id),
            stake,
            lucro_prejuizo
          `)
          .not("lucro_prejuizo", "is", null),
      ]);

      if (globalResult.error) throw globalResult.error;

      // Build withdrawal duration map by bookmaker_catalogo_id
      const withdrawalMap = new Map<string, { avg_days: number; total: number }>();
      if (!withdrawalResult.error && withdrawalResult.data) {
        for (const row of (withdrawalResult.data as unknown as any[])) {
          withdrawalMap.set(row.bookmaker_catalogo_id, {
            avg_days: Number(row.avg_days) || 0,
            total: Number(row.total_confirmed) || 0,
          });
        }
      }

      // Build volume/PL map by bookmaker_catalogo_id (filter by workspace)
      const volumeMap = new Map<string, { volume: number; pl: number }>();
      if (!volumeResult.error && volumeResult.data) {
        for (const row of (volumeResult.data as unknown as any[])) {
          const catalogoId = row.bookmakers?.bookmaker_catalogo_id;
          const rowWorkspace = row.bookmakers?.workspace_id;
          if (!catalogoId || rowWorkspace !== workspaceId) continue;
          const existing = volumeMap.get(catalogoId) || { volume: 0, pl: 0 };
          existing.volume += Number(row.stake) || 0;
          existing.pl += Number(row.lucro_prejuizo) || 0;
          volumeMap.set(catalogoId, existing);
        }
      }

      // Merge withdrawal and volume data into global stats
      return (globalResult.data || []).map((s: any) => ({
        ...s,
        avg_withdrawal_days: withdrawalMap.get(s.bookmaker_catalogo_id)?.avg_days ?? null,
        total_confirmed_withdrawals: withdrawalMap.get(s.bookmaker_catalogo_id)?.total ?? 0,
        volume_total: volumeMap.get(s.bookmaker_catalogo_id)?.volume ?? 0,
        lucro_prejuizo_total: volumeMap.get(s.bookmaker_catalogo_id)?.pl ?? 0,
      })) as GlobalLimitationStats[];
    },
    enabled: !!workspaceId,
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
    globalStats: globalStatsQuery.data || [],
    isLoading: eventsQuery.isLoading || statsQuery.isLoading || globalStatsQuery.isLoading,
    createEvent,
    deleteEvent,
  };
}
