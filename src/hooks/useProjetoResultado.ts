import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useProjetoDashboardData, 
  getProjetoDashboardQueryKey,
  buildBookmakerMoedaMap,
  type ProjetoDashboardRawData 
} from './useProjetoDashboardData';

// Fonte única de verdade para o resultado do projeto
export interface ProjetoResultado {
  // === MÉTRICA PRINCIPAL: Lucro baseado em fluxo de caixa ===
  netProfit: number;
  roi: number | null;
  
  // === Métricas operacionais (secundárias) ===
  totalStaked: number;
  grossProfitFromBets: number;
  lucroGirosGratis: number;
  lucroCashback: number;
  
  // Perdas operacionais
  operationalLossesConfirmed: number;
  operationalLossesPending: number;
  operationalLossesReverted: number;
  
  // Ajustes de conciliação
  ajustesConciliacao: number;
  temAjustesConciliacao: boolean;
  
  // Métricas de capital
  saldoBookmakers: number;
  saldoIrrecuperavel: number;
  totalDepositos: number;
  totalSaques: number;
  
  // Moeda de consolidação
  moedaConsolidacao: string;
}

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

// Query key mantido para compatibilidade (invalidação externa)
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

/**
 * Hook para invalidar o cache do resultado do projeto.
 * Agora invalida o cache centralizado do dashboard RPC.
 */
export function useInvalidateProjetoResultado() {
  const queryClient = useQueryClient();

  return useCallback(
    (projetoId: string) => {
      // Invalidar o cache centralizado (fonte única de dados)
      queryClient.invalidateQueries({
        queryKey: getProjetoDashboardQueryKey(projetoId),
      });
    },
    [queryClient]
  );
}

// PADRONIZADO: Tipo da função oficial de conversão
type ConvertFn = (valor: number, moedaOrigem: string) => number;

/**
 * Deriva ProjetoResultado a partir dos dados brutos do RPC.
 * Puro (sem side effects) — toda a lógica de negócio está aqui.
 */
function deriveResultado(
  rawData: ProjetoDashboardRawData,
  convert: ConvertFn
): ProjetoResultado {
  const moedaConsolidacao = rawData.moeda_consolidacao;
  const bookmakerMoeda = buildBookmakerMoedaMap(rawData.bookmakers);

  // 1. Lucro bruto das apostas (LIQUIDADAS, sem bônus)
  const grossProfitFromBets = rawData.apostas
    .filter(a => a.status === 'LIQUIDADA' && !a.bonus_id && a.estrategia !== 'EXTRACAO_BONUS')
    .reduce((acc, a) => {
      if (a.pl_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
        return acc + Number(a.pl_consolidado);
      }
      return acc + convert(Number(a.lucro_prejuizo || 0), a.moeda_operacao || 'BRL');
    }, 0);

  // 2. Volume apostado (stake total, sem bônus)
  const totalStaked = rawData.apostas
    .filter(a => !a.bonus_id && a.estrategia !== 'EXTRACAO_BONUS')
    .reduce((acc, a) => {
      if (a.stake_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
        return acc + Number(a.stake_consolidado);
      }
      const stake = a.forma_registro === 'ARBITRAGEM' 
        ? Number(a.stake_total || 0) 
        : Number(a.stake || 0);
      return acc + convert(stake, a.moeda_operacao || 'BRL');
    }, 0);

  // 3. Perdas operacionais
  const losses = { confirmed: 0, pending: 0, reverted: 0 };
  rawData.perdas.forEach(p => {
    const v = Number(p.valor || 0);
    switch (p.status) {
      case 'CONFIRMADA': losses.confirmed += v; break;
      case 'PENDENTE': losses.pending += v; break;
      case 'REVERSA': losses.reverted += v; break;
    }
  });
  rawData.ocorrencias_perdas.forEach(oc => {
    const v = Number(oc.valor_perda || 0);
    if (v > 0 && (oc.resultado_financeiro === 'perda_confirmada' || oc.resultado_financeiro === 'perda_parcial')) {
      losses.confirmed += v;
    }
  });

  // 4. Capital (saldos, depósitos, saques)
  const saldoBookmakers = rawData.bookmakers.reduce((acc, b) => 
    acc + convert(Number(b.saldo_atual || 0), b.moeda || 'BRL'), 0);
  
  const saldoIrrecuperavel = rawData.bookmakers.reduce((acc, b) => 
    acc + convert(Number(b.saldo_irrecuperavel || 0), b.moeda || 'BRL'), 0);

  // Depósitos já incluem órfãos (safety net no RPC)
  const totalDepositos = rawData.depositos.reduce((acc, d) => 
    acc + convert(Number(d.valor || 0), d.moeda || 'BRL'), 0);

  const totalSaques = rawData.saques.reduce((acc, s) => 
    acc + convert(Number(s.valor_confirmado ?? s.valor), s.moeda || 'BRL'), 0);

  // 5. Ajustes de conciliação
  const ajustesConciliacao = rawData.conciliacoes.reduce((acc, c) => {
    return acc + (Number(c.saldo_novo) - Number(c.saldo_anterior));
  }, 0);

  // 6. Lucro giros grátis
  const lucroGirosGratis = rawData.giros_gratis.reduce((acc, g) => {
    const moeda = bookmakerMoeda.get(g.bookmaker_id) || 'BRL';
    return acc + Math.max(0, convert(Number(g.valor_retorno || 0), moeda));
  }, 0);

  // 7. Lucro cashback
  const lucroCashback = rawData.cashback.reduce((acc, cb) => {
    return acc + Math.max(0, convert(Number(cb.valor || 0), cb.moeda_operacao || 'BRL'));
  }, 0);

  // LUCRO REAL = (Saldo nas Casas + Saques Confirmados) - Depósitos Confirmados
  const netProfit = (saldoBookmakers + totalSaques) - totalDepositos;
  const roi = totalDepositos > 0 ? (netProfit / totalDepositos) * 100 : null;

  return {
    totalStaked,
    grossProfitFromBets,
    lucroGirosGratis,
    lucroCashback,
    operationalLossesConfirmed: losses.confirmed,
    operationalLossesPending: losses.pending,
    operationalLossesReverted: losses.reverted,
    ajustesConciliacao,
    temAjustesConciliacao: ajustesConciliacao !== 0,
    netProfit,
    roi,
    saldoBookmakers,
    saldoIrrecuperavel,
    totalDepositos,
    totalSaques,
    moedaConsolidacao,
  };
}

/**
 * Hook centralizado para calcular o resultado do projeto.
 * REFATORADO: Agora deriva dados do RPC centralizado (0 queries individuais).
 */
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
    return deriveResultado(rawData, safeConvert);
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

/**
 * Calcula o "Retorno Financeiro" do projeto (fórmula do card externo)
 */
export function calcularRetornoFinanceiro(resultado: ProjetoResultado): number {
  const saldoRecuperavel = resultado.saldoBookmakers - resultado.saldoIrrecuperavel;
  return resultado.totalSaques + saldoRecuperavel - resultado.totalDepositos - resultado.operationalLossesConfirmed;
}
