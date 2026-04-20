import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type GrupoModoExecucao = "AGENDADO" | "SOB_DEMANDA";

export interface BookmakerGrupo {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  workspace_id: string;
  created_at: string;
  modo_execucao: GrupoModoExecucao;
}

export interface BookmakerGrupoMembro {
  id: string;
  grupo_id: string;
  bookmaker_catalogo_id: string;
  workspace_id: string;
  deposito_sugerido: number;
  deposito_moeda: string | null;
}

const QUERY_KEY = "bookmaker-grupos";

export function useBookmakerGrupos() {
  const { workspaceId } = useAuth();
  const queryClient = useQueryClient();

  const gruposQuery = useQuery({
    queryKey: [QUERY_KEY, workspaceId],
    queryFn: async (): Promise<BookmakerGrupo[]> => {
      if (!workspaceId) return [];
      const { data, error } = await (supabase as any)
        .from("bookmaker_grupos")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const membrosQuery = useQuery({
    queryKey: [QUERY_KEY, "membros", workspaceId],
    queryFn: async (): Promise<BookmakerGrupoMembro[]> => {
      if (!workspaceId) return [];
      const { data, error } = await (supabase as any)
        .from("bookmaker_grupo_membros")
        .select("*")
        .eq("workspace_id", workspaceId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  const createGrupo = useMutation({
    mutationFn: async (params: {
      nome: string;
      descricao?: string;
      cor?: string;
      modo_execucao?: GrupoModoExecucao;
    }) => {
      if (!workspaceId) throw new Error("Workspace não encontrado");
      const { data, error } = await (supabase as any)
        .from("bookmaker_grupos")
        .insert({
          workspace_id: workspaceId,
          nome: params.nome,
          descricao: params.descricao || null,
          cor: params.cor || "#6366f1",
          modo_execucao: params.modo_execucao || "AGENDADO",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Grupo criado com sucesso");
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao criar grupo"),
  });

  const updateGrupo = useMutation({
    mutationFn: async (params: {
      id: string;
      nome?: string;
      descricao?: string;
      cor?: string;
      modo_execucao?: GrupoModoExecucao;
    }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (params.nome !== undefined) updates.nome = params.nome;
      if (params.descricao !== undefined) updates.descricao = params.descricao || null;
      if (params.cor !== undefined) updates.cor = params.cor || "#6366f1";
      if (params.modo_execucao !== undefined) updates.modo_execucao = params.modo_execucao;
      const { error } = await (supabase as any)
        .from("bookmaker_grupos")
        .update(updates)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atualizar grupo"),
  });

  const deleteGrupo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("bookmaker_grupos")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grupo excluído");
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao excluir grupo"),
  });

  const addMembros = useMutation({
    mutationFn: async (params: {
      grupoId: string;
      catalogoIds: string[];
      moedaPorCatalogo?: Record<string, string>;
    }) => {
      if (!workspaceId) throw new Error("Workspace não encontrado");
      const rows = params.catalogoIds.map((cid) => ({
        grupo_id: params.grupoId,
        bookmaker_catalogo_id: cid,
        workspace_id: workspaceId,
        deposito_moeda: params.moedaPorCatalogo?.[cid] ?? null,
      }));
      const { error } = await (supabase as any)
        .from("bookmaker_grupo_membros")
        .upsert(rows, { onConflict: "grupo_id,bookmaker_catalogo_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao adicionar ao grupo"),
  });

  const removeMembro = useMutation({
    mutationFn: async (params: { grupoId: string; catalogoId: string }) => {
      const { error } = await (supabase as any)
        .from("bookmaker_grupo_membros")
        .delete()
        .eq("grupo_id", params.grupoId)
        .eq("bookmaker_catalogo_id", params.catalogoId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao remover do grupo"),
  });

  /** Atualiza apenas o depósito sugerido de uma casa-no-grupo. */
  const updateMembroDeposito = useMutation({
    mutationFn: async (params: {
      grupoId: string;
      catalogoId: string;
      deposito_sugerido: number;
      deposito_moeda?: string | null;
    }) => {
      const updates: any = { deposito_sugerido: params.deposito_sugerido };
      if (params.deposito_moeda !== undefined) updates.deposito_moeda = params.deposito_moeda;
      const { error } = await (supabase as any)
        .from("bookmaker_grupo_membros")
        .update(updates)
        .eq("grupo_id", params.grupoId)
        .eq("bookmaker_catalogo_id", params.catalogoId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atualizar depósito"),
  });

  // Helper: get catalogo IDs for a given grupo
  const getCatalogoIdsByGrupo = (grupoId: string): Set<string> => {
    const ids = new Set<string>();
    (membrosQuery.data ?? []).forEach((m) => {
      if (m.grupo_id === grupoId) ids.add(m.bookmaker_catalogo_id);
    });
    return ids;
  };

  // Helper: get full membros for a given grupo
  const getMembrosByGrupo = (grupoId: string): BookmakerGrupoMembro[] => {
    return (membrosQuery.data ?? []).filter((m) => m.grupo_id === grupoId);
  };

  // Helper: get grupo IDs for a given catalogo
  const getGrupoIdsByCatalogo = (catalogoId: string): string[] => {
    return (membrosQuery.data ?? [])
      .filter((m) => m.bookmaker_catalogo_id === catalogoId)
      .map((m) => m.grupo_id);
  };

  return {
    grupos: gruposQuery.data ?? [],
    membros: membrosQuery.data ?? [],
    isLoading: gruposQuery.isLoading || membrosQuery.isLoading,
    createGrupo,
    updateGrupo,
    deleteGrupo,
    addMembros,
    removeMembro,
    updateMembroDeposito,
    getCatalogoIdsByGrupo,
    getMembrosByGrupo,
    getGrupoIdsByCatalogo,
    invalidate,
  };
}
