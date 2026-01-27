/**
 * Hook centralizado para saldos de bookmaker usando TanStack Query
 * 
 * CONTRATO CANÔNICO DE SALDO (via RPC get_bookmaker_saldos):
 * - saldo_real = bookmakers.saldo_atual
 * - saldo_freebet = bookmakers.saldo_freebet
 * - saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status='credited'
 * - saldo_em_aposta = SUM de stakes pendentes (SIMPLES/MULTIPLA: direto, ARBITRAGEM: pernas JSON)
 * - saldo_disponivel = saldo_real - saldo_em_aposta (capital livre)
 * - saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus (total para apostar)
 * 
 * REGRA FUNDAMENTAL:
 * - NÃO existe separação operacional entre saldo real e bônus
 * - Apostas pendentes BLOQUEIAM capital (refletido em saldo_em_aposta)
 * - Este hook é a ÚNICA fonte de saldos de bookmaker para TODOS os componentes
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BookmakerSaldo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  parceiro_primeiro_nome: string | null;
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
  // Estado de conciliação
  has_pending_transactions: boolean; // true se há transações pendentes de conciliação
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
        saldo_real: Number(row.saldo_real) || 0,
        saldo_freebet: Number(row.saldo_freebet) || 0,
        saldo_bonus: Number(row.saldo_bonus) || 0,
        saldo_em_aposta: Number(row.saldo_em_aposta) || 0,
        saldo_disponivel: Number(row.saldo_disponivel) || 0,
        saldo_operavel: Number(row.saldo_operavel) || 0,
        bonus_rollover_started: Boolean(row.bonus_rollover_started),
        has_pending_transactions: Boolean(row.has_pending_transactions)
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
 * Hook para invalidar cache de saldos e KPIs (usar após criar/editar apostas)
 * 
 * ATUALIZADO: Agora também invalida vínculos do projeto para garantir
 * que a aba Vínculos reflita os saldos corretos em tempo real.
 * 
 * CRÍTICO: Esta é a única função que deve ser chamada após mutations
 * financeiras (apostas, liquidação, exclusão) para garantir consistência
 * de estado entre todas as abas.
 */
export function useInvalidateBookmakerSaldos() {
  const queryClient = useQueryClient();
  
  return (projetoId?: string) => {
    if (projetoId) {
      // 1. Saldos de bookmakers (fonte canônica)
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, projetoId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      
      // 2. CRÍTICO: Vínculos do projeto - a aba Vínculos consome dados de saldo
      queryClient.invalidateQueries({ queryKey: ["projeto-vinculos", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["projeto-vinculos", "historico", projetoId] });
      
      // 3. KPIs centrais do projeto
      queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns", projetoId] });
      
      // 4. Lista de apostas
      queryClient.invalidateQueries({ queryKey: ["apostas", projetoId] });
      
      // 5. Saldo operável via RPC (usado em alguns componentes)
      queryClient.invalidateQueries({ queryKey: ["saldo-operavel-rpc", projetoId] });
      
      // 6. Parceiro consolidado (saldos agregados)
      queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["parceiro-consolidado"] });
      
      console.log(`[useInvalidateBookmakerSaldos] Invalidated saldos + vínculos + KPIs for project ${projetoId}`);
    } else {
      // Invalidação global (quando não temos projetoId)
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["projeto-vinculos"] });
      queryClient.invalidateQueries({ queryKey: ["projeto-resultado"] });
      queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns"] });
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
