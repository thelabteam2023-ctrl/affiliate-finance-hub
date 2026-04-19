import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type GrupoRegraTipo =
  | "LIMITE_MAX_POR_PERFIL"
  | "UNICA_POR_PERFIL"
  | "IP_UNICO_OBRIGATORIO"
  | "COOLDOWN_DIAS";

export type GrupoRegraEscopo = "PERFIL" | "IP" | "CARTEIRA" | "WORKSPACE";
export type GrupoRegraSeveridade = "BLOQUEIO" | "AVISO";

export interface BookmakerGrupoRegra {
  id: string;
  workspace_id: string;
  grupo_id: string;
  tipo_regra: GrupoRegraTipo;
  escopo: GrupoRegraEscopo;
  severidade: GrupoRegraSeveridade;
  valor_numerico: number | null;
  mensagem_violacao: string | null;
  ativa: boolean;
  created_at: string;
  updated_at: string;
}

export const REGRA_TIPO_LABELS: Record<GrupoRegraTipo, string> = {
  LIMITE_MAX_POR_PERFIL: "Máximo de casas por perfil",
  UNICA_POR_PERFIL: "Casa única por perfil",
  IP_UNICO_OBRIGATORIO: "IP único obrigatório",
  COOLDOWN_DIAS: "Cooldown entre usos (dias)",
};

export const REGRA_TIPO_DESCRICOES: Record<GrupoRegraTipo, string> = {
  LIMITE_MAX_POR_PERFIL: "Cada perfil pode usar no máximo N casas deste grupo no período.",
  UNICA_POR_PERFIL: "Casa deste grupo não pode se repetir no mesmo perfil.",
  IP_UNICO_OBRIGATORIO: "Casas deste grupo exigem IPs distintos por perfil no mesmo dia.",
  COOLDOWN_DIAS: "Após usar uma casa do grupo, aguardar N dias antes de outra.",
};

export const REGRA_TIPO_PRECISA_VALOR: Record<GrupoRegraTipo, boolean> = {
  LIMITE_MAX_POR_PERFIL: true,
  UNICA_POR_PERFIL: false,
  IP_UNICO_OBRIGATORIO: false,
  COOLDOWN_DIAS: true,
};

const QUERY_KEY = "bookmaker-grupo-regras";

export function useBookmakerGrupoRegras(grupoId?: string) {
  const { workspaceId, user } = useAuth();
  const queryClient = useQueryClient();

  const regrasQuery = useQuery({
    queryKey: [QUERY_KEY, workspaceId, grupoId ?? "all"],
    queryFn: async (): Promise<BookmakerGrupoRegra[]> => {
      if (!workspaceId) return [];
      let q = (supabase as any)
        .from("bookmaker_grupo_regras")
        .select("*")
        .eq("workspace_id", workspaceId);
      if (grupoId) q = q.eq("grupo_id", grupoId);
      const { data, error } = await q.order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  const createRegra = useMutation({
    mutationFn: async (params: {
      grupo_id: string;
      tipo_regra: GrupoRegraTipo;
      escopo?: GrupoRegraEscopo;
      severidade?: GrupoRegraSeveridade;
      valor_numerico?: number | null;
      mensagem_violacao?: string | null;
    }) => {
      if (!workspaceId || !user) throw new Error("Workspace não encontrado");
      const { data, error } = await (supabase as any)
        .from("bookmaker_grupo_regras")
        .insert({
          workspace_id: workspaceId,
          grupo_id: params.grupo_id,
          tipo_regra: params.tipo_regra,
          escopo: params.escopo ?? "PERFIL",
          severidade: params.severidade ?? "BLOQUEIO",
          valor_numerico: params.valor_numerico ?? null,
          mensagem_violacao: params.mensagem_violacao ?? null,
          created_by: user.id,
          ativa: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Regra criada");
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao criar regra"),
  });

  const updateRegra = useMutation({
    mutationFn: async (params: { id: string } & Partial<Omit<BookmakerGrupoRegra, "id" | "workspace_id" | "grupo_id" | "created_at" | "updated_at">>) => {
      const { id, ...patch } = params;
      const { error } = await (supabase as any)
        .from("bookmaker_grupo_regras")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atualizar regra"),
  });

  const deleteRegra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("bookmaker_grupo_regras")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra removida");
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao remover regra"),
  });

  return {
    regras: regrasQuery.data ?? [],
    isLoading: regrasQuery.isLoading,
    createRegra,
    updateRegra,
    deleteRegra,
  };
}
