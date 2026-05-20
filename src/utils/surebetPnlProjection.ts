/**
 * SurebetPnlProjection — Utilitários para cálculo canônico de P&L projetado.
 * Garante consistência de moeda e rastreabilidade total de taxas.
 */

import { LiquidationLeg } from "./surebetLiquidationUtils";
import { validateExchangeRates } from "./exchangeRateGuard";

export interface WorkingRates {
  [currency: string]: number;
}

export interface RateUsed {
  currency: string;
  workingRate: number;
  officialRate: number;
  source: 'working' | 'official' | 'fallback';
  usdRate: number; // Taxa final para converter da moeda original para USD
  isInvalid?: boolean;
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
  errorMessages?: string[];
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
  // 1. Validar taxas antes de qualquer cálculo
  const usedCurrencies: string[] = [];
  liquidationLegs.forEach(leg => {
    leg.houses.forEach(h => usedCurrencies.push(h.currency));
  });

  const validation = validateExchangeRates(workingRates, usedCurrencies);
  
  // 2. Calcular total investido em BRL (moeda base interna)
  const totalInvestedBRL = liquidationLegs.reduce(
    (sum, leg) => sum + leg.totalNormalizedStake,
    0
  );

  // 3. Obter taxa BRL -> USD (display)
  const brlToUSD = workingRates['USD'] || 1;
  const totalInvestedUSD = totalInvestedBRL / brlToUSD;

  const results: PnlProjectionResult[] = [];

  for (const leg of liquidationLegs) {
    // 4. Calcular retorno da perna vencedora em BRL
    const winnerReturnBRL = leg.totalNormalizedStake * leg.odd;

    // 5. Converter retorno para USD
    const winnerReturnUSD = winnerReturnBRL / brlToUSD;

    // 6. P&L em ambas as moedas
    const pnlBRL = winnerReturnBRL - totalInvestedBRL;
    const pnlUSD = winnerReturnUSD - totalInvestedUSD;

    // 7. Registrar taxas usadas
    const ratesUsed: RateUsed[] = leg.houses.map(house => {
      const workRate = workingRates[house.currency] || workingRates['USD'] || 1;
      const offRate = officialRates[house.currency] || 0;
      
      const usdRate = house.currency === 'USD' 
        ? 1 
        : workRate / brlToUSD;

      const isInvalid = validation.errors.some(err => err.includes(house.currency));

      return {
        currency: house.currency,
        workingRate: workRate,
        officialRate: offRate,
        source: isInvalid ? 'fallback' : 'working',
        usdRate,
        isInvalid
      };
    });

    // 8. Validação final
    const calculationInvalid = isNaN(pnlUSD) || !isFinite(pnlUSD);
    const overallInvalid = !validation.valid || calculationInvalid;
    
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
      isValid: !overallInvalid,
      currencyContamination: overallInvalid,
      warningMessage: !validation.valid ? 'Cotações de trabalho inválidas detectadas' : (calculationInvalid ? `Cálculo de P&L inválido para ${leg.legLabel}` : undefined),
      errorMessages: validation.errors
    });
  }

  return results;
}
