/**
 * UTILITÁRIO CENTRAL DE CONVERSÃO DE MOEDAS PARA ARBITRAGEM
 * 
 * REGRA: Toda conversão passa pela baseCurrency (BRL) como pivot.
 * Nunca assumir taxa 1:1. Nunca duplicar lógica nos componentes.
 * 
 * Fórmula Pivot Universal:
 *   valorConvertido = (valor * taxaBRL_origem) / taxaBRL_destino
 * 
 * Onde taxaBRL é: 1 [moeda] = X BRL
 */

export interface EffectiveRate {
  rate: number;
  source: "TRABALHO" | "OFICIAL";
}

export type GetEffectiveRateFn = (moeda: string) => EffectiveRate;

/**
 * Converte um valor de uma moeda para outra usando BRL como pivot.
 * 
 * @param amount - Valor a converter
 * @param from - Moeda de origem
 * @param to - Moeda de destino
 * @param getEffectiveRate - Função que retorna taxa BRL e fonte para uma moeda
 * @returns Valor convertido na moeda de destino
 * 
 * Exemplos:
 *   convertCurrency(10, "USD", "BRL", fn) → 10 * 5.16 / 1 = 51.60
 *   convertCurrency(100, "BRL", "USD", fn) → 100 * 1 / 5.16 = 19.38
 *   convertCurrency(10, "USD", "EUR", fn) → 10 * 5.16 / 5.48 = 9.42
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  getEffectiveRate: GetEffectiveRateFn
): number {
  if (from === to) return amount;
  if (amount === 0) return 0;

  const fromRate = getEffectiveRate(from).rate; // 1 [from] = X BRL
  const toRate = getEffectiveRate(to).rate;     // 1 [to]   = X BRL

  if (toRate === 0) return 0;

  return (amount * fromRate) / toRate;
}

/**
 * Informações de conversão para tooltips e auditoria.
 */
export interface ConversionInfo {
  from: string;
  to: string;
  rate: number;        // taxa efetiva direta (from → to)
  source: "TRABALHO" | "OFICIAL";
  fromRateBRL: number; // taxa BRL da origem
  toRateBRL: number;   // taxa BRL do destino
}

/**
 * Retorna detalhes da conversão entre duas moedas (para tooltips).
 */
export function getConversionInfo(
  from: string,
  to: string,
  getEffectiveRate: GetEffectiveRateFn
): ConversionInfo | null {
  if (from === to) return null;

  const fromInfo = getEffectiveRate(from);
  const toInfo = getEffectiveRate(to);

  if (toInfo.rate === 0) return null;

  return {
    from,
    to,
    rate: fromInfo.rate / toInfo.rate,
    source: fromInfo.source === "TRABALHO" || toInfo.source === "TRABALHO" ? "TRABALHO" : "OFICIAL",
    fromRateBRL: fromInfo.rate,
    toRateBRL: toInfo.rate,
  };
}

/**
 * Calcula stakes de arbitragem multi-moeda com equalização de lucro.
 * 
 * LÓGICA:
 * 1. A perna de referência define a moeda base e o retorno-alvo
 * 2. O retorno-alvo é calculado na moeda da referência
 * 3. Para cada outra perna: converter retorno-alvo → moeda da perna → dividir pela odd
 * 4. Arredondamento ocorre APENAS no final
 * 
 * @param legs - Array de pernas com odd, moeda, stake e flag de referência
 * @param getEffectiveRate - Função de cotação
 * @param roundFn - Função de arredondamento (aplicada apenas no final)
 * @returns Stakes calculadas e lucro equalizado
 */
export function calcularStakesMultiCurrency(
  legs: Array<{
    oddMedia: number;
    moeda: string;
    stakeAtual: number;
    isReference: boolean;
    isManuallyEdited: boolean;
    isFromPrint: boolean;
  }>,
  getEffectiveRate: GetEffectiveRateFn,
  roundFn: (value: number) => number,
  consolidationCurrency: string
): {
  stakes: number[];
  isValid: boolean;
  lucroConsolidado: number;
  ratesUsed: Record<string, { rate: number; source: string }>;
} {
  const n = legs.length;
  const ratesUsed: Record<string, { rate: number; source: string }> = {};

  if (n < 2) {
    return { stakes: legs.map(l => l.stakeAtual), isValid: false, lucroConsolidado: 0, ratesUsed };
  }

  const allOddsValid = legs.every(l => l.oddMedia > 1);
  if (!allOddsValid) {
    return { stakes: legs.map(l => l.stakeAtual), isValid: false, lucroConsolidado: 0, ratesUsed };
  }

  const refIndex = legs.findIndex(l => l.isReference);
  if (refIndex === -1) {
    return { stakes: legs.map(l => l.stakeAtual), isValid: false, lucroConsolidado: 0, ratesUsed };
  }

  const ref = legs[refIndex];
  if (ref.stakeAtual <= 0) {
    return { stakes: legs.map(l => l.stakeAtual), isValid: false, lucroConsolidado: 0, ratesUsed };
  }

  // PASSO 1: Retorno-alvo na moeda da referência
  const targetReturnInRefCurrency = ref.stakeAtual * ref.oddMedia;

  // PASSO 2: Para cada perna, calcular stake na sua própria moeda
  const calculatedStakes = legs.map((leg, i) => {
    if (i === refIndex) return ref.stakeAtual;
    if (leg.isManuallyEdited || leg.isFromPrint) return leg.stakeAtual;

    // Converter retorno-alvo da moeda da referência para a moeda desta perna
    const targetReturnInLegCurrency = convertCurrency(
      targetReturnInRefCurrency,
      ref.moeda,
      leg.moeda,
      getEffectiveRate
    );

    // Stake = retorno / odd (arredondamento apenas aqui, no final)
    return roundFn(targetReturnInLegCurrency / leg.oddMedia);
  });

  // PASSO 3: Calcular lucro consolidado na moeda de consolidação
  // Para cada cenário (perna que ganha), o lucro deve ser igual
  // Usamos o cenário da referência: retorno_ref - soma_stakes_consolidadas
  const stakeConsolidadoTotal = calculatedStakes.reduce((sum, stake, i) => {
    const converted = convertCurrency(stake, legs[i].moeda, consolidationCurrency, getEffectiveRate);
    // Registrar taxas usadas
    if (legs[i].moeda !== "BRL") {
      const info = getEffectiveRate(legs[i].moeda);
      ratesUsed[legs[i].moeda] = { rate: info.rate, source: info.source };
    }
    if (consolidationCurrency !== "BRL") {
      const info = getEffectiveRate(consolidationCurrency);
      ratesUsed[consolidationCurrency] = { rate: info.rate, source: info.source };
    }
    return sum + converted;
  }, 0);

  const retornoRefConsolidado = convertCurrency(
    targetReturnInRefCurrency,
    ref.moeda,
    consolidationCurrency,
    getEffectiveRate
  );

  const lucroConsolidado = retornoRefConsolidado - stakeConsolidadoTotal;

  return {
    stakes: calculatedStakes,
    isValid: true,
    lucroConsolidado,
    ratesUsed,
  };
}
