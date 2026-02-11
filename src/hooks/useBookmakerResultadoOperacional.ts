import { useQuery } from "@tanstack/react-query";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook para buscar o resultado operacional PURO de bookmakers
 * Usa a view v_bookmaker_resultado_operacional que inclui APENAS:
 * - Lucro/prejuízo de apostas liquidadas
 * - Giros grátis confirmados
 * - Cashback manual
 * 
 * EXCLUI: depósitos, saques, ajustes FX, transferências
 */

export interface BookmakerResultadoOperacional {
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: string;
  workspace_id: string;
  projeto_id: string | null;
  parceiro_id: string | null;
  resultado_apostas: number;
  resultado_pernas: number;
  resultado_giros: number;
  resultado_cashback: number;
  resultado_operacional_total: number;
  qtd_apostas: number;
  qtd_greens: number;
  qtd_reds: number;
}

export function useBookmakerResultadoOperacional(bookmakerIds: string[]) {
  return useQuery({
    queryKey: ["bookmaker-resultado-operacional", bookmakerIds],
    queryFn: async () => {
      if (bookmakerIds.length === 0) return [];

      const { data, error } = await supabase
        .from("v_bookmaker_resultado_operacional")
        .select("*")
        .in("bookmaker_id", bookmakerIds);

      if (error) {
        console.error("Erro ao buscar resultado operacional:", error);
        throw error;
      }

      return (data || []) as BookmakerResultadoOperacional[];
    },
    enabled: bookmakerIds.length > 0,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });
}

/**
 * Hook para buscar resultado operacional de um único bookmaker
 */
export function useBookmakerResultadoOperacionalSingle(bookmakerId: string | null) {
  return useQuery({
    queryKey: ["bookmaker-resultado-operacional", bookmakerId],
    queryFn: async () => {
      if (!bookmakerId) return null;

      const { data, error } = await supabase
        .from("v_bookmaker_resultado_operacional")
        .select("*")
        .eq("bookmaker_id", bookmakerId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar resultado operacional:", error);
        throw error;
      }

      return data as BookmakerResultadoOperacional | null;
    },
    enabled: !!bookmakerId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });
}

/**
 * Função helper para calcular resultado operacional via RPC
 * Útil para cálculos em tempo real sem depender da view
 */
export async function calcularResultadoOperacionalRPC(
  bookmakerId: string
): Promise<{
  resultado_apostas: number;
  resultado_giros: number;
  resultado_cashback: number;
  resultado_total: number;
  qtd_apostas: number;
  qtd_greens: number;
  qtd_reds: number;
} | null> {
  const { data, error } = await supabase.rpc(
    "calcular_resultado_operacional_bookmaker",
    { p_bookmaker_id: bookmakerId }
  );

  if (error) {
    console.error("Erro ao calcular resultado operacional:", error);
    return null;
  }

  // RPC retorna array, pegamos o primeiro (e único) item
  const resultado = Array.isArray(data) ? data[0] : data;
  
  if (!resultado) return null;

  return {
    resultado_apostas: Number(resultado.resultado_apostas) || 0,
    resultado_giros: Number(resultado.resultado_giros) || 0,
    resultado_cashback: Number(resultado.resultado_cashback) || 0,
    resultado_total: Number(resultado.resultado_total) || 0,
    qtd_apostas: Number(resultado.qtd_apostas) || 0,
    qtd_greens: Number(resultado.qtd_greens) || 0,
    qtd_reds: Number(resultado.qtd_reds) || 0,
  };
}
