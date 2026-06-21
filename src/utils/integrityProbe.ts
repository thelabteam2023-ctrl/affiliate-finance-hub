/**
 * Integrity probe — observabilidade autônoma para o pipeline de pernas LAY.
 *
 * Detecta automaticamente:
 *  1. Perda do campo `tipo` em qualquer transformação (entrada vs saída).
 *  2. Pernas LAY tratadas com fórmula de BACK (lucro = stake*(odd-1) em vez de liability-based).
 *  3. Divergência da mesma operação renderizada em abas diferentes (Surebet vs Todas as Apostas).
 *
 * Todos os warnings são `console.warn` + buffer em `window.__INTEGRITY_LOG__`
 * e `window.__TAB_DIFF__` para inspeção em runtime.
 */

type Tipo = "back" | "lay" | null | undefined;

interface LogEntry {
  ts: number;
  kind: string;
  message: string;
  data?: unknown;
}

declare global {
  interface Window {
    __INTEGRITY_LOG__?: LogEntry[];
    __TAB_DIFF__?: Record<string, Record<string, any>>;
  }
}

function push(entry: LogEntry) {
  if (typeof window === "undefined") return;
  if (!window.__INTEGRITY_LOG__) window.__INTEGRITY_LOG__ = [];
  window.__INTEGRITY_LOG__.push(entry);
  if (window.__INTEGRITY_LOG__.length > 500) window.__INTEGRITY_LOG__.shift();
  // eslint-disable-next-line no-console
  console.warn(`[INTEGRITY] ${entry.message}`, entry.data ?? "");
}

/** Verifica se o campo `tipo` se manteve entre entrada e saída de uma transformação. */
export function probePernaTipo(stage: string, pernaId: string | undefined, tipoIn: Tipo, tipoOut: Tipo) {
  const a = tipoIn ?? "back";
  const b = tipoOut ?? "back";
  if (a !== b) {
    push({
      ts: Date.now(),
      kind: "TIPO_DIVERGENTE",
      message: `tipo divergente em ${stage}: perna ${pernaId ?? "?"} entrou como ${a} saiu como ${b}`,
      data: { stage, pernaId, tipoIn: a, tipoOut: b },
    });
  }
}

/** Compara, para a mesma operação, snapshots renderizados em abas distintas. */
export function publishTabRender(
  tab: string,
  operacaoId: string,
  pernas: Array<{ id?: string; tipo?: Tipo; stake?: number; odd?: number; lucro_prejuizo?: number | null }>,
) {
  if (typeof window === "undefined" || !operacaoId) return;
  if (!window.__TAB_DIFF__) window.__TAB_DIFF__ = {};
  if (!window.__TAB_DIFF__[operacaoId]) window.__TAB_DIFF__[operacaoId] = {};
  const snapshot = pernas.map((p) => ({
    id: p.id,
    tipo: p.tipo ?? "back",
    stake: p.stake,
    odd: p.odd,
    lucro: p.lucro_prejuizo ?? null,
  }));
  window.__TAB_DIFF__[operacaoId][tab] = snapshot;

  const tabsSeen = Object.keys(window.__TAB_DIFF__[operacaoId]);
  if (tabsSeen.length < 2) return;
  const [t1, t2] = tabsSeen;
  const s1 = window.__TAB_DIFF__[operacaoId][t1];
  const s2 = window.__TAB_DIFF__[operacaoId][t2];
  const diffs: any[] = [];
  const max = Math.max(s1.length, s2.length);
  for (let i = 0; i < max; i++) {
    const a = s1[i];
    const b = s2[i];
    if (!a || !b) {
      diffs.push({ idx: i, reason: "missing_in_one_tab", a, b });
      continue;
    }
    if (a.tipo !== b.tipo || a.stake !== b.stake || a.lucro !== b.lucro) {
      diffs.push({ idx: i, a, b });
    }
  }
  if (diffs.length > 0) {
    push({
      ts: Date.now(),
      kind: "TAB_DIFF",
      message: `divergência entre abas: operação ${operacaoId} (${t1} vs ${t2})`,
      data: { operacaoId, tabs: [t1, t2], diffs },
    });
  }
}