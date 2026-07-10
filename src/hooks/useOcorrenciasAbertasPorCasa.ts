import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";

export interface OcorrenciaAbertaResumo {
  id: string;
  titulo: string;
  tipo: string;
  sub_motivo: string | null;
  valor_risco: number;
  moeda: string;
  created_at: string;
  bookmaker_id: string;
  projeto_id: string | null;
}

/**
 * Lista ocorrências ainda em ABERTO/em_andamento/aguardando_terceiro para uma
 * casa específica. Usado nos fluxos de Reconciliação e Ajuste Manual para
 * alertar o operador sobre pendências antes do ajuste e permitir vinculação.
 */
export function useOcorrenciasAbertasPorCasa(bookmakerId: string | null | undefined) {
  const { workspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["ocorrencias-abertas-por-casa", workspaceId, bookmakerId],
    enabled: !!bookmakerId && !!workspaceId,
    queryFn: async (): Promise<OcorrenciaAbertaResumo[]> => {
      const { data, error } = await (supabase as any)
        .from("ocorrencias")
        .select("id, titulo, tipo, sub_motivo, valor_risco, moeda, created_at, bookmaker_id, projeto_id")
        .eq("workspace_id", workspaceId!)
        .eq("bookmaker_id", bookmakerId!)
        .in("status", ["aberto", "em_andamento", "aguardando_terceiro"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OcorrenciaAbertaResumo[];
    },
  });
}