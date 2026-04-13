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
  const { events, targetExtraction, exchangeCommission, bankrollAvailable } = config;
  const backStake = targetExtraction;
  const hedgeEvents: HedgeEvent[] = [];

  const oddTotal = events.reduce((acc, e) => acc * e.backOdd, 1);
  const potentialReturn = backStake * oddTotal;

  for (let i = 0; i < events.length; i++) {
    const { backOdd, layOdd } = events[i];

    // Odd acumulada até evento i (inclusive)
    let oddAcumulada = 1;
    for (let j = 0; j <= i; j++) oddAcumulada *= events[j].backOdd;

    const retornoAcumulado = backStake * oddAcumulada;

    // Lay stake para hedgear o retorno acumulado
    const layStake = Math.round((retornoAcumulado / layOdd) * 100) / 100;
    const liability = Math.round(layStake * (layOdd - 1) * 100) / 100;

    // Resultado se back perde neste evento
    const resultIfBackLoses = i === 0
      ? -backStake
      : Math.round(-hedgeEvents[i - 1].liability * 100) / 100;

    // Resultado líquido se hedge é executado (back ganha, lay protege)
    const resultIfHedged = Math.round(
      (retornoAcumulado - layStake * layOdd) * (1 - exchangeCommission) * 100
    ) / 100;

    hedgeEvents.push({
      eventIndex: i,
      backOdd,
      layOdd,
      layStake,
      liability,
      isConditional: i > 0,
      resultIfBackLoses,
      resultIfHedged,
    });
  }

  // ─ Métricas financeiras ─
  const maxLiability = Math.max(...hedgeEvents.map(e => e.liability));
  const capitalMaximoNecessario = Math.round((backStake + maxLiability) * 100) / 100;

  // Custo esperado (valor esperado ponderado por probabilidade)
  let valorEsperado = 0;
  let capitalEsperadoPonderado = 0;

  for (let i = 0; i < hedgeEvents.length; i++) {
    const probChegar = probabilityOfReaching(events, i);
    const probPerder = 1 - 1 / events[i].backOdd;
    const probParar = probChegar * probPerder;

    if (i === hedgeEvents.length - 1) {
      // Último evento
      const probGanha = probChegar * (1 / events[i].backOdd);
      const retornoFinal = (potentialReturn - backStake) * (1 - exchangeCommission);
      valorEsperado += probGanha * retornoFinal;
      valorEsperado += probParar * hedgeEvents[i].resultIfBackLoses;
    } else {
      valorEsperado += probParar * hedgeEvents[i].resultIfBackLoses;
    }

    capitalEsperadoPonderado += probChegar * hedgeEvents[i].liability;
  }

  const custoExtracao = Math.round(Math.abs(valorEsperado) * 100) / 100;
  const custoExtracaoPercent = Math.round((custoExtracao / targetExtraction) * 10000) / 100;

  const exposicaoMaxima = Math.abs(Math.min(
    ...hedgeEvents.map(e => e.resultIfBackLoses),
    -backStake,
  ));
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
    custoExtracao,
    custoExtracaoPercent,
    exposicaoMaxima: Math.round(exposicaoMaxima * 100) / 100,
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

export function calculateProbabilities(events: EventInput[]): ProbabilityEvent[] {
  const result: ProbabilityEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    const probChegar = probabilityOfReaching(events, i);
    const probPerder = 1 - 1 / events[i].backOdd;

    if (i === 0) {
      result.push({ eventIndex: i, label: `Parar no evento 1 (back perde)`, probability: probPerder });
    } else {
      result.push({ eventIndex: i, label: `Usar lay ${i + 1} (chegar ao evento ${i + 1})`, probability: probChegar });
    }
  }

  const probAll = events.reduce((acc, e) => acc * (1 / e.backOdd), 1);
  result.push({ eventIndex: events.length, label: 'Múltipla completa (todos ganham)', probability: probAll });

  return result;
}

// ─── Monte Carlo ───

export function runMonteCarloSimulation(
  config: ExtractionConfig,
  hedgeEvents: HedgeEvent[],
  iterations = 10000,
): MonteCarloResult {
  const { events, targetExtraction, exchangeCommission } = config;
  const backStake = targetExtraction;
  const potentialReturn = backStake * events.reduce((a, e) => a * e.backOdd, 1);

  const results: number[] = [];
  const layUsage: number[] = new Array(events.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    let result = 0;
    let allWon = true;

    for (let i = 0; i < events.length; i++) {
      layUsage[i]++;
      const probWin = 1 / events[i].backOdd;
      if (Math.random() > probWin) {
        // Back perde
        result = i === 0 ? -backStake : -hedgeEvents[i - 1].liability;
        allWon = false;
        break;
      }
    }

    if (allWon) {
      const retorno = potentialReturn - backStake;
      const lastLiability = hedgeEvents[hedgeEvents.length - 1].liability;
      result = (retorno - lastLiability) * (1 - exchangeCommission);
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
