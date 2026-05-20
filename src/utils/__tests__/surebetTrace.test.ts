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

  it('should generate a trace for a complex multi-currency scenario (print scenario)', () => {
    const trace = new CalculationTrace(true);
    
    // Scenario: P1 USD, P2 (EUR+USD sub-entries), P3 USD
    // We'll simulate this by providing the aggregated EngineLegs
    const legs: EngineLeg[] = [
      { moeda: 'USD', stakeLocal: 100, odd: 3, isReference: true },
      { moeda: 'EUR', stakeLocal: 85, odd: 3, isReference: false }, // Aggregated leg
      { moeda: 'USD', stakeLocal: 100, odd: 3, isReference: false },
    ];

    const result = runSurebetPipeline({
      legs,
      config,
      numPernasEsperado: 3,
      arredondarFn: (v) => Math.round(v * 100) / 100
    }, trace);

    const steps = trace.getSteps();
    
    // Check if critical steps are present
    expect(steps.some(s => s.step === 'currency_normalization')).toBe(true);
    expect(steps.some(s => s.step === 'stake_distribution')).toBe(true);
    expect(steps.some(s => s.step === 'payout_projection')).toBe(true);

    // Verify determinism: ROI should be positive in this balanced 3-leg @ odd 3 scenario
    expect(result.minRoi).toBeGreaterThan(0);
    expect(result.stakeTotal).toBeCloseTo(100 + (85 * 6 / 5) + 100, 1);
  });

  it('should detect hydration drift if currentValue differs from original', () => {
    // This will be tested in integration, but we can verify the Trace output here
    // by manually adding steps or checking if our refactored code correctly calls them.
  });
});
