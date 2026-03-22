import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { derivarCotacoesFromConvertFn } from "@/services/fetchProjetosLucroOperacionalKpi";

/**
 * Hook que busca dados diários do calendário usando a mesma lógica
 * da RPC canônica de Lucro Operacional (get_projetos_lucro_operacional).
 * 
 * GARANTE PARIDADE ABSOLUTA entre:
 * - Badge de lucro (fetchProjetosLucroOperacionalKpi)
 * - Calendário diário (este hook)
 * 
 * Inclui TODOS os 11 módulos: apostas, cashback, giros, bônus,
 * conciliações, ajustes, FX, promocionais, perdas, perdas_cancelamento.
 */

export interface CanonicalDailyEntry {
  dia: string;   // YYYY-MM-DD
  lucro: number;
}

interface UseCanonicalCalendarDailyOptions {
  projetoId: string;
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
  dataInicio?: string;
  dataFim?: string;
  autoFetch?: boolean;
}

export function useCanonicalCalendarDaily({
  projetoId,
  convertToConsolidation,
  dataInicio,
  dataFim,
  autoFetch = true,
}: UseCanonicalCalendarDailyOptions) {
  // Derivar cotações do convertFn para enviar ao banco
  const cotacoes = convertToConsolidation
    ? derivarCotacoesFromConvertFn(convertToConsolidation)
    : {};

  const cotacoesKey = JSON.stringify(
    Object.entries(cotacoes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moeda, valor]) => [moeda, Math.round(valor * 10000)])
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["canonical-calendar-daily", projetoId, cotacoesKey, dataInicio || "all", dataFim || "all"],
    queryFn: async (): Promise<CanonicalDailyEntry[]> => {
      const { data: result, error } = await supabase
        .rpc('get_projeto_lucro_operacional_daily', {
          p_projeto_id: projetoId,
          p_cotacoes: cotacoes,
          p_data_inicio: dataInicio || null,
          p_data_fim: dataFim || null,
        } as any);

      if (error) {
        console.error('[useCanonicalCalendarDaily] RPC error:', error);
        throw error;
      }

      return (result as any as CanonicalDailyEntry[]) || [];
    },
    enabled: autoFetch && !!projetoId,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    daily: data ?? [],
    loading: isLoading,
    refetch,
  };
}

/**
 * Transforma daily canônico para o formato ApostaBase esperado
 * pelo VisaoGeralCharts (apostasCalendario prop).
 */
export function transformCanonicalDailyForCharts(daily: CanonicalDailyEntry[]) {
  return daily.map(d => ({
    data_aposta: d.dia,
    lucro_prejuizo: d.lucro,
    stake: 0,
    stake_total: null as number | null,
    bookmaker_nome: '',
    parceiro_nome: null as string | null,
    bookmaker_id: null as string | null,
    pl_consolidado: d.lucro,
    moeda_operacao: null as string | null,
    stake_consolidado: null as number | null,
    lucro_prejuizo_brl_referencia: null as number | null,
    valor_brl_referencia: null as number | null,
    operacoes: 0, // canonical daily doesn't track operations count
  }));
}
