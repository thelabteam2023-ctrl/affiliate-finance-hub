/**
 * SurebetPnlProjection — Utilitários para cálculo canônico de P&L projetado.
 * Garante consistência de moeda e rastreabilidade total de taxas.
 */

import { LiquidationLeg } from "./surebetLiquidationUtils";

export interface WorkingRates {
  [currency: string]: number;
}

export interface RateUsed {
  currency: string;
  workingRate: number;
  officialRate: number;
  source: 'working' | 'official' | 'fallback';
  usdRate: number; // Taxa final para converter da moeda original para USD
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
  isValid: boolean;
  currencyContamination: boolean;
  warningMessage?: string;
}

/**
 * Calcula as projeções de P&L para cada cenário de liquidação.
 */
export function calculatePnlProjections(
  liquidationLegs: LiquidationLeg[],
  workingRates: WorkingRates,
  officialRates: Record<string, number> = {},
  displayCurrency: string = 'USD'
): PnlProjectionResult[] {
  // 1. Calcular total investido em BRL (moeda base interna)
  // totalNormalizedStake em LiquidationLeg já deve estar em BRL
  const totalInvestedBRL = liquidationLegs.reduce(
    (sum, leg) => sum + leg.totalNormalizedStake,
    0
  );

  // 2. Obter taxa BRL -> USD (display)
  const brlToUSD = workingRates['USD'] || 1;
  const totalInvestedUSD = totalInvestedBRL / brlToUSD;

  const results: PnlProjectionResult[] = [];

  for (const leg of liquidationLegs) {
    // 3. Calcular retorno da perna vencedora em BRL
    const winnerReturnBRL = leg.totalNormalizedStake * leg.odd;

    // 4. Converter retorno para USD
    const winnerReturnUSD = winnerReturnBRL / brlToUSD;

    // 5. P&L em ambas as moedas
    const pnlBRL = winnerReturnBRL - totalInvestedBRL;
    const pnlUSD = winnerReturnUSD - totalInvestedUSD;

    // 6. Registrar taxas usadas
    const ratesUsed: RateUsed[] = leg.houses.map(house => {
      const workRate = workingRates[house.currency] || workingRates['USD'] || 1;
      const offRate = officialRates[house.currency] || 0;
      
      // Se a moeda já é USD, a taxa para USD é 1
      // Se é outra moeda (ex: MXN), convertemos MXN -> BRL (workRate) e BRL -> USD (1/brlToUSD)
      const usdRate = house.currency === 'USD' 
        ? 1 
        : workRate / brlToUSD;

      return {
        currency: house.currency,
        workingRate: workRate,
        officialRate: offRate,
        source: 'working',
        usdRate
      };
    });

    // 7. Validação
    const isInvalid = isNaN(pnlUSD) || !isFinite(pnlUSD);
    
    results.push({
      scenario: `${leg.legLabel} ganha`,
      legId: leg.legId,
      legLabel: leg.legLabel,
      winnerReturnBRL,
      totalInvestedBRL,
      pnlBRL,
      winnerReturnUSD,
      totalInvestedUSD,
      pnlUSD,
      ratesUsed,
      isValid: !isInvalid,
      currencyContamination: isInvalid,
      warningMessage: isInvalid ? `Cálculo de P&L inválido para ${leg.legLabel}` : undefined
    });
  }

  return results;
}
