/**
 * Hook centralizado para saldos de bookmaker usando TanStack Query
 * 
 * CONTRATO CANÔNICO DE SALDO (via RPC get_bookmaker_saldos):
 * - saldo_real = bookmakers.saldo_atual (JÁ INCLUI valor do bônus creditado via financial_events)
 * - saldo_freebet = bookmakers.saldo_freebet
 * - saldo_bonus = APENAS PARA DISPLAY (retornado pela RPC para breakdown, NÃO somado no operavel)
 * - saldo_em_aposta = SUM de stakes pendentes (SIMPLES/MULTIPLA: direto, ARBITRAGEM: pernas JSON)
 * - saldo_disponivel = saldo_real - saldo_em_aposta (capital livre)
 * - saldo_operavel = saldo_disponivel + saldo_freebet (bônus NÃO é somado — já está em saldo_real via ledger)
 * 
 * REGRA FUNDAMENTAL:
 * - O bônus creditado já está incluído em saldo_real (via financial_events/trigger)
 * - saldo_bonus é retornado APENAS para informação/breakdown na UI
 * - Apostas pendentes BLOQUEIAM capital (refletido em saldo_em_aposta)
 * - Este hook é a ÚNICA fonte de saldos de bookmaker para TODOS os componentes
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface BookmakerSaldo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  parceiro_primeiro_nome: string | null;
  moeda: string;
  logo_url: string | null;
  instance_identifier: string | null;
  // Saldos brutos (da RPC)
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_em_aposta: number;
  // Saldos calculados (da RPC)
  saldo_disponivel: number;  // saldo_real - saldo_em_aposta
  saldo_operavel: number;    // saldo_disponivel + saldo_freebet (bônus NÃO somado — já em saldo_real)
  // Estado do rollover
  bonus_rollover_started: boolean; // true se rollover_progress > 0 em algum bônus creditado
  // Estado de conciliação (APENAS depósitos pendentes bloqueiam)
  has_pending_transactions: boolean; // true se há depósitos pendentes de conciliação
  // Saques pendentes (informativo, NÃO bloqueia apostas)
  has_pending_withdrawals: boolean;
  saldo_saque_pendente: number;
}

interface UseBookmakerSaldosQueryOptions {
  projetoId: string;
  enabled?: boolean;
  includeZeroBalance?: boolean;
  currentBookmakerId?: string | null;
}

const QUERY_KEY = "bookmaker-saldos";

/**
 * Hook principal para consumo de saldos canônicos
 * FONTE ÚNICA DE VERDADE - usar este hook em TODOS os componentes
 */
export function useBookmakerSaldosQuery({
  projetoId,
  enabled = true,
  includeZeroBalance = false,
  currentBookmakerId = null
}: UseBookmakerSaldosQueryOptions) {
  const queryClient = useQueryClient();

  // Realtime: invalidar cache quando bookmakers ou bônus do projeto mudam
  useEffect(() => {
    if (!enabled || !projetoId) return;

    const invalidate = () => {
      console.log('[useBookmakerSaldosQuery] Realtime: data changed, invalidating...');
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, projetoId] });
    };

    const channel = supabase
      .channel(`bookmaker-saldos-${projetoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmakers',
          filter: `projeto_id=eq.${projetoId}`,
        },
        invalidate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_bookmaker_link_bonuses',
          filter: `project_id=eq.${projetoId}`,
        },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, projetoId, queryClient]);

  return useQuery({
    queryKey: [QUERY_KEY, projetoId],
    queryFn: async (): Promise<BookmakerSaldo[]> => {
      const { data, error } = await supabase.rpc("get_bookmaker_saldos", {
        p_projeto_id: projetoId
      });

      if (error) {
        console.error("[useBookmakerSaldosQuery] Erro na RPC:", error);
        throw error;
      }

      const formatted: BookmakerSaldo[] = (data || []).map((row: any) => ({
        id: row.id,
        nome: row.nome,
        parceiro_id: row.parceiro_id,
        parceiro_nome: row.parceiro_nome || null,
        parceiro_primeiro_nome: row.parceiro_primeiro_nome || null,
        moeda: row.moeda || "BRL",
        logo_url: row.logo_url || null,
        instance_identifier: row.instance_identifier || null,
        saldo_real: Number(row.saldo_real) || 0,
        saldo_freebet: Number(row.saldo_freebet) || 0,
        saldo_bonus: Number(row.saldo_bonus) || 0,
        saldo_em_aposta: Number(row.saldo_em_aposta) || 0,
        saldo_disponivel: Number(row.saldo_disponivel) || 0,
        saldo_operavel: Number(row.saldo_operavel) || 0,
        bonus_rollover_started: Boolean(row.bonus_rollover_started),
        has_pending_transactions: Boolean(row.has_pending_transactions),
        has_pending_withdrawals: Boolean(row.has_pending_withdrawals),
        saldo_saque_pendente: Number(row.saldo_saque_pendente) || 0
      }));

      // Filtrar por saldo operável > 0, exceto se for o bookmaker atual ou includeZeroBalance
      if (includeZeroBalance) {
        return formatted;
      }

      return formatted.filter(bk => 
        bk.saldo_operavel > 0 || bk.id === currentBookmakerId
      );
    },
    enabled: enabled && !!projetoId,
    staleTime: 5 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always'
  });
}

/**
 * Hook para invalidar cache de saldos e estado financeiro completo.
 * 
 * WRAPPER para useInvalidateFinancialState - mantido para retrocompatibilidade.
 * 
 * CRÍTICO: Esta função invalida o grupo FINANCIAL_STATE completo,
 * garantindo que TODAS as telas (Vínculos, KPIs, Saldo Operável, Exposição)
 * atualizem simultaneamente após qualquer mutation financeira.
 * 
 * @deprecated Prefira usar useInvalidateFinancialState diretamente para novos componentes
 */
export function useInvalidateBookmakerSaldos() {
  const queryClient = useQueryClient();
  
  // CRITICAL FIX: Retorna uma Promise para permitir await no caller
  // Isso garante que o cache seja invalidado ANTES de fechar dialogs
  return async (projetoId?: string): Promise<void> => {
    const KEYS = {
      BOOKMAKER_SALDOS: "bookmaker-saldos",
      PROJETO_VINCULOS: "projeto-vinculos",
      PROJETO_RESULTADO: "projeto-resultado",
      PROJETO_BREAKDOWNS: "projeto-breakdowns",
      APOSTAS: "apostas",
      SALDO_OPERAVEL_RPC: "saldo-operavel-rpc",
      PARCEIRO_FINANCEIRO: "parceiro-financeiro",
      PARCEIRO_CONSOLIDADO: "parceiro-consolidado",
      EXPOSICAO_PROJETO: "exposicao-projeto",
      CAPACIDADE_APOSTA: "capacidade-aposta",
      BOOKMAKERS_DISPONIVEIS: "bookmakers-disponiveis",
      BOOKMAKERS: "bookmakers",
      FREEBET_ESTOQUE: "freebet-estoque",
    };

    const invalidations: Promise<void>[] = [];

    if (projetoId) {
      // GRUPO FINANCIAL_STATE - Invalidação completa por projeto
      
      // 1. Saldos
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.BOOKMAKER_SALDOS, projetoId] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.BOOKMAKER_SALDOS] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.SALDO_OPERAVEL_RPC, projetoId] })
      );
      
      // 2. Vínculos
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.PROJETO_VINCULOS, projetoId] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PROJETO_VINCULOS, "historico", projetoId] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.BOOKMAKERS_DISPONIVEIS] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.BOOKMAKERS] })
      );
      
      // 3. KPIs
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.PROJETO_RESULTADO, projetoId] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PROJETO_BREAKDOWNS, projetoId] })
      );
      
      // 4. Apostas
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.APOSTAS, projetoId] })
      );
      
      // 5. Calendário RPC
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["calendar-apostas-rpc", projetoId] })
      );
      
      // 5. Bonus bets (juice/performance/analytics) - CRÍTICO para refletir mudanças
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["bonus-bets-juice", projetoId] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-bets-summary", projetoId] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-analytics", projetoId] })
      );
      
      // 5. Exposição
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.EXPOSICAO_PROJETO, projetoId] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.CAPACIDADE_APOSTA, projetoId] })
      );
      
      // 6. Parceiros (saldos agregados)
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.PARCEIRO_FINANCEIRO] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PARCEIRO_CONSOLIDADO] })
      );
      
      // 7. Freebet estoque (aba Promoções) - CRÍTICO para refletir freebets consumidas
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.FREEBET_ESTOQUE, projetoId] })
      );
    } else {
      // Invalidação global
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: [KEYS.BOOKMAKER_SALDOS] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PROJETO_VINCULOS] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PROJETO_RESULTADO] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PROJETO_BREAKDOWNS] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PARCEIRO_FINANCEIRO] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.PARCEIRO_CONSOLIDADO] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-bets-juice"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-bets-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-analytics"] }),
        queryClient.invalidateQueries({ queryKey: [KEYS.FREEBET_ESTOQUE] })
      );
    }

    // Aguardar todas as invalidações em paralelo
    await Promise.all(invalidations);
    
    console.log(
      `[useInvalidateBookmakerSaldos] Invalidated FINANCIAL_STATE + freebet-estoque`,
      { projetoId: projetoId || 'global', queriesInvalidated: invalidations.length }
    );
  };
}

/**
 * Calcular saldo disponível para uma posição específica em operação multi-perna
 * Considera stakes já usadas em outras posições da mesma operação
 */
export function calcularSaldoDisponivelParaPosicao(
  bookmaker: BookmakerSaldo,
  currentIndex: number,
  allPositions: Array<{ bookmaker_id: string; stake: number }>
): number {
  // Somar stakes usadas em OUTRAS posições da operação atual que usam a mesma casa
  let stakesOutrasPosicoes = 0;
  allPositions.forEach((pos, idx) => {
    if (idx !== currentIndex && pos.bookmaker_id === bookmaker.id) {
      stakesOutrasPosicoes += pos.stake || 0;
    }
  });

  return bookmaker.saldo_operavel - stakesOutrasPosicoes;
}

/**
 * Formata saldo para exibição com breakdown, respeitando a moeda do bookmaker
 */
export function formatarSaldoBreakdown(bookmaker: BookmakerSaldo): string {
  const moeda = bookmaker.moeda || "BRL";
  const symbol = moeda === "USD" || moeda === "USDT" ? "$" : "R$";
  
  const parts: string[] = [];
  parts.push(`${symbol} ${bookmaker.saldo_disponivel.toFixed(0)}`);
  if (bookmaker.saldo_freebet > 0) {
    parts.push(`FB: ${bookmaker.saldo_freebet.toFixed(0)}`);
  }
  if (bookmaker.saldo_bonus > 0) {
    parts.push(`🎁: ${bookmaker.saldo_bonus.toFixed(0)}`);
  }
  return parts.join(" + ");
}

/**
 * Helper para obter bookmaker por ID
 */
export function getBookmakerById(
  bookmakers: BookmakerSaldo[],
  id: string
): BookmakerSaldo | undefined {
  return bookmakers.find(b => b.id === id);
}

/**
 * Helper para criar mapa de saldos por ID (para acesso rápido)
 */
export function createSaldosMap(
  bookmakers: BookmakerSaldo[]
): Map<string, BookmakerSaldo> {
  return new Map(bookmakers.map(b => [b.id, b]));
}

/**
 * Helper para verificar se um bookmaker tem bônus ativo
 */
export function hasActiveBonus(bookmaker: BookmakerSaldo): boolean {
  return bookmaker.saldo_bonus > 0;
}

/**
 * Helper para verificar se um bookmaker precisa de conciliação
 * Casas com transações pendentes NÃO PODEM ser usadas operacionalmente
 */
export function requiresReconciliation(bookmaker: BookmakerSaldo): boolean {
  return bookmaker.has_pending_transactions;
}

/**
 * Filtrar bookmakers disponíveis para operação (sem pendências de conciliação)
 */
export function filterOperationalBookmakers(bookmakers: BookmakerSaldo[]): BookmakerSaldo[] {
  return bookmakers.filter(bk => !bk.has_pending_transactions);
}

/**
 * Helper para obter o saldo total consolidado (saldo que pode ser apostado agora)
 * ESTE É O ÚNICO VALOR QUE IMPORTA PARA OPERAÇÕES
 */
export function getSaldoConsolidado(bookmaker: BookmakerSaldo): number {
  return bookmaker.saldo_operavel;
}
