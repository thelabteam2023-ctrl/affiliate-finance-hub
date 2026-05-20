/**
 * SurebetLiquidationUtils — Utilitários para expansão de pernas e geração de opções de liquidação.
 */

import { SurebetPerna } from "@/components/projeto-detalhe/SurebetCard";

export interface LiquidationEntry {
  id: string;
  casa: string;
  currency: string;
  stake: number;
  normalizedStake: number; // em BRL (valor de referência)
  odd: number;
  legIndex: number;
  subEntryIndex: number | null; // null = perna principal sem sub-entradas extras
  isSubEntry: boolean;
  parentLegId: string | null;
}

/**
 * Expande a estrutura de pernas (com possíveis sub-entradas) em uma lista flat de entradas liquidáveis.
 */
export function expandLegsWithSubEntries(legs: SurebetPerna[]): LiquidationEntry[] {
  const entries: LiquidationEntry[] = [];

  legs.forEach((leg, legIndex) => {
    if (leg.entries && leg.entries.length > 0) {
      // Perna com múltiplas entradas: expandir cada uma
      leg.entries.forEach((sub, subIndex) => {
        entries.push({
          id: sub.id || `${leg.id}_sub_${subIndex}`,
          casa: sub.bookmaker_nome,
          currency: sub.moeda || 'BRL',
          stake: sub.stake,
          normalizedStake: sub.stake_brl_referencia || sub.stake,
          odd: sub.odd,
          legIndex,
          subEntryIndex: subIndex,
          isSubEntry: true,
          parentLegId: leg.id,
        });
      });
    } else {
      // Perna simples
      entries.push({
        id: leg.id,
        casa: leg.bookmaker_nome,
        currency: leg.moeda || 'BRL',
        stake: leg.stake,
        normalizedStake: leg.stake_brl_referencia || leg.stake,
        odd: leg.odd,
        legIndex,
        subEntryIndex: null,
        isSubEntry: false,
        parentLegId: null,
      });
    }
  });

  return entries;
}

/**
 * Calcula o P&L projetado para quando uma única entrada ganha (as outras perdem).
 */
function calculateSingleWinPnl(
  winner: LiquidationEntry,
  allEntries: LiquidationEntry[]
): number {
  const totalStake = allEntries.reduce((sum, e) => sum + e.normalizedStake, 0);
  const winReturn = winner.normalizedStake * winner.odd;
  return winReturn - totalStake;
}

/**
 * Calcula o P&L projetado para quando duas entradas ganham (hedge parcial / duplo green).
 */
function calculateDoubleGreenPnl(
  winner1: LiquidationEntry,
  winner2: LiquidationEntry,
  allEntries: LiquidationEntry[]
): number {
  const totalStake = allEntries.reduce((sum, e) => sum + e.normalizedStake, 0);
  const return1 = winner1.normalizedStake * winner1.odd;
  const return2 = winner2.normalizedStake * winner2.odd;
  // Simplificação: no duplo green ambas ganham. 
  // Em arbitragem real, isso geralmente significa um spread entre elas ou empate anula.
  // Seguindo a lógica do prompt: ((return1 + return2) / 2) - totalStake
  return ((return1 + return2) / 2) - totalStake;
}

export function generateLiquidationOptions(legs: SurebetPerna[]) {
  const entries = expandLegsWithSubEntries(legs);

  // "Uma perna ganha"
  const singleWin = entries.map(entry => ({
    type: 'single_win' as const,
    label: `${entry.casa} Win`,
    entryId: entry.id,
    casa: entry.casa,
    isSubEntry: entry.isSubEntry,
    parentLegId: entry.parentLegId,
    pnl: calculateSingleWinPnl(entry, entries),
  }));

  // "Duplo Green" (combinações de 2)
  const doubleGreen = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      doubleGreen.push({
        type: 'double_green' as const,
        label: `${entries[i].casa} + ${entries[j].casa}`,
        entryIds: [entries[i].id, entries[j].id],
        pnl: calculateDoubleGreenPnl(entries[i], entries[j], entries),
      });
    }
  }

  const voidTotal = [{ 
    type: 'void_total' as const, 
    label: 'Void Total', 
    pnl: 0 
  }];

  return { singleWin, doubleGreen, voidTotal, allEntries: entries };
}
