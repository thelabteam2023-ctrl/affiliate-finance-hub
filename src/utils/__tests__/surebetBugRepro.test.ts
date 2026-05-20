import { describe, it, expect } from "vitest";
import {
  analisarArbitragem,
  calcularStakesEqualizadasMultiCurrency,
  adjustStakeForSubEntries,
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

describe("BUG REPRO: Multi-Currency Surebet with Sub-Entries", () => {
  const EXCHANGE_RATES: BRLRates = {
    'BRL': 1.0,
    'USD': 5.10,
    'EUR': 5.52,
  };

  it("5.1 - Cenário exato do bug reportado", () => {
    const config = makeConfig("USD", EXCHANGE_RATES);
    const trace = new CalculationTrace(true, "bug-repro-5.1");

    // Perna 1: AMUNRA | odd: 3.00 | stake: $100,00 USD | moeda: USD
    // Perna 2: MY EMPIRE | odd: 3.00 | stake: $100,00 USD + R$1.000,00 BRL
    // Perna 3: THUNDERPICK | odd: 3.00 | stake: €85,32 EUR | moeda: EUR

    // Primeiro, precisamos calcular a odd média da perna 2 manualmente para simular o input do pipeline
    // Stake total perna 2 em USD: $100 + ($1000 / 5.10) = $100 + $196.078 = $296.08
    const p2_sub1_usd = 100.00;
    const p2_sub2_brl = 1000.00;
    const p2_sub2_usd = p2_sub2_brl / EXCHANGE_RATES.USD;
    const p2_total_usd = p2_sub1_usd + p2_sub2_usd;
    
    // Odd média Perna 2: (100 * 3.0 + 196.08 * 3.0) / 296.08 = 3.0
    const p2_odd_media = 3.0;

    const legs: EngineLeg[] = [
      {
        moeda: "USD",
        stakeLocal: 100.00,
        odd: 3.00,
        isReference: true
      },
      {
        moeda: "USD",
        stakeLocal: p2_total_usd,
        odd: p2_odd_media,
        isReference: false
      },
      {
        moeda: "EUR",
        stakeLocal: 85.32,
        odd: 3.00,
        isReference: false
      }
    ];

    const analysis = analisarArbitragem(legs, legs.map(l => l.stakeLocal), config, 3, trace);

    // Verificações Matemáticas (em USD)
    // Stake Total (USD) = 100 (P1) + 296.08 (P2) + (85.32 * 5.52 / 5.10) (P3)
    const p3_usd = 85.32 * EXCHANGE_RATES.EUR / EXCHANGE_RATES.USD; // 92.34
    const expectedTotalUSD = 100 + p2_total_usd + p3_usd; // 100 + 296.08 + 92.34 = 488.42

    console.log('BUG REPRO Analysis:', {
        stakeTotal: analysis.stakeTotal,
        expectedTotalUSD,
        minLucro: analysis.minLucro,
        minRoi: analysis.minRoi
    });

    expect(analysis.stakeTotal).toBeCloseTo(expectedTotalUSD, 1);
    
    // Payout se P1 ganhar: 100 * 3 = 300 USD
    // Payout se P2 ganhar: 296.08 * 3 = 888.24 USD
    // Payout se P3 ganhar: 85.32 * 3 EUR = 255.96 EUR -> * (5.52/5.10) = 277.03 USD
    
    // Lucro se P1 ganhar: 300 - 488.42 = -188.42 USD
    expect(analysis.scenarios[0].lucro).toBeCloseTo(300 - expectedTotalUSD, 1);
    expect(analysis.minLucro).toBeCloseTo(Math.min(300 - expectedTotalUSD, 888.24 - expectedTotalUSD, 277.03 - expectedTotalUSD), 1);
  });

  it("Testar adjustStakeForSubEntries com multi-moeda", () => {
    // Este teste foca na função que parece ser o ponto cego
    const subEntries = [
        { odd: "3.00", stake: "100.00", moeda: "USD" },
        { odd: "3.00", stake: "1000.00", moeda: "BRL" }
    ];
    
    const totalStakeNeededUSD = 300.00; // Queremos que a perna 2 tenha 300 USD no total
    
    const result = adjustStakeForSubEntries(
        totalStakeNeededUSD,
        3.00, // mainOdd
        3.00, // oddMedia
        subEntries,
        noRound,
        EXCHANGE_RATES,
        "USD" // legMoeda
    );

    // Cálculo esperado:
    // targetReturn = 300 * 3 = 900 USD
    // subPayout = (100 * 3) [USD] + (1000 * 3) [BRL -> USD]
    // subPayout = 300 USD + (3000 / 5.10) USD = 300 + 588.235 = 888.235 USD
    // adjustedMainStake = (900 - 888.235) / 3 = 11.765 / 3 = 3.92 USD
    
    expect(result).toBeCloseTo(3.92, 2);
  });
});
