/**
 * useSurebetCalculator — Hook de cálculo de arbitragem N-pernas
 */

import { useMemo, useCallback } from "react";
import { type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import { CalculationTrace, type TraceStep } from "@/engine/calculationTrace";
import { runSurebetPipeline } from "@/engine/surebetPipeline";
import {
  convertViaBRL,
  type EngineLeg,
  type BRLRates,
  type SurebetEngineConfig,
  type SurebetEngineAnalysis,
  type LegScenarioResult,
} from "@/utils/surebetCurrencyEngine";

declare global {
  interface Window {
    __CALC_DEBUG__?: {
      lastCalculation: (SurebetEngineAnalysis & { traceId?: string }) | null;
      traces: Array<{
        id: string;
        steps: TraceStep[];
        timestamp: number;
      }>;
      hydrationState: Record<string, any>;
      dependencyGraph: Record<string, any>;
      exportSnapshot: () => string;
      reproduce: (snapshot: string | any) => void;
      reproduceAndRender: (snapshot: string | any) => void;
      overrideExchangeRate: (from: string, to: string, rate: number) => void;
      audit: () => void;
    };
  }
}


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
  fonteSaldo?: 'REAL' | 'FREEBET';
  /** UUID da perna no banco (apostas_pernas.id). Undefined para pernas novas. */
  pernaId?: string;
  additionalEntries?: OddFormEntry[];
}

export interface OddFormEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecaoLivre: string;
  fonteSaldo?: 'REAL' | 'FREEBET';
  /** UUID da perna no banco (apostas_pernas.id). Undefined para pernas novas. */
  pernaId?: string;
}

interface BookmakerInfo {
  id: string;
  moeda: string;
}

// ─── Utilitários públicos ─────────────────────────────────────

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
    const convertedStakes = comStake.map(e => ({
      ...e,
      stakeConverted: convertViaBRL(e.stakeNum, e.moeda, baseCurrency, brlRates),
    }));
    const somaConverted = convertedStakes.reduce((acc, e) => acc + e.stakeConverted, 0);
    if (somaConverted > 0) {
      return convertedStakes.reduce((acc, e) => acc + e.stakeConverted * e.oddNum, 0) / somaConverted;
    }
  }

  const somaStake = comStake.reduce((acc, e) => acc + e.stakeNum, 0);
  if (somaStake > 0) {
    return comStake.reduce((acc, e) => acc + e.stakeNum * e.oddNum, 0) / somaStake;
  }

  return validas.find(e => e.isMain)?.oddNum ?? validas[0].oddNum;
}

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
      return acc + convertViaBRL(stakeNum, moeda, baseCurrency, brlRates);
    }, 0);
    return main + extra;
  }

  const extra = (additionalEntries || []).reduce((acc, e) => acc + (parseFloat(e.stake) || 0), 0);
  return main + extra;
}

export function calcularStakeSplit(
  mainEntry: { stake: string; fonteSaldo?: string },
  additionalEntries?: OddFormEntry[],
  brlRates?: BRLRates,
  baseCurrency?: string
): { realStakeLocal: number; freebetStakeLocal: number } {
  const mainStake = parseFloat(mainEntry.stake) || 0;
  const mainIsFB = mainEntry.fonteSaldo === 'FREEBET';
  let realStake = mainIsFB ? 0 : mainStake;
  let fbStake = mainIsFB ? mainStake : 0;

  if (additionalEntries) {
    for (const e of additionalEntries) {
      let s = parseFloat(e.stake) || 0;
      const moeda = (e.moeda as string) || baseCurrency || "BRL";
      if (brlRates && baseCurrency && moeda !== baseCurrency) {
        s = convertViaBRL(s, moeda, baseCurrency, brlRates);
      }
      if (e.fonteSaldo === 'FREEBET') {
        fbStake += s;
      } else {
        realStake += s;
      }
    }
  }

  return { realStakeLocal: realStake, freebetStakeLocal: fbStake };
}

// ─── Hook Principal ───────────────────────────────────────────

interface UseSurebetCalculatorParams {
  odds: OddEntry[];
  directedProfitLegs: number[];
  numPernas: number;
  arredondarAtivado: boolean;
  arredondarValor: string;
  bookmakerSaldos: BookmakerInfo[];
  engineConfig?: SurebetEngineConfig;
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

  const arredondarStake = useCallback((valor: number): number => {
    if (!arredondarAtivado || !valor) return valor;
    const fator = parseFloat(arredondarValor) || 1;
    return Math.round(valor / fator) * fator;
  }, [arredondarAtivado, arredondarValor]);

  const getMoedaPerna = useCallback((entry: OddEntry): SupportedCurrency => {
    const bk = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
    return (bk?.moeda as SupportedCurrency) || entry.moeda || "BRL";
  }, [bookmakerSaldos]);

  const safeConfig: SurebetEngineConfig = useMemo(() => {
    if (engineConfig) return engineConfig;
    return {
      consolidationCurrency: "BRL",
      brlRates: { BRL: 1, USD: 5.5, EUR: 6.0, GBP: 7.0 },
    };
  }, [engineConfig]);

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

  // CALCULATION PIPELINE WITH TRACE
  const analysis = useMemo((): SurebetEngineAnalysis & { traceId?: string } => {
    const trace = new CalculationTrace(true);
    
    const engineLegs: EngineLeg[] = odds.map((o) => {
      const baseCurrency = getMoedaPerna(o);
      const split = calcularStakeSplit(
        { stake: o.stake, fonteSaldo: o.fonteSaldo },
        o.additionalEntries, safeConfig.brlRates, baseCurrency
      );
      return {
        moeda: baseCurrency,
        stakeLocal: getStakeTotalPerna(o),
        odd: getOddMediaPerna(o),
        isReference: o.isReference,
        isManuallyEdited: o.isManuallyEdited,
        isFromPrint: o.stakeOrigem === "print",
        isFreebet: o.fonteSaldo === 'FREEBET' && !o.additionalEntries?.length,
        realStakeLocal: split.realStakeLocal,
        freebetStakeLocal: split.freebetStakeLocal,
      };
    });

    const result = runSurebetPipeline({
      legs: engineLegs,
      config: safeConfig,
      numPernasEsperado: numPernas,
      arredondarFn: arredondarStake,
      directedProfitLegs,
      refIndex: odds.findIndex(o => o.isReference),
      equalizedStakesSnapshot
    }, trace);

    const finalResult = {
      ...result,
      traceId: trace.getId()
    };

    // Global bridge update for AI-debuggable engine
    if (typeof window !== 'undefined') {
      if (!window.__CALC_DEBUG__) {
        window.__CALC_DEBUG__ = {
          lastCalculation: null,
          traces: [],
          hydrationState: {},
          dependencyGraph: {},
          exportSnapshot: () => JSON.stringify(window.__CALC_DEBUG__),
          reproduce: (snapshot) => {
            console.log("Reproducing from snapshot:", snapshot);
          },
          reproduceAndRender: (snapshot) => {
            console.log("Reproducing and rendering from snapshot:", snapshot);
          },
          overrideExchangeRate: (from, to, rate) => {
            console.log(`Overriding rate ${from} -> ${to} with ${rate}`);
          },
        };
      }
      window.__CALC_DEBUG__.lastCalculation = finalResult;
      window.__CALC_DEBUG__.traces.push({
        id: trace.getId(),
        steps: trace.getSteps(),
        timestamp: Date.now(),
      });
      if (window.__CALC_DEBUG__.traces.length > 50) window.__CALC_DEBUG__.traces.shift();
    }

    return finalResult;
  }, [odds, directedProfitLegs, numPernas, arredondarStake, safeConfig, getMoedaPerna, getOddMediaPerna, getStakeTotalPerna, equalizedStakesSnapshot]);

  return {
    analysis,
    calculatedStakes: analysis.calculatedStakesLocal,
    equalizedTargetStakes: analysis.calculatedStakesLocal, // Simplificado para compatibilidade
    targetPayoutsLocal: analysis.scenarios.map(s => s.payoutLocal),
    pernasValidas: odds.filter((_, i) => analysis.scenarios[i].payoutLocal > 0),
    arredondarStake,
    getOddMediaPerna,
    getStakeTotalPerna,
    directedStakes: analysis.calculatedStakesLocal
  };
}
