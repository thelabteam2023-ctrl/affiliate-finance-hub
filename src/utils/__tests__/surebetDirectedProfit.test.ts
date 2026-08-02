import { describe, it, expect } from 'vitest';
import { runSurebetPipeline } from '@/engine/surebetPipeline';
import type { EngineLeg, SurebetEngineConfig } from '@/utils/surebetCurrencyEngine';

const config: SurebetEngineConfig = {
  consolidationCurrency: 'BRL',
  brlRates: { BRL: 1, USD: 5, EUR: 6 },
};

const run = (legs: EngineLeg[], directed?: number[]) =>
  runSurebetPipeline({
    legs,
    config,
    numPernasEsperado: legs.length,
    arredondarFn: (v) => Math.round(v * 100) / 100,
    directedProfitLegs: directed,
    refIndex: legs.findIndex(l => l.isReference),
  });

const legs3 = (): EngineLeg[] => [
  { moeda: 'BRL', stakeLocal: 100, odd: 3.2, isReference: true, tipo: 'back' },
  { moeda: 'BRL', stakeLocal: 100, odd: 3.3, isReference: false, tipo: 'back' },
  { moeda: 'BRL', stakeLocal: 100, odd: 3.4, isReference: false, tipo: 'back' },
];

describe('Lucro direcionado por perna', () => {
  it('sem direcionamento parcial: lucro equalizado', () => {
    const r = run(legs3(), [0, 1, 2]);
    expect(r.maxLucro - r.minLucro).toBeLessThan(0.05);
  });

  it('direciona lucro para a perna 3', () => {
    const r = run(legs3(), [2]);
    expect(r.scenarios[0].lucro).toBeCloseTo(0, 1);
    expect(r.scenarios[1].lucro).toBeCloseTo(0, 1);
    expect(r.scenarios[2].lucro).toBeGreaterThan(r.scenarios[0].lucro);
    // payout da perna direcionada = investimento total + lucro
    expect(r.scenarios[2].payoutConsolidado - r.stakeTotal).toBeCloseTo(r.scenarios[2].lucro, 1);
  });

  it('direciona para a própria referência mantendo sua stake', () => {
    const r = run(legs3(), [0]);
    expect(r.calculatedStakesLocal[0]).toBe(100);
    expect(r.scenarios[1].lucro).toBeCloseTo(0, 1);
    expect(r.scenarios[2].lucro).toBeCloseTo(0, 1);
    expect(r.scenarios[0].lucro).toBeGreaterThan(0.5);
  });

  it('direciona para duas pernas (lucro igual entre elas)', () => {
    const legs: EngineLeg[] = [
      { moeda: 'BRL', stakeLocal: 100, odd: 4.2, isReference: true, tipo: 'back' },
      { moeda: 'BRL', stakeLocal: 100, odd: 4.3, isReference: false, tipo: 'back' },
      { moeda: 'BRL', stakeLocal: 100, odd: 4.4, isReference: false, tipo: 'back' },
      { moeda: 'BRL', stakeLocal: 100, odd: 4.5, isReference: false, tipo: 'back' },
    ];
    const r = run(legs, [1, 2]);
    expect(r.scenarios[0].lucro).toBeCloseTo(0, 1);
    expect(r.scenarios[3].lucro).toBeCloseTo(0, 1);
    expect(r.scenarios[1].lucro).toBeCloseTo(r.scenarios[2].lucro, 1);
    expect(r.scenarios[1].lucro).toBeGreaterThan(0.5);
  });

  it('multimoeda: direcionamento respeita conversão', () => {
    const legs: EngineLeg[] = [
      { moeda: 'USD', stakeLocal: 100, odd: 3.2, isReference: true, tipo: 'back' },
      { moeda: 'BRL', stakeLocal: 100, odd: 3.3, isReference: false, tipo: 'back' },
      { moeda: 'EUR', stakeLocal: 100, odd: 3.4, isReference: false, tipo: 'back' },
    ];
    const r = run(legs, [1]);
    expect(r.scenarios[0].lucro).toBeCloseTo(0, 0);
    expect(r.scenarios[2].lucro).toBeCloseTo(0, 0);
    expect(r.scenarios[1].lucro).toBeGreaterThan(r.scenarios[0].lucro);
  });

  it('LAY mantém equalização padrão (sem regressão)', () => {
    const legs: EngineLeg[] = [
      { moeda: 'BRL', stakeLocal: 100, odd: 2, isReference: true, tipo: 'back', comissao: 0 },
      { moeda: 'BRL', stakeLocal: 100, odd: 2, isReference: false, tipo: 'lay', comissao: 0.028 },
    ];
    const r = run(legs, [1]);
    expect(r.calculatedStakesLocal[1]).toBeCloseTo(101.42, 2);
  });
});
