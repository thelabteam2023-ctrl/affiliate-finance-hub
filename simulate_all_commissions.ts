import { HedgeProbabilisticoEngine } from './src/lib/hedge-probabilistico-engine';

const freebet = 100;
const bankroll = 5000;
const commissions = [2.8, 3, 4.8, 6];
const legCounts = [2, 3, 4, 5];
const oddRange = [1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.5, 4.0];

const results: Record<number, any[]> = {};

for (const comm of commissions) {
  for (const numLegs of legCounts) {
    let bestROI = -Infinity;
    let bestCombo: number[] = [];
    
    function findBest(n: number, current: number[] = []) {
      if (current.length === n) {
        const legs = current.map(o => ({ name: 'L', backOdd: o, layOdd: o }));
        const m = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, comm / 100, 0.6); // Base 60% extraction for stability
        if (m.allWonProfit > 0 && m.totalROI > bestROI) {
          bestROI = m.totalROI;
          bestCombo = [...current];
        }
        return;
      }
      for (const odd of oddRange) {
        findBest(n, [...current, odd]);
      }
    }
    
    findBest(numLegs);
    if (!results[comm]) results[comm] = [];
    results[comm].push({
      legs: bestCombo,
      roi: bestROI.toFixed(1) + "%",
      numLegs
    });
  }
}

console.log(JSON.stringify(results, null, 2));
