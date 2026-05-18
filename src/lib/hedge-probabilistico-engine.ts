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
   efficiency: number;
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
     efficiency: number,
     metaPct?: number
   ): CalculatedLeg[] {
     const metaLiquida = metaPct !== undefined ? (freebet * metaPct) : (freebet * efficiency);
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
         efficiency: metaPct !== undefined ? metaPct : efficiency
       };
       
       // Update cumulative for NEXT leg (assuming Back won this one)
       cumulativeResponsibility += responsibility;
       
       return calculatedLeg;
     });
   }
 
   static generateScenarios(
     calculatedLegs: CalculatedLeg[],
     freebet: number,
     commission: number
   ): Scenario[] {
     const scenarios: Scenario[] = [];
     const numLegs = calculatedLegs.length;
     const totalScenarios = Math.pow(2, numLegs);
     
     for (let i = 0; i < totalScenarios; i++) {
       const path: ('won' | 'lost')[] = [];
       let currentProb = 1;
       let currentResult = 0;
       let maxExposure = 0;
       let stop = false;
       let cumulativeCost = 0;
 
       for (let j = 0; j < numLegs; j++) {
         const isWon = (i >> (numLegs - 1 - j)) & 1;
         const leg = calculatedLegs[j];
         const pWin = 1 / leg.backOdd;
         const pLoss = 1 - pWin;
 
         if (stop) {
           path.push('lost');
           continue;
         }
 
         maxExposure = Math.max(maxExposure, cumulativeCost + leg.responsibility);
 
         if (isWon) {
           path.push('won');
           currentProb *= pWin;
           cumulativeCost += leg.responsibility;
         } else {
           path.push('lost');
           currentProb *= pLoss;
           // Lay wins: profit = layStake * (1 - comm) - previous costs
           currentResult = (leg.layStake * (1 - commission)) - cumulativeCost;
           stop = true;
         }
       }
 
       if (!stop) {
         // All legs won: Profit = Freebet * (LastOdd - 1) - All Responsibilities
         const lastLeg = calculatedLegs[numLegs - 1];
         currentResult = (freebet * (lastLeg.backOdd - 1)) - cumulativeCost;
       }
 
       scenarios.push({
         path,
         probability: currentProb,
         result: currentResult,
         maxExposure,
         description: path.join(' → ')
       });
     }
 
     return scenarios;
   }

   /**
    * Aggregate scenarios that share the same canonical outcome.
    * After the first 'lost' the cascade stops, so e.g. lost→lost→lost,
    * lost→won→lost, lost→lost→won and lost→won→won all collapse into "lost".
    */
   static aggregateScenarios(scenarios: Scenario[]): AggregatedScenario[] {
     const map = new Map<string, AggregatedScenario>();

     for (const s of scenarios) {
       const firstLost = s.path.indexOf('lost');
       const canonical = firstLost === -1 ? s.path.slice() : s.path.slice(0, firstLost + 1);
       const key = canonical.join('>');

       const existing = map.get(key);
       if (existing) {
         existing.probability += s.probability;
         existing.maxExposure = Math.max(existing.maxExposure, s.maxExposure);
         existing.subScenarios.push(s);
       } else {
         map.set(key, {
           canonicalPath: canonical,
           description: canonical.join(' → '),
           probability: s.probability,
           result: s.result,
           maxExposure: s.maxExposure,
           subScenarios: [s],
         });
       }
     }

     return Array.from(map.values()).sort((a, b) => b.probability - a.probability);
   }

   static calculateMetrics(
     legs: LegInput[],
     freebet: number,
     commission: number,
     efficiency: number,
     metaPct?: number
   ): HedgeResult {
     const calculatedLegs = this.calculateCalculatedLegs(legs, freebet, commission, efficiency, metaPct);
     const scenarios = this.generateScenarios(calculatedLegs, freebet, commission);
      const aggregatedScenarios = this.aggregateScenarios(scenarios);
     
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
     const allWonProfit = (freebet * (legs[legs.length - 1].backOdd - 1)) - totalResponsibilities;
 
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
       allWonProfit
     };
   }
}
