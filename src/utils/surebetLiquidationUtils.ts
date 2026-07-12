/**
 * SurebetLiquidationUtils — Utilitários para expansão de pernas e geração de opções de liquidação.
 */

import { SurebetPerna } from "@/components/projeto-detalhe/SurebetCard";

export interface LiquidationEntry {
  id: string;
  bookmaker_id: string;
  casa: string;
  currency: string;
  stake: number;
  normalizedStake: number; // em BRL
  odd: number;
  legIndex: number;
  subEntryIndex: number | null;
  isSubEntry: boolean;
  parentLegId: string | null;
  /** 'back' (default) ou 'lay' — necessário para calcular liability em validações de saldo. */
  tipo?: "back" | "lay";
}

export interface LiquidationLeg {
  legId: string;
  legIndex: number;
  legLabel: string;
  houses: Array<{
    entryId: string;
    casa: string;
    stake: number;
    currency: string;
    normalizedStake: number;
    odd: number;
    bookmakerId: string;
  }>;
  totalNormalizedStake: number;
  odd: number;
  hasMultipleHouses: boolean;
  houseCount: number;
}

/**
 * Expande a estrutura de pernas em uma lista flat de entradas.
 * Mantida para compatibilidade com o validador de saldo.
 */
export function expandLegsWithSubEntries(legs: SurebetPerna[]): LiquidationEntry[] {
  const entries: LiquidationEntry[] = [];

  legs.forEach((leg, legIndex) => {
    if (leg.entries && leg.entries.length > 0) {
      leg.entries.forEach((sub, subIndex) => {
        entries.push({
          id: sub.id || `${leg.id}_sub_${subIndex}`,
          bookmaker_id: sub.bookmaker_id,
          casa: sub.bookmaker_nome,
          currency: sub.moeda || 'BRL',
          stake: sub.stake,
          normalizedStake: sub.stake_brl_referencia || sub.stake,
          odd: sub.odd,
          legIndex,
          subEntryIndex: subIndex,
          isSubEntry: true,
          parentLegId: leg.id,
          tipo: ((sub as any).tipo ?? (leg as any).tipo ?? "back") as "back" | "lay",
        });
      });
    } else {
      entries.push({
        id: leg.id,
        bookmaker_id: leg.bookmaker_id || '',
        casa: leg.bookmaker_nome,
        currency: leg.moeda || 'BRL',
        stake: leg.stake,
        normalizedStake: leg.stake_brl_referencia || leg.stake,
        odd: leg.odd,
        legIndex,
        subEntryIndex: null,
        isSubEntry: false,
        parentLegId: null,
        tipo: ((leg as any).tipo ?? "back") as "back" | "lay",
      });
    }
  });

  return entries;
}

export function buildLiquidationLegs(legs: SurebetPerna[]): LiquidationLeg[] {
  return legs.map((leg, legIndex) => {
    const hasSubEntries = leg.entries && leg.entries.length > 0;

    if (hasSubEntries) {
      const houses = leg.entries!.map((sub, subIndex) => ({
        entryId: sub.id || `${leg.id}_sub_${subIndex}`,
        casa: cleanHouseName(sub.bookmaker_nome),
        stake: sub.stake,
        currency: sub.moeda || 'BRL',
        normalizedStake: sub.stake_brl_referencia || sub.stake,
        odd: sub.odd || leg.odd,
        bookmakerId: sub.bookmaker_id,
      }));

      const totalNormalized = houses.reduce((sum, h) => sum + h.normalizedStake, 0);

      return {
        legId: leg.id,
        legIndex,
        legLabel: buildLegLabel(houses),
        houses,
        totalNormalizedStake: totalNormalized,
        odd: leg.odd || (houses.length > 0 ? houses[0].odd : 0),
        hasMultipleHouses: true,
        houseCount: houses.length,
      };
    } else {
      const normalizedStake = leg.stake_brl_referencia || leg.stake;
      const cleanedCasa = cleanHouseName(leg.bookmaker_nome);
      return {
        legId: leg.id,
        legIndex,
        legLabel: cleanedCasa,
        houses: [{
          entryId: leg.id,
          casa: cleanedCasa,
          stake: leg.stake,
          currency: leg.moeda || 'BRL',
          normalizedStake: normalizedStake,
          odd: leg.odd,
          bookmakerId: leg.bookmaker_id || '',
        }],
        totalNormalizedStake: normalizedStake,
        odd: leg.odd,
        hasMultipleHouses: false,
        houseCount: 1,
      };
    }
  });
}

function buildLegLabel(houses: Array<{ casa: string }>): string {
  if (houses.length === 1) return houses[0].casa;
  if (houses.length === 2) return `${houses[0].casa} + ${houses[1].casa}`;
  return `${houses[0].casa} +${houses.length - 1}`;
}

/**
 * Limpa o nome da casa, removendo o sufixo de parceiro/titular se existir.
 * Ex: "12BET - STHEFANI" -> "12BET"
 */
function cleanHouseName(name: string): string {
  if (!name) return "";
  const separatorIdx = name.indexOf(" - ");
  if (separatorIdx > 0) {
    // Retorna apenas a parte da casa, removendo o titular
    return name.substring(0, separatorIdx).trim();
  }
  return name;
}


export function generateLiquidationOptions(legs: SurebetPerna[]) {
  const liquidationLegs = buildLiquidationLegs(legs);
  const totalNormalized = liquidationLegs.reduce(
    (sum, l) => sum + l.totalNormalizedStake, 0
  );

  const singleWin = liquidationLegs.map(leg => ({
    type: 'single_win' as const,
    legId: leg.legId,
    legIndex: leg.legIndex,
    label: leg.legLabel,
    houses: leg.houses,
    hasMultipleHouses: leg.hasMultipleHouses,
    houseCount: leg.houseCount,
    pnl: calculateSingleWinPnl(leg, totalNormalized),
  }));

  const doubleGreen = [];
  for (let i = 0; i < liquidationLegs.length; i++) {
    for (let j = i + 1; j < liquidationLegs.length; j++) {
      const leg1 = liquidationLegs[i];
      const leg2 = liquidationLegs[j];
      doubleGreen.push({
        type: 'double_green' as const,
        legIds: [leg1.legId, leg2.legId],
        label: `${leg1.legLabel} + ${leg2.legLabel}`,
        leg1,
        leg2,
        pnl: calculateDoubleGreenPnl(leg1, leg2, totalNormalized),
      });
    }
  }

  const voidTotal = [{
    type: 'void_total' as const,
    label: 'Void Total',
    pnl: 0,
  }];

  return { 
    singleWin, 
    doubleGreen, 
    voidTotal, 
    liquidationLegs,
    totalNormalized 
  };
}

function calculateSingleWinPnl(
  winner: LiquidationLeg,
  totalNormalized: number
): number {
  return (winner.totalNormalizedStake * winner.odd) - totalNormalized;
}

function calculateDoubleGreenPnl(
  leg1: LiquidationLeg,
  leg2: LiquidationLeg,
  totalNormalized: number
): number {
  const return1 = leg1.totalNormalizedStake * leg1.odd;
  const return2 = leg2.totalNormalizedStake * leg2.odd;
  // Duplo Green: as duas pernas vencem e ambos os retornos são recebidos integralmente.
  // P&L = soma dos retornos − total apostado. (Antes dividia por 2 incorretamente.)
  return (return1 + return2) - totalNormalized;
}
