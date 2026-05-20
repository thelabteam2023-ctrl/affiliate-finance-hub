import { describe, it, expect } from 'vitest';
import { calculatePnlProjections } from './surebetPnlProjection';

describe('SurebetPnlProjection', () => {
  const workingRates = { USD: 5.06, MXN: 0.29, EUR: 5.87 };

  const legs = [
    { 
      legId: 'l1', 
      legIndex: 0,
      legLabel: 'HUGEWIN', 
      odd: 3, 
      totalNormalizedStake: 506.00, // $100 * 5.06
      hasMultipleHouses: false,
      houseCount: 1,
      houses: [{ entryId: 'e1', casa: 'HUGEWIN', stake: 100, currency: 'USD', normalizedStake: 506.00, odd: 3, bookmakerId: 'b1' }] 
    },
    { 
      legId: 'l2', 
      legIndex: 1,
      legLabel: 'AMUNRA + ALAWIN', 
      odd: 3, 
      totalNormalizedStake: 504.94, // ($74 * 5.06) + (450 * 0.29)
      hasMultipleHouses: true, 
      houseCount: 2,
      houses: [
        { entryId: 'e2', casa: 'AMUNRA', stake: 74, currency: 'USD', normalizedStake: 374.44, odd: 3, bookmakerId: 'b2' },
        { entryId: 'e3', casa: 'ALAWIN', stake: 450, currency: 'MXN', normalizedStake: 130.50, odd: 3, bookmakerId: 'b3' },
      ]
    },
    { 
      legId: 'l3', 
      legIndex: 2,
      legLabel: 'MY EMPIRE', 
      odd: 3, 
      totalNormalizedStake: 506.00, 
      hasMultipleHouses: false,
      houseCount: 1,
      houses: [{ entryId: 'e4', casa: 'MY EMPIRE', stake: 100, currency: 'USD', normalizedStake: 506.00, odd: 3, bookmakerId: 'b4' }] 
    },
  ];

  it('T1: P&L na magnitude correta (centavos, não centenas)', () => {
    const projections = calculatePnlProjections(legs as any, workingRates, {}, 'USD');

    projections.forEach(p => {
      expect(Math.abs(p.pnlUSD)).toBeLessThan(10);
      expect(p.currencyContamination).toBe(false);
      expect(p.isValid).toBe(true);
    });

    // Valores específicos (HUGEWIN ganha: (506*3 - 1516.94)/5.06 = 1.06/5.06 = 0.209)
    expect(projections[0].pnlUSD).toBeCloseTo(0.21, 1);
    expect(projections[1].pnlUSD).toBeCloseTo(-0.42, 1);
    expect(projections[2].pnlUSD).toBeCloseTo(0.21, 1);
  });

  it('T2: Cotação de trabalho registrada no trace', () => {
    const projections = calculatePnlProjections(legs as any, workingRates, {}, 'USD');

    projections.forEach(p => {
      expect(p.ratesUsed.length).toBeGreaterThan(0);
      p.ratesUsed.forEach(r => {
        expect(r.workingRate).toBeGreaterThan(0);
        expect(r.source).toBe('working');
      });
    });

    const p2 = projections[1];
    const mxnRate = p2.ratesUsed.find(r => r.currency === 'MXN');
    expect(mxnRate?.workingRate).toBeCloseTo(0.29, 2);
  });

  it('T3: Mudar cotação de trabalho recalcula o trace', () => {
    const ratesV1 = { USD: 4.92, MXN: 0.28 };
    const ratesV2 = { USD: 5.06, MXN: 0.29 };

    const proj1 = calculatePnlProjections(legs as any, ratesV1, {}, 'USD');
    const proj2 = calculatePnlProjections(legs as any, ratesV2, {}, 'USD');

    expect(proj1[0].pnlUSD).not.toBeCloseTo(proj2[0].pnlUSD, 3);
    expect(Math.abs(proj1[0].pnlUSD)).toBeLessThan(10);
    expect(Math.abs(proj2[0].pnlUSD)).toBeLessThan(10);
  });
});
