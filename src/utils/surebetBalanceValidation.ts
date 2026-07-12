/**
 * Pure functions for surebet balance validation.
 * Extracted from SurebetModalRoot for testability.
 */

import { capitalComprometido } from "./pernaLayHelpers";

export interface BookmakerBalance {
  id: string;
  saldo_operavel: number;
  saldo_disponivel: number;
  saldo_freebet?: number;
}

export interface OddEntry {
  bookmaker_id: string;
  stake: string;
  fonteSaldo?: string;
  /** Tipo da perna: 'back' (default) ou 'lay'. Em LAY o capital reservado é a liability. */
  tipo?: "back" | "lay";
  /** Odd usada para calcular a liability de pernas LAY. */
  odd?: string;
  additionalEntries?: Array<{
    bookmaker_id?: string;
    stake: string;
    fonteSaldo?: string;
    tipo?: "back" | "lay";
    odd?: string;
  }>;
}

export interface OriginalCredits {
  real: number;
  freebet: number;
}

export interface BalanceValidationResult {
  hasInsufficientBalance: boolean;
  insufficientLegs: number[];
  insufficientEntries: Map<string, boolean>;
  bookmakerInsuficientes: Set<string>;
  bookmakerFBInsuficientes: Set<string>;
}

/**
 * Build the original stakes map from pernas data (for edit mode credit).
 */
export function buildOriginalStakesMap(
  pernas: Array<{
    bookmaker_id: string;
    stake: number;
    fonte_saldo: string | null;
    tipo?: "back" | "lay" | null;
    odd?: number | null;
  }>
): Map<string, OriginalCredits> {
  const map = new Map<string, OriginalCredits>();
  pernas.forEach(p => {
    if (!p.bookmaker_id || !p.stake) return;
    const cur = map.get(p.bookmaker_id) || { real: 0, freebet: 0 };
    // Crédito virtual deve refletir o débito real no ledger:
    // BACK debita stake; LAY debita liability (stake × (odd−1)).
    const reservado = capitalComprometido(p.tipo ?? "back", p.stake, Number(p.odd ?? 0));
    if (p.fonte_saldo === 'FREEBET') cur.freebet += p.stake; // LAY nunca usa FREEBET
    else cur.real += reservado;
    map.set(p.bookmaker_id, cur);
  });
  return map;
}

/**
 * Apply virtual credits to bookmaker balances (for edit mode).
 */
export function applyVirtualCredits(
  bookmakers: BookmakerBalance[],
  credits: Map<string, OriginalCredits>
): BookmakerBalance[] {
  return bookmakers.map(bk => {
    const credito = credits.get(bk.id) || { real: 0, freebet: 0 };
    if (credito.real > 0 || credito.freebet > 0) {
      return {
        ...bk,
        saldo_operavel: bk.saldo_operavel + credito.real,
        saldo_disponivel: bk.saldo_disponivel + credito.real,
        saldo_freebet: (bk.saldo_freebet ?? 0) + credito.freebet,
      };
    }
    return bk;
  });
}

/**
 * Validate balance sufficiency for all entries.
 */
export function validateBalance(
  odds: OddEntry[],
  bookmakerSaldos: BookmakerBalance[],
  isEditing: boolean,
  originalCredits: Map<string, OriginalCredits>
): BalanceValidationResult {
  const insufficientLegs: number[] = [];
  const insufficientEntries = new Map<string, boolean>();

  // Accumulate allocations per bookmaker
  const alocadoPorBookmaker = new Map<string, { real: number; freebet: number }>();

  odds.forEach((entry) => {
    if (entry.bookmaker_id) {
      const mainStakeRaw = parseFloat(entry.stake) || 0;
      const mainOdd = parseFloat(entry.odd ?? "") || 0;
      const mainStake = capitalComprometido(entry.tipo ?? "back", mainStakeRaw, mainOdd);
      if (mainStake > 0) {
        const cur = alocadoPorBookmaker.get(entry.bookmaker_id) || { real: 0, freebet: 0 };
        if (entry.fonteSaldo === 'FREEBET') cur.freebet += mainStake; else cur.real += mainStake;
        alocadoPorBookmaker.set(entry.bookmaker_id, cur);
      }
    }
    (entry.additionalEntries || []).forEach(sub => {
      const subBk = sub.bookmaker_id || entry.bookmaker_id;
      if (!subBk) return;
      const subStakeRaw = parseFloat(sub.stake) || 0;
      const subOdd = parseFloat(sub.odd ?? entry.odd ?? "") || 0;
      const subTipo = sub.tipo ?? entry.tipo ?? "back";
      const subStake = capitalComprometido(subTipo, subStakeRaw, subOdd);
      if (subStake > 0) {
        const cur = alocadoPorBookmaker.get(subBk) || { real: 0, freebet: 0 };
        if (sub.fonteSaldo === 'FREEBET') cur.freebet += subStake; else cur.real += subStake;
        alocadoPorBookmaker.set(subBk, cur);
      }
    });
  });

  // Validate each bookmaker
  const bookmakerInsuficientes = new Set<string>();
  const bookmakerFBInsuficientes = new Set<string>();

  for (const [bkId, alocado] of alocadoPorBookmaker.entries()) {
    const bookmaker = bookmakerSaldos.find(b => b.id === bkId);
    if (!bookmaker) continue;
    const credito = isEditing ? (originalCredits.get(bkId) || { real: 0, freebet: 0 }) : { real: 0, freebet: 0 };
    const saldoReal = (bookmaker.saldo_operavel ?? 0) + credito.real;
    const saldoFB = (bookmaker.saldo_freebet ?? 0) + credito.freebet;
    if (alocado.real > saldoReal + 0.01) bookmakerInsuficientes.add(bkId);
    if (alocado.freebet > saldoFB + 0.01) bookmakerFBInsuficientes.add(bkId);
  }

  // Mark specific entries with issues
  odds.forEach((entry, index) => {
    let legHasIssue = false;

    if (entry.bookmaker_id) {
      const isMainFB = entry.fonteSaldo === 'FREEBET';
      if ((isMainFB && bookmakerFBInsuficientes.has(entry.bookmaker_id)) ||
          (!isMainFB && bookmakerInsuficientes.has(entry.bookmaker_id))) {
        insufficientEntries.set(`main-${index}`, true);
        legHasIssue = true;
      }
    }

    (entry.additionalEntries || []).forEach((sub, subIdx) => {
      const subBk = sub.bookmaker_id || entry.bookmaker_id;
      if (!subBk) return;
      const isSubFB = sub.fonteSaldo === 'FREEBET';
      if ((isSubFB && bookmakerFBInsuficientes.has(subBk)) ||
          (!isSubFB && bookmakerInsuficientes.has(subBk))) {
        insufficientEntries.set(`sub-${index}-${subIdx}`, true);
        legHasIssue = true;
      }
    });

    if (legHasIssue) insufficientLegs.push(index);
  });

  return {
    hasInsufficientBalance: insufficientLegs.length > 0,
    insufficientLegs,
    insufficientEntries,
    bookmakerInsuficientes,
    bookmakerFBInsuficientes,
  };
}
