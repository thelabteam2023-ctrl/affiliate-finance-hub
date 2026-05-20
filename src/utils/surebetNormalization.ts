/**
 * REGRA DE OURO DO MOTOR FINANCEIRO:
 * 
 * 1. Toda stake entra em sua moeda original.
 * 2. normalizeOperation converte TUDO para BRL (moeda base interna) 
 *    e para USD (moeda de exibição) usando cotação de trabalho.
 * 3. Todos os cálculos (retorno, P&L, ROI, cobertura) usam 
 *    SOMENTE os valores normalizados — nunca os valores originais.
 * 4. A conversão acontece UMA VEZ, no início.
 * 5. Nenhuma função downstream converte moeda novamente.
 */

export interface WorkingRates {
  [currency: string]: number;
}

export interface NormalizedEntry {
  casa: string;
  stakeOriginal: number;
  currencyOriginal: string;
  stakeBRL: number;          // stake convertida para BRL
  stakeUSD: number;          // stake convertida para USD (moeda de exibição)
  exchangeRateToBRL: number; // taxa usada: 1 unidade de currencyOriginal em BRL
  exchangeRateToUSD: number; // taxa usada: 1 unidade de currencyOriginal em USD
  conversionPath: string;    // ex: "MXN→BRL→USD" ou "USD→BRL→USD"
}

export interface NormalizedLeg {
  legId: string;
  legLabel: string;
  odd: number;
  entries: NormalizedEntry[];
  totalBRL: number;          // soma de todas as sub-entradas em BRL
  totalUSD: number;          // soma de todas as sub-entradas em USD
  returnIfWinBRL: number;    // totalBRL * odd
  returnIfWinUSD: number;    // totalUSD * odd
}

export interface NormalizedOperation {
  legs: NormalizedLeg[];
  totalInvestedBRL: number;  // soma de todos os legs em BRL
  totalInvestedUSD: number;  // soma de todos os legs em USD
  workingRatesUsed: Record<string, number>;  // snapshot das taxas usadas
  calculatedAt: string;      // ISO timestamp
}

export function normalizeOperation(
  legs: any[], // Aceita SurebetPerna ou estrutura similar
  workingRates: WorkingRates
): NormalizedOperation {
  const usdToBRL = workingRates['USD'];
  
  if (!usdToBRL || usdToBRL <= 0 || (Math.abs(usdToBRL - 1.0) < 0.001 && !workingRates['FORCE_BRL'])) {
    // Nota: Em alguns ambientes de teste BRL pode ser a base, mas no ERP 5565 USD é cotação de trabalho > 1
    // Adicionamos um bypass FORCE_BRL apenas para testes se necessário
    throw new Error(
      `Taxa USD inválida: ${usdToBRL}. ` +
      `Configure a cotação de trabalho do USD.`
    );
  }

  const normalizedLegs: NormalizedLeg[] = legs.map((leg, idx) => {
    // Suporte a diferentes formatos de input (SurebetPerna vs LiquidationLeg)
    const rawEntries = leg.houses || leg.entries || (leg.stake ? [{ 
      casa: leg.bookmaker_nome || leg.casa, 
      stake: leg.stake_total || leg.stake, 
      currency: leg.moeda || leg.currency || 'BRL' 
    }] : []);

    const normalizedEntries: NormalizedEntry[] = rawEntries.map((entry: any) => {
      const currency = entry.currency || entry.moeda || 'BRL';
      const stake = entry.stake || 0;

      // Taxa desta moeda para BRL
      const rateToBRL = currency === 'BRL'
        ? 1.0
        : (workingRates[currency] ?? workingRates['USD'] ?? 1.0);

      // PASSO 1: converter para BRL
      const stakeBRL = stake * rateToBRL;

      // PASSO 2: converter BRL para USD (base consolidada)
      const stakeUSD = stakeBRL / usdToBRL;

      return {
        casa: entry.casa || entry.bookmaker_nome || 'Casa',
        stakeOriginal: stake,
        currencyOriginal: currency,
        stakeBRL,
        stakeUSD,
        exchangeRateToBRL: rateToBRL,
        exchangeRateToUSD: rateToBRL / usdToBRL,
        conversionPath: currency === 'USD'
          ? `USD (nativo)`
          : currency === 'BRL'
          ? `BRL→USD @ ${(1/usdToBRL).toFixed(6)}`
          : `${currency}→BRL @ ${rateToBRL} →USD @ ${(1/usdToBRL).toFixed(4)}`,
      };
    });

    const totalBRL = normalizedEntries.reduce((s, e) => s + e.stakeBRL, 0);
    const totalUSD = normalizedEntries.reduce((s, e) => s + e.stakeUSD, 0);
    const odd = leg.odd || 0;

    return {
      legId: leg.id || leg.legId || `leg-${idx}`,
      legLabel: leg.casa || leg.bookmaker_nome || leg.legLabel || `Perna ${idx + 1}`,
      odd,
      entries: normalizedEntries,
      totalBRL,
      totalUSD,
      returnIfWinBRL: totalBRL * odd,
      returnIfWinUSD: totalUSD * odd,
    };
  });

  const totalInvestedBRL = normalizedLegs.reduce((s, l) => s + l.totalBRL, 0);
  const totalInvestedUSD = normalizedLegs.reduce((s, l) => s + l.totalUSD, 0);

  return {
    legs: normalizedLegs,
    totalInvestedBRL,
    totalInvestedUSD,
    workingRatesUsed: { ...workingRates },
    calculatedAt: new Date().toISOString(),
  };
}
