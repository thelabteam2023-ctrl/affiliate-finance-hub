import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Fonte única de verdade para o resultado do projeto
export interface ProjetoResultado {
  // Métricas de apostas
  totalStaked: number;
  grossProfitFromBets: number;
  
  // Perdas operacionais
  operationalLossesConfirmed: number;
  operationalLossesPending: number;
  operationalLossesReverted: number;
  
  // Resultado final
  netProfit: number;
  roi: number | null;
  
  // Métricas de capital
  saldoBookmakers: number;
  saldoIrrecuperavel: number;
  totalDepositos: number;
  totalSaques: number;
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
      // 1. Fetch lucro bruto das apostas (simples, múltiplas, surebets, matched betting)
      const grossProfitFromBets = await fetchGrossProfitFromBets(projetoId, dataInicio, dataFim);
      
      // 2. Fetch volume apostado (stake total)
      const totalStaked = await fetchTotalStaked(projetoId, dataInicio, dataFim);
      
      // 3. Fetch perdas operacionais por status
      const operationalLosses = await fetchOperationalLosses(projetoId, dataInicio, dataFim);
      
      // 4. Fetch dados de capital (saldo bookmakers, depósitos, saques)
      const capitalData = await fetchCapitalData(projetoId);
      
      // 5. Calcular lucro líquido (fonte única de verdade)
      // net_profit = gross_profit_from_bets - operational_losses_confirmed
      const netProfit = grossProfitFromBets - operationalLosses.confirmed;
      
      // 6. Calcular ROI
      const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : null;

      setResultado({
        totalStaked,
        grossProfitFromBets,
        operationalLossesConfirmed: operationalLosses.confirmed,
        operationalLossesPending: operationalLosses.pending,
        operationalLossesReverted: operationalLosses.reverted,
        netProfit,
        roi,
        saldoBookmakers: capitalData.saldoBookmakers,
        saldoIrrecuperavel: capitalData.saldoIrrecuperavel,
        totalDepositos: capitalData.totalDepositos,
        totalSaques: capitalData.totalSaques,
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

async function fetchGrossProfitFromBets(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null
): Promise<number> {
  // Usar apostas_unificada como fonte única de verdade
  let query = supabase
    .from('apostas_unificada')
    .select('lucro_prejuizo')
    .eq('projeto_id', projetoId)
    .eq('status', 'LIQUIDADA');
  
  if (dataInicio) query = query.gte('data_aposta', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_aposta', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar lucro das apostas:', error);
    return 0;
  }

  return data?.reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0) || 0;
}

async function fetchTotalStaked(
  projetoId: string, 
  dataInicio: Date | null, 
  dataFim: Date | null
): Promise<number> {
  // Usar apostas_unificada como fonte única de verdade
  // stake para apostas simples, stake_total para arbitragens
  let query = supabase
    .from('apostas_unificada')
    .select('stake, stake_total, forma_registro')
    .eq('projeto_id', projetoId);
  
  if (dataInicio) query = query.gte('data_aposta', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_aposta', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar stake total:', error);
    return 0;
  }

  return data?.reduce((acc, a) => {
    // Para arbitragens, usar stake_total; para outras, usar stake
    if (a.forma_registro === 'ARBITRAGEM') {
      return acc + Number(a.stake_total || 0);
    }
    return acc + Number(a.stake || 0);
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

async function fetchCapitalData(projetoId: string): Promise<{
  saldoBookmakers: number;
  saldoIrrecuperavel: number;
  totalDepositos: number;
  totalSaques: number;
}> {
  // Buscar bookmakers do projeto
  const { data: bookmakers } = await supabase
    .from('bookmakers')
    .select('saldo_atual, saldo_irrecuperavel')
    .eq('projeto_id', projetoId);

  const saldoBookmakers = bookmakers?.reduce((acc, b) => acc + Number(b.saldo_atual || 0), 0) || 0;
  const saldoIrrecuperavel = bookmakers?.reduce((acc, b) => acc + Number(b.saldo_irrecuperavel || 0), 0) || 0;

  // Buscar IDs dos bookmakers para filtrar transações
  const bookmakerIds = bookmakers?.map(b => b) || [];
  
  // Buscar histórico de bookmakers do projeto
  const { data: historico } = await supabase
    .from('projeto_bookmaker_historico')
    .select('bookmaker_id')
    .eq('projeto_id', projetoId);
  
  const historicalIds = new Set(historico?.map(h => h.bookmaker_id) || []);

  // Depósitos
  const { data: depositos } = await supabase
    .from('cash_ledger')
    .select('valor, destino_bookmaker_id')
    .eq('tipo_transacao', 'DEPOSITO')
    .eq('status', 'CONFIRMADO')
    .not('destino_bookmaker_id', 'is', null);

  const totalDepositos = depositos
    ?.filter(d => historicalIds.has(d.destino_bookmaker_id))
    .reduce((acc, d) => acc + Number(d.valor), 0) || 0;

  // Saques
  const { data: saques } = await supabase
    .from('cash_ledger')
    .select('valor, origem_bookmaker_id')
    .eq('tipo_transacao', 'SAQUE')
    .eq('status', 'CONFIRMADO')
    .not('origem_bookmaker_id', 'is', null);

  const totalSaques = saques
    ?.filter(s => historicalIds.has(s.origem_bookmaker_id))
    .reduce((acc, s) => acc + Number(s.valor), 0) || 0;

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
