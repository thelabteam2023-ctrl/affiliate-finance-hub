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
 
 export interface CalculatedLeg {
   backOdd: number;
   layOdd: number;
   layStake: number;
   responsibility: number;
   cumulativeResponsibility: number;
   totalExposure: number;
   probability: number;
   ev: number;
    extractionRate: number;
 }

export interface Scenario {
  path: ('won' | 'lost')[];
  probability: number;
  result: number;
  maxExposure: number;
  description: string;
}

export interface AggregatedScenario {
  /** Canonical path truncated at the first 'lost' (since the cascade stops there). */
  canonicalPath: ('won' | 'lost')[];
  description: string;
  probability: number;
  result: number;
  maxExposure: number;
  /** Raw scenarios that collapse into this aggregate (path length = numLegs). */
  subScenarios: Scenario[];
}

 export interface HedgeResult {
   legs: CalculatedLeg[];
   scenarios: Scenario[];
    aggregatedScenarios: AggregatedScenario[];
   totalEV: number;
   totalROI: number;
   maxResponsibility: number;
   maxDrawdown: number;
   capitalRequired: number;
   score: 'excellent' | 'good' | 'risky' | 'critical';
   cumulativeCascadeCost: number;
   allWonProfit: number;
  totalBackOdd: number;
 }

/**
 * Advanced Engine for Probabilistic Hedge Calculations
 */
export class HedgeProbabilisticoEngine {
   /**
    * Calculates the lay stake for a leg considering cumulative costs
    * Formula ensures that if Lay wins, it covers (meta + previous costs)
    */
   static calculateLayStakeCascade(
     metaLiquida: number,
     layOdd: number,
     commission: number,
     cumulativeCost: number
   ): number {
     // (LayStake * (1 - Commission)) - CumulativeCost = MetaLiquida
     // LayStake * (1 - Commission) = MetaLiquida + CumulativeCost
     // LayStake = (MetaLiquida + CumulativeCost) / (1 - Commission)
     
     // Wait, the user mentioned: "Stake Próxima Perna = (meta de lucro desejado + responsabilidades acumuladas + prejuízos acumulados) ÷ eficiência operacional"
     // But efficiency is usually part of meta.
     // Standard hedge: LayStake = (TargetProfit + Cost) / (LayOdd - Commission) ? 
     // No, if Lay wins, you get LayStake. Profit = LayStake * (1 - Comm). 
     // We want Profit - Costs = Meta.
     
     return (metaLiquida + cumulativeCost) / (1 - commission);
   }

    static calculateCalculatedLegs(
      legs: LegInput[],
      freebet: number,
      commission: number,
      targetExtraction: number
    ): CalculatedLeg[] {
      const metaLiquida = freebet * targetExtraction;
     let cumulativeResponsibility = 0;
     
     return legs.map((leg) => {
       // LayStake calculation: if Lay wins, we recover everything + meta
       const layStake = this.calculateLayStakeCascade(metaLiquida, leg.layOdd, commission, cumulativeResponsibility);
       const responsibility = layStake * (leg.layOdd - 1);
       const currentCumulative = cumulativeResponsibility;
       const totalExposure = currentCumulative + responsibility;
       
       const calculatedLeg: CalculatedLeg = {
         backOdd: leg.backOdd,
         layOdd: leg.layOdd,
         layStake,
         responsibility,
         cumulativeResponsibility: currentCumulative,
         totalExposure,
         probability: 1 / leg.backOdd,
         ev: 0, // Calculated later
          extractionRate: targetExtraction
       };
       
       // Update cumulative for NEXT leg (assuming Back won this one)
       cumulativeResponsibility += responsibility;
       
       return calculatedLeg;
     });
   }
 
   /**
    * Generates canonical scenarios directly.
    * A canonical scenario stops at the first 'lost'.
    */
   static generateCanonicalScenarios(
     calculatedLegs: CalculatedLeg[],
     freebet: number,
     commission: number
   ): AggregatedScenario[] {
     const aggregated: AggregatedScenario[] = [];
     const numLegs = calculatedLegs.length;
     let currentProbOfSuccess = 1;
     let cumulativeResponsibility = 0;
     const pathSoFar: ('won' | 'lost')[] = [];

     // 1. Generate scenarios where it fails at leg i (0 to numLegs-1)
     for (let i = 0; i < numLegs; i++) {
       const leg = calculatedLegs[i];
       const pWin = 1 / leg.backOdd;
       const pLoss = 1 - pWin;

       // Scenario: Won first i-1 legs, Lost at leg i
       const path: ('won' | 'lost')[] = [...pathSoFar, 'lost'];
       const prob = currentProbOfSuccess * pLoss;
       const result = (leg.layStake * (1 - commission)) - cumulativeResponsibility;
       const maxExposure = cumulativeResponsibility + leg.responsibility;

       // Generate virtual sub-scenarios for visualization in Modal
       const subScenarios: Scenario[] = [];
       const remainingLegs = numLegs - (i + 1);
       const numSub = Math.pow(2, remainingLegs);
       for (let k = 0; k < numSub; k++) {
         const fullPath: ('won' | 'lost')[] = [...path];
         for (let l = 0; l < remainingLegs; l++) {
           fullPath.push(((k >> (remainingLegs - 1 - l)) & 1) ? 'won' : 'lost');
         }
         subScenarios.push({
           path: fullPath,
           probability: prob / numSub, // Shared weight
           result,
           maxExposure,
           description: fullPath.join(' → ')
         });
       }

       aggregated.push({
         canonicalPath: path,
         description: path.join(' → '),
         probability: prob,
         result,
         maxExposure,
         subScenarios
       });

       // Prepare for next iteration (success at this leg)
       currentProbOfSuccess *= pWin;
       cumulativeResponsibility += leg.responsibility;
       pathSoFar.push('won');
     }

     // 2. Generate final scenario: All legs won
     const lastLeg = calculatedLegs[numLegs - 1];
     const resultAllWon = (freebet * (lastLeg.backOdd - 1)) - cumulativeResponsibility;
     
     aggregated.push({
       canonicalPath: pathSoFar,
       description: pathSoFar.join(' → '),
       probability: currentProbOfSuccess,
       result: resultAllWon,
       maxExposure: cumulativeResponsibility,
       subScenarios: [{
         path: pathSoFar,
         probability: currentProbOfSuccess,
         result: resultAllWon,
         maxExposure: cumulativeResponsibility,
         description: pathSoFar.join(' → ')
       }]
     });

     return aggregated.sort((a, b) => b.probability - a.probability);
   }

    static calculateMetrics(
      legs: LegInput[],
      freebet: number,
      commission: number,
      targetExtraction: number
    ): HedgeResult {
      const calculatedLegs = this.calculateCalculatedLegs(legs, freebet, commission, targetExtraction);
      const aggregatedScenarios = this.generateCanonicalScenarios(calculatedLegs, freebet, commission);
      
      // Flatten for legacy consumers if needed
      const scenarios = aggregatedScenarios.flatMap(as => as.subScenarios);
     
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
     if (totalROI > 80) score = 'excellent';
     else if (totalROI > 60) score = 'good';
     else if (totalROI > 40) score = 'risky';
     else score = 'critical';
 
     // All won profit calculation
     let totalResponsibilities = 0;
     calculatedLegs.forEach(l => totalResponsibilities += l.responsibility);
    
    const totalBackOdd = legs.reduce((acc, l) => acc * l.backOdd, 1);
    const allWonProfit = (freebet * (totalBackOdd - 1)) - totalResponsibilities;
 
     return {
       legs: calculatedLegs,
       scenarios,
        aggregatedScenarios,
       totalEV,
       totalROI,
       maxResponsibility,
       maxDrawdown,
       capitalRequired: maxResponsibility,
       score,
       cumulativeCascadeCost: totalResponsibilities,
      allWonProfit,
      totalBackOdd
     };
   }
}
