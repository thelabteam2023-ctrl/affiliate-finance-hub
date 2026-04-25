import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "@/hooks/useCotacoes";

type WorkingRatesRow = {
  fonte_cotacao: string | null;
  cotacao_trabalho: number | null;
  cotacao_trabalho_eur: number | null;
  cotacao_trabalho_gbp: number | null;
  cotacao_trabalho_myr: number | null;
  cotacao_trabalho_mxn: number | null;
  cotacao_trabalho_ars: number | null;
  cotacao_trabalho_cop: number | null;
};

export type EffectiveRateSource = "TRABALHO" | "OFICIAL";

export interface EffectiveRateInfo {
  rate: number;
  source: EffectiveRateSource;
}

export function resolveEffectiveProjectRate(
  moeda: string,
  workingRates: WorkingRatesRow | null | undefined,
  officialRate: (moeda: string) => number,
): EffectiveRateInfo {
  const normalized = moeda.toUpperCase();
  if (normalized === "BRL") return { rate: 1, source: "OFICIAL" };

  const workKey = ["USDT", "USDC"].includes(normalized) ? "USD" : normalized;
  const workRateMap: Record<string, number | null | undefined> = {
    USD: workingRates?.cotacao_trabalho,
    EUR: workingRates?.cotacao_trabalho_eur,
    GBP: workingRates?.cotacao_trabalho_gbp,
    MYR: workingRates?.cotacao_trabalho_myr,
    MXN: workingRates?.cotacao_trabalho_mxn,
    ARS: workingRates?.cotacao_trabalho_ars,
    COP: workingRates?.cotacao_trabalho_cop,
  };

  const workRate = workRateMap[workKey];
  if (workingRates?.fonte_cotacao === "TRABALHO" && workRate && workRate > 0) {
    return { rate: workRate, source: "TRABALHO" };
  }

  return { rate: officialRate(normalized) || 1, source: "OFICIAL" };
}

export function useProjetoWorkingRates(projetoId: string | undefined) {
  const { getRate } = useCotacoes();

  const { data: workingRates } = useQuery({
    queryKey: ["projeto-working-rates", projetoId],
    queryFn: async (): Promise<WorkingRatesRow | null> => {
      if (!projetoId) return null;
      const { data, error } = await supabase
        .from("projetos")
        .select("fonte_cotacao, cotacao_trabalho, cotacao_trabalho_eur, cotacao_trabalho_gbp, cotacao_trabalho_myr, cotacao_trabalho_mxn, cotacao_trabalho_ars, cotacao_trabalho_cop")
        .eq("id", projetoId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!projetoId,
    staleTime: 30_000,
  });

  const getEffectiveRate = useCallback(
    (moeda: string) => resolveEffectiveProjectRate(moeda, workingRates, getRate),
    [workingRates, getRate],
  );

  return { workingRates, getEffectiveRate };
}