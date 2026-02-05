import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Estatísticas de bônus por casa (bookmaker_catalogo_id) DENTRO DE UM PROJETO
 * 
 * Correções conceituais aplicadas:
 * - Sem classificação automática (dados insuficientes para classificar)
 * - Multi-moeda: valores exibidos na moeda nativa da casa
 * - Remoção de ROI e Eficiência (conceitos mal definidos neste estágio)
 * - Foco em métricas claras: contagem, volume, taxa de conclusão
 */
export interface BookmakerBonusStats {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  currency: string; // Moeda nativa da casa
  
  // Métricas de bônus (valores na moeda nativa)
  total_bonus_count: number;
  total_bonus_value: number; // Em moeda nativa
  bonus_credited_count: number;
  bonus_finalized_count: number;
  bonus_converted_count: number; // rollover_completed
  bonus_problem_count: number; // failed, expired, reversed, cancelled
  
  // Métricas de apostas de bônus (valores na moeda nativa)
  total_bets: number;
  total_stake: number; // Em moeda nativa
  bets_won: number;
  bets_lost: number;
  bets_pending: number;
  
  // Taxa de conclusão (métrica clara e auditável)
  completion_rate: number; // (finalized / credited) * 100
  
  // Depósitos associados (valores na moeda nativa)
  total_deposits: number;
}

export interface ProjectBonusAnalyticsSummary {
  total_bookmakers: number;
  total_bonus_count: number;
  // Multi-moeda: só agrega se todas forem iguais, senão mostra "multi"
  primary_currency: string | 'MULTI';
  total_bonus_value_display: string;
  total_stake_display: string;
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

      // 2. Buscar apostas com contexto BONUS do projeto
      // CORREÇÃO: Buscar TODAS as apostas das bookmakers que têm bônus (não filtrar por contexto)
      // A regra de negócio é: Análise por Casa = todas as apostas da casa, não apenas contexto BONUS
      const bookmakerIds = (bonusData || [])
        .map((b: any) => b.bookmaker_id)
        .filter((id: string | null): id is string => !!id);
      
      if (bookmakerIds.length === 0) {
        setStats([]);
        setLoading(false);
        return;
      }

      const { data: betsData, error: betsError } = await supabase
        .from("apostas_unificada")
        .select(`
          id,
          bookmaker_id,
          stake,
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

      if (betsError) throw betsError;

      // 3. Agregar por bookmaker_catalogo_id
      const catalogoMap = new Map<string, {
        nome: string;
        logo_url: string | null;
        currency: string;
        bonus: typeof bonusData;
        bets: typeof betsData;
        totalDeposits: number;
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
            bonus: [],
            bets: [],
            totalDeposits: 0,
          });
        }
        
        const entry = catalogoMap.get(catalogoId)!;
        entry.bonus.push(b);
        entry.totalDeposits += Number(b.deposit_amount) || 0;
      });

      // Processar apostas
      (betsData || []).forEach((bet: any) => {
        const catalogoId = bet.bookmakers?.bookmaker_catalogo_id;
        if (!catalogoId || !catalogoMap.has(catalogoId)) return;
        
        catalogoMap.get(catalogoId)!.bets.push(bet);
      });

      // 4. Calcular métricas
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
          b.status === 'finalized' && b.finalize_reason === 'rollover_completed'
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
        // CORREÇÃO: O banco usa 'GREEN' para ganhou e 'RED' para perdeu
        const betsWon = bets.filter(b => b.resultado === 'GREEN' || b.resultado === 'MEIO_GREEN').length;
        const betsLost = bets.filter(b => b.resultado === 'RED' || b.resultado === 'MEIO_RED').length;
        const betsPending = bets.filter(b => b.status === 'PENDENTE').length;

        // Depósitos
        const totalDeposits = data.totalDeposits;

        // Taxa de conclusão (métrica clara)
        const completionRate = creditedCount > 0 ? (finalizedCount / creditedCount) * 100 : 0;

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
          completion_rate: completionRate,
          total_deposits: totalDeposits,
        });
      });

      // Ordenar por total de bônus decrescente
      statsArray.sort((a, b) => b.total_bonus_count - a.total_bonus_count);

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
    if (stats.length === 0) {
      return {
        total_bookmakers: 0,
        total_bonus_count: 0,
        primary_currency: 'BRL',
        total_bonus_value_display: 'R$ 0',
        total_stake_display: 'R$ 0',
      };
    }

    const totalBonusCount = stats.reduce((sum, s) => sum + s.total_bonus_count, 0);
    
    // Detectar se é multi-moeda
    const currencies = [...new Set(stats.map(s => s.currency))];
    const isMultiCurrency = currencies.length > 1;
    
    const formatValue = (value: number, currency: string) => {
      const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£', USDT: 'USDT' };
      return `${symbols[currency] || currency} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    };
    
    let totalBonusValueDisplay: string;
    let totalStakeDisplay: string;
    
    if (isMultiCurrency) {
      // Multi-moeda: mostrar por moeda
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

    return {
      total_bookmakers: stats.length,
      total_bonus_count: totalBonusCount,
      primary_currency: isMultiCurrency ? 'MULTI' : (currencies[0] || 'BRL'),
      total_bonus_value_display: totalBonusValueDisplay,
      total_stake_display: totalStakeDisplay,
    };
  }, [stats]);

  return {
    stats,
    summary,
    loading,
    error,
    refetch: fetchAnalytics,
  };
}
