import type { SurebetEngineAnalysis } from "@/utils/surebetCurrencyEngine";

type DebugLeg = {
  tipo?: "back" | "lay";
  odd?: string | number;
  stake?: string | number;
  comissao?: number;
  moeda?: string;
  isReference?: boolean;
  isManuallyEdited?: boolean;
  stakeOrigem?: string;
};

export interface SurebetObservabilitySnapshot {
  source: string;
  timestamp: number;
  legs: DebugLeg[];
  calculatedStakes?: number[];
  scenarioLucros?: number[];
  minLucro?: number;
  maxLucro?: number;
  spread?: number;
  warnings: string[];
}

declare global {
  interface Window {
    __SUREBET_OBS__?: {
      history: SurebetObservabilitySnapshot[];
      last: SurebetObservabilitySnapshot | null;
      export: () => string;
      clear: () => void;
    };
  }
}

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildSurebetObservabilitySnapshot(params: {
  source: string;
  legs: DebugLeg[];
  calculatedStakes?: number[];
  analysis?: SurebetEngineAnalysis;
}): SurebetObservabilitySnapshot {
  const scenarioLucros = params.analysis?.scenarios?.map((scenario) => scenario.lucro) ?? [];
  const spread = scenarioLucros.length > 1 ? Math.max(...scenarioLucros) - Math.min(...scenarioLucros) : 0;
  const warnings: string[] = [];
  const hasLay = params.legs.some((leg) => (leg.tipo ?? "back") === "lay");

  if (hasLay) {
    params.legs.forEach((leg, index) => {
      if ((leg.tipo ?? "back") !== "lay") return;
      const odd = toNumber(leg.odd);
      const commission = toNumber(leg.comissao);
      const calculatedStake = params.calculatedStakes?.[index];
      if (odd <= 1) warnings.push(`LAY_ODD_INVALIDA_PERNA_${index + 1}`);
      if (commission < 0 || commission > 1) warnings.push(`LAY_COMISSAO_INVALIDA_PERNA_${index + 1}`);
      if (calculatedStake !== undefined && calculatedStake <= 0) warnings.push(`LAY_STAKE_CALCULADA_INVALIDA_PERNA_${index + 1}`);
    });

    const completeLegs = params.legs.filter((leg) => toNumber(leg.odd) > 1 && toNumber(leg.stake) > 0);
    const hasManual = params.legs.some((leg) => leg.isManuallyEdited || leg.stakeOrigem === "manual" || leg.stakeOrigem === "print");
    if (completeLegs.length === params.legs.length && !hasManual && spread > 0.05) {
      warnings.push(`LAY_EQUALIZATION_SPREAD_${spread.toFixed(4)}`);
    }
  }

  return {
    source: params.source,
    timestamp: Date.now(),
    legs: params.legs,
    calculatedStakes: params.calculatedStakes,
    scenarioLucros,
    minLucro: params.analysis?.minLucro,
    maxLucro: params.analysis?.maxLucro,
    spread,
    warnings,
  };
}

export function publishSurebetObservability(snapshot: SurebetObservabilitySnapshot) {
  if (typeof window === "undefined") return;

  if (!window.__SUREBET_OBS__) {
    window.__SUREBET_OBS__ = {
      history: [],
      last: null,
      export: () => JSON.stringify(window.__SUREBET_OBS__?.history ?? [], null, 2),
      clear: () => {
        if (window.__SUREBET_OBS__) {
          window.__SUREBET_OBS__.history = [];
          window.__SUREBET_OBS__.last = null;
        }
      },
    };
  }

  window.__SUREBET_OBS__.last = snapshot;
  window.__SUREBET_OBS__.history.push(snapshot);
  if (window.__SUREBET_OBS__.history.length > 100) window.__SUREBET_OBS__.history.shift();

  if (snapshot.warnings.length > 0) {
    console.warn("[SUREBET_OBS]", snapshot);
  }
}