import { HedgeProbabilisticoEngine } from './src/lib/hedge-probabilistico-engine';

const freebet = 100;
const commission = 0.03;
const bankroll = 5000;
const targets = [0.7, 0.75, 0.8, 0.85];

interface Result {
  numLegs: number;
  odds: number[];
  roi: number;
  ev: number;
  maxResponsibility: number;
  target: number;
  allWonProfit: number;
}

const bestResults: Result[] = [];

function simulate(numLegs: number) {
  const oddRange = [1.8, 2.0, 2.2, 2.5, 3.0, 3.5];
  
  function getCombinations(n: number, current: number[] = []): number[][] {
    if (current.length === n) return [current];
    let combos: number[][] = [];
    for (const odd of oddRange) {
      combos = combos.concat(getCombinations(n, [...current, odd]));
    }
    return combos;
  }

  const combinations = getCombinations(numLegs);
  let bestForThisLeg: Result | null = null;

  for (const combo of combinations) {
    const legs = combo.map((o, i) => ({ name: `L${i+1}`, backOdd: o, layOdd: o }));
    
    for (const t of targets) {
      const m = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission, t);
      
      if (m.allWonProfit > 0 && m.maxResponsibility <= bankroll) {
        if (!bestForThisLeg || m.totalROI > bestForThisLeg.roi) {
          bestForThisLeg = {
            numLegs,
            odds: combo,
            roi: m.totalROI,
            ev: m.totalEV,
            maxResponsibility: m.maxResponsibility,
            target: t,
            allWonProfit: m.allWonProfit
          };
        }
      }
    }
  }
  if (bestForThisLeg) bestResults.push(bestForThisLeg);
}

simulate(2);
simulate(3);
simulate(4);
simulate(5);

console.log(JSON.stringify(bestResults, null, 2));
