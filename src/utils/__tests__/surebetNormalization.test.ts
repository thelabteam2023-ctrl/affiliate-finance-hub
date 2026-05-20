import { describe, it, expect } from 'vitest';
import { normalizeOperation } from './surebetNormalization';
import { calculatePnlProjections } from './surebetPnlProjection';

describe('Surebet Normalization & P&L (Audit Correctness)', () => {
  const workingRates = { USD: 5.0556, MXN: 0.2901, BRL: 1.0 };

  const legs = [
    {
      id: 'l1',
      legLabel: 'HUGEWIN',
      odd: 3.00,
      houses: [{ casa: 'HUGEWIN', stake: 100, currency: 'USD' }]
    },
    {
      id: 'l2',
      legLabel: 'AMUNRA + ALAWIN',
      odd: 3.00,
      houses: [
        { casa: 'AMUNRA', stake: 74, currency: 'USD' },
        { casa: 'ALAWIN', stake: 450, currency: 'MXN' },
      ]
    },
    {
      id: 'l3',
      legLabel: 'MY EMPIRE',
      odd: 3.00,
      houses: [{ casa: 'MY EMPIRE', stake: 100, currency: 'USD' }]
    },
  ];

  it('N1: Valores corretos para o cenário das imagens (USD/MXN/BRL)', () => {
    const normalized = normalizeOperation(legs, workingRates);
    
    // Total investido correto ($299.84 USD)
    // HUGEWIN (100*5.0556) + AMUNRA (74*5.0556) + ALAWIN (450*0.2901) + MY EMPIRE (100*5.0556)
    // = 505.56 + 374.1144 + 130.545 + 505.56 = 1515.7794 BRL
    // 1515.7794 / 5.0556 = 299.8377.. USD
    expect(normalized.totalInvestedUSD).toBeCloseTo(299.84, 1);
    expect(normalized.totalInvestedBRL).toBeCloseTo(1515.78, 1);

    const projections = calculatePnlProjections(legs as any, workingRates);

    // HUGEWIN ganha: $300 return, $299.84 invested -> +$0.16
    expect(projections[0].winnerReturnUSD).toBeCloseTo(300.00, 1);
    expect(projections[0].totalInvestedUSD).toBeCloseTo(299.84, 1);
    expect(projections[0].pnlUSD).toBeCloseTo(0.16, 1);

    // AMUNRA + ALAWIN ganha
    // Retorno: (74*5.0556 + 450*0.2901)*3 / 5.0556 = (374.11+130.55)*3/5.0556 = 504.66*3/5.0556 = 1513.98/5.0556 = 299.46 USD
    expect(projections[1].winnerReturnUSD).toBeCloseTo(299.46, 1);
    expect(projections[1].pnlUSD).toBeCloseTo(-0.38, 1);

    // NENHUM valor com magnitude absurda (-83 ou +167)
    projections.forEach(p => {
      expect(Math.abs(p.pnlUSD)).toBeLessThan(5.0);
    });
  });

  it('N2: Retorno e total usam a mesma base', () => {
    const normalized = normalizeOperation(legs, workingRates);
    normalized.legs.forEach(leg => {
      // Retorno deve ser exatamente totalUSD * odd
      expect(leg.returnIfWinUSD).toBeCloseTo(leg.totalUSD * leg.odd, 4);
      // Retorno BRL deve ser exatamente totalBRL * odd
      expect(leg.returnIfWinBRL).toBeCloseTo(leg.totalBRL * leg.odd, 4);
    });
  });

  it('N3: MXN normalizado corretamente', () => {
    const normalized = normalizeOperation(legs, workingRates);
    const leg2 = normalized.legs[1];
    const alawinEntry = leg2.entries.find(e => e.casa === 'ALAWIN');
    
    expect(alawinEntry).toBeDefined();
    expect(alawinEntry!.stakeBRL).toBeCloseTo(450 * 0.2901, 2);  // R$130.55
    expect(alawinEntry!.stakeUSD).toBeCloseTo(130.55 / 5.0556, 2);  // $25.83
  });

  it('N4: Nunca somar nominais sem converter', () => {
    const normalized = normalizeOperation(legs, workingRates);
    // 100+74+450+100 = 724. 724 / 5.0556 = 143.21.
    expect(normalized.totalInvestedUSD).not.toBeCloseTo(724, 0);
    expect(normalized.totalInvestedUSD).not.toBeCloseTo(143.21, 0);
  });

  it('N6: Regressão: BRL puro sem sub-entradas', () => {
    const brlLegs = [
      { id: 'l1', casa: 'Betano', odd: 2.10, stake: 500, currency: 'BRL' },
      { id: 'l2', casa: 'Bet365', odd: 2.10, stake: 500, currency: 'BRL' },
    ];
    const normalized = normalizeOperation(brlLegs, { USD: 5.0, BRL: 1.0 });
    expect(normalized.totalInvestedBRL).toBe(1000);
    expect(normalized.totalInvestedUSD).toBe(200);
    
    const projections = calculatePnlProjections(brlLegs as any, { USD: 5.0, BRL: 1.0 });
    expect(projections[0].winnerReturnBRL).toBe(1050);
    expect(projections[0].pnlBRL).toBe(50);
    expect(projections[0].pnlUSD).toBe(10);
  });
});
