import { describe, it, expect } from 'vitest';
import { calculateDeterministicHedge, ExtractionConfig } from '../extracao-engine';

describe('calculateDeterministicHedge', () => {
  it('should produce zero cost when back == lay and commission == 0', () => {
    const config: ExtractionConfig = {
      targetExtraction: 100,
      bankrollAvailable: 1000,
      exchangeCommission: 0,
      events: [
        { backOdd: 2.0, layOdd: 2.0 },
        { backOdd: 2.0, layOdd: 2.0 },
      ],
    };

    const result = calculateDeterministicHedge(config);

    expect(result.custoExtracao).toBe(0);
    expect(result.custoExtracaoPercent).toBe(0);
    expect(result.classification).toBe('excellent');

    for (const event of result.events) {
      expect(event.resultIfBackLoses).toBe(100);
    }
    // With no commission, failure display should also be 100
    expect(result.netCashFailure).toBe(100);
  });

  it('should produce zero cost with 3 events, equal odds, no commission', () => {
    const config: ExtractionConfig = {
      targetExtraction: 50,
      bankrollAvailable: 500,
      exchangeCommission: 0,
      events: [
        { backOdd: 1.5, layOdd: 1.5 },
        { backOdd: 1.5, layOdd: 1.5 },
        { backOdd: 1.5, layOdd: 1.5 },
      ],
    };

    const result = calculateDeterministicHedge(config);
    expect(result.custoExtracao).toBe(0);
    expect(result.custoExtracaoPercent).toBe(0);
  });

  it('should produce positive cost when there is a spread (lay > back)', () => {
    const config: ExtractionConfig = {
      targetExtraction: 100,
      bankrollAvailable: 1000,
      exchangeCommission: 0,
      events: [
        { backOdd: 2.0, layOdd: 2.1 },
        { backOdd: 2.0, layOdd: 2.1 },
      ],
    };

    const result = calculateDeterministicHedge(config);
    expect(result.custoExtracao).toBeGreaterThan(0);
  });

  it('should produce positive cost when there is commission', () => {
    const config: ExtractionConfig = {
      targetExtraction: 100,
      bankrollAvailable: 1000,
      exchangeCommission: 0.05,
      events: [
        { backOdd: 2.0, layOdd: 2.0 },
        { backOdd: 2.0, layOdd: 2.0 },
      ],
    };

    const result = calculateDeterministicHedge(config);
    expect(result.custoExtracao).toBeGreaterThan(0);
  });

  it('cost with back=lay and 2.8% commission should equal commission rate', () => {
    const config: ExtractionConfig = {
      targetExtraction: 1000,
      bankrollAvailable: 5000,
      exchangeCommission: 0.028,
      events: [
        { backOdd: 2.0, layOdd: 2.0 },
        { backOdd: 2.0, layOdd: 2.0 },
      ],
    };

    const result = calculateDeterministicHedge(config);
    expect(result.custoExtracao).toBe(28);
    expect(result.custoExtracaoPercent).toBe(2.8);
  });

  it('failure display should equal last event (all lays executed)', () => {
    const config: ExtractionConfig = {
      targetExtraction: 100,
      bankrollAvailable: 1000,
      exchangeCommission: 0.028,
      events: [
        { backOdd: 2.0, layOdd: 2.2 },
        { backOdd: 2.0, layOdd: 2.2 },
      ],
    };

    const result = calculateDeterministicHedge(config);
    const lastEvent = result.events[result.events.length - 1];
    // Display: failure = last event (both have all lays executed)
    expect(result.netCashFailure).toBe(lastEvent.resultIfBackLoses);
    // Real cash flow differs (no commission on losing lays)
    expect(result.netCashFailureReal).not.toBe(result.netCashFailure);
  });

  it('failure display should equal last event with 3 events', () => {
    const config: ExtractionConfig = {
      targetExtraction: 100,
      bankrollAvailable: 1000,
      exchangeCommission: 0.05,
      events: [
        { backOdd: 1.8, layOdd: 2.0 },
        { backOdd: 2.0, layOdd: 2.2 },
        { backOdd: 1.5, layOdd: 1.6 },
      ],
    };

    const result = calculateDeterministicHedge(config);
    const lastEvent = result.events[result.events.length - 1];
    expect(result.netCashFailure).toBe(lastEvent.resultIfBackLoses);
  });
});
