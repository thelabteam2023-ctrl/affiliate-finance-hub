/**
 * SurebetPnlProjection — Utilitários para cálculo canônico de P&L projetado.
 * Garante consistência de moeda e rastreabilidade total de taxas via motor de normalização.
 */

import { LiquidationLeg } from "./surebetLiquidationUtils";
import { normalizeOperation, WorkingRates, NormalizedEntry } from "./surebetNormalization";

export interface RateUsed {
  currency: string;
  workingRate: number;
  officialRate: number;
  source: 'working' | 'official' | 'fallback';
  usdRate: number; // Taxa final para converter da moeda original para USD
  isInvalid?: boolean;
}

export interface EntryBreakdown {
  casa: string;
  stakeOriginal: string;
  stakeBRL: number;
  stakeUSD: number;
  conversionPath: string;
}

export interface PnlProjectionResult {
  scenario: string;
  legId: string;
  legLabel: string;
  
  // Valores em BRL
  winnerReturnBRL: number;
  totalInvestedBRL: number;
  pnlBRL: number;

  // Valores em Moeda de Consolidação (USD)
  winnerReturnUSD: number;
  totalInvestedUSD: number;
  pnlUSD: number;

  ratesUsed: RateUsed[];
  entriesBreakdown: EntryBreakdown[];
  isValid: boolean;
  currencyContamination: boolean;
  warningMessage?: string;
  errorMessages?: string[];
  workingRatesSnapshot: Record<string, number>;
  calculatedAt: string;
}

/**
 * Calcula as projeções de P&L para cada cenário de liquidação usando o motor de normalização.
 */
export function calculatePnlProjections(
  liquidationLegs: LiquidationLeg[],
  workingRates: WorkingRates,
  officialRates: Record<string, number> = {},
  displayCurrency: string = 'USD'
): PnlProjectionResult[] {
  // 1. Normalizar a operação inteira (Caminho Único)
  const normalized = normalizeOperation(liquidationLegs, workingRates);

  // 2. Transformar para o formato de resultado esperado pelos componentes
  return normalized.legs.map(leg => {
    // Rastreabilidade de taxas para manter compatibilidade com a UI antiga
    const ratesUsed: RateUsed[] = leg.entries.map(e => ({
      currency: e.currencyOriginal,
      workingRate: e.exchangeRateToBRL,
      officialRate: officialRates[e.currencyOriginal] || 0,
      source: 'working',
      usdRate: e.exchangeRateToUSD,
      isInvalid: false
    }));

    const entriesBreakdown: EntryBreakdown[] = leg.entries.map(e => ({
      casa: e.casa,
      stakeOriginal: `${e.stakeOriginal} ${e.currencyOriginal}`,
      stakeBRL: e.stakeBRL,
      stakeUSD: e.stakeUSD,
      conversionPath: e.conversionPath
    }));

    return {
      scenario: `${leg.legLabel} ganha`,
      legId: leg.legId,
      legLabel: leg.legLabel,
      
      winnerReturnBRL: leg.returnIfWinBRL,
      totalInvestedBRL: normalized.totalInvestedBRL,
      pnlBRL: leg.returnIfWinBRL - normalized.totalInvestedBRL,

      winnerReturnUSD: leg.returnIfWinUSD,
      totalInvestedUSD: normalized.totalInvestedUSD,
      pnlUSD: leg.returnIfWinUSD - normalized.totalInvestedUSD,

      ratesUsed,
      entriesBreakdown,
      isValid: true,
      currencyContamination: false,
      workingRatesSnapshot: normalized.workingRatesUsed,
      calculatedAt: normalized.calculatedAt
    };
  });
}
