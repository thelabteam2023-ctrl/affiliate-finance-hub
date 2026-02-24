/**
 * useSurebetCalculator — Hook de cálculo de arbitragem N-pernas
 *
 * MODELO CORRETO (multi-moeda):
 *   1. payoutLocal = stakeLocal × odd               (moeda original)
 *   2. payoutConv  = payoutLocal → consolidation    (pivot BRL)
 *   3. stakeConv   = stakeLocal  → consolidation    (pivot BRL)
 *   4. stakeTotal  = Σ stakeConv                   (NUNCA zero)
 *   5. lucro       = payoutConv − stakeTotal
 *   6. ROI         = lucro / stakeTotal × 100
 *
 * COTAÇÃO: usa useCotacoes (contexto global) que já respeita
 *   Trabalho > PTAX > API por configuração do projeto.
 *   O caller (SurebetModalRoot) passa o config com as taxas corretas.
 */

import { useMemo, useCallback } from "react";
import { type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import {
  convertViaBRL,
  calcularStakesEqualizadasMultiCurrency,
  analisarArbitragem,
  type EngineLeg,
  type BRLRates,
  type SurebetEngineConfig,
  type SurebetEngineAnalysis,
  type LegScenarioResult,
} from "@/utils/surebetCurrencyEngine";

// ─── Re-exports para compatibilidade ──────────────────────────
export type { SurebetEngineAnalysis as SurebetAnalysis, LegScenarioResult as LegScenario };

// ─── Tipos locais ──────────────────────────────────────────────

export interface OddEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecao: string;
  selecaoLivre: string;
  isReference: boolean;
  isManuallyEdited: boolean;
  stakeOrigem?: "print" | "referencia" | "manual";
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  gerouFreebet?: boolean;
  valorFreebetGerada?: string;
  additionalEntries?: OddFormEntry[];
}

export interface OddFormEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecaoLivre: string;
}

interface BookmakerInfo {
  id: string;
  moeda: string;
}

// ─── Utilitários públicos ─────────────────────────────────────

/**
 * Odd média ponderada pelas stakes das entradas adicionais.
 * Se não houver stakes, usa a odd principal.
 * 
 * MULTI-MOEDA: Quando brlRates e baseCurrency são fornecidos,
 * converte as stakes para a moeda base antes de calcular o peso,
 * garantindo que EUR 100 + USD 100 pese corretamente.
 */
export function calcularOddMedia(
  mainEntry: { odd: string; stake: string },
  additionalEntries?: OddFormEntry[],
  brlRates?: BRLRates,
  baseCurrency?: string
): number {
  const all = [
    { odd: mainEntry.odd, stake: mainEntry.stake, moeda: baseCurrency || "BRL", isMain: true },
    ...(additionalEntries || []).map(e => ({ odd: e.odd, stake: e.stake, moeda: (e.moeda as string) || baseCurrency || "BRL", isMain: false })),
  ];

  const validas = all
    .map(e => ({ ...e, oddNum: parseFloat(e.odd), stakeNum: parseFloat(e.stake) }))
    .filter(e => !isNaN(e.oddNum) && e.oddNum > 1);

  if (validas.length === 0) return 0;

  const comStake = validas.filter(e => !isNaN(e.stakeNum) && e.stakeNum > 0);

  if (comStake.length > 0 && brlRates && baseCurrency) {
    // Converter stakes para moeda base antes de ponderar
    const convertedStakes = comStake.map(e => ({
      ...e,
      stakeConverted: convertViaBRL(e.stakeNum, e.moeda, baseCurrency, brlRates),
    }));
    const somaConverted = convertedStakes.reduce((acc, e) => acc + e.stakeConverted, 0);
    if (somaConverted > 0) {
      return convertedStakes.reduce((acc, e) => acc + e.stakeConverted * e.oddNum, 0) / somaConverted;
    }
  }

  // Fallback: soma nominal (mono-moeda)
  const somaStake = comStake.reduce((acc, e) => acc + e.stakeNum, 0);
  if (somaStake > 0) {
    return comStake.reduce((acc, e) => acc + e.stakeNum * e.oddNum, 0) / somaStake;
  }

  return validas.find(e => e.isMain)?.oddNum ?? validas[0].oddNum;
}

/**
 * Soma das stakes de todas as entradas de uma perna.
 * 
 * MULTI-MOEDA: Quando brlRates e baseCurrency são fornecidos,
 * converte sub-entradas para a moeda base antes de somar,
 * garantindo que EUR 100 + USD 100 ≠ 200 USD.
 */
export function calcularStakeTotal(
  mainEntry: { stake: string },
  additionalEntries?: OddFormEntry[],
  brlRates?: BRLRates,
  baseCurrency?: string
): number {
  const main = parseFloat(mainEntry.stake) || 0;

  if (brlRates && baseCurrency && additionalEntries && additionalEntries.length > 0) {
    const extra = additionalEntries.reduce((acc, e) => {
      const stakeNum = parseFloat(e.stake) || 0;
      const moeda = (e.moeda as string) || baseCurrency;
      // Converter para moeda base da perna
      return acc + convertViaBRL(stakeNum, moeda, baseCurrency, brlRates);
    }, 0);
    return main + extra;
  }

  const extra = (additionalEntries || []).reduce((acc, e) => acc + (parseFloat(e.stake) || 0), 0);
  return main + extra;
}

// ─── Checkbox D — Distribuição de Lucro ──────────────────────

/**
 * Calcula stakes direcionadas (Checkbox D).
 *
 * REGRA v3 — Compatível com calculadora de referência:
 *   - Pernas DESMARCADAS: lucro = 0 (break even) → stake_i = totalStake / odd_i
 *   - Pernas MARCADAS: dividem todo o lucro com payouts iguais entre si
 *   - Perna de REFERÊNCIA: stake fixa, determina o totalStake
 *
 * Caso 1 — Referência DESMARCADA (mais comum):
 *   totalStake = refStake × refOdd
 *   unchecked_i = totalStake / odd_i
 *   checked: targetPayout = remaining / Σ(1/odd_j) → stake_j = targetPayout / odd_j
 *
 * Caso 2 — Referência MARCADA:
 *   targetPayout = refStake × refOdd (todas as marcadas têm mesmo payout)
 *   checked_j = targetPayout / odd_j
 *   totalStake = Σ(checked) / (1 − Σ(1/odd_i for unchecked))
 *   unchecked_i = totalStake / odd_i
 */
function calcularStakesDirecionadas(
  parsedOdds: number[],
  baseStakes: number[],
  directedProfitLegs: number[],
  refIndex: number,
  arredondarFn: (v: number) => number
): number[] | null {
  const n = parsedOdds.length;
  if (directedProfitLegs.length === 0 || directedProfitLegs.length === n) return null;

  const valid = parsedOdds.filter(o => o > 1).length;
  if (valid !== n) return null;

  if (refIndex < 0 || refIndex >= n) return null;
  if (baseStakes[refIndex] <= 0) return null;

  const refStake = baseStakes[refIndex];
  const refOdd = parsedOdds[refIndex];
  const isRefChecked = directedProfitLegs.includes(refIndex);
  const uncheckedIndices = parsedOdds.map((_, i) => i).filter(i => !directedProfitLegs.includes(i));

  const result = new Array(n).fill(0);

  if (!isRefChecked) {
    // Caso 1: Referência desmarcada → break even → totalStake = refStake × refOdd
    const totalStake = refStake * refOdd;

    // Pernas desmarcadas: break even (payout = totalStake)
    for (const i of uncheckedIndices) {
      result[i] = arredondarFn(totalStake / parsedOdds[i]);
    }

    // Pernas marcadas: dividem restante com payouts iguais
    const sumUnchecked = uncheckedIndices.reduce((acc, i) => acc + result[i], 0);
    const remaining = totalStake - sumUnchecked;

    if (directedProfitLegs.length === 1) {
      result[directedProfitLegs[0]] = arredondarFn(remaining);
    } else {
      const invOddSum = directedProfitLegs.reduce((acc, i) => acc + 1 / parsedOdds[i], 0);
      const targetPayout = remaining / invOddSum;
      for (const i of directedProfitLegs) {
        result[i] = arredondarFn(targetPayout / parsedOdds[i]);
      }
    }
  } else {
    // Caso 2: Referência marcada → payout fixo para todas marcadas
    const targetPayout = refStake * refOdd;

    result[refIndex] = refStake;
    for (const i of directedProfitLegs) {
      if (i === refIndex) continue;
      result[i] = arredondarFn(targetPayout / parsedOdds[i]);
    }

    const sumChecked = directedProfitLegs.reduce((acc, i) => acc + result[i], 0);
    const invOddSumUnchecked = uncheckedIndices.reduce((acc, i) => acc + 1 / parsedOdds[i], 0);

    if (1 - invOddSumUnchecked <= 0) return null;

    const totalStake = sumChecked / (1 - invOddSumUnchecked);
    for (const i of uncheckedIndices) {
      result[i] = arredondarFn(totalStake / parsedOdds[i]);
    }
  }

  return result;
}

// ─── Hook Principal ───────────────────────────────────────────

interface UseSurebetCalculatorParams {
  odds: OddEntry[];
  directedProfitLegs: number[];
  numPernas: number;
  arredondarAtivado: boolean;
  arredondarValor: string;
  bookmakerSaldos: BookmakerInfo[];
  /** Configuração de câmbio do projeto — OBRIGATÓRIA para multi-moeda correto */
  engineConfig?: SurebetEngineConfig;
  /** Snapshot das stakes equalizadas — base imutável para checkbox D */
  equalizedStakesSnapshot?: number[];
}

export function useSurebetCalculator({
  odds,
  directedProfitLegs,
  numPernas,
  arredondarAtivado,
  arredondarValor,
  bookmakerSaldos,
  engineConfig,
  equalizedStakesSnapshot,
}: UseSurebetCalculatorParams) {

  // ── Arredondamento ───────────────────────────────────────────
  const arredondarStake = useCallback((valor: number): number => {
    if (!arredondarAtivado || !valor) return valor;
    const fator = parseFloat(arredondarValor) || 1;
    return Math.round(valor / fator) * fator;
  }, [arredondarAtivado, arredondarValor]);

  // ── Moeda de cada perna ──────────────────────────────────────
  const getMoedaPerna = useCallback((entry: OddEntry): SupportedCurrency => {
    const bk = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
    return (bk?.moeda as SupportedCurrency) || entry.moeda || "BRL";
  }, [bookmakerSaldos]);

  // ── Configuração de fallback quando engineConfig não fornecido ─
  const safeConfig: SurebetEngineConfig = useMemo(() => {
    if (engineConfig) return engineConfig;
    return {
      consolidationCurrency: "BRL",
      brlRates: { BRL: 1, USD: 5.5, EUR: 6.0, GBP: 7.0 },
    };
  }, [engineConfig]);

  // ── Helpers de perna (dependem de getMoedaPerna e safeConfig) ──
  const getOddMediaPerna = useCallback((entry: OddEntry): number => {
    const baseCurrency = getMoedaPerna(entry);
    return calcularOddMedia(
      { odd: entry.odd, stake: entry.stake },
      entry.additionalEntries,
      safeConfig.brlRates,
      baseCurrency
    );
  }, [safeConfig.brlRates, getMoedaPerna]);

  const getStakeTotalPerna = useCallback((entry: OddEntry): number => {
    const baseCurrency = getMoedaPerna(entry);
    return calcularStakeTotal(
      { stake: entry.stake },
      entry.additionalEntries,
      safeConfig.brlRates,
      baseCurrency
    );
  }, [safeConfig.brlRates, getMoedaPerna]);

  // ── Checkbox D ───────────────────────────────────────────────
  // Usa snapshot imutável como base; fallback para stakes atuais se snapshot vazio
  const directedStakesLocal = useMemo(() => {
    const parsedOdds = odds.map(o => getOddMediaPerna(o));
    const baseStakes = (equalizedStakesSnapshot && equalizedStakesSnapshot.length === odds.length)
      ? equalizedStakesSnapshot
      : odds.map(o => getStakeTotalPerna(o));
    const refIndex = odds.findIndex(o => o.isReference);
    return calcularStakesDirecionadas(parsedOdds, baseStakes, directedProfitLegs, refIndex, arredondarStake);
  }, [odds, directedProfitLegs, arredondarStake, getOddMediaPerna, getStakeTotalPerna, equalizedStakesSnapshot]);

  // ── Stakes equalizadas ou dirigidas ──────────────────────────
  const { calculatedStakesLocal, calculatedStakesConsolidated } = useMemo(() => {
    if (directedStakesLocal) {
      const stakesConsolidated = directedStakesLocal.map((stake, i) =>
        convertViaBRL(stake, getMoedaPerna(odds[i]), safeConfig.consolidationCurrency, safeConfig.brlRates)
      );
      return {
        calculatedStakesLocal: directedStakesLocal,
        calculatedStakesConsolidated: stakesConsolidated,
      };
    }

    // Construir EngineLeg para o equalizador
    const engineLegs: EngineLeg[] = odds.map((o, i) => ({
      moeda: getMoedaPerna(o),
      stakeLocal: getStakeTotalPerna(o),
      odd: getOddMediaPerna(o),
      isReference: o.isReference,
      isManuallyEdited: o.isManuallyEdited,
      isFromPrint: o.stakeOrigem === "print",
    }));

    const resultado = calcularStakesEqualizadasMultiCurrency(engineLegs, safeConfig, arredondarStake);

    if (resultado.isValid) {
      return {
        calculatedStakesLocal: resultado.stakesLocal,
        calculatedStakesConsolidated: resultado.stakesConsolidated,
      };
    }

    // Fallback: stakes como estão na tela
    const stakesFallback = odds.map(o => getStakeTotalPerna(o));
    const consolidatedFallback = stakesFallback.map((stake, i) =>
      convertViaBRL(stake, getMoedaPerna(odds[i]), safeConfig.consolidationCurrency, safeConfig.brlRates)
    );
    return {
      calculatedStakesLocal: stakesFallback,
      calculatedStakesConsolidated: consolidatedFallback,
    };
  }, [odds, directedStakesLocal, safeConfig, arredondarStake, getMoedaPerna, getOddMediaPerna, getStakeTotalPerna]);

  // ── Análise completa via engine ───────────────────────────────
  const analysis = useMemo((): SurebetEngineAnalysis => {
    // Usar stakes REAIS da tela para análise (não equalizadas)
    const realStakesLocal = odds.map(o => getStakeTotalPerna(o));

    const engineLegs: EngineLeg[] = odds.map((o, i) => ({
      moeda: getMoedaPerna(o),
      stakeLocal: realStakesLocal[i],
      odd: getOddMediaPerna(o),
      isReference: o.isReference,
      isManuallyEdited: o.isManuallyEdited,
      isFromPrint: o.stakeOrigem === "print",
    }));

    // Stakes efetivos para análise: direcionadas se ativo, senão reais
    const effectiveStakes = directedStakesLocal || realStakesLocal;

    return analisarArbitragem(engineLegs, effectiveStakes, safeConfig, numPernas);
  }, [odds, directedStakesLocal, numPernas, safeConfig, getMoedaPerna, getOddMediaPerna, getStakeTotalPerna]);

  // ── Pernas válidas ────────────────────────────────────────────
  const pernasValidas = useMemo(() => {
    return odds.filter(entry => {
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      return !isNaN(odd) && odd > 1 && !isNaN(stake) && stake > 0 && entry.bookmaker_id;
    });
  }, [odds]);

  return {
    analysis,
    calculatedStakes: calculatedStakesLocal,   // stakes locais (para UI de entrada)
    calculatedStakesConsolidated,               // stakes convertidas (para exibição de totais)
    directedStakes: directedStakesLocal,
    pernasValidas,
    arredondarStake,
    getOddMediaPerna,
    getStakeTotalPerna,
    getMoedaPerna,
  };
}
