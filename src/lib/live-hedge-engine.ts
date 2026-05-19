export interface LiveHedgeInput {
   layOdd: number;           // Odd atual do Lay na Exchange
   backOddActual: number;    // Odd atual do Back (informativo)
   backOddProjected: number; // Odd que você pegou/pretende no Back
   backStake: number;        // Valor da Freebet ou Stake Back
   commission: number;       // Comissão da Exchange em %
   alreadyLaidStake?: number; // Valor que já foi coberto em Lay anteriormente
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
    const alreadyLaid = input.alreadyLaidStake || 0;

    // FÓRMULA HEDGE (Equalização de Lucro):
    // LucroBack = StakeBack * (OddBack - 1)
    // LucroLay = LayStake * (1 - Comissão)
    // Para igualar: LayStake = (StakeBack * (OddBack - 1)) / (1 - Comissão) -- Se for FREEBET
    // Mas aqui usamos a fórmula de proteção sobre a responsabilidade ou lucro esperado.
    const totalRequiredLayStake = (backStake * (backOddProjected - 1)) / (layOdd - commDec);
    const recommendedLayStake = Math.max(0, totalRequiredLayStake - alreadyLaid);
    const liability = totalRequiredLayStake * (layOdd - 1);
    
    const profitIfBackWins = (backStake * (backOddProjected - 1)) - liability;
    const profitIfLayWins = (totalRequiredLayStake * (1 - commDec)) - 0; // Se for freebet, não subtrai backStake original
    
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
