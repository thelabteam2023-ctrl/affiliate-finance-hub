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
      scoreReason?: string;
   cumulativeCascadeCost: number;
   allWonProfit: number;
  totalBackOdd: number;
 }

export type HedgeMode = 'roi-max' | 'balanced';

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
     
      // Base score on ROI initially, will be refined in component with Risk of Ruin
      let score: 'excellent' | 'good' | 'risky' | 'critical' = 'good';
      if (totalROI > 75) score = 'excellent';
      else if (totalROI > 55) score = 'good';
      else if (totalROI > 35) score = 'risky';
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

   /**
    * BALANCED MODE — Loss-Balanced Hedge.
    * Solves the linear system so that ALL N+1 canonical scenarios return the
    * same value X (a flat outcome). Trades the high "all-back-won" profit of
    * ROI-Max for a deterministic result regardless of which leg fails.
    *
    * Math (with c = commission, L_k = layOdd_k):
    *   layStake_k = (X + S_k) / (1 - c),  resp_k = layStake_k * (L_k - 1)
    *   where S_k = sum_{i<k} resp_i.
    * Let a_k = (L_k - 1) / (1 - c). Then S_{k+1} = S_k * (1 + a_k) + a_k * X.
    * Closing equation (all-won): freebet * (Π backOdd - 1) - S_{N+1} = X.
    * Solving: X = freebet * (totalBackOdd - 1) / (1 + B_{N+1}),
    * where B is the X-coefficient accumulator of S_k.
    */
   static calculateBalancedMetrics(
     legs: LegInput[],
     freebet: number,
     commission: number
   ): HedgeResult {
     const N = legs.length;
     const totalBackOdd = legs.reduce((acc, l) => acc * l.backOdd, 1);

     // Build B coefficient (A stays 0 since S_1 = 0).
     let B = 0;
     for (let k = 0; k < N; k++) {
       const a = (legs[k].layOdd - 1) / (1 - commission);
       B = B * (1 + a) + a;
     }
     const X = (freebet * (totalBackOdd - 1)) / (1 + B);

     // Materialize legs with computed lay stakes.
     const calculatedLegs: CalculatedLeg[] = [];
     let cumulativeResponsibility = 0;
     for (let k = 0; k < N; k++) {
       const leg = legs[k];
       const layStake = (X + cumulativeResponsibility) / (1 - commission);
       const responsibility = layStake * (leg.layOdd - 1);
       const cumBefore = cumulativeResponsibility;
       calculatedLegs.push({
         backOdd: leg.backOdd,
         layOdd: leg.layOdd,
         layStake,
         responsibility,
         cumulativeResponsibility: cumBefore,
         totalExposure: cumBefore + responsibility,
         probability: 1 / leg.backOdd,
         ev: 0,
         extractionRate: freebet > 0 ? X / freebet : 0,
       });
       cumulativeResponsibility += responsibility;
     }

     // Build canonical scenarios — every one of them returns X by construction.
     const aggregated: AggregatedScenario[] = [];
     const pathSoFar: ('won' | 'lost')[] = [];
     let probSuccess = 1;
     let cumResp = 0;
     for (let i = 0; i < N; i++) {
       const leg = calculatedLegs[i];
       const pWin = 1 / leg.backOdd;
       const pLoss = 1 - pWin;
       const path: ('won' | 'lost')[] = [...pathSoFar, 'lost'];
       const prob = probSuccess * pLoss;
       const result = (leg.layStake * (1 - commission)) - cumResp;
       const maxExposure = cumResp + leg.responsibility;

       const subScenarios: Scenario[] = [];
       const remaining = N - (i + 1);
       const numSub = Math.pow(2, remaining);
       for (let kk = 0; kk < numSub; kk++) {
         const fullPath: ('won' | 'lost')[] = [...path];
         for (let l = 0; l < remaining; l++) {
           fullPath.push(((kk >> (remaining - 1 - l)) & 1) ? 'won' : 'lost');
         }
         subScenarios.push({
           path: fullPath,
           probability: prob / numSub,
           result,
           maxExposure,
           description: fullPath.join(' → '),
         });
       }

       aggregated.push({
         canonicalPath: path,
         description: path.join(' → '),
         probability: prob,
         result,
         maxExposure,
         subScenarios,
       });

       probSuccess *= pWin;
       cumResp += leg.responsibility;
       pathSoFar.push('won');
     }

     const allWonResult = (freebet * (totalBackOdd - 1)) - cumResp;
     aggregated.push({
       canonicalPath: pathSoFar,
       description: pathSoFar.join(' → '),
       probability: probSuccess,
       result: allWonResult,
       maxExposure: cumResp,
       subScenarios: [{
         path: pathSoFar,
         probability: probSuccess,
         result: allWonResult,
         maxExposure: cumResp,
         description: pathSoFar.join(' → '),
       }],
     });

     const aggregatedScenarios = aggregated.sort((a, b) => b.probability - a.probability);
     const scenarios = aggregatedScenarios.flatMap(as => as.subScenarios);

     let totalEV = 0;
     let maxResp = 0;
     let maxDrawdown = 0;
     scenarios.forEach(s => {
       totalEV += s.result * s.probability;
       maxResp = Math.max(maxResp, s.maxExposure);
       if (s.result < 0) maxDrawdown = Math.max(maxDrawdown, Math.abs(s.result));
     });

     const totalROI = freebet > 0 ? (totalEV / freebet) * 100 : 0;
     let score: 'excellent' | 'good' | 'risky' | 'critical';
     if (X >= 0) score = 'excellent';
     else if (X >= -freebet * 0.5) score = 'good';
     else if (X >= -freebet * 1.5) score = 'risky';
     else score = 'critical';

     return {
       legs: calculatedLegs,
       scenarios,
       aggregatedScenarios,
       totalEV,
       totalROI,
       maxResponsibility: maxResp,
       maxDrawdown,
       capitalRequired: maxResp,
       score,
       scoreReason: `Resultado garantido R$ ${X.toFixed(2)} em todos os cenários.`,
       cumulativeCascadeCost: cumResp,
       allWonProfit: allWonResult,
       totalBackOdd,
     };
   }

   /**
    * Mode dispatcher — picks ROI-Max or Balanced (Equilíbrio de Perdas).
    */
   static calculateByMode(
     mode: HedgeMode,
     legs: LegInput[],
     freebet: number,
     commission: number,
     targetExtraction: number
   ): HedgeResult {
     if (mode === 'balanced') {
       return this.calculateBalancedMetrics(legs, freebet, commission);
     }
     return this.calculateMetrics(legs, freebet, commission, targetExtraction);
   }
}
