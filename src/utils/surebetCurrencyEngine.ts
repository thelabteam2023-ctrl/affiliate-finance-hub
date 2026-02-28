/**
 * ============================================================
 * SUREBET CURRENCY ENGINE — Motor Único de Câmbio para Arbitragem
 * ============================================================
 *
 * REGRA ABSOLUTA DE PRIORIDADE:
 *   1️⃣  Cotação Trabalho (manual, quando configurada)
 *   2️⃣  PTAX / Oficial do Context (FastForex)
 *   3️⃣  Fallback (rates hardcoded — emergência apenas)
 *
 * FÓRMULA PIVOT UNIVERSAL (via BRL):
 *   valorConvertido = (valor × taxaBRL_origem) / taxaBRL_destino
 *   onde taxaBRL = "1 [moeda] = X BRL"
 *
 * FLUXO CORRETO PARA CADA CENÁRIO DE ARBITRAGEM:
 *   1. payoutLocal   = stakeLocal × odd            (na moeda da casa)
 *   2. payoutConv    = payoutLocal  → consolidation (pivot BRL)
 *   3. stakeConv     = stakeLocal   → consolidation (pivot BRL)
 *   4. stakeTotal    = Σ stakeConv                 (nunca = 0)
 *   5. lucro cenário = payoutConv(vencedor) − stakeTotal
 *   6. ROI           = lucro / stakeTotal × 100
 *
 * EQUALIZADOR MULTI-MOEDA:
 *   targetReturnConv = refStake × refOdd → consolidation
 *   stakeOtherLocal  = (targetReturnConv / taxaConsolidation_other) / oddOther
 *   (nunca assume mesma moeda; sempre converte antes)
 *
 * ============================================================
 */

import type { SupportedCurrency } from "@/types/currency";

// ─── Interfaces públicas ─────────────────────────────────────

/** Mapa de cotações: 1 [moeda] = X BRL */
export interface BRLRates {
  [currency: string]: number;
}

/** Configuração passada ao engine */
export interface SurebetEngineConfig {
  /** Moeda de consolidação do projeto (ex: "USD", "BRL") */
  consolidationCurrency: SupportedCurrency;

  /**
   * Cotações BRL (1 moeda = X BRL).
   * DEVEM ser fornecidas pelo chamador usando a prioridade correta:
   *   Trabalho > PTAX > Fallback
   */
  brlRates: BRLRates;
}

/** Perna de entrada para o engine */
export interface EngineLeg {
  moeda: SupportedCurrency;
  stakeLocal: number;   // stake na moeda original da casa
  odd: number;          // odd média desta perna
  isReference: boolean; // perna de referência para equalização
  isManuallyEdited?: boolean;
  isFromPrint?: boolean;
}

/** Resultado de análise de uma perna num cenário */
export interface LegScenarioResult {
  legIndex: number;
  moeda: SupportedCurrency;
  stakeLocal: number;           // stake na moeda original
  stakeConsolidado: number;     // stake convertida para consolidation
  payoutLocal: number;          // payout na moeda original
  payoutConsolidado: number;    // payout convertido
  lucro: number;                // lucro SE esta perna ganhar (em consolidation)
  roi: number;                  // ROI SE esta perna ganhar
  isPositive: boolean;
}

/** Análise completa da operação */
export interface SurebetEngineAnalysis {
  /** Stakes calculadas para cada perna (na moeda original de cada uma) */
  calculatedStakesLocal: number[];

  /** Stakes consolidadas (na moeda de consolidação) */
  calculatedStakesConsolidated: number[];

  /** Soma das stakes consolidadas (NUNCA zero se houver stakes válidas) */
  stakeTotal: number;

  /** Cenários: um por perna (qual seria o lucro se aquela perna ganhasse) */
  scenarios: LegScenarioResult[];

  /** Menor lucro possível (cenário pessimista) */
  minLucro: number;

  /** Maior lucro possível */
  maxLucro: number;

  /** ROI do pior cenário */
  minRoi: number;

  /** ROI do melhor cenário */
  maxRoi: number;

  /** Se há pernas com moedas diferentes */
  isMultiCurrency: boolean;

  /** Moeda de consolidação usada */
  consolidationCurrency: SupportedCurrency;

  /** Válido para arbitragem: todas as pernas têm lucro ≥ 0 */
  isValidArbitrage: boolean;

  /** Pernas completas (bookmaker + odd + stake preenchidos) */
  pernasCompletasCount: number;

  /** Operação com pelo menos 2 pernas mas menos que numPernasEsperado */
  isOperacaoParcial: boolean;

  /**
   * Moeda dominante para exibição.
   * Em multi-moeda = moeda de consolidação.
   * Em mono-moeda = moeda da única divisa presente.
   */
  moedaDominante: SupportedCurrency;
}

// ─── Ajuste de stake para sub-entradas ───────────────────────

/**
 * Ajusta a stake equalizada TOTAL de uma perna para a stake PRINCIPAL correta
 * quando há sub-entradas com stakes/odds fixas.
 *
 * PROBLEMA: O equalizador calcula `targetReturn / oddMedia = totalStake`.
 * Mas se sub-entradas têm stakes fixas, alterar apenas a entrada principal
 * muda a oddMedia efetiva, fazendo o payout real ≠ targetReturn.
 *
 * SOLUÇÃO: mainStake = (targetReturn - subPayout) / mainOdd
 * onde targetReturn = totalStake * oddMedia (reconstruído)
 *
 * Para sub-entradas multi-moeda, converte cada subPayout para a moeda
 * da perna antes de subtrair.
 */
export function adjustStakeForSubEntries(
  totalStakeNeeded: number,
  mainOdd: number,
  oddMedia: number,
  subEntries: Array<{ odd: string; stake: string; moeda?: string }>,
  roundFn: (v: number) => number,
  brlRates?: BRLRates,
  legMoeda?: string
): number {
  if (!subEntries || subEntries.length === 0) return totalStakeNeeded;
  if (mainOdd <= 1 || oddMedia <= 0) return totalStakeNeeded;

  // Calcular payout das sub-entradas (convertido para moeda da perna se necessário)
  const subPayout = subEntries.reduce((sum, ae) => {
    const s = parseFloat(ae.stake) || 0;
    const aeOdd = parseFloat(ae.odd) || 0;
    if (s <= 0 || aeOdd <= 0) return sum;
    const payoutLocal = s * aeOdd;
    // Se temos info de moeda e taxas, converter para moeda da perna
    if (brlRates && legMoeda && ae.moeda && ae.moeda !== legMoeda) {
      return sum + convertViaBRL(payoutLocal, ae.moeda, legMoeda, brlRates);
    }
    return sum + payoutLocal;
  }, 0);

  if (subPayout <= 0) return totalStakeNeeded;

  // targetReturn = totalStakeNeeded * oddMedia (reconstruir o retorno-alvo)
  const targetReturn = totalStakeNeeded * oddMedia;
  const adjustedMainStake = (targetReturn - subPayout) / mainOdd;

  return roundFn(Math.max(0, adjustedMainStake));
}

// ─── Funções puras do engine ─────────────────────────────────

/**
 * Obtém a taxa BRL para uma moeda.
 * BRL sempre retorna 1 (já está em BRL).
 */
export function getBRLRate(moeda: string, brlRates: BRLRates): number {
  const key = moeda.toUpperCase();
  if (key === "BRL") return 1;
  const rate = brlRates[key];
  if (!rate || rate <= 0) {
    console.warn(`[SurebetEngine] Taxa BRL não encontrada para ${moeda}, usando 1.0`);
    return 1;
  }
  return rate;
}

/**
 * Converte um valor de uma moeda para outra usando BRL como pivot.
 * Fórmula: (valor × taxaBRL_origem) / taxaBRL_destino
 */
export function convertViaBRL(
  valor: number,
  from: string,
  to: string,
  brlRates: BRLRates
): number {
  if (from.toUpperCase() === to.toUpperCase()) return valor;
  if (valor === 0) return 0;

  const fromRate = getBRLRate(from, brlRates); // 1 [from] = X BRL
  const toRate = getBRLRate(to, brlRates);     // 1 [to]   = X BRL

  if (toRate === 0) return 0;

  return (valor * fromRate) / toRate;
}

/**
 * Calcula stakes equalizadas para arbitragem multi-moeda.
 *
 * LÓGICA:
 *   - Perna de referência define o retorno-alvo na moeda dela
 *   - Retorno-alvo é convertido para consolidation
 *   - Para outras pernas: targetReturnConv → moeda da perna → dividir por odd
 *   - Arredondamento APENAS no final
 */
export function calcularStakesEqualizadasMultiCurrency(
  legs: EngineLeg[],
  config: SurebetEngineConfig,
  roundFn: (v: number) => number
): {
  stakesLocal: number[];
  stakesConsolidated: number[];
  stakeTotal: number;
  isValid: boolean;
} {
  const { brlRates, consolidationCurrency } = config;
  const n = legs.length;
  const fallback = {
    stakesLocal: legs.map(l => l.stakeLocal),
    stakesConsolidated: legs.map(l =>
      convertViaBRL(l.stakeLocal, l.moeda, consolidationCurrency, brlRates)
    ),
    stakeTotal: 0,
    isValid: false,
  };

  if (n < 2) return fallback;

  const allOddsValid = legs.every(l => l.odd > 1);
  if (!allOddsValid) return fallback;

  const refIndex = legs.findIndex(l => l.isReference);
  if (refIndex === -1) return fallback;

  const ref = legs[refIndex];
  if (ref.stakeLocal <= 0) return fallback;

  // Passo 1: retorno-alvo na moeda da referência
  const targetReturnRef = ref.stakeLocal * ref.odd;

  // Passo 2: converter retorno-alvo para moeda de consolidação
  const targetReturnConsolidated = convertViaBRL(
    targetReturnRef,
    ref.moeda,
    consolidationCurrency,
    brlRates
  );

  // Passo 3: calcular stake de cada perna na sua moeda original
  const stakesLocal = legs.map((leg, i) => {
    if (i === refIndex) return ref.stakeLocal;
    if (leg.isManuallyEdited || leg.isFromPrint) return leg.stakeLocal;

    // targetReturnConsolidated → moeda da perna → divide pela odd
    const targetReturnInLegCurrency = convertViaBRL(
      targetReturnConsolidated,
      consolidationCurrency,
      leg.moeda,
      brlRates
    );

    return roundFn(targetReturnInLegCurrency / leg.odd);
  });

  // Passo 4: converter todas as stakes para consolidation
  const stakesConsolidated = stakesLocal.map((stake, i) =>
    convertViaBRL(stake, legs[i].moeda, consolidationCurrency, brlRates)
  );

  const stakeTotal = stakesConsolidated.reduce((a, b) => a + b, 0);

  return { stakesLocal, stakesConsolidated, stakeTotal, isValid: true };
}

/**
 * Análise completa de arbitragem multi-moeda.
 * Recebe as stakes REAIS (usuário inseriu ou equalizador calculou).
 */
export function analisarArbitragem(
  legs: EngineLeg[],
  stakesLocaisEfetivos: number[], // stakes reais (equalizadas ou manuais)
  config: SurebetEngineConfig,
  numPernasEsperado: number
): SurebetEngineAnalysis {
  const { brlRates, consolidationCurrency } = config;

  // Detectar multi-moeda
  const moedasUnicas = [...new Set(legs.map(l => l.moeda).filter(Boolean))];
  const isMultiCurrency = moedasUnicas.length > 1;

  // Converter todas as stakes para consolidation
  const stakesConsolidated = stakesLocaisEfetivos.map((stake, i) =>
    convertViaBRL(stake, legs[i]?.moeda || "BRL", consolidationCurrency, brlRates)
  );

  // Stake total consolidada (NUNCA pode ser zero se há stakes válidas)
  const stakeTotal = stakesConsolidated.reduce((a, b) => a + b, 0);

  // Pernas completas
  const pernasCompletasCount = legs.filter(
    (l, i) => l.odd > 1 && stakesLocaisEfetivos[i] > 0 && l.moeda
  ).length;

  // Cenários: para cada perna, calcular o lucro se ela ganhar
  const scenarios: LegScenarioResult[] = legs.map((leg, i) => {
    const stakeLocal = stakesLocaisEfetivos[i] || 0;
    const stakeConsolidado = stakesConsolidated[i] || 0;

    if (leg.odd <= 1 || stakeLocal <= 0) {
      return {
        legIndex: i,
        moeda: leg.moeda,
        stakeLocal,
        stakeConsolidado,
        payoutLocal: 0,
        payoutConsolidado: 0,
        lucro: -stakeTotal,
        roi: stakeTotal > 0 ? (-stakeTotal / stakeTotal) * 100 : 0,
        isPositive: false,
      };
    }

    // Payout na moeda original
    const payoutLocal = stakeLocal * leg.odd;

    // Payout convertido para consolidation
    const payoutConsolidado = convertViaBRL(payoutLocal, leg.moeda, consolidationCurrency, brlRates);

    // Lucro = payout consolidado − total apostado consolidado
    const lucro = payoutConsolidado - stakeTotal;

    const roi = stakeTotal > 0 ? (lucro / stakeTotal) * 100 : 0;

    return {
      legIndex: i,
      moeda: leg.moeda,
      stakeLocal,
      stakeConsolidado,
      payoutLocal,
      payoutConsolidado,
      lucro,
      roi,
      isPositive: lucro >= 0,
    };
  });

  const lucros = scenarios.map(s => s.lucro);
  const minLucro = lucros.length > 0 ? Math.min(...lucros) : 0;
  const maxLucro = lucros.length > 0 ? Math.max(...lucros) : 0;
  const minRoi = stakeTotal > 0 ? (minLucro / stakeTotal) * 100 : 0;
  const maxRoi = stakeTotal > 0 ? (maxLucro / stakeTotal) * 100 : 0;

  const isValidArbitrage = pernasCompletasCount >= numPernasEsperado && minLucro >= 0;
  const isOperacaoParcial = pernasCompletasCount >= 2 && pernasCompletasCount < numPernasEsperado;

  // Moeda dominante: consolidation em multi-moeda, ou moeda única presente
  const moedasPresentes = [...new Set(legs.filter((_, i) => stakesLocaisEfetivos[i] > 0).map(l => l.moeda))];
  const moedaDominante: SupportedCurrency = isMultiCurrency
    ? consolidationCurrency
    : (moedasPresentes[0] || consolidationCurrency);

  return {
    calculatedStakesLocal: stakesLocaisEfetivos,
    calculatedStakesConsolidated: stakesConsolidated,
    stakeTotal,
    scenarios,
    minLucro,
    maxLucro,
    minRoi,
    maxRoi,
    isMultiCurrency,
    consolidationCurrency,
    isValidArbitrage,
    pernasCompletasCount,
    isOperacaoParcial,
    moedaDominante,
  };
}

