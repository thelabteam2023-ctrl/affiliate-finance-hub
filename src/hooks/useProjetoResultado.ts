import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Fonte única de verdade para o resultado do projeto
export interface ProjetoResultado {
  // Métricas de apostas (NA MOEDA DE CONSOLIDAÇÃO DO PROJETO)
  totalStaked: number;
  grossProfitFromBets: number;
  
  // Lucro de giros grátis (sempre positivo ou zero)
  lucroGirosGratis: number;
  
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
}

interface UseProjetoResultadoReturn {
  resultado: ProjetoResultado | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook centralizado para calcular o resultado do projeto.
 * FONTE ÚNICA DE VERDADE - deve ser usado por:
 * - KPI "Lucro" do dashboard interno
 * - "Retorno Financeiro" do card externo
 * - Qualquer outro lugar que exiba resultado do projeto
 */
export function useProjetoResultado({ 
  projetoId, 
  dataInicio = null, 
  dataFim = null 
}: UseProjetoResultadoProps): UseProjetoResultadoReturn {
  const [resultado, setResultado] = useState<ProjetoResultado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateResultado = useCallback(async () => {
    if (!projetoId) {
      setResultado(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 0. Buscar configuração de moeda do projeto
      const { data: projetoData } = await supabase
        .from('projetos')
        .select('moeda_consolidacao, cotacao_trabalho, fonte_cotacao')
        .eq('id', projetoId)
        .single();
      
      const moedaConsolidacao = projetoData?.moeda_consolidacao || 'BRL';
      const cotacaoTrabalho = projetoData?.cotacao_trabalho || 5.0;

      // 1. Fetch lucro bruto das apostas (USANDO VALORES CONSOLIDADOS QUANDO DISPONÍVEIS)
      const grossProfitFromBets = await fetchGrossProfitFromBets(projetoId, dataInicio, dataFim, moedaConsolidacao, cotacaoTrabalho);
      
      // 2. Fetch volume apostado (stake total) (USANDO VALORES CONSOLIDADOS)
      const totalStaked = await fetchTotalStaked(projetoId, dataInicio, dataFim, moedaConsolidacao, cotacaoTrabalho);
      
      // 3. Fetch perdas operacionais por status
      const operationalLosses = await fetchOperationalLosses(projetoId, dataInicio, dataFim);
      
      // 4. Fetch dados de capital (saldo bookmakers, depósitos, saques)
      const capitalData = await fetchCapitalData(projetoId, moedaConsolidacao, cotacaoTrabalho);
      
      // 5. Fetch ajustes de conciliação
      const ajustesConciliacao = await fetchConciliacaoAdjustments(projetoId);
      
      // 6. Fetch lucro de giros grátis (sempre >= 0)
      const lucroGirosGratis = await fetchLucroGirosGratis(projetoId, dataInicio, dataFim);
      
      // 7. Calcular lucro líquido (fonte única de verdade)
      // net_profit = gross_profit_from_bets + lucro_giros_gratis - operational_losses_confirmed + ajustes_conciliacao
      const netProfit = grossProfitFromBets + lucroGirosGratis - operationalLosses.confirmed + ajustesConciliacao;
      
      // 8. Calcular ROI
      const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : null;

      setResultado({
        totalStaked,
        grossProfitFromBets,
        lucroGirosGratis,
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
      });
    } catch (err: any) {
      console.error('Erro ao calcular resultado do projeto:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projetoId, dataInicio, dataFim]);

  useEffect(() => {
    calculateResultado();
  }, [calculateResultado]);

  return { resultado, loading, error, refresh: calculateResultado };
}

// Funções auxiliares de fetch

// Helper para converter valor para moeda de consolidação
function convertToConsolidation(
  valor: number,
  moedaOrigem: string | null,
  moedaConsolidacao: string,
  cotacao: number
): number {
  if (!valor) return 0;
  if (!moedaOrigem || moedaOrigem === moedaConsolidacao) return valor;
  
  // BRL -> USD
  if (moedaOrigem === "BRL" && moedaConsolidacao === "USD") {
    return valor / cotacao;
  }
  // USD -> BRL
  if (moedaOrigem === "USD" && moedaConsolidacao === "BRL") {
    return valor * cotacao;
  }
  // Crypto -> USD (já está em USD)
  if (["USDT", "USDC", "BTC", "ETH"].includes(moedaOrigem) && moedaConsolidacao === "USD") {
    return valor;
  }
  // Crypto -> BRL
  if (["USDT", "USDC", "BTC", "ETH"].includes(moedaOrigem) && moedaConsolidacao === "BRL") {
    return valor * cotacao;
  }
  return valor;
}

async function fetchGrossProfitFromBets(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null,
  moedaConsolidacao: string,
  cotacao: number
): Promise<number> {
  // Usar apostas_unificada como fonte única de verdade
  // PRIORIDADE: pl_consolidado > lucro_prejuizo convertido
  let query = supabase
    .from('apostas_unificada')
    .select('lucro_prejuizo, pl_consolidado, moeda_operacao, consolidation_currency')
    .eq('projeto_id', projetoId)
    .eq('status', 'LIQUIDADA');
  
  if (dataInicio) query = query.gte('data_aposta', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_aposta', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar lucro das apostas:', error);
    return 0;
  }

  return data?.reduce((acc, a) => {
    // Se já temos o valor consolidado na moeda do projeto, usar ele
    if (a.pl_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
      return acc + Number(a.pl_consolidado);
    }
    // Senão, converter lucro_prejuizo para moeda de consolidação
    const valorOriginal = Number(a.lucro_prejuizo || 0);
    const moedaOrigem = a.moeda_operacao || 'BRL';
    return acc + convertToConsolidation(valorOriginal, moedaOrigem, moedaConsolidacao, cotacao);
  }, 0) || 0;
}

async function fetchTotalStaked(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null,
  moedaConsolidacao: string,
  cotacao: number
): Promise<number> {
  // Usar apostas_unificada como fonte única de verdade
  // PRIORIDADE: stake_consolidado > stake convertido
  let query = supabase
    .from('apostas_unificada')
    .select('stake, stake_total, stake_consolidado, forma_registro, moeda_operacao, consolidation_currency')
    .eq('projeto_id', projetoId);
  
  if (dataInicio) query = query.gte('data_aposta', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_aposta', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar stake total:', error);
    return 0;
  }

  return data?.reduce((acc, a) => {
    // Se já temos o valor consolidado na moeda do projeto, usar ele
    if (a.stake_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
      return acc + Number(a.stake_consolidado);
    }
    // Senão, converter stake para moeda de consolidação
    let valorOriginal: number;
    if (a.forma_registro === 'ARBITRAGEM') {
      valorOriginal = Number(a.stake_total || 0);
    } else {
      valorOriginal = Number(a.stake || 0);
    }
    const moedaOrigem = a.moeda_operacao || 'BRL';
    return acc + convertToConsolidation(valorOriginal, moedaOrigem, moedaConsolidacao, cotacao);
  }, 0) || 0;
}

async function fetchOperationalLosses(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
): Promise<{ confirmed: number; pending: number; reverted: number }> {
  let query = supabase
    .from('projeto_perdas')
    .select('valor, status')
    .eq('projeto_id', projetoId);
  
  if (dataInicio) query = query.gte('data_perda', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_perda', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar perdas operacionais:', error);
    return { confirmed: 0, pending: 0, reverted: 0 };
  }

  const losses = {
    confirmed: 0,
    pending: 0,
    reverted: 0,
  };

  (data || []).forEach((perda) => {
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
  
  if (dataInicio) query = query.gte('data_registro', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_registro', dataFim.toISOString());

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

async function fetchCapitalData(
  projetoId: string,
  moedaConsolidacao: string,
  cotacao: number
): Promise<{
  saldoBookmakers: number;
  saldoIrrecuperavel: number;
  totalDepositos: number;
  totalSaques: number;
}> {
  // Buscar bookmakers do projeto com moeda
  const { data: bookmakers } = await supabase
    .from('bookmakers')
    .select('saldo_atual, saldo_irrecuperavel, moeda')
    .eq('projeto_id', projetoId);

  // Converter saldos para moeda de consolidação
  const saldoBookmakers = bookmakers?.reduce((acc, b) => {
    const moedaOrigem = b.moeda || 'BRL';
    return acc + convertToConsolidation(Number(b.saldo_atual || 0), moedaOrigem, moedaConsolidacao, cotacao);
  }, 0) || 0;
  
  const saldoIrrecuperavel = bookmakers?.reduce((acc, b) => {
    const moedaOrigem = b.moeda || 'BRL';
    return acc + convertToConsolidation(Number(b.saldo_irrecuperavel || 0), moedaOrigem, moedaConsolidacao, cotacao);
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
      return acc + convertToConsolidation(Number(d.valor), moedaOrigem, moedaConsolidacao, cotacao);
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
      return acc + convertToConsolidation(Number(s.valor), moedaOrigem, moedaConsolidacao, cotacao);
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
