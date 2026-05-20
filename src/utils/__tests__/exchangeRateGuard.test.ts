import { describe, it, expect } from 'vitest';
import { getSafeWorkingRate, validateExchangeRates } from '../exchangeRateGuard';
import { calculatePnlProjections } from '../surebetPnlProjection';

describe('ExchangeRateGuard', () => {
  it('G1 — Taxa 1.0 para USD é detectada como inválida', () => {
    const result = getSafeWorkingRate('USD', 1.0, 5.06);
    expect(result.source).toBe('official_fallback');
    expect(result.rate).toBeCloseTo(5.06, 2);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('inválida');
  });

  it('G3 — Taxa 1.0 para BRL é válida (BRL = BRL)', () => {
    const result = getSafeWorkingRate('BRL', 1.0, 1.0);
    expect(result.source).toBe('working');
    expect(result.rate).toBe(1.0);
    expect(result.warning).toBeUndefined();
  });

  it('G2 — Pipeline detecta taxas inválidas', () => {
    const workingRatesInvalidas = { USD: 1.0, MXN: 1.0, BRL: 1.0 };
    const usedCurrencies = ['USD', 'BRL'];
    
    const validation = validateExchangeRates(workingRatesInvalidas, usedCurrencies);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('USD = 1.0 (inválida)');
  });

  it('G6 — P&L exibe centavos, não centenas, após corrigir taxa', () => {
    // Simular uma perna de $100 USD (R$ 506) com odd 3.0 em uma operação de $300 (R$ 1518)
    // O lucro real seria ~$0 USD. Se a taxa estivesse 1.0, o lucro pareceria ser centenas de dólares.
    
    const workingRatesCorrigidas = { USD: 5.06, BRL: 1.0 };
    const liquidationLegs = [
      {
        legId: 'leg1',
        legIndex: 0,
        legLabel: 'HUGEWIN',
        houses: [{
          entryId: 'e1',
          casa: 'HUGEWIN',
          stake: 100, // $100 USD
          currency: 'USD',
          normalizedStake: 506, // R$ 506
          odd: 3.0,
          bookmakerId: 'h1'
        }],
        totalNormalizedStake: 506,
        odd: 3.0,
        hasMultipleHouses: false,
        houseCount: 1
      },
      {
        legId: 'leg2',
        legIndex: 1,
        legLabel: 'AMUNRA',
        houses: [{
          entryId: 'e2',
          casa: 'AMUNRA',
          stake: 1012, // R$ 1012
          currency: 'BRL',
          normalizedStake: 1012,
          odd: 1.5,
          bookmakerId: 'h2'
        }],
        totalNormalizedStake: 1012,
        odd: 1.5,
        hasMultipleHouses: false,
        houseCount: 1
      }
    ];

    const results = calculatePnlProjections(liquidationLegs, workingRatesCorrigidas, { USD: 5.06 });
    
    expect(results[0].isValid).toBe(true);
    // P&L total investido = R$ 1518 (~$300 USD)
    // Retorno leg1 = R$ 1518 (~$300 USD)
    // P&L deve ser próximo de 0
    expect(Math.abs(results[0].pnlUSD)).toBeLessThan(1.0);
    expect(Math.abs(results[0].pnlBRL)).toBeLessThan(5.0);
  });
});
