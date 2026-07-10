import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BookmakerFamilia {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  created_at: string;
  updated_at: string;
}

export interface BookmakerFamiliaMembro {
  id: string;
  familia_id: string;
  bookmaker_catalogo_id: string;
  is_referencia: boolean;
}

export interface CasaCatalogoLite {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string | null;
}

const QK = "bookmaker-familias";

export function useBookmakerFamilias() {
  const qc = useQueryClient();

  const familiasQuery = useQuery({
    queryKey: [QK, "list"],
    queryFn: async (): Promise<BookmakerFamilia[]> => {
      const { data, error } = await (supabase as any)
        .from("bookmaker_familias")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const membrosQuery = useQuery({
    queryKey: [QK, "membros"],
    queryFn: async (): Promise<BookmakerFamiliaMembro[]> => {
      const { data, error } = await (supabase as any)
        .from("bookmaker_familia_membros")
        .select("*");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const casasQuery = useQuery({
    queryKey: [QK, "casas-catalogo"],
    queryFn: async (): Promise<CasaCatalogoLite[]> => {
      // RLS de bookmakers_catalogo já filtra casas restritas por workspace
      const { data, error } = await (supabase as any)
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, status")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [QK] });

  const createFamilia = useMutation({
    mutationFn: async (params: { nome: string; descricao?: string; cor?: string }) => {
      const { data, error } = await (supabase as any)
        .from("bookmaker_familias")
        .insert({
          nome: params.nome,
          descricao: params.descricao || null,
          cor: params.cor || "#6366f1",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Família criada");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar família"),
  });

  const updateFamilia = useMutation({
    mutationFn: async (params: { id: string; nome?: string; descricao?: string | null; cor?: string }) => {
      const patch: any = {};
      if (params.nome !== undefined) patch.nome = params.nome;
      if (params.descricao !== undefined) patch.descricao = params.descricao || null;
      if (params.cor !== undefined) patch.cor = params.cor;
      const { error } = await (supabase as any)
        .from("bookmaker_familias")
        .update(patch)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar família"),
  });

  const deleteFamilia = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("bookmaker_familias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Família excluída");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir família"),
  });

  /** Move uma casa para uma família (upsert 1:1 pelo bookmaker_catalogo_id). */
  const moverCasaParaFamilia = useMutation({
    mutationFn: async (params: { catalogoId: string; familiaId: string }) => {
      const { error } = await (supabase as any)
        .from("bookmaker_familia_membros")
        .upsert(
          { familia_id: params.familiaId, bookmaker_catalogo_id: params.catalogoId },
          { onConflict: "bookmaker_catalogo_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message || "Erro ao mover casa"),
  });

  /** Adiciona múltiplas casas de uma vez a uma família (substitui vínculos antigos). */
  const adicionarCasas = useMutation({
    mutationFn: async (params: { familiaId: string; catalogoIds: string[] }) => {
      if (params.catalogoIds.length === 0) return;
      const rows = params.catalogoIds.map((cid) => ({
        familia_id: params.familiaId,
        bookmaker_catalogo_id: cid,
      }));
      const { error } = await (supabase as any)
        .from("bookmaker_familia_membros")
        .upsert(rows, { onConflict: "bookmaker_catalogo_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Casas adicionadas à família");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao adicionar casas"),
  });

  /** Remove uma casa de qualquer família (volta ao pool). */
  const removerCasa = useMutation({
    mutationFn: async (params: { catalogoId: string }) => {
      const { error } = await (supabase as any)
        .from("bookmaker_familia_membros")
        .delete()
        .eq("bookmaker_catalogo_id", params.catalogoId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message || "Erro ao remover casa"),
  });

  /** Marca uma casa como referência da família (trigger DB garante unicidade). */
  const definirReferencia = useMutation({
    mutationFn: async (params: { catalogoId: string }) => {
      const { error } = await (supabase as any)
        .from("bookmaker_familia_membros")
        .update({ is_referencia: true })
        .eq("bookmaker_catalogo_id", params.catalogoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Casa definida como referência");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao definir referência"),
  });

  return {
    familias: familiasQuery.data ?? [],
    membros: membrosQuery.data ?? [],
    casas: casasQuery.data ?? [],
    isLoading: familiasQuery.isLoading || membrosQuery.isLoading || casasQuery.isLoading,
    createFamilia,
    updateFamilia,
    deleteFamilia,
    moverCasaParaFamilia,
    adicionarCasas,
    removerCasa,
    definirReferencia,
    invalidate,
  };
}
