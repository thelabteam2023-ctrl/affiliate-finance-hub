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
  consolidationCurrency: string,
  legsWithEntries?: Array<{
    additionalEntries?: Array<{
      moeda: string;
      odd: number;
      stake: number;
    }>;
  }>

): {
  stakes: number[];
  isValid: boolean;
  lucroConsolidado: number;
  ratesUsed: Record<string, { rate: number; source: string }>;
  adjustedAdditionalEntries?: any[][];
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
  // Se a perna de referência tem múltiplas entradas, o retorno-alvo é a soma dos retornos de cada entrada
  // convertido para a moeda da perna de referência.
  const refPernaData = legsWithEntries?.[refIndex];
  let targetReturnInRefCurrency = 0;

  if (refPernaData && refPernaData.additionalEntries && refPernaData.additionalEntries.length > 0) {
    // Retorno da entrada principal na moeda da perna de referência
    targetReturnInRefCurrency = ref.stakeAtual * ref.oddMedia;
    
    // Somar retornos das entradas adicionais (convertendo para a moeda da perna de referência)
    refPernaData.additionalEntries.forEach(ae => {
      const aeReturn = ae.stake * ae.odd;
      // CRÍTICO: Converter retorno da entrada adicional para a moeda da perna de referência
      targetReturnInRefCurrency += convertCurrency(aeReturn, ae.moeda, ref.moeda, getEffectiveRate);
    });
  } else {
    targetReturnInRefCurrency = ref.stakeAtual * ref.oddMedia;
  }

  // PASSO 2: Para cada perna, calcular stake nas entradas (seguindo a prioridade: Entrada Principal fixa -> Subentradas calculadas)
  const calculatedStakes = legs.map((leg, i) => {
    if (i === refIndex) return leg.stakeAtual;
    if (leg.isManuallyEdited || leg.isFromPrint) return leg.stakeAtual;

    // Converter retorno-alvo da moeda da referência para a moeda desta perna
    const targetReturnInLegCurrency = convertCurrency(
      targetReturnInRefCurrency,
      ref.moeda,
      leg.moeda,
      getEffectiveRate
    );

    // CRÍTICO: A entrada principal nesta perna é considerada fixa pelo usuário (ou o valor padrão da calculadora).
    // O sistema agora deve recalcular as SUBENTRADAS para preencher o déficit, mas o motor central
    // de calcularStakesMultiCurrency retorna a stake da entrada principal.
    // Para manter a entrada principal fixa quando editada, o recálculo deve fluir para a última subentrada.
    return roundFn(targetReturnInLegCurrency / leg.oddMedia);
  });

  // PASSO 3: Ajustar subentradas para pernas dependentes (não referência)
  // Se uma perna tem múltiplas entradas e a entrada principal foi fixada/ajustada,
  // recalcular a ÚLTIMA subentrada para atingir o retorno-alvo.
  const adjustedAdditionalEntries = legsWithEntries?.map((legData, i) => {
    if (i === refIndex) return legData.additionalEntries;
    
    // Apenas se a perna for dependente e tiver subentradas
    if (!legData.additionalEntries || legData.additionalEntries.length === 0) {
      return legData.additionalEntries;
    }

    const leg = legs[i];
    const targetReturnInLegCurrency = convertCurrency(
      targetReturnInRefCurrency,
      ref.moeda,
      leg.moeda,
      getEffectiveRate
    );

    // Retorno da entrada principal (que o motor central agora trata como fixa se for manual)
    const currentMainStake = calculatedStakes[i];
    const mainReturn = currentMainStake * leg.oddMedia;
    
    // Retorno de todas as subentradas EXCETO a última
    let otherEntriesReturn = 0;
    const entries = [...legData.additionalEntries];
    for (let j = 0; j < entries.length - 1; j++) {
      const e = entries[j];
      const eReturn = (parseFloat(e.stake as any) || 0) * (parseFloat(e.odd as any) || 0);
      otherEntriesReturn += convertCurrency(eReturn, e.moeda, leg.moeda, getEffectiveRate);
    }

    // Calcular stake necessária para a última subentrada
    const lastIdx = entries.length - 1;
    const lastEntry = entries[lastIdx];
    const lastOdd = parseFloat(lastEntry.odd as any) || 0;

    if (lastOdd > 1) {
      const neededReturn = Math.max(0, targetReturnInLegCurrency - mainReturn - otherEntriesReturn);
      const neededReturnInEntryCurrency = convertCurrency(neededReturn, leg.moeda, lastEntry.moeda, getEffectiveRate);
      entries[lastIdx] = {
        ...lastEntry,
        stake: roundFn(neededReturnInEntryCurrency / lastOdd)
      };
    }

    return entries;
  });

  // PASSO 4: Calcular lucro consolidado na moeda de consolidação
  const stakeConsolidadoTotal = legs.reduce((sum, leg, i) => {
    const mainConverted = convertCurrency(calculatedStakes[i], leg.moeda, consolidationCurrency, getEffectiveRate);
    
    let additionalConverted = 0;
    const entries = adjustedAdditionalEntries?.[i];
    if (entries) {
      entries.forEach(ae => {
        additionalConverted += convertCurrency(parseFloat(ae.stake as any) || 0, ae.moeda, consolidationCurrency, getEffectiveRate);
      });
    }

    [leg.moeda, ...(entries?.map(ae => ae.moeda) || [])].forEach(m => {
      if (m !== "BRL" && !ratesUsed[m]) {
        const info = getEffectiveRate(m);
        ratesUsed[m] = { rate: info.rate, source: info.source };
      }
    });
    
    return sum + mainConverted + additionalConverted;
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
    adjustedAdditionalEntries,
  };
}
