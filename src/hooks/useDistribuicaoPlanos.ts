import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type RegraCasa = "REPETIR_LIVRE" | "NAO_REPETIR_NO_CPF" | "RODIZIO_ENTRE_CPFS";
export type RegraIp = "IP_COMPARTILHADO_GRUPO" | "IP_UNICO_POR_CASA";

export const REGRA_CASA_LABELS: Record<RegraCasa, string> = {
  REPETIR_LIVRE: "Repetir livremente",
  NAO_REPETIR_NO_CPF: "Não repetir no mesmo CPF",
  RODIZIO_ENTRE_CPFS: "Rodízio entre CPFs",
};

export const REGRA_IP_LABELS: Record<RegraIp, string> = {
  IP_COMPARTILHADO_GRUPO: "IP compartilhado entre casas do grupo",
  IP_UNICO_POR_CASA: "Um IP por casa",
};

export interface DistribuicaoPlano {
  id: string;
  workspace_id: string;
  nome: string;
  descricao: string | null;
  parceiro_ids: string[];
  projeto_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DistribuicaoPlanoGrupo {
  id: string;
  plano_id: string;
  grupo_id: string;
  regra_casa: RegraCasa;
  regra_ip: RegraIp;
  casas_por_cpf: number | null;
  ordem: number;
}

export interface DistribuicaoPlanoCelula {
  id: string;
  plano_id: string;
  plano_grupo_id: string;
  parceiro_id: string;
  bookmaker_catalogo_id: string;
  ip_slot: string | null;
  travada: boolean;
  ordem: number;
}

const KEY = "distribuicao-planos";

export function useDistribuicaoPlanos() {
  const { workspaceId } = useAuth();
  const qc = useQueryClient();

  const planosQuery = useQuery({
    queryKey: [KEY, workspaceId],
    queryFn: async (): Promise<DistribuicaoPlano[]> => {
      if (!workspaceId) return [];
      const { data, error } = await (supabase as any)
        .from("distribuicao_planos")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [KEY] });

  const createPlano = useMutation({
    mutationFn: async (params: {
      nome: string;
      descricao?: string;
      projeto_id?: string | null;
      parceiro_ids: string[];
      grupos: Array<{
        grupo_id: string;
        regra_casa: RegraCasa;
        regra_ip: RegraIp;
        casas_por_cpf: number | null;
        ordem: number;
      }>;
      celulas: Array<{
        plano_grupo_id?: string;
        grupo_id: string;
        parceiro_id: string | null;
        perfil_planejamento_id: string | null;
        bookmaker_catalogo_id: string;
        ip_slot: string | null;
        ordem: number;
      }>;
    }) => {
      if (!workspaceId) throw new Error("Workspace não encontrado");

      const { data: plano, error: planoErr } = await (supabase as any)
        .from("distribuicao_planos")
        .insert({
          workspace_id: workspaceId,
          nome: params.nome,
          descricao: params.descricao || null,
          projeto_id: params.projeto_id ?? null,
          parceiro_ids: params.parceiro_ids,
        })
        .select()
        .single();
      if (planoErr) throw planoErr;

      const grupoRows = params.grupos.map((g) => ({
        plano_id: plano.id,
        workspace_id: workspaceId,
        grupo_id: g.grupo_id,
        regra_casa: g.regra_casa,
        regra_ip: g.regra_ip,
        casas_por_cpf: g.casas_por_cpf,
        ordem: g.ordem,
      }));
      const { data: grupos, error: gruposErr } = await (supabase as any)
        .from("distribuicao_plano_grupos")
        .insert(grupoRows)
        .select();
      if (gruposErr) throw gruposErr;

      const grupoMap = new Map<string, string>();
      grupos.forEach((g: any) => grupoMap.set(g.grupo_id, g.id));

      const celulaRows = params.celulas.map((c) => ({
        plano_id: plano.id,
        workspace_id: workspaceId,
        plano_grupo_id: grupoMap.get(c.grupo_id)!,
        parceiro_id: c.parceiro_id,
        perfil_planejamento_id: c.perfil_planejamento_id,
        bookmaker_catalogo_id: c.bookmaker_catalogo_id,
        ip_slot: c.ip_slot,
        ordem: c.ordem,
      }));
      if (celulaRows.length > 0) {
        const { error: celErr } = await (supabase as any)
          .from("distribuicao_plano_celulas")
          .insert(celulaRows);
        if (celErr) throw celErr;
      }

      return plano;
    },
    onSuccess: (plano) => {
      toast.success("Plano de distribuição salvo");
      qc.setQueryData<DistribuicaoPlano[]>([KEY, workspaceId], (cur) => {
        if (!cur) return [plano as DistribuicaoPlano];
        if (cur.some((p) => p.id === plano.id)) return cur;
        return [plano as DistribuicaoPlano, ...cur];
      });
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar plano"),
  });

  const deletePlano = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("distribuicao_planos")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano excluído");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir plano"),
  });

  const updatePlano = useMutation({
    mutationFn: async (params: { id: string; nome?: string; descricao?: string | null; projeto_id?: string | null }) => {
      const patch: Record<string, any> = {};
      if (params.nome !== undefined) patch.nome = params.nome;
      if (params.descricao !== undefined) patch.descricao = params.descricao;
      if (params.projeto_id !== undefined) patch.projeto_id = params.projeto_id;
      const { data, error } = await (supabase as any)
        .from("distribuicao_planos")
        .update(patch)
        .eq("id", params.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Plano atualizado");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar plano"),
  });

  return {
    planos: planosQuery.data ?? [],
    isLoading: planosQuery.isLoading,
    createPlano,
    updatePlano,
    deletePlano,
    invalidate,
  };
}

/**
 * Carrega configuração + células de UM plano específico.
 */
export function useDistribuicaoPlanoDetalhe(planoId: string | null) {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ["distribuicao-plano-detalhe", planoId, workspaceId],
    queryFn: async () => {
      if (!planoId || !workspaceId) return null;
      const [gruposRes, celulasRes] = await Promise.all([
        (supabase as any)
          .from("distribuicao_plano_grupos")
          .select("*")
          .eq("plano_id", planoId)
          .order("ordem"),
        (supabase as any)
          .from("distribuicao_plano_celulas")
          .select("*")
          .eq("plano_id", planoId)
          .order("ordem"),
      ]);
      if (gruposRes.error) throw gruposRes.error;
      if (celulasRes.error) throw celulasRes.error;
      return {
        grupos: (gruposRes.data ?? []) as DistribuicaoPlanoGrupo[],
        celulas: (celulasRes.data ?? []) as DistribuicaoPlanoCelula[],
      };
    },
    enabled: !!planoId && !!workspaceId,
  });
}
