/**
 * ============================================================
 * SUREBET CURRENCY ENGINE — Motor Único de Câmbio para Arbitragem
 * ============================================================
 */

import type { SupportedCurrency } from "@/types/currency";
import { CalculationTrace } from "@/engine/calculationTrace";

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
   */
  brlRates: BRLRates;
}

/** Perna de entrada para o engine */
export interface EngineLeg {
  moeda: SupportedCurrency;
  stakeLocal: number;   // stake TOTAL na moeda original da casa
  odd: number;          // odd média desta perna
  isReference: boolean; // perna de referência para equalização
  isManuallyEdited?: boolean;
  isFromPrint?: boolean;
  /** SNR: Freebet stake não retorna e não conta como custo */
  isFreebet?: boolean;
  /** Stake de saldo real dentro desta perna (para legs mistas Real+FB) */
  realStakeLocal?: number;
  /** Stake de freebet dentro desta perna (para legs mistas Real+FB) */
  freebetStakeLocal?: number;
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

  /** Soma das stakes consolidadas */
  stakeTotal: number;

  /** Cenários: um por perna */
  scenarios: LegScenarioResult[];

  /** Menor lucro possível */
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

  /** Moeda dominante para exibição */
  moedaDominante: SupportedCurrency;
}

// ─── Funções puras do engine ─────────────────────────────────

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

export function convertViaBRL(
  valor: number,
  from: string,
  to: string,
  brlRates: BRLRates,
  trace?: CalculationTrace
): number {
  if (!from || !to) return valor;
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();
  
  if (fromUpper === toUpper) return valor;
  if (valor === 0) return 0;

  const fromRate = getBRLRate(fromUpper, brlRates);
  const toRate = getBRLRate(toUpper, brlRates);

  if (toRate === 0) return 0;

  const result = (valor * fromRate) / toRate;

  if (trace) {
    trace.step("currency_conversion", {
      inputs: { valor, from: fromUpper, to: toUpper },
      outputs: { result },
      currencyIn: fromUpper,
      currencyOut: toUpper,
      rate: fromRate / toRate,
      formula: `(${valor} * ${fromRate}) / ${toRate}`
    });
    
    // Detectar contaminação (BRL como pivô mas verificando se há taxas nulas)
    if (fromRate === 1 && fromUpper !== "BRL") {
      trace.step("currency_warning", { inputs: { fromUpper }, outputs: { warning: "Rate not found, using 1.0" } });
    }
  }

  return result;
}

export function adjustStakeForSubEntries(
  totalStakeNeeded: number,
  mainOdd: number,
  oddMedia: number,
  subEntries: Array<{ odd: string; stake: string; moeda?: string }>,
  roundFn: (v: number) => number,
  brlRates?: BRLRates,
  legMoeda?: string,
  trace?: CalculationTrace
): number {
  if (!subEntries || subEntries.length === 0) return totalStakeNeeded;
  if (mainOdd <= 1 || oddMedia <= 0) return totalStakeNeeded;

  const subPayout = subEntries.reduce((sum, ae) => {
    const s = parseFloat(ae.stake) || 0;
    const aeOdd = parseFloat(ae.odd) || 0;
    if (s <= 0 || aeOdd <= 0) return sum;
    const payoutLocal = s * aeOdd;
    if (brlRates && legMoeda && ae.moeda && ae.moeda.toUpperCase() !== legMoeda.toUpperCase()) {
      return sum + convertViaBRL(payoutLocal, ae.moeda, legMoeda, brlRates, trace);
    }
    return sum + payoutLocal;
  }, 0);

  if (subPayout <= 0) return totalStakeNeeded;

  const targetReturn = totalStakeNeeded * oddMedia;
  const adjustedMainStake = (targetReturn - subPayout) / mainOdd;
  const result = roundFn(Math.max(0, adjustedMainStake));

  trace?.step("sub_entry_adjustment", {
    inputs: { totalStakeNeeded, mainOdd, oddMedia, subPayout },
    outputs: { result },
    formula: `((${totalStakeNeeded} * ${oddMedia}) - ${subPayout}) / ${mainOdd}`,
    rounded: true,
    precisionLoss: (Math.max(0, adjustedMainStake)) - result
  });

  return result;
}

/**
 * Agrega sub-entradas normalizando para uma moeda comum
 */
export function aggregateSubEntries(
  subEntries: Array<{ odd: string; stake: string; moeda?: string }>,
  targetCurrency: string,
  brlRates: BRLRates,
  trace?: CalculationTrace
): {
  totalStake: number;
  totalPayout: number;
} {
  return subEntries.reduce((acc, ae) => {
    const s = parseFloat(ae.stake) || 0;
    const odd = parseFloat(ae.odd) || 0;
    if (s <= 0 || odd <= 0) return acc;
    
    const moeda = (ae.moeda || targetCurrency).toUpperCase();
    const normalizedStake = convertViaBRL(s, moeda, targetCurrency, brlRates, trace);
    const normalizedPayout = convertViaBRL(s * odd, moeda, targetCurrency, brlRates, trace);
    
    return {
      totalStake: acc.totalStake + normalizedStake,
      totalPayout: acc.totalPayout + normalizedPayout,
    };
  }, { totalStake: 0, totalPayout: 0 });
}


export function calcularStakesEqualizadasMultiCurrency(
  legs: EngineLeg[],
  config: SurebetEngineConfig,
  roundFn: (v: number) => number,
  trace?: CalculationTrace
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
      convertViaBRL(l.stakeLocal, l.moeda, consolidationCurrency, brlRates, trace)
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

  const getEffectivePayout = (leg: EngineLeg, stakeOverride?: number): number => {
    const stake = stakeOverride ?? leg.stakeLocal;
    const realPart = leg.realStakeLocal ?? (leg.isFreebet ? 0 : stake);
    const fbPart = leg.freebetStakeLocal ?? (leg.isFreebet ? stake : 0);
    const total = realPart + fbPart;
    if (total <= 0) return stake * leg.odd;
    const ratio = stake / total;
    return (realPart * ratio * leg.odd) + (fbPart * ratio * (leg.odd - 1));
  };

  const targetReturnRef = getEffectivePayout(ref);

  const targetReturnConsolidated = convertViaBRL(
    targetReturnRef,
    ref.moeda,
    consolidationCurrency,
    brlRates,
    trace
  );

  const stakesLocal = legs.map((leg, i) => {
    if (i === refIndex) return ref.stakeLocal;
    if (leg.isManuallyEdited || leg.isFromPrint) return leg.stakeLocal;

    const targetReturnInLegCurrency = convertViaBRL(
      targetReturnConsolidated,
      consolidationCurrency,
      leg.moeda,
      brlRates,
      trace
    );

    const hasRealPart = (leg.realStakeLocal ?? (leg.isFreebet ? 0 : 1)) > 0;
    const hasFbPart = (leg.freebetStakeLocal ?? (leg.isFreebet ? 1 : 0)) > 0;

    let res: number;
    if (hasFbPart && !hasRealPart) {
      res = roundFn(targetReturnInLegCurrency / (leg.odd - 1));
    } else if (!hasFbPart) {
      res = roundFn(targetReturnInLegCurrency / leg.odd);
    } else {
      const total = (leg.realStakeLocal || 0) + (leg.freebetStakeLocal || 0);
      const realRatio = (leg.realStakeLocal || 0) / total;
      const fbRatio = (leg.freebetStakeLocal || 0) / total;
      const effectiveOdd = (realRatio * leg.odd) + (fbRatio * (leg.odd - 1));
      res = roundFn(targetReturnInLegCurrency / effectiveOdd);
    }

    trace?.step("stake_distribution", {
      inputs: { targetReturnInLegCurrency, odd: leg.odd, legIndex: i },
      outputs: { stakeLocal: res },
      currencyOut: leg.moeda,
      rounded: true
    });

    return res;
  });

  const stakesConsolidated = stakesLocal.map((stake, i) =>
    convertViaBRL(stake, legs[i].moeda, consolidationCurrency, brlRates, trace)
  );

  const stakeTotal = stakesConsolidated.reduce((a, b) => a + b, 0);

  return { stakesLocal, stakesConsolidated, stakeTotal, isValid: true };
}

export function analisarArbitragem(
  legs: EngineLeg[],
  stakesLocaisEfetivos: number[],
  config: SurebetEngineConfig,
  numPernasEsperado: number,
  trace?: CalculationTrace
): SurebetEngineAnalysis {
  const { brlRates, consolidationCurrency } = config;

  const moedasUnicas = [...new Set(legs.map(l => l.moeda).filter(Boolean))];
  const isMultiCurrency = moedasUnicas.length > 1;

  const stakesConsolidated = stakesLocaisEfetivos.map((stake, i) =>
    convertViaBRL(stake, legs[i]?.moeda || "BRL", consolidationCurrency, brlRates, trace)
  );

  const stakeTotal = stakesConsolidated.reduce((a, b) => a + b, 0);

  const perLegRealStakeConsolidated: number[] = [];
  const perLegFbStakeLocal: number[] = [];
  const perLegRealStakeLocal: number[] = [];

  legs.forEach((leg, i) => {
    const totalLocal = stakesLocaisEfetivos[i] || 0;
    let realLocal: number;
    let fbLocal: number;

    if (leg.realStakeLocal !== undefined || leg.freebetStakeLocal !== undefined) {
      realLocal = leg.realStakeLocal ?? totalLocal;
      fbLocal = leg.freebetStakeLocal ?? 0;
    } else if (leg.isFreebet) {
      realLocal = 0;
      fbLocal = totalLocal;
    } else {
      realLocal = totalLocal;
      fbLocal = 0;
    }

    perLegRealStakeLocal.push(realLocal);
    perLegFbStakeLocal.push(fbLocal);
    perLegRealStakeConsolidated.push(
      convertViaBRL(realLocal, leg.moeda || "BRL", consolidationCurrency, brlRates, trace)
    );
  });

  const stakeRealTotal = perLegRealStakeConsolidated.reduce((a, b) => a + b, 0);

  const pernasCompletasCount = legs.filter(
    (l, i) => l.odd > 1 && stakesLocaisEfetivos[i] > 0 && l.moeda
  ).length;

  const scenarios: LegScenarioResult[] = legs.map((leg, i) => {
    const stakeLocal = stakesLocaisEfetivos[i] || 0;
    const stakeConsolidado = stakesConsolidated[i] || 0;
    const realLocal = perLegRealStakeLocal[i];
    const fbLocal = perLegFbStakeLocal[i];

    if (leg.odd <= 1 || stakeLocal <= 0) {
      return {
        legIndex: i,
        moeda: leg.moeda,
        stakeLocal,
        stakeConsolidado,
        payoutLocal: 0,
        payoutConsolidado: 0,
        lucro: -stakeRealTotal,
        roi: stakeRealTotal > 0 ? -100 : 0,
        isPositive: false,
      };
    }

    const payoutLocal = (realLocal * leg.odd) + (fbLocal * (leg.odd - 1));
    const payoutConsolidado = convertViaBRL(payoutLocal, leg.moeda, consolidationCurrency, brlRates, trace);
    const lucro = payoutConsolidado - stakeRealTotal;
    const roiBase = stakeRealTotal > 0 ? stakeRealTotal : stakeTotal;
    const roi = roiBase > 0 ? (lucro / roiBase) * 100 : 0;

    trace?.step("payout_projection", {
      inputs: { legIndex: i, stakeLocal, odd: leg.odd, stakeRealTotal },
      outputs: { payoutConsolidado, lucro, roi },
      currencyOut: consolidationCurrency
    });

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
  const roiBase = stakeRealTotal > 0 ? stakeRealTotal : stakeTotal;
  const minRoi = roiBase > 0 ? (minLucro / roiBase) * 100 : 0;
  const maxRoi = roiBase > 0 ? (maxLucro / roiBase) * 100 : 0;

  const isValidArbitrage = pernasCompletasCount >= numPernasEsperado && minLucro >= 0;
  const isOperacaoParcial = pernasCompletasCount >= 2 && pernasCompletasCount < numPernasEsperado;

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
