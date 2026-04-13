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

    // All scenarios should extract exactly targetExtraction (100)
    for (const event of result.events) {
      expect(event.resultIfBackLoses).toBe(100);
    }
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
    // Expected cost = commission rate * targetExtraction = 28
    expect(result.custoExtracao).toBe(28);
    expect(result.custoExtracaoPercent).toBe(2.8);
  });

  it('last event and failure should differ when commission > 0 (lay win vs lay loss)', () => {
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
    // Last event: lay wins (commission applied) → less than failure
    // Failure: all lays lose (no commission) → freebet pays out
    expect(lastEvent.resultIfBackLoses).not.toBe(result.netCashFailure);
  });
});
