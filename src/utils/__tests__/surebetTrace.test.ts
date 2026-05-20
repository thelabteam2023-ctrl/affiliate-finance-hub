import { describe, it, expect } from 'vitest';
import { runSurebetPipeline } from '@/engine/surebetPipeline';
import { CalculationTrace } from '@/engine/calculationTrace';
import { type EngineLeg, type SurebetEngineConfig } from '@/utils/surebetCurrencyEngine';

describe('Surebet Math Determinism & Trace', () => {
  const config: SurebetEngineConfig = {
    consolidationCurrency: 'USD',
    brlRates: {
      BRL: 1,
      USD: 5,
      EUR: 6
    }
  };

  it('should generate a trace and calculate ROI correctly', () => {
    const trace = new CalculationTrace(true);
    
    // Scenario: P1 USD, P2 EUR, P3 USD
    // Stake total in USD will be around 100 + 102 + 100 = 302
    // Payout should be around 310 (if odd 3.1)
    const legs: EngineLeg[] = [
      { moeda: 'USD', stakeLocal: 100, odd: 3.1, isReference: true },
      { moeda: 'EUR', stakeLocal: 85, odd: 3.1, isReference: false }, 
      { moeda: 'USD', stakeLocal: 100, odd: 3.1, isReference: false },
    ];

    const result = runSurebetPipeline({
      legs,
      config,
      numPernasEsperado: 3,
      arredondarFn: (v) => Math.round(v * 100) / 100
    }, trace);

    const steps = trace.getSteps();
    
    // Debug: console.log(steps.map(s => s.step));
    expect(steps.length).toBeGreaterThan(0);

    // With odd 3.1 on 3 legs, ROI should be positive (~3.33%)
    expect(result.minRoi).toBeGreaterThan(0);
  });

  it('should verify trace steps structure', () => {
    const trace = new CalculationTrace(true);
    trace.step('test_step', { inputs: { a: 1 }, outputs: { b: 2 } });
    const steps = trace.getSteps();
    expect(steps[0].step).toBe('test_step');
    expect(steps[0].inputs.a).toBe(1);
    expect(steps[0].outputs.b).toBe(2);
    expect(steps[0].timestamp).toBeGreaterThan(0);
  });
});
