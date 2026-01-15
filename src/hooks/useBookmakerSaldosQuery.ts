/**
 * Hook centralizado para saldos de bookmaker usando TanStack Query
 * 
 * CONTRATO CANÔNICO DE SALDO (via RPC get_bookmaker_saldos):
 * - saldo_real = bookmakers.saldo_atual
 * - saldo_freebet = bookmakers.saldo_freebet
 * - saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status='credited' AND project_id=X
 * - saldo_em_aposta = SUM(apostas_unificada.stake) WHERE status='PENDENTE'
 * - saldo_disponivel = saldo_real - saldo_em_aposta
 * - saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus
 * 
 * Este hook é a ÚNICA fonte de saldos de bookmaker para TODOS os formulários.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BookmakerSaldo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  moeda: string;
  logo_url: string | null;
  // Saldos brutos (da RPC)
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_em_aposta: number;
  // Saldos calculados (da RPC)
  saldo_disponivel: number;  // saldo_real - saldo_em_aposta
  saldo_operavel: number;    // saldo_disponivel + saldo_freebet + saldo_bonus
  // Estado do rollover
  bonus_rollover_started: boolean; // true se rollover_progress > 0 em algum bônus creditado
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
 */
export function useBookmakerSaldosQuery({
  projetoId,
  enabled = true,
  includeZeroBalance = false,
  currentBookmakerId = null
}: UseBookmakerSaldosQueryOptions) {
  return useQuery({
    queryKey: [QUERY_KEY, projetoId],
    queryFn: async (): Promise<BookmakerSaldo[]> => {
      const { data, error } = await supabase.rpc("get_bookmaker_saldos", {
        p_projeto_id: projetoId
      });

      if (error) {
        console.error("Erro ao buscar saldos via RPC:", error);
        throw error;
      }

      const formatted: BookmakerSaldo[] = (data || []).map((row: any) => ({
        id: row.id,
        nome: row.nome,
        parceiro_id: row.parceiro_id,
        parceiro_nome: row.parceiro_nome,
        moeda: row.moeda || "BRL",
        logo_url: row.logo_url,
        saldo_real: Number(row.saldo_real) || 0,
        saldo_freebet: Number(row.saldo_freebet) || 0,
        saldo_bonus: Number(row.saldo_bonus) || 0,
        saldo_em_aposta: Number(row.saldo_em_aposta) || 0,
        saldo_disponivel: Number(row.saldo_disponivel) || 0,
        saldo_operavel: Number(row.saldo_operavel) || 0,
        bonus_rollover_started: Boolean(row.bonus_rollover_started)
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
    staleTime: 10 * 1000, // 10 segundos - dados de saldo mudam frequentemente
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
}

/**
 * Hook para invalidar cache de saldos (usar após criar/editar apostas)
 */
export function useInvalidateBookmakerSaldos() {
  const queryClient = useQueryClient();
  
  return (projetoId?: string) => {
    if (projetoId) {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, projetoId] });
    } else {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    }
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
  const symbol = moeda === "USD" ? "$" : "R$";
  
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
