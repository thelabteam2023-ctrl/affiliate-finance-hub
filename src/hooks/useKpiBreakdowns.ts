import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  ProjetoKpiBreakdowns, 
  KpiBreakdown, 
  createModuleContribution, 
  createKpiBreakdown 
} from '@/types/moduleBreakdown';

interface UseKpiBreakdownsProps {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
  moedaConsolidacao?: string;
}

interface UseKpiBreakdownsReturn {
  breakdowns: ProjetoKpiBreakdowns | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook para calcular breakdowns dinâmicos dos KPIs por módulo.
 * 
 * Arquitetura:
 * - Cada módulo contribui independentemente
 * - Novos módulos podem ser adicionados sem alterar a lógica do tooltip
 * - Mesma estrutura alimenta KPIs, relatórios e exportações
 */
export function useKpiBreakdowns({
  projetoId,
  dataInicio = null,
  dataFim = null,
  moedaConsolidacao = 'BRL',
}: UseKpiBreakdownsProps): UseKpiBreakdownsReturn {
  const [breakdowns, setBreakdowns] = useState<ProjetoKpiBreakdowns | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateBreakdowns = useCallback(async () => {
    if (!projetoId) {
      setBreakdowns(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch dados de todos os módulos em paralelo
      const [
        apostasData,
        girosGratisData,
        perdasData,
        ajustesData,
      ] = await Promise.all([
        fetchApostasModuleData(projetoId, dataInicio, dataFim),
        fetchGirosGratisModuleData(projetoId, dataInicio, dataFim),
        fetchPerdasModuleData(projetoId, dataInicio, dataFim),
        fetchAjustesModuleData(projetoId),
      ]);

      // === BREAKDOWN APOSTAS (quantidade) ===
      const apostasBreakdown = createKpiBreakdown([
        createModuleContribution(
          'apostas',
          'Apostas',
          apostasData.count,
          true,
          { icon: 'Target', color: 'default', details: apostasData.countDetails }
        ),
        createModuleContribution(
          'giros_gratis',
          'Giros Grátis',
          girosGratisData.count,
          girosGratisData.count > 0,
          { icon: 'Dices', color: 'default' }
        ),
      ], moedaConsolidacao);

      // === BREAKDOWN VOLUME (stake) ===
      // Nota: Giros Grátis NÃO contribui para volume pois não há investimento
      const volumeBreakdown = createKpiBreakdown([
        createModuleContribution(
          'apostas',
          'Apostas',
          apostasData.volume,
          true,
          { icon: 'Target', color: 'default' }
        ),
        // Giros Grátis não tem volume (investimento = 0, é promoção gratuita)
      ], moedaConsolidacao);

      // === BREAKDOWN LUCRO ===
      const lucroBreakdown = createKpiBreakdown([
        createModuleContribution(
          'apostas',
          'Apostas',
          apostasData.lucro,
          true,
          { icon: 'Target' }
        ),
        createModuleContribution(
          'giros_gratis',
          'Giros Grátis',
          girosGratisData.lucro,
          girosGratisData.count > 0,
          { icon: 'Dices', color: 'positive' } // Sempre positivo por regra
        ),
        createModuleContribution(
          'perdas',
          'Perdas Operacionais',
          -perdasData.confirmadas, // Negativo pois são perdas
          perdasData.confirmadas > 0,
          { icon: 'TrendingDown', color: 'negative' }
        ),
        createModuleContribution(
          'ajustes',
          'Ajustes Conciliação',
          ajustesData.total,
          ajustesData.total !== 0,
          { icon: 'Minus', color: ajustesData.total >= 0 ? 'positive' : 'negative' }
        ),
      ], moedaConsolidacao);

      // === ROI (calculado a partir do lucro e volume) ===
      const lucroTotal = lucroBreakdown.total;
      const volumeTotal = volumeBreakdown.total;
      const roiTotal = volumeTotal > 0 ? (lucroTotal / volumeTotal) * 100 : null;

      setBreakdowns({
        apostas: apostasBreakdown,
        volume: volumeBreakdown,
        lucro: lucroBreakdown,
        roi: {
          total: roiTotal,
          volumeTotal,
          lucroTotal,
          currency: moedaConsolidacao,
        },
      });
    } catch (err: any) {
      console.error('Erro ao calcular breakdowns:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projetoId, dataInicio, dataFim, moedaConsolidacao]);

  useEffect(() => {
    calculateBreakdowns();
  }, [calculateBreakdowns]);

  return {
    breakdowns,
    loading,
    error,
    refresh: calculateBreakdowns,
  };
}

// === Funções de fetch por módulo ===

async function fetchApostasModuleData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
) {
  let query = supabase
    .from('apostas_unificada')
    .select('stake, stake_total, lucro_prejuizo, resultado, forma_registro, status')
    .eq('projeto_id', projetoId);

  if (dataInicio) query = query.gte('data_aposta', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_aposta', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar dados de apostas:', error);
    return { count: 0, volume: 0, lucro: 0, countDetails: '' };
  }

  const apostas = data || [];
  
  // Contagem com detalhes (greens/reds)
  const greens = apostas.filter(a => a.resultado === 'GREEN' || a.resultado === 'MEIO_GREEN').length;
  const reds = apostas.filter(a => a.resultado === 'RED' || a.resultado === 'MEIO_RED').length;
  const countDetails = `${greens}G/${reds}R`;

  // Volume (stake)
  const volume = apostas.reduce((acc, a) => {
    const stake = a.forma_registro === 'ARBITRAGEM' ? Number(a.stake_total || 0) : Number(a.stake || 0);
    return acc + stake;
  }, 0);

  // Lucro (apenas liquidadas)
  const lucro = apostas
    .filter(a => a.status === 'LIQUIDADA')
    .reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0);

  return {
    count: apostas.length,
    volume,
    lucro,
    countDetails,
  };
}

async function fetchGirosGratisModuleData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
) {
  let query = supabase
    .from('giros_gratis' as any)
    .select('valor_retorno, quantidade_giros, valor_total_giros, status')
    .eq('projeto_id', projetoId)
    .eq('status', 'confirmado');

  if (dataInicio) query = query.gte('data_registro', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_registro', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar dados de giros grátis:', error);
    return { count: 0, valorTotal: 0, lucro: 0 };
  }

  const giros = (data || []) as any[];
  
  // Contagem de registros
  const count = giros.length;
  
  // Valor total dos giros (para volume)
  const valorTotal = giros.reduce((acc, g) => acc + Number(g.valor_total_giros || 0), 0);
  
  // Lucro (valor_retorno é sempre >= 0)
  const lucro = giros.reduce((acc, g) => acc + Math.max(0, Number(g.valor_retorno || 0)), 0);

  return { count, valorTotal, lucro };
}

async function fetchPerdasModuleData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
) {
  let query = supabase
    .from('projeto_perdas')
    .select('valor, status')
    .eq('projeto_id', projetoId);

  if (dataInicio) query = query.gte('data_perda', dataInicio.toISOString());
  if (dataFim) query = query.lte('data_perda', dataFim.toISOString());

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar dados de perdas:', error);
    return { confirmadas: 0, pendentes: 0 };
  }

  const perdas = data || [];
  
  const confirmadas = perdas
    .filter(p => p.status === 'CONFIRMADA')
    .reduce((acc, p) => acc + Number(p.valor || 0), 0);

  const pendentes = perdas
    .filter(p => p.status === 'PENDENTE')
    .reduce((acc, p) => acc + Number(p.valor || 0), 0);

  return { confirmadas, pendentes };
}

async function fetchAjustesModuleData(projetoId: string) {
  const { data, error } = await supabase
    .from('bookmaker_balance_audit')
    .select('saldo_anterior, saldo_novo')
    .eq('origem', 'CONCILIACAO_VINCULO')
    .eq('referencia_id', projetoId)
    .eq('referencia_tipo', 'projeto');

  if (error) {
    console.error('Erro ao buscar dados de ajustes:', error);
    return { total: 0 };
  }

  const total = (data || []).reduce((acc, item) => {
    const diferenca = Number(item.saldo_novo) - Number(item.saldo_anterior);
    return acc + diferenca;
  }, 0);

  return { total };
}
