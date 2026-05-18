import { describe, it, expect } from 'vitest';
import { HedgeProbabilisticoEngine } from '../hedge-probabilistico-engine';

describe('HedgeProbabilisticoEngine', () => {
  it('should calculate cumulative responsibilities correctly', () => {
    const legs = [
      { name: 'E1', backOdd: 2, layOdd: 2 },
      { name: 'E2', backOdd: 2, layOdd: 2 }
    ];
    const freebet = 100;
    const commission = 0;
    const efficiency = 1;

    const result = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission, efficiency);

    // Leg 1: Meta = 100, LayOdd = 2, Comm = 0, PrevCost = 0
    // LayStake = (100 + 0) / (1 - 0) = 100
    // Responsibility = 100 * (2 - 1) = 100
    // TotalExposure = 0 + 100 = 100
    expect(result.legs[0].layStake).toBe(100);
    expect(result.legs[0].responsibility).toBe(100);
    expect(result.legs[0].cumulativeResponsibility).toBe(0);
    expect(result.legs[0].totalExposure).toBe(100);

    // Leg 2: Meta = 100, LayOdd = 2, Comm = 0, PrevCost = 100
    // LayStake = (100 + 100) / (1 - 0) = 200
    // Responsibility = 200 * (2 - 1) = 200
    // TotalExposure = 100 + 200 = 300
    expect(result.legs[1].layStake).toBe(200);
    expect(result.legs[1].responsibility).toBe(200);
    expect(result.legs[1].cumulativeResponsibility).toBe(100);
    expect(result.legs[1].totalExposure).toBe(300);

    expect(result.maxResponsibility).toBe(300);
    expect(result.cumulativeCascadeCost).toBe(300);
  });

  it('should calculate all-won profit correctly', () => {
    const legs = [
      { name: 'E1', backOdd: 2, layOdd: 2 },
      { name: 'E2', backOdd: 2, layOdd: 2 }
    ];
    const freebet = 100;
    const commission = 0;
    const efficiency = 1;

    const result = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission, efficiency);

    // Profit if all won = Freebet * (LastOdd - 1) - Sum(Resp)
    // = 100 * (2 - 1) - (100 + 200) = 100 - 300 = -200
    expect(result.allWonProfit).toBe(-200);
  });

  it('should guarantee meta in each scenario', () => {
    const legs = [
      { name: 'E1', backOdd: 2, layOdd: 2 },
      { name: 'E2', backOdd: 2, layOdd: 2 }
    ];
    const freebet = 100;
    const commission = 0;
    const efficiency = 0.8; // 80 meta

    const result = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission, efficiency);

    // Scenario 1: Leg 1 loses. Lay 1 wins.
    // LayStake1 = (80 + 0) / 1 = 80.
    // Result = 80 * 1 - 0 = 80.
    expect(result.scenarios.find(s => s.path[0] === 'lost')?.result).toBe(80);

    // Scenario 2: Leg 1 wins, Leg 2 loses. Lay 2 wins.
    // Resp1 = 80 * (2-1) = 80.
    // LayStake2 = (80 + 80) / 1 = 160.
    // Result = (160 * 1) - 80 = 80.
    const scenarioWinLost = result.scenarios.find(s => s.path[0] === 'won' && s.path[1] === 'lost');
    expect(scenarioWinLost?.result).toBe(80);
  });
});
