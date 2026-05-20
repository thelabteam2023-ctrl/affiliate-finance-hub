import { describe, it, expect } from "vitest";
import {
  analisarArbitragem,
  calcularStakesEqualizadasMultiCurrency,
  type EngineLeg,
  type SurebetEngineConfig,
  type BRLRates,
} from "@/utils/surebetCurrencyEngine";
import { runSurebetPipeline } from "@/engine/surebetPipeline";
import { CalculationTrace } from "@/engine/calculationTrace";

// Helpers
function makeConfig(consolidation: string, rates: BRLRates): SurebetEngineConfig {
  return { consolidationCurrency: consolidation as any, brlRates: rates };
}

function makeLegs(
  entries: Array<{ moeda: string; stake: number; odd: number; isRef?: boolean }>
): EngineLeg[] {
  return entries.map((e, i) => ({
    moeda: e.moeda as any,
    stakeLocal: e.stake,
    odd: e.odd,
    isReference: e.isRef ?? i === 0,
    isManuallyEdited: false,
  }));
}

const noRound = (v: number) => v;

describe("Surebet Stress Tests - Edge Cases & Extremes", () => {
  const DEFAULT_RATES: BRLRates = { BRL: 1, USD: 5.1, EUR: 5.5 };

  describe("Odds Extremas", () => {
    it("lidar com odds mínimas (1.01)", () => {
      const config = makeConfig("BRL", DEFAULT_RATES);
      const legs = makeLegs([
        { moeda: "BRL", stake: 990.1, odd: 1.01, isRef: true },
        { moeda: "BRL", stake: 10, odd: 100.0 },
      ]);
      
      const analysis = analisarArbitragem(legs, [990.1, 10], config, 2);
      
      expect(analysis.minRoi).toBeDefined();
      expect(Number.isFinite(analysis.minRoi)).toBe(true);
      expect(analysis.isValidArbitrage).toBe(false); // ROI negativo
      expect(analysis.minLucro).toBeLessThan(0);
    });

    it("lidar com odds máximas (1000.0)", () => {
      const config = makeConfig("BRL", DEFAULT_RATES);
      const legs = makeLegs([
        { moeda: "BRL", stake: 1000, odd: 2.0, isRef: true },
        { moeda: "BRL", stake: 2, odd: 1000.0 },
      ]);
      
      const analysis = analisarArbitragem(legs, [1000, 2], config, 2);
      
      expect(analysis.maxLucro).toBeGreaterThan(900);
      expect(Number.isFinite(analysis.maxRoi)).toBe(true);
    });

    it("não deve gerar NaN/Infinity com odd 1.0", () => {
      const config = makeConfig("BRL", DEFAULT_RATES);
      const legs = makeLegs([
        { moeda: "BRL", stake: 100, odd: 1.0, isRef: true },
        { moeda: "BRL", stake: 100, odd: 2.0 },
      ]);
      
      const analysis = analisarArbitragem(legs, [100, 100], config, 2);
      expect(Number.isFinite(analysis.minRoi)).toBe(true);
      expect(analysis.scenarios[0].lucro).toBe(-100);
    });
  });

  describe("Stakes de Centavos", () => {
    it("precisão com stakes mínimas (0.01)", () => {
      const config = makeConfig("BRL", DEFAULT_RATES);
      const legs = makeLegs([
        { moeda: "BRL", stake: 0.51, odd: 2.0, isRef: true },
        { moeda: "BRL", stake: 0.49, odd: 2.1 },
      ]);
      
      const analysis = analisarArbitragem(legs, [0.51, 0.49], config, 2);
      
      expect(analysis.stakeTotal).toBe(1.0);
      expect(analysis.minLucro).toBeCloseTo(0.02, 2);
    });
  });

  describe("Multi-Moeda - Taxas Extremas", () => {
    it("conversão com moeda de valor muito baixo (ex: ARS simulado)", () => {
      const rates: BRLRates = { BRL: 1, ARS: 0.005 };
      const config = makeConfig("BRL", rates);
      const legs = makeLegs([
        { moeda: "BRL", stake: 100, odd: 2.0, isRef: true },
        { moeda: "ARS", stake: 20000, odd: 2.0 }, // 20000 * 0.005 = 100 BRL
      ]);
      
      const analysis = analisarArbitragem(legs, [100, 20000], config, 2);
      expect(analysis.stakeTotal).toBe(200);
      expect(analysis.minLucro).toBe(0);
    });
  });

  describe("Race Conditions & Pipeline Discard", () => {
    it("deve processar trace independente para cada execução", () => {
      const config = makeConfig("BRL", DEFAULT_RATES);
      const input = {
        legs: makeLegs([{ moeda: "BRL", stake: 100, odd: 2.0, isRef: true }, { moeda: "BRL", stake: 100, odd: 2.0 }]),
        config,
        numPernasEsperado: 2,
        arredondarFn: noRound
      };

      const trace1 = new CalculationTrace(true, "trace-1");
      const trace2 = new CalculationTrace(true, "trace-2");

      runSurebetPipeline(input, trace1);
      runSurebetPipeline(input, trace2);

      expect(trace1.getId()).toBe("trace-1");
      expect(trace2.getId()).toBe("trace-2");
      expect(trace1.getSteps().length).toBeGreaterThan(0);
      expect(trace2.getSteps().length).toBeGreaterThan(0);
    });
  });
});
