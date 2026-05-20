/**
 * ExchangeRateGuard — Proteção contra cotações de trabalho inválidas.
 * Garante que moedas estrangeiras não sejam tratadas como 1:1 com BRL.
 */

export const CURRENCIES_THAT_CANNOT_BE_1 = ['USD', 'EUR', 'GBP', 'MXN', 'ARS', 'COP', 'MYR'];

export interface SafeRateResult {
  rate: number;
  source: 'working' | 'official_fallback' | 'error';
  warning?: string;
}

/**
 * Valida uma cotação de trabalho e retorna um fallback seguro se necessário.
 */
export function getSafeWorkingRate(
  currency: string,
  savedWorkingRate: number | null | undefined,
  officialRate: number | null | undefined
): SafeRateResult {
  const normalized = currency.toUpperCase();
  
  // BRL contra BRL é sempre 1
  if (normalized === 'BRL') {
    return { rate: 1.0, source: 'working' };
  }

  const isSuspect = CURRENCIES_THAT_CANNOT_BE_1.includes(normalized);
  const workingIsInvalid =
    !savedWorkingRate ||
    savedWorkingRate <= 0 ||
    (isSuspect && Math.abs(savedWorkingRate - 1.0) < 0.001);

  if (!workingIsInvalid) {
    return { rate: savedWorkingRate!, source: 'working' };
  }

  // Cotação de trabalho inválida — usar oficial como fallback
  if (officialRate && officialRate > 0) {
    return {
      rate: officialRate,
      source: 'official_fallback',
      warning: `Cotação de trabalho ${normalized} inválida (${savedWorkingRate || 'null'}). ` +
               `Usando oficial (${officialRate.toFixed(4)}) como fallback. ` +
               `Defina uma cotação de trabalho válida.`,
    };
  }

  // Sem taxa válida de nenhuma fonte
  return {
    rate: 0,
    source: 'error',
    warning: `Nenhuma taxa válida para ${normalized}. Cálculo bloqueado.`,
  };
}

/**
 * Valida um conjunto de taxas para uma operação.
 */
export function validateExchangeRates(
  rates: Record<string, number>,
  usedCurrencies: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const uniqueCurrencies = Array.from(new Set(usedCurrencies.map(c => c.toUpperCase())));

  uniqueCurrencies.forEach(currency => {
    if (currency === 'BRL') return;

    const rate = rates[currency];
    const isSuspect = CURRENCIES_THAT_CANNOT_BE_1.includes(currency);

    if (!rate || rate <= 0) {
      errors.push(`Taxa ausente para ${currency}`);
    } else if (isSuspect && Math.abs(rate - 1.0) < 0.001) {
      errors.push(
        `Taxa ${currency} = 1.0 (inválida). ` +
        `${currency} não pode valer 1 BRL. ` +
        `Verifique as cotações de trabalho.`
      );
    }
  });

  return { valid: errors.length === 0, errors };
}
