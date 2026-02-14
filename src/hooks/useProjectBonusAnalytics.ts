import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Estatísticas de bônus por casa (bookmaker_catalogo_id) DENTRO DE UM PROJETO
 * 
 * Métricas avançadas de rentabilidade e risco para apoiar decisão estratégica:
 * - ROI: (Sacado - Depositado) / Depositado * 100
 * - Taxa de conversão de bônus
 * - Índice de problemas (risco)
 * - Eficiência do rollover
 */
export interface BookmakerBonusStats {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  currency: string;
  
  // Métricas de bônus
  total_bonus_count: number;
  total_bonus_value: number;
  bonus_credited_count: number;
  bonus_finalized_count: number;
  bonus_converted_count: number;
  bonus_problem_count: number;
  
  // Métricas de apostas
  total_bets: number;
  total_stake: number;
  bets_won: number;
  bets_lost: number;
  bets_pending: number;
  bets_void: number;
  
  // Taxa de conclusão
  completion_rate: number;
  
  // Depósitos e Saques
  total_deposits: number;
  total_withdrawals: number;
  
  // MÉTRICAS AVANÇADAS DE RENTABILIDADE
  net_profit: number; // Lucro Líquido = Sacado - Depositado
  roi: number; // ROI (%) = (Sacado - Depositado) / Depositado * 100
  
  // MÉTRICAS DE RISCO E EFICIÊNCIA
  bonus_conversion_rate: number; // % de bônus que resultaram em conversão
  problem_index: number; // % de bônus com problema
  rollover_efficiency: number; // Lucro / Volume Apostado * 100
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
  // New fields
  status_breakdown: BookmakerStatusBreakdown;
  volume_breakdown: CurrencyVolumeBreakdown[];
  total_volume_consolidated: number;
  moeda_consolidacao: string;
}

interface UseProjectBonusAnalyticsReturn {
  stats: BookmakerBonusStats[];
  summary: ProjectBonusAnalyticsSummary;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useProjectBonusAnalytics(projectId: string): UseProjectBonusAnalyticsReturn {
  const [stats, setStats] = useState<BookmakerBonusStats[]>([]);
  const [bookmakerStatuses, setBookmakerStatuses] = useState<Map<string, string>>(new Map());
  const [moedaConsolidacaoProjeto, setMoedaConsolidacaoProjeto] = useState<string>('BRL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!projectId) {
      setStats([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

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
        setStats([]);
        setLoading(false);
        return;
      }

      // 2. Buscar apostas das bookmakers
      const { data: betsData, error: betsError } = await supabase
        .from("apostas_unificada")
        .select(`
          id,
          bookmaker_id,
          stake,
          stake_consolidado,
          resultado,
          status,
          bonus_id,
          moeda_operacao,
          bookmakers!apostas_unificada_bookmaker_id_fkey (
            bookmaker_catalogo_id,
            moeda
          )
        `)
        .eq("projeto_id", projectId)
        .in("bookmaker_id", bookmakerIds)
        .neq("status", "CANCELADA");

      // 2b. Buscar moeda de consolidação do projeto
      const { data: projetoData } = await supabase
        .from("projetos")
        .select("moeda_consolidacao")
        .eq("id", projectId)
        .single();

      if (betsError) throw betsError;

      // 3. Buscar saques CONFIRMADOS do cash_ledger
      const { data: withdrawalsData, error: withdrawalsError } = await supabase
        .from("cash_ledger")
        .select(`
          id,
          valor,
          origem_bookmaker_id,
          tipo_transacao,
          status
        `)
        .in("origem_bookmaker_id", bookmakerIds)
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO");

      if (withdrawalsError) throw withdrawalsError;

      // 4. Agregar por bookmaker_catalogo_id
      const catalogoMap = new Map<string, {
        nome: string;
        logo_url: string | null;
        currency: string;
        bookmakerStatuses: Set<string>;
        bookmakerIds: Set<string>;
        bonus: typeof bonusData;
        bets: typeof betsData;
        totalDeposits: number;
        totalWithdrawals: number;
      }>();

      // Processar bônus
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
        if (b.bookmakers?.status) {
          entry.bookmakerStatuses.add(b.bookmakers.status);
        }
        entry.totalDeposits += Number(b.deposit_amount) || 0;
      });

      // Processar apostas
      (betsData || []).forEach((bet: any) => {
        const catalogoId = bet.bookmakers?.bookmaker_catalogo_id;
        if (!catalogoId || !catalogoMap.has(catalogoId)) return;
        
        catalogoMap.get(catalogoId)!.bets.push(bet);
      });

      // Processar saques
      (withdrawalsData || []).forEach((w: any) => {
        // Encontrar o catalogo_id pelo bookmaker_id
        for (const [catalogoId, data] of catalogoMap.entries()) {
          if (data.bookmakerIds.has(w.origem_bookmaker_id)) {
            data.totalWithdrawals += Number(w.valor) || 0;
            break;
          }
        }
      });

      // 5. Calcular métricas
      const statsArray: BookmakerBonusStats[] = [];

      catalogoMap.forEach((data, catalogoId) => {
        const bonuses = data.bonus;
        const bets = data.bets;

        // Métricas de bônus
        const totalBonusCount = bonuses.length;
        const totalBonusValue = bonuses.reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0);
        const creditedCount = bonuses.filter(b => b.status === 'credited' || b.status === 'finalized').length;
        const finalizedCount = bonuses.filter(b => b.status === 'finalized').length;
        const convertedCount = bonuses.filter(b => 
          b.status === 'finalized' && 
          ['rollover_completed', 'cycle_completed', 'early_withdrawal', 'extracted_early'].includes(b.finalize_reason || '')
        ).length;
        const problemCount = bonuses.filter(b => 
          b.status === 'failed' || 
          b.status === 'expired' || 
          b.status === 'reversed' ||
          (b.status === 'finalized' && ['cancelled_reversed', 'bonus_consumed', 'expired'].includes(b.finalize_reason || ''))
        ).length;

        // Métricas de apostas
        const totalBets = bets.length;
        const totalStake = bets.reduce((sum, b) => sum + Number(b.stake || 0), 0);
        const betsWon = bets.filter(b => b.resultado === 'GREEN' || b.resultado === 'MEIO_GREEN').length;
        const betsLost = bets.filter(b => b.resultado === 'RED' || b.resultado === 'MEIO_RED').length;
        const betsPending = bets.filter(b => b.status === 'PENDENTE').length;
        const betsVoid = bets.filter(b => b.resultado === 'VOID' || b.resultado === 'REEMBOLSO').length;

        // Depósitos e Saques
        const totalDeposits = data.totalDeposits;
        const totalWithdrawals = data.totalWithdrawals;

        // MÉTRICAS AVANÇADAS DE RENTABILIDADE
        const netProfit = totalWithdrawals - totalDeposits;
        const roi = totalDeposits > 0 ? ((totalWithdrawals - totalDeposits) / totalDeposits) * 100 : 0;

        // Taxa de conclusão
        const completionRate = creditedCount > 0 ? (finalizedCount / creditedCount) * 100 : 0;

        // MÉTRICAS DE RISCO E EFICIÊNCIA
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

      // Ordenar por ROI decrescente
      statsArray.sort((a, b) => b.roi - a.roi);

      // Coletar statuses individuais de bookmakers
      const statusMap = new Map<string, string>();
      catalogoMap.forEach((data) => {
        // Each bonus has a bookmaker with a status
        (data.bonus as any[]).forEach((b: any) => {
          if (b.bookmaker_id && b.bookmakers?.status) {
            statusMap.set(b.bookmaker_id, b.bookmakers.status);
          }
        });
      });
      setBookmakerStatuses(statusMap);
      setMoedaConsolidacaoProjeto(projetoData?.moeda_consolidacao || 'BRL');
      setStats(statsArray);
    } catch (err) {
      console.error("Error fetching project bonus analytics:", err);
      setError(err instanceof Error ? err.message : "Erro ao buscar análises");
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = useMemo((): ProjectBonusAnalyticsSummary => {
    const emptyBreakdown: BookmakerStatusBreakdown = {
      ativas: 0, concluidas: 0, encerradas: 0, pausadas: 0, limitadas: 0, bloqueadas: 0,
    };

    if (stats.length === 0) {
      return {
        total_bookmakers: 0,
        total_bonus_count: 0,
        primary_currency: 'BRL',
        total_bonus_value_display: 'R$ 0',
        total_stake_display: 'R$ 0',
        status_breakdown: emptyBreakdown,
        volume_breakdown: [],
        total_volume_consolidated: 0,
        moeda_consolidacao: moedaConsolidacaoProjeto,
      };
    }

    const totalBonusCount = stats.reduce((sum, s) => sum + s.total_bonus_count, 0);
    
    const currencies = [...new Set(stats.map(s => s.currency))];
    const isMultiCurrency = currencies.length > 1;
    
    const formatValue = (value: number, currency: string) => {
      const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£', USDT: 'USDT' };
      return `${symbols[currency] || currency} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    };
    
    let totalBonusValueDisplay: string;
    let totalStakeDisplay: string;
    
    // Volume breakdown by currency
    const volumeByCurrency: Record<string, number> = {};
    stats.forEach(s => {
      volumeByCurrency[s.currency] = (volumeByCurrency[s.currency] || 0) + s.total_stake;
    });
    const volumeBreakdown: CurrencyVolumeBreakdown[] = Object.entries(volumeByCurrency)
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) >= 0.01);

    // Total volume consolidated (use stake_consolidado when available, otherwise raw sum)
    const totalVolumeConsolidated = stats.reduce((sum, s) => sum + s.total_stake, 0);
    
    if (isMultiCurrency) {
      const byCurrency: Record<string, { bonus: number; stake: number }> = {};
      stats.forEach(s => {
        if (!byCurrency[s.currency]) {
          byCurrency[s.currency] = { bonus: 0, stake: 0 };
        }
        byCurrency[s.currency].bonus += s.total_bonus_value;
        byCurrency[s.currency].stake += s.total_stake;
      });
      
      totalBonusValueDisplay = Object.entries(byCurrency)
        .map(([curr, vals]) => formatValue(vals.bonus, curr))
        .join(' + ');
      totalStakeDisplay = Object.entries(byCurrency)
        .map(([curr, vals]) => formatValue(vals.stake, curr))
        .join(' + ');
    } else {
      const currency = currencies[0] || 'BRL';
      const totalBonus = stats.reduce((sum, s) => sum + s.total_bonus_value, 0);
      const totalStake = stats.reduce((sum, s) => sum + s.total_stake, 0);
      totalBonusValueDisplay = formatValue(totalBonus, currency);
      totalStakeDisplay = formatValue(totalStake, currency);
    }

    // Status breakdown from bookmaker instances
    const statusBreakdown: BookmakerStatusBreakdown = { ...emptyBreakdown };
    const statusMapping: Record<string, keyof BookmakerStatusBreakdown> = {
      'ativo': 'ativas',
      'limitada': 'limitadas',
      'encerrada': 'encerradas',
      'bloqueada': 'bloqueadas',
      'pausada': 'pausadas',
    };
    
    bookmakerStatuses.forEach((status) => {
      const key = statusMapping[status.toLowerCase()];
      if (key) {
        statusBreakdown[key]++;
      } else {
        // Treat unknown statuses as "concluidas" if finalized, otherwise ativas
        statusBreakdown.ativas++;
      }
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
    loading,
    error,
    refetch: fetchAnalytics,
  };
}