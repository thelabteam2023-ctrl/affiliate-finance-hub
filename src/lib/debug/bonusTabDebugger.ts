/**
 * BonusTabDebugger — observabilidade estruturada para a aba Bônus.
 *
 * Ativação:
 *   - localStorage.setItem('DEBUG_BONUS','1')
 *   - ou URL contendo ?debugBonus=1
 *
 * Consumo:
 *   - window.__BONUS_DEBUG__.snapshot()  → JSON com todos os eventos
 *   - window.__BONUS_DEBUG__.export()    → copia para clipboard
 *   - window.__BONUS_DEBUG__.clear()     → limpa buffer
 *   - Painel visual em <BonusDebugPanel />
 *
 * Custo zero quando desligado (early-return em todos os métodos).
 */

export type BonusDebugStage =
  | "AREA.mount"
  | "AREA.refreshTrigger"
  | "TAB.mount"
  | "TAB.subTabChange"
  | "QUERY.surebets.request"
  | "QUERY.surebets.response"
  | "QUERY.pernas.request"
  | "QUERY.pernas.response"
  | "QUERY.entradas.response"
  | "QUERY.apostas.request"
  | "QUERY.apostas.response"
  | "QUERY.multiplas.response"
  | "MAP.baseObj"
  | "MAP.entries"
  | "GROUP.pernas"
  | "FILTER.subTab"
  | "FILTER.dimensional"
  | "FILTER.date"
  | "FILTER.suspiciousDate"
  | "SORT.final"
  | "RENDER.list"
  | "RENDER.card";

export interface BonusDebugEvent {
  ts: number;
  traceId: string;
  stage: BonusDebugStage | string;
  projetoId?: string;
  payload?: Record<string, unknown>;
}

export interface BonusDebugFilterEvent {
  inputCount: number;
  outputCount: number;
  rule: string;
  droppedSamples?: unknown[];
  reason?: string;
}

const MAX_BUFFER = 500;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage?.getItem("DEBUG_BONUS");
    if (ls === "1" || ls === "true") return true;
    const qs = window.location?.search || "";
    if (qs.includes("debugBonus=1")) {
      // persist para sobreviver refresh
      window.localStorage?.setItem("DEBUG_BONUS", "1");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function ensureGlobal() {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    __BONUS_DEBUG__?: {
      events: BonusDebugEvent[];
      enabled: boolean;
      lastTraceId: string | null;
      snapshot: () => BonusDebugEvent[];
      export: () => string;
      clear: () => void;
      subscribers: Set<() => void>;
      subscribe: (fn: () => void) => () => void;
      notify: () => void;
    };
  };
  if (!w.__BONUS_DEBUG__) {
    const state: BonusDebugEvent[] = [];
    const subscribers = new Set<() => void>();
    w.__BONUS_DEBUG__ = {
      events: state,
      enabled: isEnabled(),
      lastTraceId: null,
      snapshot: () => [...state],
      export: () => {
        const json = JSON.stringify(state, null, 2);
        try {
          navigator.clipboard?.writeText(json);
        } catch {
          /* ignore */
        }
        return json;
      },
      clear: () => {
        state.length = 0;
        w.__BONUS_DEBUG__!.notify();
      },
      subscribers,
      subscribe: (fn: () => void) => {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
      notify: () => {
        subscribers.forEach((fn) => {
          try {
            fn();
          } catch {
            /* ignore */
          }
        });
      },
    };
  }
  return w.__BONUS_DEBUG__;
}

function push(event: BonusDebugEvent) {
  const g = ensureGlobal();
  if (!g) return;
  g.events.push(event);
  if (g.events.length > MAX_BUFFER) {
    g.events.splice(0, g.events.length - MAX_BUFFER);
  }
  g.notify();
  // Console mirror (fácil de copiar do DevTools)
  // eslint-disable-next-line no-console
  console.debug(`[BONUS_DBG] ${event.stage}`, event.payload || {});
}

export const bonusDebug = {
  get enabled() {
    const g = ensureGlobal();
    if (!g) return false;
    g.enabled = isEnabled();
    return g.enabled;
  },

  newTraceId(): string {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const g = ensureGlobal();
    if (g) g.lastTraceId = id;
    return id;
  },

  stage(
    stage: BonusDebugStage | string,
    traceId: string,
    projetoId: string | undefined,
    payload?: Record<string, unknown>
  ) {
    if (!this.enabled) return;
    push({ ts: Date.now(), traceId, stage, projetoId, payload });
  },

  filter(
    stage: BonusDebugStage | string,
    traceId: string,
    projetoId: string | undefined,
    data: BonusDebugFilterEvent
  ) {
    if (!this.enabled) return;
    const dropped = data.inputCount - data.outputCount;
    push({
      ts: Date.now(),
      traceId,
      stage,
      projetoId,
      payload: {
        inputCount: data.inputCount,
        outputCount: data.outputCount,
        droppedCount: dropped,
        rule: data.rule,
        reason: data.reason,
        droppedSamples: (data.droppedSamples || []).slice(0, 5),
      },
    });
  },

  query(
    label: string,
    traceId: string,
    projetoId: string | undefined,
    info: { params?: unknown; rows?: number; error?: unknown; ms?: number; sample?: unknown[] }
  ) {
    if (!this.enabled) return;
    push({
      ts: Date.now(),
      traceId,
      stage: label,
      projetoId,
      payload: {
        params: info.params,
        rows: info.rows,
        error: info.error ? String((info.error as Error)?.message ?? info.error) : undefined,
        ms: info.ms,
        sample: (info.sample || []).slice(0, 3),
      },
    });
  },
};

// Boot: garantir global mesmo antes do primeiro evento
ensureGlobal();