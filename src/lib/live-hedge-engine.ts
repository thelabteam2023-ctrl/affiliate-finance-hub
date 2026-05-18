export interface LiveHedgeInput {
  layOdd: number;
  backOddActual: number;
  backOddProjected: number;
  backStake: number;
  commission: number;
}

export interface LiveHedgeResult {
  recommendedLayStake: number;
  liability: number;
  expectedNetExtraction: number;
  expectedProfit: number;
  currentSpread: number;
  projectedSpread: number;
  spreadReduction: number;
  efficiencyGain: number;
  temporaryExposure: number;
  distanceToConvergence: number;
  slippageRisk: 'low' | 'medium' | 'high';
  roi: number;
  evGain: number;
  sensitivity: {
    odd: number;
    profit: number;
    extraction: number;
  }[];
}

export class LiveHedgeEngine {
  static calculate(input: LiveHedgeInput): LiveHedgeResult {
    const { layOdd, backOddActual, backOddProjected, backStake, commission } = input;
    const commDec = commission / 100;

    // FÓRMULA PRINCIPAL sugerida pelo usuário:
    // LayStakeProjetado = (StakeBack × (OddBackProjetada - 1)) ÷ (OddLayAtual - Comissão)
    const recommendedLayStake = (backStake * (backOddProjected - 1)) / (layOdd - commDec);
    const liability = recommendedLayStake * (layOdd - 1);
    
    // Resultados esperados
    const profitIfBackWins = (backStake * (backOddProjected - 1)) - liability;
    const profitIfLayWins = (recommendedLayStake * (1 - commDec)) - backStake;
    
    const expectedProfit = (profitIfBackWins + profitIfLayWins) / 2;
    
    const currentSpread = ((layOdd / backOddActual) - 1) * 100;
    const projectedSpread = ((layOdd / backOddProjected) - 1) * 100;
    const spreadReduction = currentSpread - projectedSpread;
    
    const efficiencyGain = ((backOddProjected / backOddActual) - 1) * 100;
    const distanceToConvergence = ((backOddProjected / backOddActual) - 1) * 100;
    
    const roi = (expectedProfit / backStake) * 100;
    
    let slippageRisk: 'low' | 'medium' | 'high' = 'low';
    if (distanceToConvergence > 15) slippageRisk = 'high';
    else if (distanceToConvergence > 5) slippageRisk = 'medium';

    const sensitivityOffsets = [-0.5, -0.2, -0.1, 0, 0.1, 0.2, 0.5];
    const sensitivity = sensitivityOffsets.map(offset => {
      const sOdd = Math.max(1.01, backOddProjected + offset);
      const sProfitIfBack = (backStake * (sOdd - 1)) - liability;
      const sProfitIfLay = (recommendedLayStake * (1 - commDec)) - backStake;
      const avgProfit = (sProfitIfBack + sProfitIfLay) / 2;
      return {
        odd: Number(sOdd.toFixed(2)),
        profit: avgProfit,
        extraction: (avgProfit / backStake) * 100
      };
    });

    return {
      recommendedLayStake,
      liability,
      expectedNetExtraction: (expectedProfit / backStake) * 100,
      expectedProfit,
      currentSpread,
      projectedSpread,
      spreadReduction,
      efficiencyGain,
      temporaryExposure: liability,
      distanceToConvergence,
      slippageRisk,
      roi,
      evGain: expectedProfit * 0.95,
      sensitivity
    };
  }
}
