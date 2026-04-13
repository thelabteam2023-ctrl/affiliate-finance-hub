/**
 * Motor de cálculo da Calculadora de Extração
 * 
 * Otimiza conversão de bônus/freebet em dinheiro real via:
 * - Múltipla (back em casa) 
 * - Hedge sequencial condicional (lay em exchange)
 * 
 * 100% lógica pura, sem dependências React.
 */

// ─── Types ───

export interface ExtractionConfig {
  targetExtraction: number;      // Valor a extrair (ex: 1000)
  bankrollAvailable: number;     // Bankroll disponível
  numEventsMin: number;          // Mín eventos (2-5)
  numEventsMax: number;          // Máx eventos (2-5)
  oddMin: number;                // Odd mínima (ex: 1.30)
  oddMax: number;                // Odd máxima (ex: 5.50)
  avgSpread: number;             // Spread médio back vs lay (ex: 0.03 = 3%)
  targetRetention: number;       // Retenção alvo (0.80 a 0.95)
  exchangeCommission: number;    // Comissão exchange (ex: 0.028 = 2.8%)
}

export interface HedgeEvent {
  eventIndex: number;
  backOdd: number;
  layOdd: number;
  layStake: number;
  liability: number;
  isConditional: boolean;        // true se depende do evento anterior ganhar
  profitIfBackWins: number;      // lucro se back ganha até aqui
  lossIfBackLoses: number;       // perda se back perde aqui
}

export interface Strategy {
  numEvents: number;
  backOdds: number[];
  oddTotal: number;
  backStake: number;             // stake na múltipla (= targetExtraction para freebet)
  hedgeEvents: HedgeEvent[];
  potentialReturn: number;       // retorno se múltipla ganha
}

export interface StrategyResults {
  strategy: Strategy;
  lucroLiquidoEstimado: number;
  perdaMaxima: number;
  perdaMaximaPercent: number;
  taxaConversao: number;         // lucro / target (%)
  capitalMaximoNecessario: number;
  capitalEsperado: number;
  eficienciaCapital: number;     // lucro / capital_maximo
  classification: 'excellent' | 'medium' | 'poor';
}

export interface ProbabilityEvent {
  eventIndex: number;
  label: string;
  probability: number;           // 0 a 1
}

export interface MonteCarloResult {
  iterations: number;
  avgProfit: number;
  medianProfit: number;
  worstCase: number;
  bestCase: number;
  profitDistribution: { range: string; count: number; percentage: number }[];
  layUsageFrequency: { eventIndex: number; frequency: number }[];
}

// ─── Core Functions ───

/**
 * Gera odds distribuídas equilibradamente dentro do range
 */
function generateBalancedOdds(numEvents: number, oddMin: number, oddMax: number, targetOddTotal: number): number[] {
  // Queremos odds equilibradas cuja multiplicação ≈ targetOddTotal
  // odd_individual ≈ targetOddTotal^(1/numEvents)
  const baseOdd = Math.pow(targetOddTotal, 1 / numEvents);
  
  // Clamp ao range
  const clampedOdd = Math.max(oddMin, Math.min(oddMax, baseOdd));
  
  // Distribuir com leve variação para parecer natural
  const odds: number[] = [];
  for (let i = 0; i < numEvents; i++) {
    const variation = 1 + (i - (numEvents - 1) / 2) * 0.05;
    let odd = clampedOdd * variation;
    odd = Math.max(oddMin, Math.min(oddMax, odd));
    odd = Math.round(odd * 100) / 100;
    odds.push(odd);
  }
  
  return odds;
}

/**
 * Calcula a sequência de hedge para uma estratégia
 */
export function calculateHedgeSequence(
  backOdds: number[],
  backStake: number,
  avgSpread: number,
  exchangeCommission: number
): HedgeEvent[] {
  const hedgeEvents: HedgeEvent[] = [];
  const numEvents = backOdds.length;
  
  for (let i = 0; i < numEvents; i++) {
    const backOdd = backOdds[i];
    const layOdd = backOdd * (1 + avgSpread); // lay = back + spread
    const layOddRounded = Math.round(layOdd * 100) / 100;
    
    // Odd acumulada dos eventos até i (inclusive)
    let oddAcumulada = 1;
    for (let j = 0; j <= i; j++) {
      oddAcumulada *= backOdds[j];
    }
    
    // Retorno potencial se múltipla ganha até evento i
    const potentialReturn = backStake * oddAcumulada;
    
    // Lay stake para hedgear o valor acumulado
    // lay_stake = potentialReturn / layOdd (simplificado)
    const layStake = Math.round((potentialReturn / layOddRounded) * 100) / 100;
    const liability = Math.round(layStake * (layOddRounded - 1) * 100) / 100;
    
    // Lucro se o back ganha e fazemos lay
    const layProfit = layStake * (1 - exchangeCommission);
    const profitIfBackWins = Math.round((potentialReturn - layStake * layOddRounded) * (1 - exchangeCommission) * 100) / 100;
    
    // Perda se back perde neste evento (perdemos apenas o que não foi hedgeado antes)
    const lossIfBackLoses = i === 0 
      ? -backStake  // se perde no primeiro, perdemos a stake da múltipla
      : Math.round(-liability * 100) / 100; // se perde depois, perdemos a liability do lay anterior
    
    hedgeEvents.push({
      eventIndex: i,
      backOdd,
      layOdd: layOddRounded,
      layStake,
      liability,
      isConditional: i > 0,
      profitIfBackWins,
      lossIfBackLoses,
    });
  }
  
  return hedgeEvents;
}

/**
 * Gera a estratégia ótima iterando combinações
 */
export function generateOptimalStrategy(config: ExtractionConfig): Strategy[] {
  const strategies: Strategy[] = [];
  
  for (let numEvents = config.numEventsMin; numEvents <= config.numEventsMax; numEvents++) {
    // Testar diferentes odd totals no range viável
    const oddTotalMin = Math.pow(config.oddMin, numEvents);
    const oddTotalMax = Math.pow(config.oddMax, numEvents);
    
    // Range ideal: 3.0 a 8.0 para extração
    const effectiveMin = Math.max(2.5, oddTotalMin);
    const effectiveMax = Math.min(15, oddTotalMax);
    
    // Testar 5 pontos no range
    const steps = 5;
    for (let step = 0; step < steps; step++) {
      const oddTotal = effectiveMin + (effectiveMax - effectiveMin) * (step / (steps - 1));
      
      const backOdds = generateBalancedOdds(numEvents, config.oddMin, config.oddMax, oddTotal);
      const actualOddTotal = backOdds.reduce((acc, o) => acc * o, 1);
      
      const backStake = config.targetExtraction;
      const potentialReturn = backStake * actualOddTotal;
      
      const hedgeEvents = calculateHedgeSequence(
        backOdds,
        backStake,
        config.avgSpread,
        config.exchangeCommission
      );
      
      strategies.push({
        numEvents,
        backOdds,
        oddTotal: Math.round(actualOddTotal * 100) / 100,
        backStake,
        hedgeEvents,
        potentialReturn: Math.round(potentialReturn * 100) / 100,
      });
    }
  }
  
  return strategies;
}

/**
 * Avalia uma estratégia e calcula resultados financeiros
 */
export function evaluateStrategy(
  strategy: Strategy,
  config: ExtractionConfig
): StrategyResults {
  const { hedgeEvents } = strategy;
  
  // Capital máximo = maior liability simultânea + back stake
  const maxLiability = Math.max(...hedgeEvents.map(e => e.liability));
  const capitalMaximoNecessario = Math.round((strategy.backStake + maxLiability) * 100) / 100;
  
  // Lucro esperado ponderado por probabilidade
  let lucroEsperado = 0;
  let capitalEsperadoPonderado = 0;
  
  for (let i = 0; i < hedgeEvents.length; i++) {
    const event = hedgeEvents[i];
    const probChegar = getProbabilityOfReaching(strategy.backOdds, i);
    const probPerder = 1 - (1 / event.backOdd);
    const probParar = probChegar * probPerder;
    
    if (i === hedgeEvents.length - 1) {
      // Último evento: ou ganha tudo ou perde
      const probGanha = probChegar * (1 / event.backOdd);
      const retornoFinal = strategy.potentialReturn - strategy.backStake;
      const lucroComHedge = event.profitIfBackWins;
      
      lucroEsperado += probGanha * retornoFinal * (1 - config.exchangeCommission);
      lucroEsperado += probParar * event.lossIfBackLoses;
    } else {
      // Evento intermediário: hedge condicional
      lucroEsperado += probParar * event.lossIfBackLoses;
    }
    
    capitalEsperadoPonderado += probChegar * event.liability;
  }
  
  // Perda máxima: pior cenário
  const perdaMaxima = Math.abs(Math.min(...hedgeEvents.map(e => e.lossIfBackLoses), -strategy.backStake));
  const perdaMaximaPercent = (perdaMaxima / config.targetExtraction) * 100;
  
  // Lucro líquido estimado (valor esperado)
  const lucroLiquidoEstimado = Math.round(lucroEsperado * 100) / 100;
  const taxaConversao = (lucroLiquidoEstimado / config.targetExtraction) * 100;
  
  const capitalEsperado = Math.round(capitalEsperadoPonderado * 100) / 100;
  const eficienciaCapital = capitalMaximoNecessario > 0 
    ? Math.round((lucroLiquidoEstimado / capitalMaximoNecessario) * 10000) / 100 
    : 0;
  
  // Classificação
  let classification: 'excellent' | 'medium' | 'poor';
  if (taxaConversao >= 70 && perdaMaximaPercent <= 15) {
    classification = 'excellent';
  } else if (taxaConversao >= 50 && perdaMaximaPercent <= 25) {
    classification = 'medium';
  } else {
    classification = 'poor';
  }
  
  // Verificar se atende retenção
  const retencaoReal = 1 - (perdaMaxima / config.targetExtraction);
  if (retencaoReal < config.targetRetention) {
    classification = 'poor';
  }
  
  return {
    strategy,
    lucroLiquidoEstimado,
    perdaMaxima: Math.round(perdaMaxima * 100) / 100,
    perdaMaximaPercent: Math.round(perdaMaximaPercent * 100) / 100,
    taxaConversao: Math.round(taxaConversao * 100) / 100,
    capitalMaximoNecessario,
    capitalEsperado,
    eficienciaCapital,
    classification,
  };
}

/**
 * Probabilidade de chegar ao evento i (todos anteriores ganharam)
 */
function getProbabilityOfReaching(backOdds: number[], eventIndex: number): number {
  let prob = 1;
  for (let j = 0; j < eventIndex; j++) {
    prob *= 1 / backOdds[j];
  }
  return prob;
}

/**
 * Calcula probabilidades de cada evento
 */
export function calculateProbabilities(strategy: Strategy): ProbabilityEvent[] {
  const events: ProbabilityEvent[] = [];
  const { backOdds } = strategy;
  
  for (let i = 0; i < backOdds.length; i++) {
    const probChegar = getProbabilityOfReaching(backOdds, i);
    const probPerder = 1 - (1 / backOdds[i]);
    
    if (i === 0) {
      events.push({
        eventIndex: i,
        label: `Parar no evento ${i + 1} (back perde)`,
        probability: probPerder,
      });
    } else {
      events.push({
        eventIndex: i,
        label: `Usar lay ${i + 1} (chegar ao evento ${i + 1})`,
        probability: probChegar,
      });
    }
  }
  
  // Probabilidade de todos ganharem (múltipla completa)
  const probTodosGanham = backOdds.reduce((acc, odd) => acc * (1 / odd), 1);
  events.push({
    eventIndex: backOdds.length,
    label: 'Múltipla completa (todos ganham)',
    probability: probTodosGanham,
  });
  
  return events;
}

/**
 * Simulação Monte Carlo
 */
export function runMonteCarloSimulation(
  strategy: Strategy,
  config: ExtractionConfig,
  iterations: number = 10000
): MonteCarloResult {
  const profits: number[] = [];
  const layUsage: number[] = new Array(strategy.backOdds.length).fill(0);
  
  for (let iter = 0; iter < iterations; iter++) {
    let profit = 0;
    let allWon = true;
    
    for (let i = 0; i < strategy.backOdds.length; i++) {
      const probWin = 1 / strategy.backOdds[i];
      const roll = Math.random();
      
      layUsage[i]++;
      
      if (roll > probWin) {
        // Back perde neste evento
        if (i === 0) {
          profit = -strategy.backStake;
        } else {
          // Perdemos a liability do lay do evento anterior que foi ativado
          profit = -strategy.hedgeEvents[i - 1].liability;
        }
        allWon = false;
        break;
      }
      // Back ganhou, lay é ativado (hedge)
    }
    
    if (allWon) {
      // Múltipla completa ganhou
      const retornoBruto = strategy.potentialReturn - strategy.backStake;
      // Deduz comissão do último hedge
      const lastHedge = strategy.hedgeEvents[strategy.backOdds.length - 1];
      profit = retornoBruto - lastHedge.liability;
      profit *= (1 - config.exchangeCommission);
    }
    
    profits.push(Math.round(profit * 100) / 100);
  }
  
  // Estatísticas
  profits.sort((a, b) => a - b);
  const avg = profits.reduce((s, p) => s + p, 0) / iterations;
  const median = profits[Math.floor(iterations / 2)];
  
  // Distribuição em buckets
  const minProfit = profits[0];
  const maxProfit = profits[profits.length - 1];
  const bucketSize = Math.max(1, Math.ceil((maxProfit - minProfit) / 10));
  const buckets: Map<string, number> = new Map();
  
  for (const p of profits) {
    const bucketStart = Math.floor(p / bucketSize) * bucketSize;
    const key = `${bucketStart} a ${bucketStart + bucketSize}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  
  const profitDistribution = Array.from(buckets.entries()).map(([range, count]) => ({
    range,
    count,
    percentage: Math.round((count / iterations) * 10000) / 100,
  }));
  
  const layUsageFrequency = layUsage.map((count, i) => ({
    eventIndex: i,
    frequency: Math.round((count / iterations) * 10000) / 100,
  }));
  
  return {
    iterations,
    avgProfit: Math.round(avg * 100) / 100,
    medianProfit: median,
    worstCase: profits[0],
    bestCase: profits[profits.length - 1],
    profitDistribution,
    layUsageFrequency,
  };
}

/**
 * Encontra a melhor estratégia dado o config
 */
export function findBestStrategy(config: ExtractionConfig): {
  best: StrategyResults;
  alternatives: StrategyResults[];
} {
  const strategies = generateOptimalStrategy(config);
  
  const evaluated = strategies.map(s => evaluateStrategy(s, config));
  
  // Ordenar por: classificação (excellent > medium > poor), depois por taxa de conversão
  const classOrder = { excellent: 0, medium: 1, poor: 2 };
  evaluated.sort((a, b) => {
    const classDiff = classOrder[a.classification] - classOrder[b.classification];
    if (classDiff !== 0) return classDiff;
    return b.taxaConversao - a.taxaConversao;
  });
  
  // Filtrar estratégias que cabem no bankroll
  const viable = evaluated.filter(e => e.capitalMaximoNecessario <= config.bankrollAvailable);
  
  const pool = viable.length > 0 ? viable : evaluated;
  
  return {
    best: pool[0],
    alternatives: pool.slice(1, 4), // até 3 alternativas
  };
}
