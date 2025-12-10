import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PerformanceMetrics, PeriodoAnalise } from '@/types/performance';

interface UseProjetoPerformanceProps {
  projetoId?: string; // Se undefined, busca todos os projetos
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
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLucroApostas = useCallback(async (): Promise<number> => {
    const { dataInicio, dataFim } = periodo;
    let lucroTotal = 0;

    // 1. Apostas simples (excluindo pernas de surebet)
    let querySimples = supabase
      .from('apostas')
      .select('lucro_prejuizo')
      .eq('status', 'LIQUIDADO')
      .is('surebet_id', null);
    if (projetoId) querySimples = querySimples.eq('projeto_id', projetoId);
    if (dataInicio) querySimples = querySimples.gte('data_aposta', dataInicio.toISOString());
    if (dataFim) querySimples = querySimples.lte('data_aposta', dataFim.toISOString());

    // 2. Apostas múltiplas
    let queryMultiplas = supabase
      .from('apostas_multiplas')
      .select('lucro_prejuizo')
      .eq('status', 'LIQUIDADO');
    if (projetoId) queryMultiplas = queryMultiplas.eq('projeto_id', projetoId);
    if (dataInicio) queryMultiplas = queryMultiplas.gte('data_aposta', dataInicio.toISOString());
    if (dataFim) queryMultiplas = queryMultiplas.lte('data_aposta', dataFim.toISOString());

    // 3. Surebets
    let querySurebets = supabase
      .from('surebets')
      .select('lucro_real')
      .eq('status', 'LIQUIDADO');
    if (projetoId) querySurebets = querySurebets.eq('projeto_id', projetoId);
    if (dataInicio) querySurebets = querySurebets.gte('data_operacao', dataInicio.toISOString());
    if (dataFim) querySurebets = querySurebets.lte('data_operacao', dataFim.toISOString());

    // 4. Matched Betting Rounds
    let queryMB = supabase
      .from('matched_betting_rounds')
      .select('lucro_real')
      .eq('status', 'LIQUIDADO');
    if (projetoId) queryMB = queryMB.eq('projeto_id', projetoId);
    if (dataInicio) queryMB = queryMB.gte('data_evento', dataInicio.toISOString());
    if (dataFim) queryMB = queryMB.lte('data_evento', dataFim.toISOString());

    const [simples, multiplas, surebets, mb] = await Promise.all([
      querySimples,
      queryMultiplas,
      querySurebets,
      queryMB,
    ]);

    lucroTotal += simples.data?.reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0) || 0;
    lucroTotal += multiplas.data?.reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0) || 0;
    lucroTotal += surebets.data?.reduce((acc, a) => acc + Number(a.lucro_real || 0), 0) || 0;
    lucroTotal += mb.data?.reduce((acc, a) => acc + Number(a.lucro_real || 0), 0) || 0;

    return lucroTotal;
  }, [projetoId, periodo]);

  const fetchCashFlow = useCallback(async (): Promise<{ depositos: number; saques: number }> => {
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

    // Se temos projetoId, precisamos filtrar por bookmakers do projeto
    if (projetoId) {
      const { data: bookmakersProjeto } = await supabase
        .from('bookmakers')
        .select('id')
        .eq('projeto_id', projetoId);
      
      const bookmakerIds = new Set(bookmakersProjeto?.map(b => b.id) || []);
      
      const depositos = depositosResult.data
        ?.filter(d => bookmakerIds.has(d.destino_bookmaker_id))
        .reduce((acc, d) => acc + Number(d.valor), 0) || 0;
      
      const saques = saquesResult.data
        ?.filter(s => bookmakerIds.has(s.origem_bookmaker_id))
        .reduce((acc, s) => acc + Number(s.valor), 0) || 0;
      
      return { depositos, saques };
    }

    return {
      depositos: depositosResult.data?.reduce((acc, d) => acc + Number(d.valor), 0) || 0,
      saques: saquesResult.data?.reduce((acc, s) => acc + Number(s.valor), 0) || 0,
    };
  }, [projetoId, periodo]);

  const fetchSaldoBookmakers = useCallback(async (): Promise<number> => {
    let query = supabase.from('bookmakers').select('saldo_atual');
    if (projetoId) query = query.eq('projeto_id', projetoId);

    const { data } = await query;
    return data?.reduce((acc, b) => acc + Number(b.saldo_atual || 0), 0) || 0;
  }, [projetoId]);

  const calculateMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [lucroApostas, cashFlow, saldoFinal] = await Promise.all([
        fetchLucroApostas(),
        fetchCashFlow(),
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
  }, [fetchLucroApostas, fetchCashFlow, fetchSaldoBookmakers]);

  useEffect(() => {
    calculateMetrics();
  }, [calculateMetrics]);

  return { metrics, loading, error, refresh: calculateMetrics };
}
