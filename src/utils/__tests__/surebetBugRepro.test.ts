import { describe, it, expect } from "vitest";
import {
  analisarArbitragem,
  calcularStakesEqualizadasMultiCurrency,
  adjustStakeForSubEntries,
  aggregateSubEntries,
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

const noRound = (v: number) => v;

describe("SUREBET ENGINE Hardening - Comprehensive Tests", () => {
  const EXCHANGE_RATES: BRLRates = {
    'BRL': 1.0,
    'USD': 5.10,
    'EUR': 5.52,
  };

  it("5.1 - Cenário exato do bug reportado", () => {
    const config = makeConfig("USD", EXCHANGE_RATES);
    const trace = new CalculationTrace(true, "bug-repro-5.1");

    // Simulação do input real do formulário para o pipeline
    const p2_sub1_usd = 100.00;
    const p2_sub2_brl = 1000.00;
    const p2_sub2_usd = p2_sub2_brl / EXCHANGE_RATES.USD;
    const p2_total_usd = p2_sub1_usd + p2_sub2_usd;
    const p2_odd_media = 3.0;

    const legs: EngineLeg[] = [
      { moeda: "USD", stakeLocal: 100.00, odd: 3.00, isReference: true },
      { moeda: "USD", stakeLocal: p2_total_usd, odd: p2_odd_media, isReference: false },
      { moeda: "EUR", stakeLocal: 85.32, odd: 3.00, isReference: false }
    ];

    const analysis = analisarArbitragem(legs, legs.map(l => l.stakeLocal), config, 3, trace);

    const p3_usd = 85.32 * EXCHANGE_RATES.EUR / EXCHANGE_RATES.USD; 
    const expectedTotalUSD = 100 + p2_total_usd + p3_usd; 

    expect(analysis.stakeTotal).toBeCloseTo(expectedTotalUSD, 1);
    expect(analysis.scenarios[0].lucro).toBeCloseTo(300 - expectedTotalUSD, 1);
    expect(analysis.minLucro).toBeCloseTo(Math.min(300 - expectedTotalUSD, p2_total_usd * 3 - expectedTotalUSD, 85.32 * 3 * (5.52/5.1) - expectedTotalUSD), 1);
  });

  it("5.2 - Consistência Multi-Moeda na Agregação", () => {
    const subEntries = [
        { odd: "3.00", stake: "100.00", moeda: "USD" },
        { odd: "3.00", stake: "1000.00", moeda: "BRL" }
    ];
    
    const result = aggregateSubEntries(subEntries, "USD", EXCHANGE_RATES);
    expect(result.totalStake).toBeCloseTo(100 + (1000/5.1), 2);
    expect(result.totalPayout).toBeCloseTo(300 + (3000/5.1), 2);
  });

  it("5.3 - Nenhuma conversão silenciosa (Trace validation)", () => {
    const trace = new CalculationTrace(true);
    const config = makeConfig("BRL", EXCHANGE_RATES);
    const legs = [
        { moeda: "USD" as any, stakeLocal: 100, odd: 2.0, isReference: true },
        { moeda: "EUR" as any, stakeLocal: 100, odd: 2.0, isReference: false }
    ];
    
    analisarArbitragem(legs, [100, 100], config, 2, trace);
    
    const conversions = trace.getSteps().filter(s => s.step === 'currency_conversion');
    expect(conversions.length).toBeGreaterThanOrEqual(2);
  });


  it("5.4 - Invariantes matemáticos (Coverage vs Profit)", () => {
    const config = makeConfig("BRL", EXCHANGE_RATES);
    // Surebet válida (1/2 + 1/2 = 1.0 -> coverage 100%)
    const legs = [
        { moeda: "BRL" as any, stakeLocal: 100, odd: 2.0, isReference: true },
        { moeda: "BRL" as any, stakeLocal: 100, odd: 2.0, isReference: false }
    ];
    const analysis = analisarArbitragem(legs, [100, 100], config, 2);
    expect(analysis.minLucro).toBeGreaterThanOrEqual(-0.0001);
    expect(analysis.isValidArbitrage).toBe(true);

    // Operação com prejuízo (1/1.5 + 1/1.5 = 1.33 -> coverage > 100% mas loss real)
    const lossLegs = [
        { moeda: "BRL" as any, stakeLocal: 100, odd: 1.5, isReference: true },
        { moeda: "BRL" as any, stakeLocal: 100, odd: 1.5, isReference: false }
    ];
    const lossAnalysis = analisarArbitragem(lossLegs, [100, 100], config, 2);
    expect(lossAnalysis.minLucro).toBeLessThan(0);
    expect(lossAnalysis.isValidArbitrage).toBe(false);
  });

  it("5.5 - Regressão: cenário simples BRL", () => {
    const config = makeConfig("BRL", EXCHANGE_RATES);
    const legs = [
        { moeda: "BRL" as any, stakeLocal: 500, odd: 2.0, isReference: true },
        { moeda: "BRL" as any, stakeLocal: 500, odd: 2.0, isReference: false }
    ];
    const analysis = analisarArbitragem(legs, [500, 500], config, 2);
    expect(analysis.stakeTotal).toBe(1000);
    expect(analysis.minLucro).toBe(0);
    expect(analysis.minRoi).toBe(0);
  });
});
