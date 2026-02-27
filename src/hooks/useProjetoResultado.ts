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
  /** Fallback: retorna taxa BRL para uma moeda (ex: USD -> 5.16). Usado quando cotacao_trabalho não está definida. */
  getRateFallback?: (moeda: string) => number;
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
  getRateFallback 
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
        .select('moeda_consolidacao, cotacao_trabalho, fonte_cotacao')
        .eq('id', projetoId)
        .single();
      
      const moedaConsolidacao = projetoData?.moeda_consolidacao || 'BRL';
      // KPIs SEMPRE usam cotação oficial para análise neutra
      // A cotação de trabalho é reservada para calculadoras e formulários
      let cotacaoTrabalho = 0; // Ignorar cotação de trabalho para KPIs
      
      // CORREÇÃO: KPIs usam a taxa oficial da API via getRateFallback
      const getEffectiveCotacao = (moedaOrigem: string): number => {
        // Sempre usar a taxa oficial da API para KPIs
        if (getRateFallback) return getRateFallback(moedaOrigem);
        // Último fallback: retornar 0 (convertToConsolidation tratará como "sem conversão")
        return 0;
      };

      // 1. Fetch lucro bruto das apostas (USANDO VALORES CONSOLIDADOS QUANDO DISPONÍVEIS)
      const grossProfitFromBets = await fetchGrossProfitFromBets(projetoId, dataInicio, dataFim, moedaConsolidacao, cotacaoTrabalho, getEffectiveCotacao);
      
      // 2. Fetch volume apostado (stake total) (USANDO VALORES CONSOLIDADOS)
      const totalStaked = await fetchTotalStaked(projetoId, dataInicio, dataFim, moedaConsolidacao, cotacaoTrabalho, getEffectiveCotacao);
      
      // 3. Fetch perdas operacionais por status
      const operationalLosses = await fetchOperationalLosses(projetoId, dataInicio, dataFim);
      
      // 4. Fetch dados de capital (saldo bookmakers, depósitos, saques)
      const capitalData = await fetchCapitalData(projetoId, moedaConsolidacao, cotacaoTrabalho, getEffectiveCotacao);
      
      // 5. Fetch ajustes de conciliação
      const ajustesConciliacao = await fetchConciliacaoAdjustments(projetoId);
      
      // 6. Fetch lucro de giros grátis (sempre >= 0)
      const lucroGirosGratis = await fetchLucroGirosGratis(projetoId, dataInicio, dataFim);
      
      // 7. Fetch lucro de cashback (sempre >= 0) - inclui automático + manual
      const lucroCashback = await fetchLucroCashback(projetoId, dataInicio, dataFim, moedaConsolidacao, cotacaoTrabalho, getEffectiveCotacao);
      
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

// Helper para converter valor para moeda de consolidação
// IMPORTANTE: cotacaoOrigem é a taxa BRL da moedaOrigem (ex: EUR=5.48)
// cotacaoConsolidacao é a taxa BRL da moedaConsolidacao (ex: USD=5.16)
// Se cotacaoOrigem <= 0, retorna o valor original (sem conversão)
function convertToConsolidation(
  valor: number,
  moedaOrigem: string | null,
  moedaConsolidacao: string,
  cotacaoOrigem: number,
  cotacaoConsolidacao?: number
): number {
  if (!valor) return 0;
  if (!moedaOrigem || moedaOrigem === moedaConsolidacao) return valor;
  
  // PROTEÇÃO: Se cotação inválida, retornar valor sem conversão
  if (!cotacaoOrigem || cotacaoOrigem <= 0) {
    console.warn('[convertToConsolidation] Cotação inválida:', cotacaoOrigem, 'para', moedaOrigem, '→', moedaConsolidacao, '- retornando valor original');
    return valor;
  }
  
  // Conversão via pivot BRL:
  // Fórmula universal: (valor * taxaBRL_origem) / taxaBRL_consolidacao
  if (moedaConsolidacao === "BRL") {
    // Qualquer moeda → BRL: valor * taxaBRL
    return valor * cotacaoOrigem;
  }
  
  if (moedaOrigem === "BRL") {
    // BRL → outra moeda: valor / taxaBRL_destino
    const rateConsolidacao = cotacaoConsolidacao || cotacaoOrigem;
    return valor / rateConsolidacao;
  }
  
  // Não-BRL → Não-BRL (ex: EUR → USD): pivot via BRL
  // (valor * taxaBRL_EUR) / taxaBRL_USD
  if (!cotacaoConsolidacao || cotacaoConsolidacao <= 0) {
    console.warn('[convertToConsolidation] Cotação de consolidação ausente para pivot:', moedaOrigem, '→', moedaConsolidacao);
    return valor;
  }
  return (valor * cotacaoOrigem) / cotacaoConsolidacao;
}

async function fetchGrossProfitFromBets(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null,
  moedaConsolidacao: string,
  cotacao: number,
  getEffectiveCotacao?: (moeda: string) => number
): Promise<number> {
  // Usar apostas_unificada como fonte única de verdade
  // PRIORIDADE: pl_consolidado > lucro_prejuizo convertido
  let query = supabase
    .from('apostas_unificada')
    .select('lucro_prejuizo, pl_consolidado, moeda_operacao, consolidation_currency, lucro_prejuizo_brl_referencia')
    .eq('projeto_id', projetoId)
    .eq('status', 'LIQUIDADA');
  
  // CRÍTICO: Usar timezone operacional (America/Sao_Paulo)
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
    // 2. Se mesma moeda, usar direto
    if (moedaOrigem === moedaConsolidacao) {
      return acc + valorOriginal;
    }
    // 3. Se consolidação é BRL e temos lucro_prejuizo_brl_referencia (snapshot), usar
    if (moedaConsolidacao === 'BRL' && a.lucro_prejuizo_brl_referencia != null) {
      return acc + Number(a.lucro_prejuizo_brl_referencia);
    }
    // 4. Converter via pivot BRL: precisamos da taxa da moeda ORIGEM e da moeda CONSOLIDAÇÃO
    const taxaOrigem = (cotacao > 0) ? cotacao : (getEffectiveCotacao ? getEffectiveCotacao(moedaOrigem) : 0);
    const taxaConsolidacao = (getEffectiveCotacao && moedaConsolidacao !== 'BRL') ? getEffectiveCotacao(moedaConsolidacao) : undefined;
    return acc + convertToConsolidation(valorOriginal, moedaOrigem, moedaConsolidacao, taxaOrigem, taxaConsolidacao);
  }, 0) || 0;
}

async function fetchTotalStaked(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null,
  moedaConsolidacao: string,
  cotacao: number,
  getEffectiveCotacao?: (moeda: string) => number
): Promise<number> {
  // Usar apostas_unificada como fonte única de verdade
  // PRIORIDADE: stake_consolidado > stake convertido
  let query = supabase
    .from('apostas_unificada')
    .select('stake, stake_total, stake_consolidado, forma_registro, moeda_operacao, consolidation_currency, valor_brl_referencia')
    .eq('projeto_id', projetoId);
  
  // CRÍTICO: Usar timezone operacional (America/Sao_Paulo)
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
    // 2. Se mesma moeda, usar direto
    if (moedaOrigem === moedaConsolidacao) {
      return acc + valorOriginal;
    }
    // 3. Se consolidação é BRL e temos valor_brl_referencia (snapshot), usar
    if (moedaConsolidacao === 'BRL' && a.valor_brl_referencia != null) {
      return acc + Number(a.valor_brl_referencia);
    }
    // 4. Converter via pivot BRL: precisamos da taxa da moeda ORIGEM e da moeda CONSOLIDAÇÃO
    const taxaOrigem = (cotacao > 0) ? cotacao : (getEffectiveCotacao ? getEffectiveCotacao(moedaOrigem) : 0);
    const taxaConsolidacao = (getEffectiveCotacao && moedaConsolidacao !== 'BRL') ? getEffectiveCotacao(moedaConsolidacao) : undefined;
    return acc + convertToConsolidation(valorOriginal, moedaOrigem, moedaConsolidacao, taxaOrigem, taxaConsolidacao);
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
  cotacao: number,
  getEffectiveCotacao?: (moeda: string) => number
): Promise<number> {
  // Buscar apenas cashback manual
  let query = supabase
    .from('cashback_manual')
    .select('valor, moeda_operacao, valor_brl_referencia')
    .eq('projeto_id', projetoId);

  // Cashback usa data (YYYY-MM-DD), não timestamp - extrair apenas a data operacional
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

  // Somar cashback manual (com conversão de moeda)
  return data?.reduce((acc: number, cb: any) => {
    const valor = Number(cb.valor || 0);
    const moeda = cb.moeda_operacao || 'BRL';
    
    // Se moeda de consolidação é BRL e temos valor_brl_referencia, usar ele
    if (moedaConsolidacao === 'BRL' && cb.valor_brl_referencia) {
      return acc + Math.max(0, Number(cb.valor_brl_referencia));
    }
    
    // Converter para moeda de consolidação (com pivot se necessário)
    const taxaOrigem = (cotacao > 0) ? cotacao : (getEffectiveCotacao ? getEffectiveCotacao(moeda) : 0);
    const taxaConsolidacao = (getEffectiveCotacao && moedaConsolidacao !== 'BRL') ? getEffectiveCotacao(moedaConsolidacao) : undefined;
    return acc + Math.max(0, convertToConsolidation(valor, moeda, moedaConsolidacao, taxaOrigem, taxaConsolidacao));
  }, 0) || 0;
}

async function fetchCapitalData(
  projetoId: string,
  moedaConsolidacao: string,
  cotacao: number,
  getEffectiveCotacao?: (moeda: string) => number
): Promise<{
  saldoBookmakers: number;
  saldoIrrecuperavel: number;
  totalDepositos: number;
  totalSaques: number;
}> {
  // CRITICAL: Usar RPC canônica que inclui saldo_operavel (real + freebet + bonus - em_aposta)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_bookmaker_saldos", {
    p_projeto_id: projetoId
  });

  if (rpcError) {
    console.error("[fetchCapitalData] Erro na RPC get_bookmaker_saldos:", rpcError);
  }

  // Helper local para conversão com pivot
  const convertLocal = (valor: number, moedaOrigem: string) => {
    const taxaOrigem = (cotacao > 0) ? cotacao : (getEffectiveCotacao ? getEffectiveCotacao(moedaOrigem) : 0);
    const taxaConsolidacao = (getEffectiveCotacao && moedaConsolidacao !== 'BRL') ? getEffectiveCotacao(moedaConsolidacao) : undefined;
    return convertToConsolidation(valor, moedaOrigem, moedaConsolidacao, taxaOrigem, taxaConsolidacao);
  };

  // Usar saldo_operavel que já inclui real + freebet + bonus - em_aposta
  // Converter para moeda de consolidação do projeto
  const saldoBookmakers = rpcData?.reduce((acc: number, b: any) => {
    const moedaOrigem = b.moeda || 'BRL';
    return acc + convertLocal(Number(b.saldo_operavel || 0), moedaOrigem);
  }, 0) || 0;
  
  // Buscar saldo irrecuperável separadamente (não está na RPC)
  const { data: bookmarkersIrrec } = await supabase
    .from('bookmakers')
    .select('saldo_irrecuperavel, moeda')
    .eq('projeto_id', projetoId);

  const saldoIrrecuperavel = bookmarkersIrrec?.reduce((acc, b) => {
    const moedaOrigem = b.moeda || 'BRL';
    return acc + convertLocal(Number(b.saldo_irrecuperavel || 0), moedaOrigem);
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
      return acc + convertLocal(Number(d.valor), moedaOrigem);
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
      return acc + convertLocal(Number(s.valor), moedaOrigem);
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
