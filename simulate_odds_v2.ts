import { HedgeProbabilisticoEngine } from './src/lib/hedge-probabilistico-engine';

const freebet = 100;
const bankroll = 5000;
const commissions = [0.028, 0.03, 0.048, 0.06];
const targetExtractions = [0.6, 0.7, 0.8]; // Testing common targets
const legCounts = [2, 3, 4, 5];
const oddRange = [1.8, 2.0, 2.2, 2.5, 3.0, 3.5, 4.0];

interface Result {
  numLegs: number;
  odds: number[];
  roi: number;
  commission: number;
  target: number;
  allWonProfit: number;
  maxResponsibility: number;
}

const bestOverall: Record<number, Result> = {};

for (const numLegs of legCounts) {
  function getCombinations(n: number, current: number[] = []): number[][] {
    if (current.length === n) return [current];
    let combos: number[][] = [];
    for (const odd of oddRange) {
      combos = combos.concat(getCombinations(n, [...current, odd]));
    }
    return combos;
  }

  const combinations = getCombinations(numLegs);
  
  for (const comm of commissions) {
    for (const combo of combinations) {
      const legs = combo.map((o, i) => ({ name: `L${i+1}`, backOdd: o, layOdd: o }));
      
      for (const t of targetExtractions) {
        const m = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, comm, t);
        
        // Filter: Scenario "All Won" must be profitable and responsibility within bankroll
        if (m.allWonProfit > 0 && m.maxResponsibility <= bankroll) {
          if (!bestOverall[numLegs] || m.totalROI > bestOverall[numLegs].roi) {
            bestOverall[numLegs] = {
              numLegs,
              odds: combo,
              roi: m.totalROI,
              commission: comm,
              target: t,
              allWonProfit: m.allWonProfit,
              maxResponsibility: m.maxResponsibility
            };
          }
        }
      }
    }
  }
}

console.log(JSON.stringify(Object.values(bestOverall), null, 2));
