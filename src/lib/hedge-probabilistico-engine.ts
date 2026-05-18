import { 
  type ExtractionConfig, 
  type EventInput 
} from './extracao-engine';

export interface LegInput extends EventInput {
  name: string;
  bookmaker?: string;
  exchange?: string;
  status?: 'pending' | 'won' | 'lost';
}

export interface Scenario {
  path: ('won' | 'lost')[];
  probability: number;
  result: number;
  maxExposure: number;
  description: string;
}

export interface HedgeResult {
  legs: {
    backOdd: number;
    layOdd: number;
    layStake: number;
    responsibility: number;
    probability: number;
    ev: number;
    efficiency: number;
  }[];
  scenarios: Scenario[];
  totalEV: number;
  totalROI: number;
  maxResponsibility: number;
  maxDrawdown: number;
  capitalRequired: number;
  score: 'excellent' | 'good' | 'risky' | 'critical';
}

/**
 * Advanced Engine for Probabilistic Hedge Calculations
 */
export class HedgeProbabilisticoEngine {
  /**
   * Calculates the lay stake for a freebet with given efficiency
   */
  static calculateLayStake(
    freebet: number,
    backOdd: number,
    layOdd: number,
    commission: number,
    efficiency: number
  ): number {
    // Formula: (Freebet * (BackOdd - 1) * Efficiency) / (LayOdd - Commission)
    return (freebet * (backOdd - 1) * efficiency) / (layOdd - commission);
  }

  /**
   * Generates all possible scenarios for a multi-leg operation
   */
  static generateScenarios(legs: LegInput[], freebet: number, commission: number, efficiency: number): Scenario[] {
    const scenarios: Scenario[] = [];
    const numLegs = legs.length;
    
    // Total scenarios = 2^numLegs
    const totalScenarios = Math.pow(2, numLegs);
    
    for (let i = 0; i < totalScenarios; i++) {
      const path: ('won' | 'lost')[] = [];
      let currentProb = 1;
      let currentResult = 0;
      let maxExposure = 0;
      let stop = false;

      for (let j = 0; j < numLegs; j++) {
        const isWon = (i >> (numLegs - 1 - j)) & 1;
        const leg = legs[j];
        const pWin = 1 / leg.backOdd;
        const pLoss = 1 - pWin;

        if (stop) {
           path.push('lost'); // Dummy, won't affect probability or result
           continue;
        }

        const layStake = this.calculateLayStake(freebet, leg.backOdd, leg.layOdd, commission, efficiency);
        const responsibility = layStake * (leg.layOdd - 1);
        maxExposure = Math.max(maxExposure, responsibility);

        if (isWon) {
          path.push('won');
          currentProb *= pWin;
          // If back wins, we lose the responsibility at the exchange
          currentResult -= responsibility;
          // But the freebet continues to the next leg
        } else {
          path.push('lost');
          currentProb *= pLoss;
          // If back loses, we win the layStake (minus commission) at the exchange
          currentResult += layStake * (1 - commission);
          stop = true; // Operation ends if a leg is lost
        }
      }

      // Final result if all legs won
      if (!stop) {
        // Last leg profit: Freebet * (LastBackOdd - 1)
        const lastLeg = legs[numLegs - 1];
        currentResult += freebet * (lastLeg.backOdd - 1);
      }

      scenarios.push({
        path,
        probability: currentProb,
        result: currentResult,
        maxExposure,
        description: path.join(' → ')
      });
    }

    // Deduplicate and group scenarios by final state for clarity
    return scenarios;
  }

  static calculateMetrics(legs: LegInput[], freebet: number, commission: number, efficiency: number): HedgeResult {
    const scenarios = this.generateScenarios(legs, freebet, commission, efficiency);
    
    let totalEV = 0;
    let maxResponsibility = 0;
    let maxDrawdown = 0;
    
    scenarios.forEach(s => {
      totalEV += s.result * s.probability;
      maxResponsibility = Math.max(maxResponsibility, s.maxExposure);
      if (s.result < 0) {
        maxDrawdown = Math.max(maxDrawdown, Math.abs(s.result));
      }
    });

    const totalROI = (totalEV / freebet) * 100;
    
    let score: 'excellent' | 'good' | 'risky' | 'critical' = 'good';
    if (totalROI > 85) score = 'excellent';
    else if (totalROI > 70) score = 'good';
    else if (totalROI > 50) score = 'risky';
    else score = 'critical';

    const calculatedLegs = legs.map(leg => {
      const layStake = this.calculateLayStake(freebet, leg.backOdd, leg.layOdd, commission, efficiency);
      return {
        backOdd: leg.backOdd,
        layOdd: leg.layOdd,
        layStake,
        responsibility: layStake * (leg.layOdd - 1),
        probability: 1 / leg.backOdd,
        ev: (1 / leg.backOdd) * (freebet * (leg.backOdd - 1) - (layStake * (leg.layOdd - 1))) + (1 - 1 / leg.backOdd) * (layStake * (1 - commission)),
        efficiency
      };
    });

    return {
      legs: calculatedLegs,
      scenarios,
      totalEV,
      totalROI,
      maxResponsibility,
      maxDrawdown,
      capitalRequired: maxResponsibility,
      score
    };
  }
}
