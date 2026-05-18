import { HedgeProbabilisticoEngine } from './src/lib/hedge-probabilistico-engine';

const freebet = 100;
const bankroll = 5000;
const commissions = [2.8, 3, 4.8, 6];
const legCounts = [2, 3, 4, 5];
const oddRange = [1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.5, 4.0];
const target = 0.65; // Balanced target for 100k testing

const results: Record<string, any[]> = {};

for (const comm of commissions) {
  const commKey = comm.toFixed(1);
  results[commKey] = [];
  
  for (const numLegs of legCounts) {
    let bestROI = -Infinity;
    let bestCombo: number[] = [];
    
    function findBest(n: number, current: number[] = []) {
      if (current.length === n) {
        const legs = current.map(o => ({ name: 'L', backOdd: o, layOdd: o }));
        const m = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, comm / 100, target);
        
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
    
    // Now simulate this specific "Best" combo 100,000 times to verify stability
    const finalLegs = bestCombo.map(o => ({ name: 'L', backOdd: o, layOdd: o }));
    const finalMetrics = HedgeProbabilisticoEngine.calculateMetrics(finalLegs, freebet, comm / 100, target);
    
    let totalProfit = 0;
    const iterations = 100000;
    for (let i = 0; i < iterations; i++) {
      const rand = Math.random();
      let cumulativeProb = 0;
      for (const scenario of finalMetrics.aggregatedScenarios) {
        cumulativeProb += scenario.probability;
        if (rand <= cumulativeProb) {
          totalProfit += scenario.result;
          break;
        }
      }
    }

    results[commKey].push({
      name: numLegs === 2 ? "Duo" : numLegs === 3 ? "Triple" : numLegs === 4 ? "Quarteto" : "Full House",
      legs: bestCombo,
      roi: (totalProfit / (iterations * freebet) * 100).toFixed(1) + "%",
      type: bestROI > 20 ? "Alta Performance" : bestROI > 5 ? "Estável" : "Risco/Baixo ROI"
    });
  }
}

console.log(JSON.stringify(results, null, 2));
