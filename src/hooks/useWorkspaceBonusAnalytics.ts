import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";

export interface BookmakerBonusStats {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  // Métricas de bônus
  total_bonus_count: number;
  total_bonus_value: number;
  bonus_credited_count: number;
  bonus_finalized_count: number;
  bonus_converted_count: number; // rollover_completed
  bonus_problem_count: number; // failed, expired, reversed, cancelled
  // Métricas financeiras (de apostas com contexto BONUS)
  total_bets: number;
  total_stake: number;
  total_profit: number;
  bets_won: number;
  bets_lost: number;
  bets_pending: number;
  bets_void: number;
  // Métricas calculadas
  conversion_rate: number; // converted / credited
  efficiency_rate: number; // profit / bonus_value
  roi: number; // (profit) / deposit * 100
  // Depósitos
  total_deposits: number;
  // Confiança dos dados
  data_confidence: number; // % de apostas vinculadas corretamente
  // Classificação
  classification: 'excellent' | 'good' | 'average' | 'poor' | 'toxic';
}

export interface WorkspaceBonusAnalyticsSummary {
  total_bookmakers: number;
  total_bonus_count: number;
  total_bonus_value: number;
  total_profit: number;
  average_roi: number;
  best_performer: BookmakerBonusStats | null;
  worst_performer: BookmakerBonusStats | null;
}

interface UseWorkspaceBonusAnalyticsReturn {
  stats: BookmakerBonusStats[];
  summary: WorkspaceBonusAnalyticsSummary;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function calculateClassification(conversionRate: number, roi: number): BookmakerBonusStats['classification'] {
  if (conversionRate >= 70 && roi >= 50) return 'excellent';
  if (conversionRate >= 50 && roi >= 20) return 'good';
  if (conversionRate >= 30 && roi >= 0) return 'average';
  if (conversionRate >= 10 || roi > -30) return 'poor';
  return 'toxic';
}

export function useWorkspaceBonusAnalytics(): UseWorkspaceBonusAnalyticsReturn {
  const { workspaceId } = useWorkspace();

  const [stats, setStats] = useState<BookmakerBonusStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!workspaceId) {
      setStats([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Buscar todos os bônus do workspace agrupados por bookmaker_catalogo_id
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
            bookmaker_catalogo_id,
            nome,
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (
              id,
              nome,
              logo_url
            )
          )
        `)
        .eq("workspace_id", workspaceId);

      if (bonusError) throw bonusError;

      // 2. Buscar apostas com contexto BONUS do workspace
      const { data: betsData, error: betsError } = await supabase
        .from("apostas_unificada")
        .select(`
          id,
          bookmaker_id,
          stake,
          lucro_prejuizo,
          resultado,
          status,
          bonus_id,
          bookmakers!apostas_unificada_bookmaker_id_fkey (
            bookmaker_catalogo_id
          )
        `)
        .eq("workspace_id", workspaceId)
        .eq("contexto_operacional", "BONUS");

      if (betsError) throw betsError;

      // 3. Agregar por bookmaker_catalogo_id
      const catalogoMap = new Map<string, {
        nome: string;
        logo_url: string | null;
        bonus: typeof bonusData;
        bets: typeof betsData;
        totalDeposits: number;
      }>();

      // Processar bônus
      (bonusData || []).forEach((b: any) => {
        const catalogoId = b.bookmakers?.bookmaker_catalogo_id;
        if (!catalogoId) return;

        const catalogoInfo = b.bookmakers?.bookmakers_catalogo;
        
        if (!catalogoMap.has(catalogoId)) {
          catalogoMap.set(catalogoId, {
            nome: catalogoInfo?.nome || b.bookmakers?.nome || 'Casa Desconhecida',
            logo_url: catalogoInfo?.logo_url || null,
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
        const totalProfit = bets.reduce((sum, b) => sum + Number(b.lucro_prejuizo || 0), 0);
        // CORREÇÃO: O banco usa 'GREEN' para ganhou e 'RED' para perdeu
        const betsWon = bets.filter(b => b.resultado === 'GREEN' || b.resultado === 'MEIO_GREEN').length;
        const betsLost = bets.filter(b => b.resultado === 'RED' || b.resultado === 'MEIO_RED').length;
        const betsPending = bets.filter(b => b.status === 'PENDENTE').length;
        const betsVoid = bets.filter(b => b.resultado === 'VOID' || b.resultado === 'REEMBOLSO').length;

        // Depósitos
        const totalDeposits = data.totalDeposits;

        // Métricas calculadas
        const conversionRate = creditedCount > 0 ? (convertedCount / creditedCount) * 100 : 0;
        const efficiencyRate = totalBonusValue > 0 ? (totalProfit / totalBonusValue) * 100 : 0;
        const roi = totalDeposits > 0 ? (totalProfit / totalDeposits) * 100 : 0;

        // Confiança dos dados (% de apostas com bonus_id vinculado)
        const linkedBets = bets.filter(b => b.bonus_id !== null).length;
        const dataConfidence = totalBets > 0 ? (linkedBets / totalBets) * 100 : 100;

        const classification = calculateClassification(conversionRate, roi);

        statsArray.push({
          bookmaker_catalogo_id: catalogoId,
          nome: data.nome,
          logo_url: data.logo_url,
          total_bonus_count: totalBonusCount,
          total_bonus_value: totalBonusValue,
          bonus_credited_count: creditedCount,
          bonus_finalized_count: finalizedCount,
          bonus_converted_count: convertedCount,
          bonus_problem_count: problemCount,
          total_bets: totalBets,
          total_stake: totalStake,
          total_profit: totalProfit,
          bets_won: betsWon,
          bets_lost: betsLost,
          bets_pending: betsPending,
          bets_void: betsVoid,
          conversion_rate: conversionRate,
          efficiency_rate: efficiencyRate,
          roi,
          total_deposits: totalDeposits,
          data_confidence: dataConfidence,
          classification,
        });
      });

      // Ordenar por ROI decrescente
      statsArray.sort((a, b) => b.roi - a.roi);

      setStats(statsArray);
    } catch (err) {
      console.error("Error fetching bonus analytics:", err);
      setError(err instanceof Error ? err.message : "Erro ao buscar análises");
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = useMemo((): WorkspaceBonusAnalyticsSummary => {
    if (stats.length === 0) {
      return {
        total_bookmakers: 0,
        total_bonus_count: 0,
        total_bonus_value: 0,
        total_profit: 0,
        average_roi: 0,
        best_performer: null,
        worst_performer: null,
      };
    }

    const totalBonusCount = stats.reduce((sum, s) => sum + s.total_bonus_count, 0);
    const totalBonusValue = stats.reduce((sum, s) => sum + s.total_bonus_value, 0);
    const totalProfit = stats.reduce((sum, s) => sum + s.total_profit, 0);
    const totalDeposits = stats.reduce((sum, s) => sum + s.total_deposits, 0);
    const averageRoi = totalDeposits > 0 ? (totalProfit / totalDeposits) * 100 : 0;

    // Melhor e pior (filtrando apenas casas com dados significativos)
    const significantStats = stats.filter(s => s.total_bonus_count >= 1);
    const bestPerformer = significantStats.length > 0 
      ? significantStats.reduce((best, curr) => curr.roi > best.roi ? curr : best)
      : null;
    const worstPerformer = significantStats.length > 0
      ? significantStats.reduce((worst, curr) => curr.roi < worst.roi ? curr : worst)
      : null;

    return {
      total_bookmakers: stats.length,
      total_bonus_count: totalBonusCount,
      total_bonus_value: totalBonusValue,
      total_profit: totalProfit,
      average_roi: averageRoi,
      best_performer: bestPerformer,
      worst_performer: worstPerformer,
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
