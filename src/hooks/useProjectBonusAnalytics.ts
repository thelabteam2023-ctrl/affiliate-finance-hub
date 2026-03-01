import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";

/**
 * Estatísticas de bônus por casa (bookmaker_catalogo_id) DENTRO DE UM PROJETO
 */
export interface BookmakerBonusStats {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  currency: string;
  total_bonus_count: number;
  total_bonus_value: number;
  bonus_pending_count: number;
  bonus_credited_count: number;
  bonus_finalized_count: number;
  bonus_converted_count: number;
  bonus_problem_count: number;
  total_bets: number;
  total_stake: number;
  bets_won: number;
  bets_lost: number;
  bets_pending: number;
  bets_void: number;
  completion_rate: number;
  total_deposits: number;
  total_withdrawals: number;
  net_profit: number;
  roi: number;
  bonus_conversion_rate: number;
  problem_index: number;
  rollover_efficiency: number;
}

export interface BookmakerStatusBreakdown {
  ativas: number;
  concluidas: number;
  encerradas: number;
  pausadas: number;
  limitadas: number;
  bloqueadas: number;
}

export interface CurrencyVolumeBreakdown {
  moeda: string;
  valor: number;
}

export interface ProjectBonusAnalyticsSummary {
  total_bookmakers: number;
  total_bonus_count: number;
  primary_currency: string | 'MULTI';
  total_bonus_value_display: string;
  total_stake_display: string;
  status_breakdown: BookmakerStatusBreakdown;
  volume_breakdown: CurrencyVolumeBreakdown[];
  total_volume_consolidated: number;
  moeda_consolidacao: string;
}

interface AnalyticsRawData {
  stats: BookmakerBonusStats[];
  bookmakerStatuses: Map<string, string>;
  moedaConsolidacao: string;
}

interface UseProjectBonusAnalyticsReturn {
  stats: BookmakerBonusStats[];
  summary: ProjectBonusAnalyticsSummary;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchBonusAnalytics(projectId: string): Promise<AnalyticsRawData> {
  // 1. Buscar bônus DO PROJETO agrupados por bookmaker
  const { data: bonusData, error: bonusError } = await supabase
    .from("project_bookmaker_link_bonuses")
    .select(`
      id,
      bonus_amount,
      status,
      finalize_reason,
      deposit_amount,
      bookmaker_id,
      bookmakers!project_bookmaker_link_bonuses_bookmaker_id_fkey (
        id,
        moeda,
        status,
        bookmaker_catalogo_id,
        nome,
        bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (
          id,
          nome,
          logo_url
        )
      )
    `)
    .eq("project_id", projectId);

  if (bonusError) throw bonusError;

  const bookmakerIds = (bonusData || [])
    .map((b: any) => b.bookmaker_id)
    .filter((id: string | null): id is string => !!id);

  if (bookmakerIds.length === 0) {
    return { stats: [], bookmakerStatuses: new Map(), moedaConsolidacao: 'BRL' };
  }

  // 2. Parallel fetches
  const [betsRes, projetoRes, withdrawalsRes] = await Promise.all([
    supabase
      .from("apostas_unificada")
      .select(`
        id,
        bookmaker_id,
        stake,
        stake_total,
        stake_consolidado,
        resultado,
        status,
        bonus_id,
        is_bonus_bet,
        estrategia,
        contexto_operacional,
        forma_registro,
        moeda_operacao,
        bookmakers!apostas_unificada_bookmaker_id_fkey ( bookmaker_catalogo_id, moeda )
      `)
      .eq("projeto_id", projectId)
      .in("bookmaker_id", bookmakerIds)
      .or("bonus_id.not.is.null,is_bonus_bet.eq.true,estrategia.eq.EXTRACAO_BONUS,contexto_operacional.eq.BONUS")
      .neq("status", "CANCELADA"),
    supabase
      .from("projetos")
      .select("moeda_consolidacao")
      .eq("id", projectId)
      .single(),
    supabase
      .from("cash_ledger")
      .select("id, valor, origem_bookmaker_id, tipo_transacao, status")
      .in("origem_bookmaker_id", bookmakerIds)
      .eq("tipo_transacao", "SAQUE")
      .eq("status", "CONFIRMADO"),
  ]);

  if (betsRes.error) throw betsRes.error;
  if (withdrawalsRes.error) throw withdrawalsRes.error;

  const betsData = betsRes.data || [];
  const withdrawalsData = withdrawalsRes.data || [];
  const moedaConsolidacao = projetoRes.data?.moeda_consolidacao || 'BRL';

  // 3. Agregar por bookmaker_catalogo_id
  const catalogoMap = new Map<string, {
    nome: string;
    logo_url: string | null;
    currency: string;
    bookmakerStatuses: Set<string>;
    bookmakerIds: Set<string>;
    bonus: any[];
    bets: any[];
    totalDeposits: number;
    totalWithdrawals: number;
  }>();

  (bonusData || []).forEach((b: any) => {
    const catalogoId = b.bookmakers?.bookmaker_catalogo_id;
    if (!catalogoId) return;
    const catalogoInfo = b.bookmakers?.bookmakers_catalogo;
    const currency = b.bookmakers?.moeda || 'BRL';
    if (!catalogoMap.has(catalogoId)) {
      catalogoMap.set(catalogoId, {
        nome: catalogoInfo?.nome || b.bookmakers?.nome || 'Casa Desconhecida',
        logo_url: catalogoInfo?.logo_url || null,
        currency,
        bookmakerStatuses: new Set(),
        bookmakerIds: new Set(),
        bonus: [],
        bets: [],
        totalDeposits: 0,
        totalWithdrawals: 0,
      });
    }
    const entry = catalogoMap.get(catalogoId)!;
    entry.bonus.push(b);
    entry.bookmakerIds.add(b.bookmaker_id);
    if (b.bookmakers?.status) entry.bookmakerStatuses.add(b.bookmakers.status);
    entry.totalDeposits += Number(b.deposit_amount) || 0;
  });

  betsData.forEach((bet: any) => {
    const catalogoId = bet.bookmakers?.bookmaker_catalogo_id;
    if (!catalogoId || !catalogoMap.has(catalogoId)) return;
    catalogoMap.get(catalogoId)!.bets.push(bet);
  });

  withdrawalsData.forEach((w: any) => {
    for (const [, data] of catalogoMap.entries()) {
      if (data.bookmakerIds.has(w.origem_bookmaker_id)) {
        data.totalWithdrawals += Number(w.valor) || 0;
        break;
      }
    }
  });

  // 4. Calcular métricas
  const statsArray: BookmakerBonusStats[] = [];

  catalogoMap.forEach((data, catalogoId) => {
    const bonuses = data.bonus;
    const bets = data.bets;

    const totalBonusCount = bonuses.length;
    const totalBonusValue = bonuses.reduce((sum: number, b: any) => sum + Number(b.bonus_amount || 0), 0);
    const pendingCount = bonuses.filter((b: any) => b.status === 'pending').length;
    const creditedCount = bonuses.filter((b: any) => b.status === 'credited' || b.status === 'finalized').length;
    const finalizedCount = bonuses.filter((b: any) => b.status === 'finalized').length;
    const convertedCount = bonuses.filter((b: any) =>
      b.status === 'finalized' &&
      ['rollover_completed', 'cycle_completed', 'early_withdrawal', 'extracted_early'].includes(b.finalize_reason || '')
    ).length;
    const problemCount = bonuses.filter((b: any) =>
      b.status === 'failed' ||
      b.status === 'expired' ||
      b.status === 'reversed' ||
      (b.status === 'finalized' && ['cancelled_reversed', 'bonus_consumed', 'expired'].includes(b.finalize_reason || ''))
    ).length;

    const totalBets = bets.length;
    const totalStake = bets.reduce((sum: number, b: any) => {
      const isMultiLeg = b.forma_registro === 'ARBITRAGEM' || b.forma_registro === 'SUREBET';
      const stakeBase = isMultiLeg ? Number(b.stake_total ?? 0) : Number(b.stake ?? 0);
      return sum + stakeBase;
    }, 0);
    const betsWon = bets.filter((b: any) => b.resultado === 'GREEN' || b.resultado === 'MEIO_GREEN').length;
    const betsLost = bets.filter((b: any) => b.resultado === 'RED' || b.resultado === 'MEIO_RED').length;
    const betsPending = bets.filter((b: any) => b.status === 'PENDENTE').length;
    const betsVoid = bets.filter((b: any) => b.resultado === 'VOID' || b.resultado === 'REEMBOLSO').length;

    const totalDeposits = data.totalDeposits;
    const totalWithdrawals = data.totalWithdrawals;
    const netProfit = totalWithdrawals - totalDeposits;
    const roi = totalDeposits > 0 ? ((totalWithdrawals - totalDeposits) / totalDeposits) * 100 : 0;
    const completionRate = creditedCount > 0 ? (finalizedCount / creditedCount) * 100 : 0;
    const bonusConversionRate = creditedCount > 0 ? (convertedCount / creditedCount) * 100 : 0;
    const problemIndex = totalBonusCount > 0 ? (problemCount / totalBonusCount) * 100 : 0;
    const rolloverEfficiency = totalStake > 0 ? (netProfit / totalStake) * 100 : 0;

    statsArray.push({
      bookmaker_catalogo_id: catalogoId,
      nome: data.nome,
      logo_url: data.logo_url,
      currency: data.currency,
      total_bonus_count: totalBonusCount,
      total_bonus_value: totalBonusValue,
      bonus_pending_count: pendingCount,
      bonus_credited_count: creditedCount,
      bonus_finalized_count: finalizedCount,
      bonus_converted_count: convertedCount,
      bonus_problem_count: problemCount,
      total_bets: totalBets,
      total_stake: totalStake,
      bets_won: betsWon,
      bets_lost: betsLost,
      bets_pending: betsPending,
      bets_void: betsVoid,
      completion_rate: completionRate,
      total_deposits: totalDeposits,
      total_withdrawals: totalWithdrawals,
      net_profit: netProfit,
      roi,
      bonus_conversion_rate: bonusConversionRate,
      problem_index: problemIndex,
      rollover_efficiency: rolloverEfficiency,
    });
  });

  statsArray.sort((a, b) => b.roi - a.roi);

  // Coletar statuses individuais de bookmakers
  const statusMap = new Map<string, string>();
  catalogoMap.forEach((data) => {
    (data.bonus as any[]).forEach((b: any) => {
      if (b.bookmaker_id && b.bookmakers?.status) {
        statusMap.set(b.bookmaker_id, b.bookmakers.status);
      }
    });
  });

  return { stats: statsArray, bookmakerStatuses: statusMap, moedaConsolidacao };
}

const emptyBreakdown: BookmakerStatusBreakdown = {
  ativas: 0, concluidas: 0, encerradas: 0, pausadas: 0, limitadas: 0, bloqueadas: 0,
};

const emptySummary: ProjectBonusAnalyticsSummary = {
  total_bookmakers: 0,
  total_bonus_count: 0,
  primary_currency: 'BRL',
  total_bonus_value_display: 'R$ 0',
  total_stake_display: 'R$ 0',
  status_breakdown: { ...emptyBreakdown },
  volume_breakdown: [],
  total_volume_consolidated: 0,
  moeda_consolidacao: 'BRL',
};

export function useProjectBonusAnalytics(projectId: string): UseProjectBonusAnalyticsReturn {
  const { data: rawData, isLoading, error, refetch } = useQuery({
    queryKey: ["bonus-analytics", projectId],
    queryFn: () => fetchBonusAnalytics(projectId),
    enabled: !!projectId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
    placeholderData: (prev: any) => prev,
  });

  const stats = rawData?.stats ?? [];
  const bookmakerStatuses = rawData?.bookmakerStatuses ?? new Map<string, string>();
  const moedaConsolidacaoProjeto = rawData?.moedaConsolidacao ?? 'BRL';

  const summary = useMemo((): ProjectBonusAnalyticsSummary => {
    if (stats.length === 0) {
      return { ...emptySummary, moeda_consolidacao: moedaConsolidacaoProjeto };
    }

    const totalBonusCount = stats.reduce((sum, s) => sum + s.total_bonus_count, 0);
    const currencies = [...new Set(stats.map(s => s.currency))];
    const isMultiCurrency = currencies.length > 1;

    const formatValue = (value: number, currency: string) => {
      const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£', USDT: 'USDT' };
      return `${symbols[currency] || currency} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    };

    // Volume breakdown by currency
    const volumeByCurrency: Record<string, number> = {};
    stats.forEach(s => {
      volumeByCurrency[s.currency] = (volumeByCurrency[s.currency] || 0) + s.total_stake;
    });
    const volumeBreakdown: CurrencyVolumeBreakdown[] = Object.entries(volumeByCurrency)
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) >= 0.01);

    const totalVolumeConsolidated = stats.reduce((sum, s) => sum + s.total_stake, 0);

    let totalBonusValueDisplay: string;
    let totalStakeDisplay: string;

    if (isMultiCurrency) {
      const byCurrency: Record<string, { bonus: number; stake: number }> = {};
      stats.forEach(s => {
        if (!byCurrency[s.currency]) byCurrency[s.currency] = { bonus: 0, stake: 0 };
        byCurrency[s.currency].bonus += s.total_bonus_value;
        byCurrency[s.currency].stake += s.total_stake;
      });
      totalBonusValueDisplay = Object.entries(byCurrency).map(([curr, vals]) => formatValue(vals.bonus, curr)).join(' + ');
      totalStakeDisplay = Object.entries(byCurrency).map(([curr, vals]) => formatValue(vals.stake, curr)).join(' + ');
    } else {
      const currency = currencies[0] || 'BRL';
      totalBonusValueDisplay = formatValue(stats.reduce((sum, s) => sum + s.total_bonus_value, 0), currency);
      totalStakeDisplay = formatValue(stats.reduce((sum, s) => sum + s.total_stake, 0), currency);
    }

    // Status breakdown
    const statusBreakdown: BookmakerStatusBreakdown = { ...emptyBreakdown };
    const statusMapping: Record<string, keyof BookmakerStatusBreakdown> = {
      'ativo': 'ativas', 'limitada': 'limitadas', 'encerrada': 'encerradas',
      'bloqueada': 'bloqueadas', 'pausada': 'pausadas',
    };
    bookmakerStatuses.forEach((status) => {
      const key = statusMapping[status.toLowerCase()];
      if (key) statusBreakdown[key]++;
      else statusBreakdown.ativas++;
    });

    return {
      total_bookmakers: bookmakerStatuses.size,
      total_bonus_count: totalBonusCount,
      primary_currency: isMultiCurrency ? 'MULTI' : (currencies[0] || 'BRL'),
      total_bonus_value_display: totalBonusValueDisplay,
      total_stake_display: totalStakeDisplay,
      status_breakdown: statusBreakdown,
      volume_breakdown: volumeBreakdown,
      total_volume_consolidated: totalVolumeConsolidated,
      moeda_consolidacao: moedaConsolidacaoProjeto,
    };
  }, [stats, bookmakerStatuses, moedaConsolidacaoProjeto]);

  return {
    stats,
    summary,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "Erro ao buscar análises") : null,
    refetch,
  };
}
