/**
 * Hook centralizado para cálculo de saldos de bookmaker
 * 
 * CONTRATO CANÔNICO DE SALDO:
 * - saldo_real = bookmakers.saldo_atual
 * - saldo_freebet = bookmakers.saldo_freebet
 * - saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status='credited' AND project_id=X
 * - saldo_em_aposta = SUM(apostas_unificada.stake) WHERE status='PENDENTE'
 * - saldo_disponivel = saldo_real - saldo_em_aposta
 * - saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus
 * 
 * Este é o ÚNICO local onde saldos devem ser calculados.
 * Todos os formulários devem usar este hook ou consumir dados formatados por ele.
 */

import { supabase } from "@/integrations/supabase/client";

export interface BookmakerSaldo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  moeda: string;
  logo_url: string | null;
  // Saldos brutos
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  // Saldos calculados
  saldo_em_aposta: number;
  saldo_disponivel: number;  // saldo_real - saldo_em_aposta
  saldo_operavel: number;    // saldo_disponivel + saldo_freebet + saldo_bonus
}

export interface FetchBookmakerSaldosParams {
  projetoId: string;
  includeZeroBalance?: boolean;
  currentBookmakerId?: string | null; // Para incluir bookmaker atual mesmo com saldo zero (modo edição)
}

/**
 * Busca bookmakers com saldos calculados corretamente
 * Esta é a ÚNICA função que deve ser usada para obter saldos de bookmaker
 */
export async function fetchBookmakerSaldos({
  projetoId,
  includeZeroBalance = false,
  currentBookmakerId = null
}: FetchBookmakerSaldosParams): Promise<BookmakerSaldo[]> {
  try {
    // 1. Buscar bookmakers ativos do projeto
    const { data: bookmakersData, error: bkError } = await supabase
      .from("bookmakers")
      .select(`
        id,
        nome,
        parceiro_id,
        saldo_atual,
        saldo_freebet,
        moeda,
        parceiro:parceiros(nome),
        bookmakers_catalogo(logo_url)
      `)
      .eq("projeto_id", projetoId)
      .in("status", ["ATIVO", "ativo", "LIMITADA", "limitada"]);

    if (bkError) throw bkError;
    if (!bookmakersData || bookmakersData.length === 0) return [];

    const bookmakerIds = bookmakersData.map(b => b.id);

    // 2. Buscar em paralelo: apostas pendentes e bônus creditados
    const [pendingBetsResult, bonusResult] = await Promise.all([
      // Apostas pendentes para calcular saldo em aposta
      supabase
        .from("apostas_unificada")
        .select("bookmaker_id, stake")
        .in("bookmaker_id", bookmakerIds)
        .eq("status", "PENDENTE")
        .not("bookmaker_id", "is", null),
      // Bônus creditados - FILTRA POR PROJECT_ID E BOOKMAKER_ID
      supabase
        .from("project_bookmaker_link_bonuses")
        .select("bookmaker_id, saldo_atual")
        .eq("project_id", projetoId)
        .in("bookmaker_id", bookmakerIds)
        .eq("status", "credited")
    ]);

    // 3. Agregar apostas pendentes por bookmaker
    const pendingStakes: Record<string, number> = {};
    (pendingBetsResult.data || []).forEach((bet: any) => {
      if (bet.bookmaker_id) {
        pendingStakes[bet.bookmaker_id] = (pendingStakes[bet.bookmaker_id] || 0) + (bet.stake || 0);
      }
    });

    // 4. Agregar bônus por bookmaker
    const bonusByBookmaker: Record<string, number> = {};
    (bonusResult.data || []).forEach((b: any) => {
      if (b.bookmaker_id) {
        bonusByBookmaker[b.bookmaker_id] = (bonusByBookmaker[b.bookmaker_id] || 0) + (b.saldo_atual || 0);
      }
    });

    // 5. Formatar resultado com cálculos corretos
    const formatted: BookmakerSaldo[] = bookmakersData.map((bk: any) => {
      const saldoReal = Number(bk.saldo_atual) || 0;
      const saldoFreebet = Number(bk.saldo_freebet) || 0;
      const saldoBonus = bonusByBookmaker[bk.id] || 0;
      const saldoEmAposta = pendingStakes[bk.id] || 0;
      const saldoDisponivel = saldoReal - saldoEmAposta;
      const saldoOperavel = saldoDisponivel + saldoFreebet + saldoBonus;

      return {
        id: bk.id,
        nome: bk.nome,
        parceiro_id: bk.parceiro_id,
        parceiro_nome: bk.parceiro?.nome || null,
        moeda: bk.moeda || "BRL",
        logo_url: bk.bookmakers_catalogo?.logo_url || null,
        saldo_real: saldoReal,
        saldo_freebet: saldoFreebet,
        saldo_bonus: saldoBonus,
        saldo_em_aposta: saldoEmAposta,
        saldo_disponivel: saldoDisponivel,
        saldo_operavel: saldoOperavel
      };
    });

    // 6. Filtrar por saldo operável > 0, exceto se for o bookmaker atual ou includeZeroBalance
    if (includeZeroBalance) {
      return formatted;
    }

    return formatted.filter(bk => 
      bk.saldo_operavel > 0 || bk.id === currentBookmakerId
    );

  } catch (error) {
    console.error("Erro ao buscar saldos de bookmakers:", error);
    return [];
  }
}

/**
 * Calcula saldo disponível para uma posição específica em operação multi-perna (Surebet)
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
 * Formata saldo para exibição com breakdown
 */
export function formatarSaldoBreakdown(bookmaker: BookmakerSaldo): string {
  const parts: string[] = [];
  parts.push(`R$ ${bookmaker.saldo_disponivel.toFixed(0)}`);
  if (bookmaker.saldo_freebet > 0) {
    parts.push(`FB: ${bookmaker.saldo_freebet.toFixed(0)}`);
  }
  if (bookmaker.saldo_bonus > 0) {
    parts.push(`🎁: ${bookmaker.saldo_bonus.toFixed(0)}`);
  }
  return parts.join(" + ");
}
