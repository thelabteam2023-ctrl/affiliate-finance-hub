import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { AutoSchedulerConfig } from "@/lib/auto-scheduler";

/**
 * Cenário de planejamento: simulação salva por plano + mês.
 *
 * Guarda configuração + lista de agendamentos (snapshot) + overrides + slots
 * já aplicados. Pensado para o "Calendário Simulado" (read-only) onde o usuário
 * pode aplicar tudo em batch ou item-a-item, marcando o que já virou campanha real.
 */
export interface PlanejamentoCenario {
  id: string;
  workspace_id: string;
  plano_id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  ano: number;
  mes: number;
  config: AutoSchedulerConfig;
  /** Snapshot dos agendamentos no momento do salvamento */
  agendamentos: Array<{
    celulaId: string;
    dia: number;
    dateKey: string;
    bookmaker_catalogo_id: string;
    bookmaker_nome: string;
    moeda: string;
    deposito_sugerido: number;
    parceiro_id: string | null;
    cpf_index: number | null;
    grupo_id: string;
    grupo_nome: string;
    grupo_cor: string;
  }>;
  overrides: Record<string, number>;
  /** Lista de celulaIds já aplicados (viraram campanha real) */
  slots_aplicados: string[];
  created_at: string;
  updated_at: string;
}

export function usePlanejamentoCenarios(planoId: string | null) {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planejamento-cenarios", planoId, workspaceId],
    queryFn: async (): Promise<PlanejamentoCenario[]> => {
      if (!workspaceId) return [];
      let q = (supabase as any)
        .from("planejamento_cenarios")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });
      if (planoId) q = q.eq("plano_id", planoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PlanejamentoCenario[];
    },
    enabled: !!workspaceId,
  });
}

export function useCenario(cenarioId: string | null) {
  return useQuery({
    queryKey: ["planejamento-cenario", cenarioId],
    queryFn: async (): Promise<PlanejamentoCenario | null> => {
      if (!cenarioId) return null;
      const { data, error } = await (supabase as any)
        .from("planejamento_cenarios")
        .select("*")
        .eq("id", cenarioId)
        .maybeSingle();
      if (error) throw error;
      return data as PlanejamentoCenario | null;
    },
    enabled: !!cenarioId,
  });
}

type SaveInput = {
  id?: string;
  plano_id: string;
  nome: string;
  descricao?: string | null;
  ano: number;
  mes: number;
  config: AutoSchedulerConfig;
  agendamentos: PlanejamentoCenario["agendamentos"];
  overrides: Record<string, number>;
  slots_aplicados?: string[];
};

export function useSaveCenario() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (payload: SaveInput) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      const base = {
        workspace_id: workspaceId,
        user_id: user.id,
        plano_id: payload.plano_id,
        nome: payload.nome.trim(),
        descricao: payload.descricao ?? null,
        ano: payload.ano,
        mes: payload.mes,
        config: payload.config as any,
        agendamentos: payload.agendamentos as any,
        overrides: payload.overrides as any,
        slots_aplicados: (payload.slots_aplicados ?? []) as any,
      };
      if (payload.id) {
        const { error } = await (supabase as any)
          .from("planejamento_cenarios")
          .update(base)
          .eq("id", payload.id);
        if (error) throw error;
        return payload.id;
      } else {
        const { data, error } = await (supabase as any)
          .from("planejamento_cenarios")
          .insert(base)
          .select("id")
          .single();
        if (error) throw error;
        return (data as any).id as string;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planejamento-cenarios"] });
      qc.invalidateQueries({ queryKey: ["planejamento-cenario"] });
    },
    onError: (e: any) =>
      toast.error("Erro ao salvar cenário", { description: e.message }),
  });
}

export function useDeleteCenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("planejamento_cenarios")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planejamento-cenarios"] });
    },
  });
}

/** Atualiza apenas a lista de slots_aplicados (uso item-a-item). */
export function useMarcarSlotAplicado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cenarioId, celulaId }: { cenarioId: string; celulaId: string }) => {
      const { data: atual, error: e1 } = await (supabase as any)
        .from("planejamento_cenarios")
        .select("slots_aplicados")
        .eq("id", cenarioId)
        .maybeSingle();
      if (e1) throw e1;
      const list: string[] = atual?.slots_aplicados ?? [];
      if (list.includes(celulaId)) return;
      const { error } = await (supabase as any)
        .from("planejamento_cenarios")
        .update({ slots_aplicados: [...list, celulaId] })
        .eq("id", cenarioId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["planejamento-cenario", vars.cenarioId] });
      qc.invalidateQueries({ queryKey: ["planejamento-cenarios"] });
    },
  });
}
