import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getOperationalDateRangeFromStrings } from '@/utils/dateUtils';

/**
 * Interface de retorno do lucro por módulo
 * Cada módulo pode contribuir independentemente para o lucro operacional
 */
export interface ModuloLucro {
  moduleId: string;
  moduleName: string;
  valor: number;
  count: number;
  isActive: boolean;
}

/**
 * Interface principal de resultado consolidado do workspace
 */
export interface WorkspaceLucroConsolidado {
  // Lucro total consolidado (soma de todos os módulos)
  lucroTotal: number;
  
  // Breakdown por módulo (para tooltips e detalhamento)
  modulos: ModuloLucro[];
  
  // Flags de consolidação
  hasMultiCurrency: boolean;
  
  // Contadores gerais
  totalOperacoes: number;
}

interface UseWorkspaceLucroOperacionalProps {
  dataInicio?: string | null;
  dataFim?: string | null;
  cotacaoUSD?: number;
}

interface UseWorkspaceLucroOperacionalReturn {
  resultado: WorkspaceLucroConsolidado | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook centralizado para calcular o lucro operacional do workspace.
 * 
 * FONTE ÚNICA DE VERDADE para lucro operacional consolidado.
 * 
 * Módulos incluídos:
 * - Apostas liquidadas (apostas_unificada)
 * - Cashback manual (cashback_manual)
 * - [Futuro] Giros grátis
 * - [Futuro] Freebets
 * 
 * Este hook deve ser usado por:
 * - Dashboard Financeiro (Financeiro.tsx)
 * - Cards de Equilíbrio Operacional
 * - Cards de Eficiência do Capital
 * - Qualquer lugar que exiba lucro operacional do workspace
 */
export function useWorkspaceLucroOperacional({
  dataInicio = null,
  dataFim = null,
  cotacaoUSD = 5.0,
}: UseWorkspaceLucroOperacionalProps = {}): UseWorkspaceLucroOperacionalReturn {
  const [resultado, setResultado] = useState<WorkspaceLucroConsolidado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateLucro = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch todos os módulos em paralelo
      const [apostasResult, cashbackResult, girosGratisResult] = await Promise.all([
        fetchApostasModulo(dataInicio, dataFim, cotacaoUSD),
        fetchCashbackModulo(dataInicio, dataFim, cotacaoUSD),
        fetchGirosGratisModulo(dataInicio, dataFim),
      ]);

      // Consolidar módulos
      const modulos: ModuloLucro[] = [
        {
          moduleId: 'apostas',
          moduleName: 'Apostas',
          valor: apostasResult.lucro,
          count: apostasResult.count,
          isActive: true, // Apostas sempre ativo
        },
        {
          moduleId: 'cashback',
          moduleName: 'Cashback',
          valor: cashbackResult.lucro,
          count: cashbackResult.count,
          isActive: cashbackResult.count > 0,
        },
        {
          moduleId: 'giros_gratis',
          moduleName: 'Giros Grátis',
          valor: girosGratisResult.lucro,
          count: girosGratisResult.count,
          isActive: girosGratisResult.count > 0,
        },
      ];

      // Calcular lucro total
      const lucroTotal = modulos
        .filter(m => m.isActive)
        .reduce((acc, m) => acc + m.valor, 0);

      // Calcular total de operações
      const totalOperacoes = modulos
        .filter(m => m.isActive)
        .reduce((acc, m) => acc + m.count, 0);

      // Verificar se há múltiplas moedas
      const hasMultiCurrency = apostasResult.hasMultiCurrency || cashbackResult.hasMultiCurrency;

      setResultado({
        lucroTotal,
        modulos,
        hasMultiCurrency,
        totalOperacoes,
      });
    } catch (err: any) {
      console.error('Erro ao calcular lucro operacional do workspace:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, cotacaoUSD]);

  useEffect(() => {
    calculateLucro();
  }, [calculateLucro]);

  return {
    resultado,
    loading,
    error,
    refresh: calculateLucro,
  };
}

// ==================== FUNÇÕES DE FETCH POR MÓDULO ====================

interface ModuloResult {
  lucro: number;
  count: number;
  hasMultiCurrency: boolean;
}

/**
 * Módulo: Apostas Liquidadas
 * Fonte: apostas_unificada
 */
async function fetchApostasModulo(
  dataInicio: string | null,
  dataFim: string | null,
  cotacaoUSD: number
): Promise<ModuloResult> {
  let query = supabase
    .from('apostas_unificada')
    .select('lucro_prejuizo, lucro_prejuizo_brl_referencia, pl_consolidado, moeda_operacao')
    .not('resultado', 'is', null);

  // Aplicar filtro de período
  // CRÍTICO: Usar getOperationalDateRangeFromStrings para garantir timezone operacional (São Paulo)
  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeFromStrings(dataInicio, dataFim);
    query = query.gte('data_aposta', startUTC);
    query = query.lte('data_aposta', endUTC);
  } else if (dataInicio) {
    // Apenas início definido - usar início do dia no timezone operacional
    const { startUTC } = getOperationalDateRangeFromStrings(dataInicio, dataInicio);
    query = query.gte('data_aposta', startUTC);
  } else if (dataFim) {
    // Apenas fim definido - usar fim do dia no timezone operacional
    const { endUTC } = getOperationalDateRangeFromStrings(dataFim, dataFim);
    query = query.lte('data_aposta', endUTC);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar apostas:', error);
    return { lucro: 0, count: 0, hasMultiCurrency: false };
  }

  let total = 0;
  let hasMulti = false;

  (data || []).forEach(a => {
    const moeda = a.moeda_operacao || 'BRL';

    // Prioridade 1: pl_consolidado (já convertido no registro)
    if (a.pl_consolidado != null) {
      total += a.pl_consolidado;
      if (moeda !== 'BRL') hasMulti = true;
      return;
    }

    // Prioridade 2: lucro_prejuizo_brl_referencia (snapshot BRL)
    if (a.lucro_prejuizo_brl_referencia != null) {
      total += a.lucro_prejuizo_brl_referencia;
      if (moeda !== 'BRL') hasMulti = true;
      return;
    }

    // Fallback: converter on-the-fly
    const lucro = a.lucro_prejuizo || 0;
    if (moeda === 'USD' || moeda === 'USDT') {
      total += lucro * cotacaoUSD;
      hasMulti = true;
    } else {
      total += lucro;
    }
  });

  return {
    lucro: total,
    count: data?.length || 0,
    hasMultiCurrency: hasMulti,
  };
}

/**
 * Módulo: Cashback Manual
 * Fonte: cashback_manual
 */
async function fetchCashbackModulo(
  dataInicio: string | null,
  dataFim: string | null,
  cotacaoUSD: number
): Promise<ModuloResult> {
  let query = supabase
    .from('cashback_manual')
    .select('valor, valor_brl_referencia, moeda_operacao');

  // Aplicar filtro de período (data_credito é date, não timestamp)
  if (dataInicio) {
    query = query.gte('data_credito', dataInicio);
  }
  if (dataFim) {
    query = query.lte('data_credito', dataFim);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar cashback:', error);
    return { lucro: 0, count: 0, hasMultiCurrency: false };
  }

  let total = 0;
  let hasMulti = false;

  (data || []).forEach(cb => {
    const moeda = cb.moeda_operacao || 'BRL';

    // Usar valor_brl_referencia se disponível
    if (cb.valor_brl_referencia != null) {
      total += cb.valor_brl_referencia;
      if (moeda !== 'BRL') hasMulti = true;
      return;
    }

    // Converter se USD/USDT
    if (moeda === 'USD' || moeda === 'USDT') {
      total += cb.valor * cotacaoUSD;
      hasMulti = true;
    } else {
      total += cb.valor;
    }
  });

  return {
    lucro: total,
    count: data?.length || 0,
    hasMultiCurrency: hasMulti,
  };
}

/**
 * Módulo: Giros Grátis
 * Fonte: giros_gratis
 * Giros grátis são sempre >= 0 (não há prejuízo)
 */
async function fetchGirosGratisModulo(
  dataInicio: string | null,
  dataFim: string | null
): Promise<ModuloResult> {
  let query = supabase
    .from('giros_gratis' as any)
    .select('valor_retorno')
    .eq('status', 'confirmado');

  // Aplicar filtro de período
  // CRÍTICO: Usar getOperationalDateRangeFromStrings para garantir timezone operacional (São Paulo)
  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeFromStrings(dataInicio, dataFim);
    query = query.gte('data_registro', startUTC);
    query = query.lte('data_registro', endUTC);
  } else if (dataInicio) {
    const { startUTC } = getOperationalDateRangeFromStrings(dataInicio, dataInicio);
    query = query.gte('data_registro', startUTC);
  } else if (dataFim) {
    const { endUTC } = getOperationalDateRangeFromStrings(dataFim, dataFim);
    query = query.lte('data_registro', endUTC);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar giros grátis:', error);
    return { lucro: 0, count: 0, hasMultiCurrency: false };
  }

  const giros = (data || []) as any[];
  const lucro = giros.reduce((acc, g) => acc + Math.max(0, Number(g.valor_retorno || 0)), 0);

  return {
    lucro,
    count: giros.length,
    hasMultiCurrency: false, // Giros são sempre em BRL por enquanto
  };
}

// ==================== HOOK UTILITÁRIO ====================

/**
 * Hook auxiliar para obter apenas o lucro total (para uso simplificado)
 */
export function useWorkspaceLucroTotal(props?: UseWorkspaceLucroOperacionalProps) {
  const { resultado, loading, error } = useWorkspaceLucroOperacional(props);
  
  return {
    lucroTotal: resultado?.lucroTotal ?? 0,
    hasMultiCurrency: resultado?.hasMultiCurrency ?? false,
    loading,
    error,
  };
}
