import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useProjetoDashboardData, 
  getProjetoDashboardQueryKey,
} from './useProjetoDashboardData';
import { FinancialMetrics, FinancialMetricsService } from '@/services/FinancialMetricsService';

// Fonte única de verdade para o resultado do projeto
export type ProjetoResultado = FinancialMetrics;

interface UseProjetoResultadoProps {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
  cotacaoKey?: number;
}

interface UseProjetoResultadoReturn {
  resultado: ProjetoResultado | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const PROJETO_RESULTADO_QUERY_KEY = "projeto-resultado";

export function getProjetoResultadoQueryKey(
  projetoId: string,
  dataInicio?: Date | null,
  dataFim?: Date | null
) {
  return [
    PROJETO_RESULTADO_QUERY_KEY,
    projetoId,
    dataInicio?.toISOString() || null,
    dataFim?.toISOString() || null,
  ];
}

export function useInvalidateProjetoResultado() {
  const queryClient = useQueryClient();

  return useCallback(
    (projetoId: string) => {
      queryClient.invalidateQueries({
        queryKey: getProjetoDashboardQueryKey(projetoId),
      });
    },
    [queryClient]
  );
}

export function useProjetoResultado({ 
  projetoId, 
  dataInicio = null, 
  dataFim = null,
  convertToConsolidation: convertToConsolidationProp,
  cotacaoKey = 0
}: UseProjetoResultadoProps): UseProjetoResultadoReturn {
  const { data: rawData, isLoading, error, refresh: refreshDashboard } = useProjetoDashboardData(projetoId || undefined);

  const safeConvert = convertToConsolidationProp || ((valor: number, _moeda: string) => valor);

  const resultado = useMemo(() => {
    if (!rawData) return null;
    return FinancialMetricsService.calculate(rawData, safeConvert);
  }, [rawData, safeConvert, cotacaoKey]);

  const refresh = useCallback(async () => {
    await refreshDashboard();
  }, [refreshDashboard]);

  return { 
    resultado, 
    loading: isLoading, 
    error: error?.message || null, 
    refresh 
  };
}

export function calcularRetornoFinanceiro(resultado: ProjetoResultado): number {
  const saldoRecuperavel = resultado.saldoBookmakers - resultado.saldoIrrecuperavel;
  return resultado.totalSaques + saldoRecuperavel - resultado.totalDepositos - resultado.operationalLossesConfirmed;
}

