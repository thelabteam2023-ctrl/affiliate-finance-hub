import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExposicaoPendente {
  /** Stake real comprometido em apostas pendentes (moeda nativa da casa). Freebet excluído. */
  exposicaoReal: number;
  /** Stake freebet comprometido em apostas pendentes (moeda nativa da casa). */
  exposicaoFreebet: number;
  /** Nº de pernas pendentes na casa. */
  qtdPendentes: number;
}

export type ExposicaoPendenteMap = Record<string, ExposicaoPendente>;

/**
 * Retorna, por bookmaker_id, o capital comprometido em apostas pendentes.
 *
 * Regra: exclui `stake_freebet` do valor "em risco de caixa" — freebet não sai
 * do saldo real da casa, então não deve neutralizar `lucro_prejuizo` (que é
 * calculado a partir de `saldo_atual`, o qual foi debitado apenas de stake_real).
 *
 * Usado pelo painel Desempenho por Casa para separar "Resultado Realizado" de
 * "Capital Comprometido" — apostas pendentes deixam de inflar/reduzir o
 * resultado financeiro exibido.
 */
export function useExposicaoPendentePorCasa(bookmakerIds: string[]): {
  data: ExposicaoPendenteMap;
  loading: boolean;
} {
  const ids = [...new Set(bookmakerIds.filter(Boolean))].sort();

  const query = useQuery({
    queryKey: ["exposicao-pendente-por-casa", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ExposicaoPendenteMap> => {
      const { data, error } = await supabase
        .from("apostas_pernas")
        .select("bookmaker_id, stake_real, stake_freebet")
        .in("bookmaker_id", ids)
        .is("resultado", null);

      if (error) throw error;

      const map: ExposicaoPendenteMap = {};
      for (const row of data ?? []) {
        const bid = (row as any).bookmaker_id as string;
        if (!bid) continue;
        const bucket = map[bid] ?? { exposicaoReal: 0, exposicaoFreebet: 0, qtdPendentes: 0 };
        bucket.exposicaoReal += Number((row as any).stake_real ?? 0);
        bucket.exposicaoFreebet += Number((row as any).stake_freebet ?? 0);
        bucket.qtdPendentes += 1;
        map[bid] = bucket;
      }
      return map;
    },
  });

  return {
    data: query.data ?? {},
    loading: query.isLoading,
  };
}