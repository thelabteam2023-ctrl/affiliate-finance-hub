import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getOperationalDateRangeForQuery } from '@/utils/dateUtils';

// Fonte única de verdade para o resultado do projeto
export interface ProjetoResultado {
  // Métricas de apostas (NA MOEDA DE CONSOLIDAÇÃO DO PROJETO)
  totalStaked: number;
  grossProfitFromBets: number;
  
  // Lucro de giros grátis (sempre positivo ou zero)
  lucroGirosGratis: number;
  
  // Lucro de cashback (valor recebido de cashback confirmado)
  lucroCashback: number;
  
  // Perdas operacionais
  operationalLossesConfirmed: number;
  operationalLossesPending: number;
  operationalLossesReverted: number;
  
  // Ajustes de conciliação
  ajustesConciliacao: number;
  temAjustesConciliacao: boolean;
  
  // Resultado final
  netProfit: number;
  roi: number | null;
  
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
  /** Função oficial de conversão (de ProjectCurrencyContext.convertToConsolidation).
   *  PADRONIZAÇÃO: Todos os KPIs devem usar esta mesma função para garantir paridade entre abas. */
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
}

interface UseProjetoResultadoReturn {
  resultado: ProjetoResultado | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Query key factory para consistência
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
 * Use após mutações que afetam KPIs (apostas, giros, cashback, etc.)
 */
export function useInvalidateProjetoResultado() {
  const queryClient = useQueryClient();

  return useCallback(
    (projetoId: string) => {
      queryClient.invalidateQueries({
        queryKey: [PROJETO_RESULTADO_QUERY_KEY, projetoId],
      });
    },
    [queryClient]
  );
}

/**
 * Hook centralizado para calcular o resultado do projeto.
 * FONTE ÚNICA DE VERDADE - deve ser usado por:
 * - KPI "Lucro" do dashboard interno
 * - "Retorno Financeiro" do card externo
 * - Qualquer outro lugar que exiba resultado do projeto
 * 
 * AGORA USANDO REACT QUERY para cache e invalidação automática
 */
export function useProjetoResultado({ 
  projetoId, 
  dataInicio = null, 
  dataFim = null,
  convertToConsolidation: convertToConsolidationProp 
}: UseProjetoResultadoProps): UseProjetoResultadoReturn {
  const queryClient = useQueryClient();

  const queryKey = getProjetoResultadoQueryKey(projetoId, dataInicio, dataFim);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<ProjetoResultado | null> => {
      if (!projetoId) return null;

      // 0. Buscar configuração de moeda do projeto
      const { data: projetoData } = await supabase
        .from('projetos')
        .select('moeda_consolidacao')
        .eq('id', projetoId)
        .single();
      
      const moedaConsolidacao = projetoData?.moeda_consolidacao || 'BRL';
      
      // PADRONIZADO: Usar exclusivamente a função oficial de conversão passada pelo caller.
      // Isso garante paridade com todas as outras abas (Bônus, Breakdowns, etc.)
      const safeConvert = convertToConsolidationProp || ((valor: number, _moeda: string) => valor);

      // 1. Fetch lucro bruto das apostas (USANDO VALORES CONSOLIDADOS QUANDO DISPONÍVEIS)
      const grossProfitFromBets = await fetchGrossProfitFromBets(projetoId, dataInicio, dataFim, moedaConsolidacao, safeConvert);
      
      // 2. Fetch volume apostado (stake total) (USANDO VALORES CONSOLIDADOS)
      const totalStaked = await fetchTotalStaked(projetoId, dataInicio, dataFim, moedaConsolidacao, safeConvert);
      
      // 3. Fetch perdas operacionais por status
      const operationalLosses = await fetchOperationalLosses(projetoId, dataInicio, dataFim);
      
      // 4. Fetch dados de capital (saldo bookmakers, depósitos, saques)
      const capitalData = await fetchCapitalData(projetoId, moedaConsolidacao, safeConvert);
      
      // 5. Fetch ajustes de conciliação
      const ajustesConciliacao = await fetchConciliacaoAdjustments(projetoId);
      
      // 6. Fetch lucro de giros grátis (sempre >= 0)
      const lucroGirosGratis = await fetchLucroGirosGratis(projetoId, dataInicio, dataFim);
      
      // 7. Fetch lucro de cashback (sempre >= 0) - inclui automático + manual
      const lucroCashback = await fetchLucroCashback(projetoId, dataInicio, dataFim, moedaConsolidacao, safeConvert);
      
      // 8. Calcular lucro líquido (fonte única de verdade)
      // net_profit = gross_profit_from_bets + lucro_giros_gratis + lucro_cashback - operational_losses_confirmed + ajustes_conciliacao
      const netProfit = grossProfitFromBets + lucroGirosGratis + lucroCashback - operationalLosses.confirmed + ajustesConciliacao;
      
      // 9. Calcular ROI
      const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : null;

      return {
        totalStaked,
        grossProfitFromBets,
        lucroGirosGratis,
        lucroCashback,
        operationalLossesConfirmed: operationalLosses.confirmed,
        operationalLossesPending: operationalLosses.pending,
        operationalLossesReverted: operationalLosses.reverted,
        ajustesConciliacao,
        temAjustesConciliacao: ajustesConciliacao !== 0,
        netProfit,
        roi,
        saldoBookmakers: capitalData.saldoBookmakers,
        saldoIrrecuperavel: capitalData.saldoIrrecuperavel,
        totalDepositos: capitalData.totalDepositos,
        totalSaques: capitalData.totalSaques,
        moedaConsolidacao,
      };
    },
    enabled: !!projetoId,
    staleTime: 30 * 1000, // 30 segundos - dados ficam "frescos"
    gcTime: 5 * 60 * 1000, // 5 minutos no cache
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return { 
    resultado: data || null, 
    loading: isLoading, 
    error: error?.message || null, 
    refresh 
  };
}

// Funções auxiliares de fetch

// PADRONIZADO: Tipo da função oficial de conversão
type ConvertFn = (valor: number, moedaOrigem: string) => number;


async function fetchGrossProfitFromBets(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null,
  moedaConsolidacao: string,
  convert: ConvertFn
): Promise<number> {
  let query = supabase
    .from('apostas_unificada')
    .select('lucro_prejuizo, pl_consolidado, moeda_operacao, consolidation_currency')
    .eq('projeto_id', projetoId)
    .eq('status', 'LIQUIDADA');
  
  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicio, dataFim);
    query = query.gte('data_aposta', startUTC).lte('data_aposta', endUTC);
  } else if (dataInicio) {
    const { startUTC } = getOperationalDateRangeForQuery(dataInicio, dataInicio);
    query = query.gte('data_aposta', startUTC);
  } else if (dataFim) {
    const { endUTC } = getOperationalDateRangeForQuery(dataFim, dataFim);
    query = query.lte('data_aposta', endUTC);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar lucro das apostas:', error);
    return 0;
  }

  return data?.reduce((acc, a: any) => {
    // 1. Se já temos o valor consolidado na moeda do projeto, usar ele
    if (a.pl_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
      return acc + Number(a.pl_consolidado);
    }
    const valorOriginal = Number(a.lucro_prejuizo || 0);
    const moedaOrigem = a.moeda_operacao || 'BRL';
    // 2. Converter via função oficial padronizada
    return acc + convert(valorOriginal, moedaOrigem);
  }, 0) || 0;
}

async function fetchTotalStaked(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null,
  moedaConsolidacao: string,
  convert: ConvertFn
): Promise<number> {
  let query = supabase
    .from('apostas_unificada')
    .select('stake, stake_total, stake_consolidado, forma_registro, moeda_operacao, consolidation_currency')
    .eq('projeto_id', projetoId);
  
  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicio, dataFim);
    query = query.gte('data_aposta', startUTC).lte('data_aposta', endUTC);
  } else if (dataInicio) {
    const { startUTC } = getOperationalDateRangeForQuery(dataInicio, dataInicio);
    query = query.gte('data_aposta', startUTC);
  } else if (dataFim) {
    const { endUTC } = getOperationalDateRangeForQuery(dataFim, dataFim);
    query = query.lte('data_aposta', endUTC);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar stake total:', error);
    return 0;
  }

  return data?.reduce((acc, a: any) => {
    // 1. Se já temos o valor consolidado na moeda do projeto, usar ele
    if (a.stake_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
      return acc + Number(a.stake_consolidado);
    }
    let valorOriginal: number;
    if (a.forma_registro === 'ARBITRAGEM') {
      valorOriginal = Number(a.stake_total || 0);
    } else {
      valorOriginal = Number(a.stake || 0);
    }
    const moedaOrigem = a.moeda_operacao || 'BRL';
    // 2. Converter via função oficial padronizada
    return acc + convert(valorOriginal, moedaOrigem);
  }, 0) || 0;
}

async function fetchOperationalLosses(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
): Promise<{ confirmed: number; pending: number; reverted: number }> {
  // 1. Perdas legadas (projeto_perdas)
  let queryLegacy = supabase
    .from('projeto_perdas')
    .select('valor, status')
    .eq('projeto_id', projetoId);
  
  // CRÍTICO: Usar timezone operacional (America/Sao_Paulo)
  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicio, dataFim);
    queryLegacy = queryLegacy.gte('data_perda', startUTC).lte('data_perda', endUTC);
  } else if (dataInicio) {
    const { startUTC } = getOperationalDateRangeForQuery(dataInicio, dataInicio);
    queryLegacy = queryLegacy.gte('data_perda', startUTC);
  } else if (dataFim) {
    const { endUTC } = getOperationalDateRangeForQuery(dataFim, dataFim);
    queryLegacy = queryLegacy.lte('data_perda', endUTC);
  }

  // 2. Perdas do módulo de Ocorrências (novo sistema)
  let queryOcorrencias = supabase
    .from('ocorrencias')
    .select('valor_perda, resultado_financeiro, status')
    .eq('projeto_id', projetoId)
    .eq('perda_registrada_ledger', true);

  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicio, dataFim);
    queryOcorrencias = queryOcorrencias.gte('created_at', startUTC).lte('created_at', endUTC);
  } else if (dataInicio) {
    const { startUTC } = getOperationalDateRangeForQuery(dataInicio, dataInicio);
    queryOcorrencias = queryOcorrencias.gte('created_at', startUTC);
  } else if (dataFim) {
    const { endUTC } = getOperationalDateRangeForQuery(dataFim, dataFim);
    queryOcorrencias = queryOcorrencias.lte('created_at', endUTC);
  }

  const [legacyResult, ocorrenciasResult] = await Promise.all([
    queryLegacy,
    queryOcorrencias,
  ]);

  if (legacyResult.error) {
    console.error('Erro ao buscar perdas operacionais (legado):', legacyResult.error);
  }
  if (ocorrenciasResult.error) {
    console.error('Erro ao buscar perdas de ocorrências:', ocorrenciasResult.error);
  }

  const losses = {
    confirmed: 0,
    pending: 0,
    reverted: 0,
  };

  // Somar perdas legadas
  (legacyResult.data || []).forEach((perda) => {
    const valor = Number(perda.valor || 0);
    switch (perda.status) {
      case 'CONFIRMADA':
        losses.confirmed += valor;
        break;
      case 'PENDENTE':
        losses.pending += valor;
        break;
      case 'REVERSA':
        losses.reverted += valor;
        break;
    }
  });

  // Somar perdas confirmadas de ocorrências (já registradas no ledger)
  (ocorrenciasResult.data || []).forEach((oc: any) => {
    const valor = Number(oc.valor_perda || 0);
    if (valor > 0 && (oc.resultado_financeiro === 'perda_confirmada' || oc.resultado_financeiro === 'perda_parcial')) {
      losses.confirmed += valor;
    }
  });

  return losses;
}

async function fetchConciliacaoAdjustments(projetoId: string): Promise<number> {
  // Buscar ajustes de conciliação da tabela bookmaker_balance_audit
  // Filtra por origem = 'CONCILIACAO_VINCULO' e referencia_id = projetoId
  const { data, error } = await supabase
    .from('bookmaker_balance_audit')
    .select('saldo_anterior, saldo_novo')
    .eq('origem', 'CONCILIACAO_VINCULO')
    .eq('referencia_id', projetoId)
    .eq('referencia_tipo', 'projeto');

  if (error) {
    console.error('Erro ao buscar ajustes de conciliação:', error);
    return 0;
  }

  // Somar as diferenças (saldo_novo - saldo_anterior)
  return data?.reduce((acc, item) => {
    const diferenca = Number(item.saldo_novo) - Number(item.saldo_anterior);
    return acc + diferenca;
  }, 0) || 0;
}

/**
 * Busca o lucro total de giros grátis do projeto
 * Giros grátis são SEMPRE positivos ou zero (não há como ter prejuízo)
 */
async function fetchLucroGirosGratis(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
): Promise<number> {
  let query = supabase
    .from('giros_gratis' as any)
    .select('valor_retorno')
    .eq('projeto_id', projetoId)
    .eq('status', 'confirmado'); // Apenas giros confirmados
  
  // CRÍTICO: Usar timezone operacional (America/Sao_Paulo)
  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicio, dataFim);
    query = query.gte('data_registro', startUTC).lte('data_registro', endUTC);
  } else if (dataInicio) {
    const { startUTC } = getOperationalDateRangeForQuery(dataInicio, dataInicio);
    query = query.gte('data_registro', startUTC);
  } else if (dataFim) {
    const { endUTC } = getOperationalDateRangeForQuery(dataFim, dataFim);
    query = query.lte('data_registro', endUTC);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar lucro de giros grátis:', error);
    return 0;
  }

  // Somar todos os retornos (valor_retorno é sempre >= 0)
  return data?.reduce((acc: number, g: any) => {
    const valor = Number(g.valor_retorno || 0);
    // Garantir que nunca seja negativo (regra de negócio)
    return acc + Math.max(0, valor);
  }, 0) || 0;
}

/**
 * Busca o lucro total de cashback recebido do projeto.
 * Apenas cashback manual (cashback_manual).
 * Cashback recebido é sempre positivo ou zero.
 */
async function fetchLucroCashback(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null,
  moedaConsolidacao: string,
  convert: ConvertFn
): Promise<number> {
  let query = supabase
    .from('cashback_manual')
    .select('valor, moeda_operacao')
    .eq('projeto_id', projetoId);

  if (dataInicio) {
    const startDate = `${dataInicio.getFullYear()}-${String(dataInicio.getMonth() + 1).padStart(2, '0')}-${String(dataInicio.getDate()).padStart(2, '0')}`;
    query = query.gte('data_credito', startDate);
  }
  if (dataFim) {
    const endDate = `${dataFim.getFullYear()}-${String(dataFim.getMonth() + 1).padStart(2, '0')}-${String(dataFim.getDate()).padStart(2, '0')}`;
    query = query.lte('data_credito', endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar cashback_manual:', error);
    return 0;
  }

  return data?.reduce((acc: number, cb: any) => {
    const valor = Number(cb.valor || 0);
    const moeda = cb.moeda_operacao || 'BRL';
    // PADRONIZADO: Usar função oficial de conversão
    return acc + Math.max(0, convert(valor, moeda));
  }, 0) || 0;
}

async function fetchCapitalData(
  projetoId: string,
  moedaConsolidacao: string,
  convert: ConvertFn
): Promise<{
  saldoBookmakers: number;
  saldoIrrecuperavel: number;
  totalDepositos: number;
  totalSaques: number;
}> {
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_bookmaker_saldos", {
    p_projeto_id: projetoId
  });

  if (rpcError) {
    console.error("[fetchCapitalData] Erro na RPC get_bookmaker_saldos:", rpcError);
  }

  const saldoBookmakers = rpcData?.reduce((acc: number, b: any) => {
    const moedaOrigem = b.moeda || 'BRL';
    return acc + convert(Number(b.saldo_operavel || 0), moedaOrigem);
  }, 0) || 0;
  
  // Buscar saldo irrecuperável separadamente (não está na RPC)
  const { data: bookmarkersIrrec } = await supabase
    .from('bookmakers')
    .select('saldo_irrecuperavel, moeda')
    .eq('projeto_id', projetoId);

  const saldoIrrecuperavel = bookmarkersIrrec?.reduce((acc, b) => {
    const moedaOrigem = b.moeda || 'BRL';
    return acc + convert(Number(b.saldo_irrecuperavel || 0), moedaOrigem);
  }, 0) || 0;

  // Buscar histórico de bookmakers do projeto
  const { data: historico } = await supabase
    .from('projeto_bookmaker_historico')
    .select('bookmaker_id')
    .eq('projeto_id', projetoId);
  
  const historicalIds = new Set(historico?.map(h => h.bookmaker_id) || []);

  // Depósitos - com moeda para conversão
  const { data: depositos } = await supabase
    .from('cash_ledger')
    .select('valor, destino_bookmaker_id, moeda')
    .eq('tipo_transacao', 'DEPOSITO')
    .eq('status', 'CONFIRMADO')
    .not('destino_bookmaker_id', 'is', null);

  const totalDepositos = depositos
    ?.filter(d => historicalIds.has(d.destino_bookmaker_id))
    .reduce((acc, d) => {
      const moedaOrigem = d.moeda || 'BRL';
      return acc + convert(Number(d.valor), moedaOrigem);
    }, 0) || 0;

  // Saques - com moeda para conversão
  const { data: saques } = await supabase
    .from('cash_ledger')
    .select('valor, origem_bookmaker_id, moeda')
    .eq('tipo_transacao', 'SAQUE')
    .eq('status', 'CONFIRMADO')
    .not('origem_bookmaker_id', 'is', null);

  const totalSaques = saques
    ?.filter(s => historicalIds.has(s.origem_bookmaker_id))
    .reduce((acc, s) => {
      const moedaOrigem = s.moeda || 'BRL';
      return acc + convert(Number(s.valor), moedaOrigem);
    }, 0) || 0;

  return {
    saldoBookmakers,
    saldoIrrecuperavel,
    totalDepositos,
    totalSaques,
  };
}

/**
 * Calcula o "Retorno Financeiro" do projeto (fórmula do card externo)
 * Resultado = Sacado + (Saldo Bookmakers - Saldo Irrecuperável) - Depositado - Perdas Confirmadas
 */
export function calcularRetornoFinanceiro(resultado: ProjetoResultado): number {
  const saldoRecuperavel = resultado.saldoBookmakers - resultado.saldoIrrecuperavel;
  return resultado.totalSaques + saldoRecuperavel - resultado.totalDepositos - resultado.operationalLossesConfirmed;
}
