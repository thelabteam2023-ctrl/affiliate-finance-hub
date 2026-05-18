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

    // Profit if all won = Freebet * (TotalOdd - 1) - Sum(Resp)
    // TotalOdd = 2 * 2 = 4
    // Profit = 100 * (4 - 1) - (100 + 200) = 300 - 300 = 0
    expect(result.totalBackOdd).toBe(4);
    expect(result.allWonProfit).toBe(0);
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

  it('should have total probability sum of 1 and correct canonical probabilities', () => {
    const legs = [
      { name: 'E1', backOdd: 2, layOdd: 2 },
      { name: 'E2', backOdd: 2, layOdd: 2 }
    ];
    const freebet = 100;
    const result = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, 0, 1);

    const totalProb = result.aggregatedScenarios.reduce((sum, s) => sum + s.probability, 0);
    expect(totalProb).toBeCloseTo(1, 5);

    // 2 legs, odds 2.0 each
    // P(lost at 1) = 0.5
    // P(won at 1, lost at 2) = 0.5 * 0.5 = 0.25
    // P(won at 1, won at 2) = 0.5 * 0.5 = 0.25
    
    const pLost1 = result.aggregatedScenarios.find(as => as.description === 'lost')?.probability;
    const pWonLost = result.aggregatedScenarios.find(as => as.description === 'won → lost')?.probability;
    const pWonWon = result.aggregatedScenarios.find(as => as.description === 'won → won')?.probability;

    expect(pLost1).toBe(0.5);
    expect(pWonLost).toBe(0.25);
    expect(pWonWon).toBe(0.25);
  });
});
