import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PerformanceMetrics, PeriodoAnalise } from '@/types/performance';
import { useWorkspace } from './useWorkspace';

interface UseProjetoPerformanceProps {
  projetoId?: string;
  periodo: PeriodoAnalise;
}

interface UseProjetoPerformanceReturn {
  metrics: PerformanceMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjetoPerformance({ 
  projetoId, 
  periodo 
}: UseProjetoPerformanceProps): UseProjetoPerformanceReturn {
  const { workspaceId } = useWorkspace();
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscar TODOS os bookmakers que já estiveram no projeto (via histórico)
  const fetchHistoricalBookmakerIds = useCallback(async (): Promise<Set<string>> => {
    if (!projetoId) return new Set();
    
    const { data } = await supabase
      .from('projeto_bookmaker_historico')
      .select('bookmaker_id')
      .eq('projeto_id', projetoId);
    
    return new Set(data?.map(h => h.bookmaker_id) || []);
  }, [projetoId]);

  const fetchLucroApostas = useCallback(async (historicalBookmakerIds?: Set<string>): Promise<number> => {
    const { dataInicio, dataFim } = periodo;
    let lucroTotal = 0;

    // 1. Apostas simples (excluindo pernas de surebet) - usar LIQUIDADA
    let querySimples = supabase
      .from('apostas')
      .select('lucro_prejuizo')
      .eq('status', 'LIQUIDADA')
      .is('surebet_id', null);
    if (projetoId) querySimples = querySimples.eq('projeto_id', projetoId);
    if (dataInicio) querySimples = querySimples.gte('data_aposta', dataInicio.toISOString());
    if (dataFim) querySimples = querySimples.lte('data_aposta', dataFim.toISOString());

    // 2. Apostas múltiplas - usar LIQUIDADA
    let queryMultiplas = supabase
      .from('apostas_multiplas')
      .select('lucro_prejuizo')
      .eq('status', 'LIQUIDADA');
    if (projetoId) queryMultiplas = queryMultiplas.eq('projeto_id', projetoId);
    if (dataInicio) queryMultiplas = queryMultiplas.gte('data_aposta', dataInicio.toISOString());
    if (dataFim) queryMultiplas = queryMultiplas.lte('data_aposta', dataFim.toISOString());

    // 3. Surebets - usar LIQUIDADA e lucro_real (já consolidado, evita double-counting)
    let querySurebets = supabase
      .from('surebets')
      .select('lucro_real')
      .eq('status', 'LIQUIDADA');
    if (projetoId) querySurebets = querySurebets.eq('projeto_id', projetoId);
    if (dataInicio) querySurebets = querySurebets.gte('data_operacao', dataInicio.toISOString());
    if (dataFim) querySurebets = querySurebets.lte('data_operacao', dataFim.toISOString());

    const [simples, multiplas, surebets] = await Promise.all([
      querySimples,
      queryMultiplas,
      querySurebets,
    ]);

    lucroTotal += simples.data?.reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0) || 0;
    lucroTotal += multiplas.data?.reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0) || 0;
    lucroTotal += surebets.data?.reduce((acc, a) => acc + Number(a.lucro_real || 0), 0) || 0;

    return lucroTotal;
  }, [projetoId, periodo]);

  const fetchCashFlow = useCallback(async (historicalBookmakerIds?: Set<string>): Promise<{ depositos: number; saques: number }> => {
    const { dataInicio, dataFim } = periodo;

    // Depósitos para bookmakers
    let queryDepositos = supabase
      .from('cash_ledger')
      .select('valor, destino_bookmaker_id')
      .eq('tipo_transacao', 'DEPOSITO')
      .eq('status', 'CONFIRMADO')
      .not('destino_bookmaker_id', 'is', null);
    if (dataInicio) queryDepositos = queryDepositos.gte('data_transacao', dataInicio.toISOString());
    if (dataFim) queryDepositos = queryDepositos.lte('data_transacao', dataFim.toISOString());

    // Saques de bookmakers
    let querySaques = supabase
      .from('cash_ledger')
      .select('valor, origem_bookmaker_id')
      .eq('tipo_transacao', 'SAQUE')
      .eq('status', 'CONFIRMADO')
      .not('origem_bookmaker_id', 'is', null);
    if (dataInicio) querySaques = querySaques.gte('data_transacao', dataInicio.toISOString());
    if (dataFim) querySaques = querySaques.lte('data_transacao', dataFim.toISOString());

    const [depositosResult, saquesResult] = await Promise.all([queryDepositos, querySaques]);

    // Se temos projetoId, usar histórico de bookmakers (inclui desvinculados)
    if (projetoId && historicalBookmakerIds && historicalBookmakerIds.size > 0) {
      const depositos = depositosResult.data
        ?.filter(d => historicalBookmakerIds.has(d.destino_bookmaker_id))
        .reduce((acc, d) => acc + Number(d.valor), 0) || 0;
      
      const saques = saquesResult.data
        ?.filter(s => historicalBookmakerIds.has(s.origem_bookmaker_id))
        .reduce((acc, s) => acc + Number(s.valor), 0) || 0;
      
      return { depositos, saques };
    }

    return {
      depositos: depositosResult.data?.reduce((acc, d) => acc + Number(d.valor), 0) || 0,
      saques: saquesResult.data?.reduce((acc, s) => acc + Number(s.valor), 0) || 0,
    };
  }, [projetoId, periodo]);

  const fetchSaldoBookmakers = useCallback(async (): Promise<number> => {
    // CRITICAL: Sempre filtrar por workspace
    if (!workspaceId) return 0;
    
    // Buscar apenas bookmakers ATUALMENTE vinculados ao projeto E ao workspace
    let query = supabase.from('bookmakers').select('saldo_atual').eq('workspace_id', workspaceId);
    if (projetoId) query = query.eq('projeto_id', projetoId);

    const { data } = await query;
    return data?.reduce((acc, b) => acc + Number(b.saldo_atual || 0), 0) || 0;
  }, [projetoId, workspaceId]);

  const calculateMetrics = useCallback(async () => {
    // CRITICAL: Não calcular métricas sem workspace
    if (!workspaceId) {
      setMetrics(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Primeiro buscar IDs históricos de bookmakers
      const historicalBookmakerIds = await fetchHistoricalBookmakerIds();
      
      const [lucroApostas, cashFlow, saldoFinal] = await Promise.all([
        fetchLucroApostas(historicalBookmakerIds),
        fetchCashFlow(historicalBookmakerIds),
        fetchSaldoBookmakers(),
      ]);

      const { depositos, saques } = cashFlow;

      // Saldo Inicial = Saldo Final - Lucro - Depósitos + Saques
      const saldoInicial = saldoFinal - lucroApostas - depositos + saques;

      // Capital Médio
      const capitalMedio = (saldoInicial + saldoFinal) / 2;

      // ROI
      const roi = capitalMedio > 0 ? (lucroApostas / capitalMedio) * 100 : null;

      setMetrics({
        saldoInicial,
        saldoFinal,
        depositos,
        saques,
        lucroApostas,
        lucroTotal: lucroApostas,
        roi,
        capitalMedio,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchHistoricalBookmakerIds, fetchLucroApostas, fetchCashFlow, fetchSaldoBookmakers, workspaceId]);

  useEffect(() => {
    calculateMetrics();
  }, [calculateMetrics]);

  return { metrics, loading, error, refresh: calculateMetrics };
}
