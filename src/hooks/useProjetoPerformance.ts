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

    // Usar apostas_unificada como fonte única de verdade
    // CRÍTICO: Priorizar pl_consolidado para evitar inflação em surebets
    let query = supabase
      .from('apostas_unificada')
      .select('lucro_prejuizo, pl_consolidado')
      .eq('status', 'LIQUIDADA');
    if (projetoId) query = query.eq('projeto_id', projetoId);
    if (dataInicio) query = query.gte('data_aposta', dataInicio.toISOString());
    if (dataFim) query = query.lte('data_aposta', dataFim.toISOString());

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar lucro das apostas:', error);
      return 0;
    }

    // CRÍTICO: Usar pl_consolidado quando disponível para evitar inflação
    return data?.reduce((acc, a) => acc + Number((a as any).pl_consolidado ?? a.lucro_prejuizo ?? 0), 0) || 0;
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
    // CRITICAL: Usar RPC canônica que inclui saldo_operavel (real + freebet + bonus - em_aposta)
    if (!projetoId) return 0;
    
    const { data, error } = await supabase.rpc("get_bookmaker_saldos", {
      p_projeto_id: projetoId
    });

    if (error) {
      console.error("[useProjetoPerformance] Erro na RPC get_bookmaker_saldos:", error);
      return 0;
    }

    // Usar saldo_operavel que já inclui real + freebet + bonus - em_aposta
    return data?.reduce((acc: number, b: any) => acc + Number(b.saldo_operavel || 0), 0) || 0;
  }, [projetoId]);

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
