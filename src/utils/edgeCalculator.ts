/**
 * EdgeCalculator — análise de Edge / Fair Odd para o Laboratório ValueBet.
 *
 * REGRA ABSOLUTA: jamais inferir, estimar ou calcular fair_odd.
 * Se `fair_odd` é NULL ou ≤ 1, a aposta NÃO participa de nenhuma análise
 * de edge — `calcularEdge` retorna `null` e os agregadores ignoram a entrada.
 *
 * Apostas sem fair_odd continuam participando normalmente de TODAS as
 * análises financeiras (ROI, lucro, win rate) — apenas edge é omitido.
 */

export type ClassificacaoEntrada =
  | "Value Excepcional"
  | "Alto Value"
  | "Com Value"
  | "Sem Value";

export type QuadranteEdge = "Q1" | "Q2" | "Q3" | "Q4";

export interface ApostaComEdge {
  odd?: number | null;
  fair_odd?: number | null;
  resultado?: string | null;
  stake?: number | null;
  data_aposta?: string | null;
}

/**
 * Edge percentual de uma aposta. Retorna `null` quando não calculável.
 * Fórmula: (1/fair_odd - 1/odd) × 100
 */
export function calcularEdge(
  odd: number | null | undefined,
  fair_odd: number | null | undefined,
): number | null {
  if (odd === null || odd === undefined) return null;
  if (fair_odd === null || fair_odd === undefined) return null;
  const o = Number(odd);
  const f = Number(fair_odd);
  if (!isFinite(o) || !isFinite(f)) return null;
  if (o <= 1 || f <= 1) return null;
  return (1 / f - 1 / o) * 100;
}

export function classificarEntrada(edge: number): ClassificacaoEntrada {
  if (edge > 10) return "Value Excepcional";
  if (edge > 5) return "Alto Value";
  if (edge > 0) return "Com Value";
  return "Sem Value";
}

/**
 * Q1: edge > 0 + GREEN/MEIO_GREEN → Correto e Lucrativo
 * Q2: edge > 0 + RED/MEIO_RED     → Correto com Variância
 * Q3: edge <= 0 + GREEN/MEIO_GREEN → Resultado sem Edge (sorte)
 * Q4: edge <= 0 + RED/MEIO_RED    → Sem Edge e Perdendo
 * Apostas VOID não entram em nenhum quadrante.
 */
export function classificarQuadrante(
  edge: number,
  resultado: string | null | undefined,
): QuadranteEdge | null {
  if (!resultado || resultado === "VOID") return null;
  const ganhou = resultado === "GREEN" || resultado === "MEIO_GREEN";
  if (edge > 0) return ganhou ? "Q1" : "Q2";
  return ganhou ? "Q3" : "Q4";
}

export interface EdgeStats {
  /** Apostas com fair_odd preenchida (calculáveis). */
  apostasComEdge: number;
  /** Total absoluto recebido (com e sem fair_odd). */
  apostasTotal: number;
  /** Percentual de cobertura (apostasComEdge / apostasTotal × 100). */
  cobertura: number;
  /** Apenas se apostasComEdge > 0. */
  edgeMedio: number;
  edgeMediano: number;
  maiorEdge: number;
  menorEdge: number;
  comValue: number;
  semValue: number;
  pctComValue: number;
  pctSemValue: number;
  edgeMedioComValue: number;
  edgeMedioSemValue: number;
  quadrantes: Record<QuadranteEdge, number>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function agregarEdgeStats(apostas: ApostaComEdge[]): EdgeStats {
  const apostasTotal = apostas.length;
  const edges: number[] = [];
  const quadrantes: Record<QuadranteEdge, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const a of apostas) {
    const e = calcularEdge(a.odd, a.fair_odd);
    if (e === null) continue;
    edges.push(e);
    const q = classificarQuadrante(e, a.resultado);
    if (q) quadrantes[q] += 1;
  }
  const apostasComEdge = edges.length;
  if (apostasComEdge === 0) {
    return {
      apostasComEdge: 0,
      apostasTotal,
      cobertura: 0,
      edgeMedio: 0,
      edgeMediano: 0,
      maiorEdge: 0,
      menorEdge: 0,
      comValue: 0,
      semValue: 0,
      pctComValue: 0,
      pctSemValue: 0,
      edgeMedioComValue: 0,
      edgeMedioSemValue: 0,
      quadrantes,
    };
  }
  const sum = edges.reduce((a, b) => a + b, 0);
  const com = edges.filter((e) => e > 0);
  const sem = edges.filter((e) => e <= 0);
  const sumCom = com.reduce((a, b) => a + b, 0);
  const sumSem = sem.reduce((a, b) => a + b, 0);
  return {
    apostasComEdge,
    apostasTotal,
    cobertura: apostasTotal > 0 ? (apostasComEdge / apostasTotal) * 100 : 0,
    edgeMedio: sum / apostasComEdge,
    edgeMediano: median(edges),
    maiorEdge: Math.max(...edges),
    menorEdge: Math.min(...edges),
    comValue: com.length,
    semValue: sem.length,
    pctComValue: (com.length / apostasComEdge) * 100,
    pctSemValue: (sem.length / apostasComEdge) * 100,
    edgeMedioComValue: com.length > 0 ? sumCom / com.length : 0,
    edgeMedioSemValue: sem.length > 0 ? sumSem / sem.length : 0,
    quadrantes,
  };
}

/** Faixas para o histograma de distribuição. */
export const EDGE_BUCKETS = [
  { label: "<-5%", min: -Infinity, max: -5, color: "#ef4444", opacity: 0.7 },
  { label: "-5 a 0%", min: -5, max: 0, color: "#ef4444", opacity: 0.55 },
  { label: "0 a 2%", min: 0, max: 2, color: "#94a3b8", opacity: 0.7 },
  { label: "2 a 5%", min: 2, max: 5, color: "#22c55e", opacity: 0.6 },
  { label: "5 a 10%", min: 5, max: 10, color: "#22c55e", opacity: 0.85 },
  { label: ">10%", min: 10, max: Infinity, color: "#22c55e", opacity: 1, glow: true },
] as const;

export interface EdgeBucketResult {
  label: string;
  min: number;
  max: number;
  color: string;
  opacity: number;
  glow?: boolean;
  n: number;
  stake: number;
  profit: number;
  roi: number;
}

export function distribuirEdge(apostas: ApostaComEdge[]): EdgeBucketResult[] {
  return EDGE_BUCKETS.map((b) => {
    let n = 0;
    let stake = 0;
    let profit = 0;
    for (const a of apostas) {
      const e = calcularEdge(a.odd, a.fair_odd);
      if (e === null) continue;
      const inRange = b.min === -Infinity ? e < b.max : b.max === Infinity ? e >= b.min : e >= b.min && e < b.max;
      if (!inRange) continue;
      n += 1;
      const s = Number(a.stake ?? 0);
      stake += s;
    }
    // ROI por bucket precisa do profit também — segunda passada simples
    for (const a of apostas) {
      const e = calcularEdge(a.odd, a.fair_odd);
      if (e === null) continue;
      const inRange = b.min === -Infinity ? e < b.max : b.max === Infinity ? e >= b.min : e >= b.min && e < b.max;
      if (!inRange) continue;
      // profit é fornecido externamente via stake; aqui não temos pl direto — quem chama deve preferir distribuirEdgeComPL
    }
    return { ...b, n, stake, profit, roi: 0 } as EdgeBucketResult;
  });
}

/**
 * Variante que aceita PL explícito por aposta — usada nos componentes de UI.
 */
export interface ApostaComEdgePL extends ApostaComEdge {
  pl?: number | null;
}

export function distribuirEdgeComPL(apostas: ApostaComEdgePL[]): EdgeBucketResult[] {
  return EDGE_BUCKETS.map((b) => {
    let n = 0;
    let stake = 0;
    let profit = 0;
    for (const a of apostas) {
      const e = calcularEdge(a.odd, a.fair_odd);
      if (e === null) continue;
      const inRange = b.min === -Infinity ? e < b.max : b.max === Infinity ? e >= b.min : e >= b.min && e < b.max;
      if (!inRange) continue;
      n += 1;
      stake += Number(a.stake ?? 0);
      profit += Number(a.pl ?? 0);
    }
    return {
      ...b,
      n,
      stake,
      profit,
      roi: stake > 0 ? (profit / stake) * 100 : 0,
    } as EdgeBucketResult;
  });
}

/**
 * Série temporal de edge médio por mês.
 * Considera apenas apostas com fair_odd preenchida.
 */
export interface EdgeMensal {
  month: string; // YYYY-MM
  edgeMedio: number;
  n: number;
}

export function edgeMedioPorMes(apostas: ApostaComEdge[]): EdgeMensal[] {
  const map = new Map<string, { sum: number; n: number }>();
  for (const a of apostas) {
    if (!a.data_aposta) continue;
    const e = calcularEdge(a.odd, a.fair_odd);
    if (e === null) continue;
    const key = a.data_aposta.slice(0, 7);
    const entry = map.get(key) ?? { sum: 0, n: 0 };
    entry.sum += e;
    entry.n += 1;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([month, { sum, n }]) => ({ month, edgeMedio: n > 0 ? sum / n : 0, n }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Série acumulada de edge esperado (em $) — para a linha pontilhada na aba Análise.
 * Cada ponto: edge_acumulado[i] = edge_acumulado[i-1] + (edge_i / 100 × stake_i)
 */
export interface EdgeAcumuladoPonto {
  idx: number;
  date: string;
  cumulative: number;
}

export function calcularEdgeAcumulado(apostas: ApostaComEdgePL[]): EdgeAcumuladoPonto[] {
  const sorted = [...apostas]
    .filter((a) => !!a.data_aposta)
    .sort((a, b) => (a.data_aposta ?? "").localeCompare(b.data_aposta ?? ""));
  let acc = 0;
  const out: EdgeAcumuladoPonto[] = [];
  sorted.forEach((a, i) => {
    const e = calcularEdge(a.odd, a.fair_odd);
    const s = Number(a.stake ?? 0);
    if (e !== null) acc += (e / 100) * s;
    out.push({ idx: i + 1, date: a.data_aposta!, cumulative: acc });
  });
  return out;
}

/**
 * Conta apostas com fair_odd preenchida — utilitário leve para gates condicionais.
 */
export function contarApostasComEdge(apostas: ApostaComEdge[]): number {
  let n = 0;
  for (const a of apostas) if (calcularEdge(a.odd, a.fair_odd) !== null) n += 1;
  return n;
}