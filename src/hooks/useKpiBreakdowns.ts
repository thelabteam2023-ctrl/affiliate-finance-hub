import { useCallback, useMemo } from 'react';
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from '@/lib/query-cache-config';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  ProjetoKpiBreakdowns, 
  KpiBreakdown, 
  CurrencyBreakdownItem,
  createModuleContribution, 
  createKpiBreakdown 
} from '@/types/moduleBreakdown';
import { getOperationalDateRangeForQuery } from '@/utils/dateUtils';
import { getConsolidatedStake, getConsolidatedLucro } from '@/utils/consolidatedValues';

interface UseKpiBreakdownsProps {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
  moedaConsolidacao?: string;
  /** Função oficial de conversão (de useProjetoCurrency.convertToConsolidationOficial).
   *  PADRONIZAÇÃO: Todos os KPIs devem usar esta mesma função para garantir paridade entre abas. */
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
}

interface UseKpiBreakdownsReturn {
  breakdowns: ProjetoKpiBreakdowns | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Query key for KPI breakdowns
export const PROJETO_BREAKDOWNS_QUERY_KEY = "projeto-breakdowns";

// Interface para dados por moeda de cada módulo
interface ModuleDataWithCurrency {
  count: number;
  volume: number;
  lucro: number;
  countDetails?: string;
  valorTotal?: number;
  confirmadas?: number;
  pendentes?: number;
  total?: number;
  // Breakdown por moeda
  volumePorMoeda: CurrencyBreakdownItem[];
  lucroPorMoeda: CurrencyBreakdownItem[];
}

/**
 * Helper para agregar valores por moeda
 */
function agregarPorMoeda(
  items: { valor: number; moeda: string }[]
): CurrencyBreakdownItem[] {
  const map = new Map<string, number>();
  
  items.forEach(({ valor, moeda }) => {
    const moedaNorm = (moeda || 'BRL').toUpperCase();
    map.set(moedaNorm, (map.get(moedaNorm) || 0) + valor);
  });
  
  return Array.from(map.entries())
    .map(([moeda, valor]) => ({ moeda, valor }))
    .filter(item => Math.abs(item.valor) > 0.01);
}

/**
 * Combina múltiplos breakdowns de moeda
 */
function combinarBreakdownsMoeda(
  ...breakdowns: CurrencyBreakdownItem[][]
): CurrencyBreakdownItem[] {
  const map = new Map<string, number>();
  
  breakdowns.flat().forEach(({ moeda, valor }) => {
    map.set(moeda, (map.get(moeda) || 0) + valor);
  });
  
  return Array.from(map.entries())
    .map(([moeda, valor]) => ({ moeda, valor }))
    .filter(item => Math.abs(item.valor) > 0.01);
}

/**
 * Fetches and calculates all KPI breakdowns from modules
 */
async function fetchBreakdownsData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null,
  moedaConsolidacao: string,
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number
): Promise<ProjetoKpiBreakdowns> {
  // PADRONIZADO: Usar exclusivamente a função de conversão oficial passada pelo caller.
  // Isso garante paridade com todas as outras abas (Bônus, Surebet, etc.)
  const safeConvert = convertToConsolidation || ((valor: number, _moeda: string) => valor);


  // Fetch dados de todos os módulos em paralelo
  const [
    apostasData,
    girosGratisData,
    perdasData,
    ajustesData,
    cashbackData,
  ] = await Promise.all([
    fetchApostasModuleData(projetoId, dataInicio, dataFim, moedaConsolidacao, safeConvert),
    fetchGirosGratisModuleData(projetoId, dataInicio, dataFim),
    fetchPerdasModuleData(projetoId, dataInicio, dataFim),
    fetchAjustesModuleData(projetoId),
    fetchCashbackModuleData(projetoId, dataInicio, dataFim, moedaConsolidacao, safeConvert),
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
  // NOTA: Giros Grátis NÃO entram no volume (apenas no lucro)
  const volumeBreakdown = createKpiBreakdown([
    createModuleContribution(
      'apostas',
      'Apostas',
      apostasData.volume,
      true,
      { icon: 'Target', color: 'default' }
    ),
  ], moedaConsolidacao);

  // Adiciona breakdown por moeda ao volume (apenas apostas, sem giros)
  volumeBreakdown.currencyBreakdown = apostasData.volumePorMoeda;

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
      { icon: 'Dices', color: 'positive' }
    ),
    createModuleContribution(
      'cashback',
      'Cashback',
      cashbackData.total || 0,
      (cashbackData.count || 0) > 0,
      { icon: 'Percent', color: 'positive' }
    ),
    createModuleContribution(
      'perdas',
      'Perdas Operacionais',
      -(perdasData.confirmadas || 0),
      (perdasData.confirmadas || 0) > 0,
      { icon: 'TrendingDown', color: 'negative' }
    ),
    createModuleContribution(
      'ajustes',
      'Ajustes Conciliação',
      ajustesData.total || 0,
      (ajustesData.total || 0) !== 0,
      { icon: 'Minus', color: (ajustesData.total || 0) >= 0 ? 'positive' : 'negative' }
    ),
  ], moedaConsolidacao);

  // Adiciona breakdown por moeda ao lucro
  lucroBreakdown.currencyBreakdown = combinarBreakdownsMoeda(
    apostasData.lucroPorMoeda,
    girosGratisData.lucroPorMoeda,
    cashbackData.lucroPorMoeda,
    // Perdas já em BRL normalmente
    perdasData.lucroPorMoeda.map(item => ({ ...item, valor: -item.valor })),
    ajustesData.lucroPorMoeda
  );

  // === ROI (calculado a partir do lucro e volume) ===
  const lucroTotal = lucroBreakdown.total;
  const volumeTotal = volumeBreakdown.total;
  const roiTotal = volumeTotal > 0 ? (lucroTotal / volumeTotal) * 100 : null;

  return {
    apostas: apostasBreakdown,
    volume: volumeBreakdown,
    lucro: lucroBreakdown,
    roi: {
      total: roiTotal,
      volumeTotal,
      lucroTotal,
      currency: moedaConsolidacao,
    },
  };
}

/**
 * Hook para calcular breakdowns dinâmicos dos KPIs por módulo.
 * 
 * Arquitetura:
 * - Cada módulo contribui independentemente
 * - Novos módulos podem ser adicionados sem alterar a lógica do tooltip
 * - Mesma estrutura alimenta KPIs, relatórios e exportações
 * - Usa React Query para cache e invalidação automática
 */
export function useKpiBreakdowns({
  projetoId,
  dataInicio = null,
  dataFim = null,
  moedaConsolidacao = 'BRL',
  convertToConsolidation,
}: UseKpiBreakdownsProps): UseKpiBreakdownsReturn {
  const queryClient = useQueryClient();

  const { 
    data: breakdowns = null, 
    isLoading: loading, 
    error,
    refetch 
  } = useQuery({
    queryKey: [
      PROJETO_BREAKDOWNS_QUERY_KEY, 
      projetoId, 
      dataInicio?.toISOString(), 
      dataFim?.toISOString(),
      moedaConsolidacao
    ],
    queryFn: () => fetchBreakdownsData(projetoId, dataInicio, dataFim, moedaConsolidacao, convertToConsolidation),
    enabled: !!projetoId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    breakdowns,
    loading,
    error: error ? String(error) : null,
    refresh,
  };
}

// === Funções de fetch por módulo ===

async function fetchApostasModuleData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null,
  moedaConsolidacao: string,
  convertToConsolidation: (valor: number, moedaOrigem: string) => number
): Promise<ModuleDataWithCurrency> {
  let query = supabase
    .from('apostas_unificada')
    .select('stake, stake_total, lucro_prejuizo, resultado, forma_registro, status, moeda_operacao, consolidation_currency, pl_consolidado, stake_consolidado, lucro_prejuizo_brl_referencia, valor_brl_referencia')
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
    console.error('Erro ao buscar dados de apostas:', error);
    return { count: 0, volume: 0, lucro: 0, countDetails: '', volumePorMoeda: [], lucroPorMoeda: [] };
  }

  const apostas = data || [];
  
  const greens = apostas.filter(a => a.resultado === 'GREEN' || a.resultado === 'MEIO_GREEN').length;
  const reds = apostas.filter(a => a.resultado === 'RED' || a.resultado === 'MEIO_RED').length;
  const voids = apostas.filter(a => a.resultado === 'VOID' || a.resultado === 'REEMBOLSO').length;
  const countDetails = `${greens}G ${reds}R ${voids}V`;

  // Volume CONSOLIDADO - usando a mesma lógica de useProjetoResultado
  const volume = apostas.reduce((acc, a) => {
    return acc + getConsolidatedStake(
      a as any,
      convertToConsolidation,
      moedaConsolidacao
    );
  }, 0);

  // Lucro CONSOLIDADO - usando a mesma lógica de useProjetoResultado
  const lucro = apostas
    .filter(a => a.status === 'LIQUIDADA')
    .reduce((acc, a) => {
      return acc + getConsolidatedLucro(
        a as any,
        convertToConsolidation,
        moedaConsolidacao
      );
    }, 0);

  // Agregação por moeda ORIGINAL - para tooltip breakdown
  const volumeItems = apostas.map(a => ({
    valor: a.forma_registro === 'ARBITRAGEM' ? Number(a.stake_total || 0) : Number(a.stake || 0),
    moeda: a.moeda_operacao || 'BRL'
  }));
  const volumePorMoeda = agregarPorMoeda(volumeItems);

  // Agregação por moeda ORIGINAL - para tooltip breakdown
  const lucroItems = apostas
    .filter(a => a.status === 'LIQUIDADA')
    .map(a => ({
      valor: Number(a.lucro_prejuizo || 0),
      moeda: a.moeda_operacao || 'BRL'
    }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return {
    count: apostas.length,
    volume,
    lucro,
    countDetails,
    volumePorMoeda,
    lucroPorMoeda,
  };
}

async function fetchGirosGratisModuleData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
): Promise<ModuleDataWithCurrency> {
  let query = supabase
    .from('giros_gratis' as any)
    .select('valor_retorno, quantidade_giros, valor_total_giros, status, bookmaker_id')
    .eq('projeto_id', projetoId)
    .eq('status', 'confirmado');

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
    console.error('Erro ao buscar dados de giros grátis:', error);
    return { count: 0, volume: 0, lucro: 0, valorTotal: 0, volumePorMoeda: [], lucroPorMoeda: [] };
  }

  const giros = (data || []) as any[];
  
  // Buscar moedas das bookmakers
  const bookmakerIds = [...new Set(giros.map(g => g.bookmaker_id).filter(Boolean))];
  let bookmakerMoedas: Record<string, string> = {};
  
  if (bookmakerIds.length > 0) {
    const { data: bookmakers } = await supabase
      .from('bookmakers')
      .select('id, moeda')
      .in('id', bookmakerIds);
    
    bookmakerMoedas = (bookmakers || []).reduce((acc, b) => {
      acc[b.id] = b.moeda || 'BRL';
      return acc;
    }, {} as Record<string, string>);
  }

  const count = giros.length;
  const valorTotal = giros.reduce((acc, g) => acc + Number(g.valor_total_giros || 0), 0);
  const lucro = giros.reduce((acc, g) => acc + Math.max(0, Number(g.valor_retorno || 0)), 0);

  // Agregação por moeda
  const volumeItems = giros.map(g => ({
    valor: Number(g.valor_total_giros || 0),
    moeda: bookmakerMoedas[g.bookmaker_id] || 'BRL'
  }));
  const volumePorMoeda = agregarPorMoeda(volumeItems);

  const lucroItems = giros.map(g => ({
    valor: Math.max(0, Number(g.valor_retorno || 0)),
    moeda: bookmakerMoedas[g.bookmaker_id] || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count, volume: 0, lucro, valorTotal, volumePorMoeda, lucroPorMoeda };
}

async function fetchPerdasModuleData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null
): Promise<ModuleDataWithCurrency> {
  let query = supabase
    .from('projeto_perdas')
    .select('valor, status, bookmaker_id')
    .eq('projeto_id', projetoId);

  // CRÍTICO: Usar timezone operacional (America/Sao_Paulo)
  if (dataInicio && dataFim) {
    const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicio, dataFim);
    query = query.gte('data_perda', startUTC).lte('data_perda', endUTC);
  } else if (dataInicio) {
    const { startUTC } = getOperationalDateRangeForQuery(dataInicio, dataInicio);
    query = query.gte('data_perda', startUTC);
  } else if (dataFim) {
    const { endUTC } = getOperationalDateRangeForQuery(dataFim, dataFim);
    query = query.lte('data_perda', endUTC);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar dados de perdas:', error);
    return { count: 0, volume: 0, lucro: 0, confirmadas: 0, pendentes: 0, volumePorMoeda: [], lucroPorMoeda: [] };
  }

  const perdas = data || [];
  
  // Buscar moedas das bookmakers
  const bookmakerIds = [...new Set(perdas.map((p: any) => p.bookmaker_id).filter(Boolean))];
  let bookmakerMoedas: Record<string, string> = {};
  
  if (bookmakerIds.length > 0) {
    const { data: bookmakers } = await supabase
      .from('bookmakers')
      .select('id, moeda')
      .in('id', bookmakerIds);
    
    bookmakerMoedas = (bookmakers || []).reduce((acc, b) => {
      acc[b.id] = b.moeda || 'BRL';
      return acc;
    }, {} as Record<string, string>);
  }
  
  const confirmadas = perdas
    .filter(p => p.status === 'CONFIRMADA')
    .reduce((acc, p) => acc + Number(p.valor || 0), 0);

  const pendentes = perdas
    .filter(p => p.status === 'PENDENTE')
    .reduce((acc, p) => acc + Number(p.valor || 0), 0);

  // Agregação por moeda (só confirmadas)
  const lucroItems = perdas
    .filter(p => p.status === 'CONFIRMADA')
    .map((p: any) => ({
      valor: Number(p.valor || 0),
      moeda: bookmakerMoedas[p.bookmaker_id] || 'BRL'
    }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { 
    count: 0, 
    volume: 0, 
    lucro: 0, 
    confirmadas, 
    pendentes, 
    volumePorMoeda: [], 
    lucroPorMoeda 
  };
}

async function fetchAjustesModuleData(projetoId: string): Promise<ModuleDataWithCurrency> {
  const { data, error } = await supabase
    .from('bookmaker_balance_audit')
    .select('saldo_anterior, saldo_novo, bookmaker_id')
    .eq('origem', 'CONCILIACAO_VINCULO')
    .eq('referencia_id', projetoId)
    .eq('referencia_tipo', 'projeto');

  if (error) {
    console.error('Erro ao buscar dados de ajustes:', error);
    return { count: 0, volume: 0, lucro: 0, total: 0, volumePorMoeda: [], lucroPorMoeda: [] };
  }

  const ajustes = data || [];

  // Buscar moedas das bookmakers
  const bookmakerIds = [...new Set(ajustes.map(a => a.bookmaker_id).filter(Boolean))];
  let bookmakerMoedas: Record<string, string> = {};
  
  if (bookmakerIds.length > 0) {
    const { data: bookmakers } = await supabase
      .from('bookmakers')
      .select('id, moeda')
      .in('id', bookmakerIds);
    
    bookmakerMoedas = (bookmakers || []).reduce((acc, b) => {
      acc[b.id] = b.moeda || 'BRL';
      return acc;
    }, {} as Record<string, string>);
  }

  const total = ajustes.reduce((acc, item) => {
    const diferenca = Number(item.saldo_novo) - Number(item.saldo_anterior);
    return acc + diferenca;
  }, 0);

  // Agregação por moeda
  const lucroItems = ajustes.map(item => ({
    valor: Number(item.saldo_novo) - Number(item.saldo_anterior),
    moeda: bookmakerMoedas[item.bookmaker_id] || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count: 0, volume: 0, lucro: 0, total, volumePorMoeda: [], lucroPorMoeda };
}

async function fetchCashbackModuleData(
  projetoId: string,
  dataInicio: Date | null,
  dataFim: Date | null,
  moedaConsolidacao: string,
  convertToConsolidation: (valor: number, moedaOrigem: string) => number
): Promise<ModuleDataWithCurrency> {
  let query = supabase
    .from('cashback_manual')
    .select('valor, valor_brl_referencia, moeda_operacao')
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
    console.error('Erro ao buscar dados de cashback:', error);
    return { count: 0, volume: 0, lucro: 0, total: 0, volumePorMoeda: [], lucroPorMoeda: [] };
  }

  const cashbacks = data || [];
  
  const count = cashbacks.length;
  // Total CONSOLIDADO - aplicar conversão correta
  const total = cashbacks.reduce((acc, cb) => {
    const moedaOp = cb.moeda_operacao || 'BRL';
    const valorOriginal = Number(cb.valor || 0);
    // Se mesma moeda, usar direto
    if (moedaOp === moedaConsolidacao) return acc + valorOriginal;
    // Se consolidação é BRL e temos valor_brl_referencia, usar
    if (moedaConsolidacao === 'BRL' && cb.valor_brl_referencia != null) {
      return acc + Number(cb.valor_brl_referencia);
    }
    // Converter via cotação oficial
    return acc + convertToConsolidation(valorOriginal, moedaOp);
  }, 0);

  // Agregação por moeda original
  const lucroItems = cashbacks.map(cb => ({
    valor: Number(cb.valor || 0),
    moeda: cb.moeda_operacao || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count, volume: 0, lucro: 0, total, volumePorMoeda: [], lucroPorMoeda };
}
