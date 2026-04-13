/**
 * Motor de cálculo da Calculadora de Extração — Modelo Determinístico
 *
 * Recebe odds reais (back + lay) por evento e calcula hedge sequencial
 * condicional para conversão de bônus/freebet.
 *
 * 100 % lógica pura, sem dependências React.
 */

// ─── Types ───

export interface EventInput {
  backOdd: number; // odd na casa de apostas
  layOdd: number;  // odd na exchange
}

export interface ExtractionConfig {
  targetExtraction: number;       // valor do bônus/freebet a converter
  bankrollAvailable: number;      // capital disponível para hedge
  exchangeCommission: number;     // ex: 0.028 = 2.8 %
  events: EventInput[];           // 2–5 eventos com odds reais
}

export interface HedgeEvent {
  eventIndex: number;
  backOdd: number;
  layOdd: number;
  layStake: number;
  liability: number;
  isConditional: boolean;
  resultIfBackLoses: number;  // fluxo de caixa se back perde aqui
  resultIfHedged: number;     // fluxo de caixa se hedge executado
}

export interface StrategyResults {
  events: HedgeEvent[];
  oddTotal: number;
  backStake: number;
  potentialReturn: number;
  netCashFailure: number;           // resultado líquido se todos ganham (falha)
  custoExtracao: number;          // custo esperado (R$)
  custoExtracaoPercent: number;   // custo / valor extraído (%)
  exposicaoMaxima: number;        // maior movimentação negativa
  exposicaoMaximaPercent: number;
  capitalMaximoNecessario: number;
  capitalEsperado: number;
  valorLiquidoEstimado: number;
  classification: 'excellent' | 'good' | 'medium' | 'poor';
}

export interface ProbabilityEvent {
  eventIndex: number;
  label: string;
  probability: number;
  type: 'success' | 'failure';
  laysExecuted: number;  // quantos lays são executados nesse cenário
}

export interface MonteCarloResult {
  iterations: number;
  avgResult: number;
  medianResult: number;
  worstCase: number;
  bestCase: number;
  resultDistribution: { range: string; count: number; percentage: number }[];
  layUsageFrequency: { eventIndex: number; frequency: number }[];
}

// ─── Core ───

/**
 * Calcula o hedge sequencial determinístico a partir de odds reais.
 */
export function calculateDeterministicHedge(config: ExtractionConfig): StrategyResults {
  const { events, targetExtraction, exchangeCommission } = config;
  const backStake = targetExtraction; // freebet value
  const commissionFactor = exchangeCommission > 0 ? (1 - exchangeCommission) : 1;

  const oddTotal = events.reduce((acc, e) => acc * e.backOdd, 1);
  const potentialReturn = backStake * oddTotal;

  // Full precision lay calculations
  const layStakes: number[] = [];
  const liabilities: number[] = [];

  for (let i = 0; i < events.length; i++) {
    let oddAcumulada = 1;
    for (let j = 0; j <= i; j++) oddAcumulada *= events[j].backOdd;
    const retornoAcumulado = backStake * oddAcumulada;
    const ls = retornoAcumulado / events[i].layOdd;
    layStakes.push(ls);
    liabilities.push(ls * (events[i].layOdd - 1));
  }

  // Net cash for each scenario (freebet model: back stake is free money)
  // When back loses at event i: we win lay i, but paid liabilities 0..i-1
  const netCashAtEvent: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const paidLiabilities = liabilities.slice(0, i).reduce((s, l) => s + l, 0);
    const layWin = layStakes[i] * commissionFactor;
    netCashAtEvent.push(layWin - paidLiabilities);
  }
  // When all events win (failure): freebet pays out, but all lays lost
  const netCashAllWin = potentialReturn - liabilities.reduce((s, l) => s + l, 0);

  // Build display events
  const hedgeEvents: HedgeEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    hedgeEvents.push({
      eventIndex: i,
      backOdd: events[i].backOdd,
      layOdd: events[i].layOdd,
      layStake: Math.round(layStakes[i] * 100) / 100,
      liability: Math.round(liabilities[i] * 100) / 100,
      isConditional: i > 0,
      resultIfBackLoses: Math.round(netCashAtEvent[i] * 100) / 100,
      resultIfHedged: Math.round(-liabilities[i] * 100) / 100,
    });
  }

  // ─ Expected value (full precision) ─
  let valorEsperado = 0;
  let capitalEsperadoPonderado = 0;

  for (let i = 0; i < events.length; i++) {
    const probChegar = probabilityOfReaching(events, i);
    const probPerder = 1 - 1 / events[i].backOdd;
    const probParar = probChegar * probPerder;

    valorEsperado += probParar * netCashAtEvent[i];

    if (i === events.length - 1) {
      const probGanha = probChegar * (1 / events[i].backOdd);
      valorEsperado += probGanha * netCashAllWin;
    }

    capitalEsperadoPonderado += probChegar * liabilities[i];
  }

  // Cost = how much less than targetExtraction we expect to get
  const custoExtracao = Math.round(Math.max(0, targetExtraction - valorEsperado) * 100) / 100;
  const custoExtracaoPercent = custoExtracao === 0 ? 0 : Math.round((custoExtracao / targetExtraction) * 10000) / 100;

  const maxLiability = Math.max(...liabilities);
  const capitalMaximoNecessario = Math.round(maxLiability * 100) / 100;

  const exposicaoMaxima = Math.round(maxLiability * 100) / 100;
  const exposicaoMaximaPercent = Math.round((exposicaoMaxima / targetExtraction) * 10000) / 100;

  const capitalEsperado = Math.round(capitalEsperadoPonderado * 100) / 100;
  const valorLiquidoEstimado = Math.round((targetExtraction - custoExtracao) * 100) / 100;

  // Classificação por custo
  let classification: StrategyResults['classification'];
  if (custoExtracaoPercent < 10) classification = 'excellent';
  else if (custoExtracaoPercent <= 20) classification = 'good';
  else if (custoExtracaoPercent <= 30) classification = 'medium';
  else classification = 'poor';

  return {
    events: hedgeEvents,
    oddTotal: Math.round(oddTotal * 100) / 100,
    backStake,
    potentialReturn: Math.round(potentialReturn * 100) / 100,
    netCashFailure: Math.round(netCashAllWin * 100) / 100,
    custoExtracao,
    custoExtracaoPercent,
    exposicaoMaxima,
    exposicaoMaximaPercent,
    capitalMaximoNecessario,
    capitalEsperado,
    valorLiquidoEstimado,
    classification,
  };
}

// ─── Probability helpers ───

function probabilityOfReaching(events: EventInput[], idx: number): number {
  let p = 1;
  for (let j = 0; j < idx; j++) p *= 1 / events[j].backOdd;
  return p;
}

export function calculateProbabilities(events: EventInput[]): { probabilities: ProbabilityEvent[]; successRate: number } {
  const result: ProbabilityEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    const probChegar = probabilityOfReaching(events, i);
    const probPerder = 1 - 1 / events[i].backOdd;
    const prob = probChegar * probPerder;

    result.push({
      eventIndex: i,
      label: `Finalizar no evento ${i + 1}`,
      probability: prob,
      type: 'success',
      laysExecuted: i + 1, // lay 1..i+1 executados (lay k antes do evento k)
    });
  }

  const probAll = events.reduce((acc, e) => acc * (1 / e.backOdd), 1);
  result.push({
    eventIndex: events.length,
    label: 'Falha — todos eventos ganham',
    probability: probAll,
    type: 'failure',
    laysExecuted: events.length,
  });

  return { probabilities: result, successRate: 1 - probAll };
}

// ─── Monte Carlo ───

export function runMonteCarloSimulation(
  config: ExtractionConfig,
  _hedgeEvents: HedgeEvent[],
  iterations = 10000,
): MonteCarloResult {
  const { events, targetExtraction, exchangeCommission } = config;
  const backStake = targetExtraction;
  const commissionFactor = exchangeCommission > 0 ? (1 - exchangeCommission) : 1;
  const potentialReturn = backStake * events.reduce((a, e) => a * e.backOdd, 1);

  // Precompute full precision lay data
  const layStakes: number[] = [];
  const liabilities: number[] = [];
  for (let i = 0; i < events.length; i++) {
    let oddAcum = 1;
    for (let j = 0; j <= i; j++) oddAcum *= events[j].backOdd;
    const ls = (backStake * oddAcum) / events[i].layOdd;
    layStakes.push(ls);
    liabilities.push(ls * (events[i].layOdd - 1));
  }

  const results: number[] = [];
  const layUsage: number[] = new Array(events.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    let result = 0;
    let allWon = true;

    for (let i = 0; i < events.length; i++) {
      layUsage[i]++;
      const probWin = 1 / events[i].backOdd;
      if (Math.random() > probWin) {
        // Back loses at event i → freebet model
        const paidLiabilities = liabilities.slice(0, i).reduce((s, l) => s + l, 0);
        result = layStakes[i] * commissionFactor - paidLiabilities;
        allWon = false;
        break;
      }
    }

    if (allWon) {
      // All events won → freebet pays, all lays lost
      result = potentialReturn - liabilities.reduce((s, l) => s + l, 0);
    }

    results.push(Math.round(result * 100) / 100);
  }

  results.sort((a, b) => a - b);
  const avg = results.reduce((s, r) => s + r, 0) / iterations;
  const median = results[Math.floor(iterations / 2)];

  // Distribution buckets
  const min = results[0];
  const max = results[results.length - 1];
  const bucketSize = Math.max(1, Math.ceil((max - min) / 10));
  const buckets = new Map<string, number>();
  for (const r of results) {
    const start = Math.floor(r / bucketSize) * bucketSize;
    const key = `${start} a ${start + bucketSize}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return {
    iterations,
    avgResult: Math.round(avg * 100) / 100,
    medianResult: median,
    worstCase: results[0],
    bestCase: results[results.length - 1],
    resultDistribution: Array.from(buckets.entries()).map(([range, count]) => ({
      range,
      count,
      percentage: Math.round((count / iterations) * 10000) / 100,
    })),
    layUsageFrequency: layUsage.map((count, i) => ({
      eventIndex: i,
      frequency: Math.round((count / iterations) * 10000) / 100,
    })),
  };
}
