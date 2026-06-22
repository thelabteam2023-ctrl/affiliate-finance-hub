/**
 * Surebet Lifecycle Probe — observabilidade interna não visual.
 *
 * Coleta evidências do ciclo de vida de uma operação de Arbitragem/Surebet
 * desde o payload do formulário até a renderização da tela.
 *
 * Sem painel visual. Sem dependência de UI. Apenas:
 *  - Buffer em memória em `window.__SUREBET_LIFECYCLE__`
 *  - `console.warn` em divergências (anomalies)
 *  - Persistência best-effort em `debug_logs` via `logDebug`
 *    (nunca bloqueia o salvamento da aposta)
 *
 * Uso típico:
 *   probeCheckpoint('FORM_PAYLOAD_READY', { apostaId: 'pending', payload })
 *   probeCheckpoint('RPC_CREATE_RETURNED', { apostaId: id, success, error })
 *   probeReadByTab({ tab, apostaIdsRaw, apostaIdsMapped, apostaIdsRendered })
 *
 * Esta camada responde automaticamente:
 *   - A aposta foi criada?  (FORM_PAYLOAD_READY + RPC_CREATE_RETURNED)
 *   - Salva corretamente?   (DB_PARENT_VISIBLE + DB_PERNAS_VISIBLE + DB_ENTRIES_VISIBLE)
 *   - Vinculada à operação correta? (campos do payload vs banco)
 *   - Presente no banco?    (DB_PARENT_VISIBLE)
 *   - Retornada pela query? (READ_QUERY_RETURNED)
 *   - Filtrada indevidamente? (FILTER_OUTPUT com reason)
 *   - Chegou ao frontend?   (MAPPER_OUTPUT)
 *   - Descartada em transformação? (MAPPER_OUTPUT dropped)
 *   - Ocultada por regra de negócio? (FILTER_OUTPUT reason)
 */

import { logDebug } from "@/lib/debugLogger";

export type LifecycleCheckpoint =
  | "FORM_PAYLOAD_READY"
  | "RPC_CREATE_SENT"
  | "RPC_CREATE_RETURNED"
  | "DB_PARENT_VISIBLE"
  | "DB_PERNAS_VISIBLE"
  | "DB_ENTRIES_VISIBLE"
  | "READ_QUERY_RETURNED"
  | "MAPPER_OUTPUT"
  | "FILTER_OUTPUT"
  | "RENDER_READY";

export interface LifecycleEvent {
  ts: number;
  checkpoint: LifecycleCheckpoint;
  apostaId?: string | null;
  correlationId?: string | null;
  source?: string;
  data?: Record<string, unknown>;
  anomaly?: string;
}

declare global {
  interface Window {
    __SUREBET_LIFECYCLE__?: {
      events: LifecycleEvent[];
      byAposta: Record<string, LifecycleEvent[]>;
      export: () => string;
      clear: () => void;
      summary: (apostaId: string) => LifecycleEvent[] | undefined;
    };
  }
}

const MAX_EVENTS = 1000;

function ensureBuffer() {
  if (typeof window === "undefined") return null;
  if (!window.__SUREBET_LIFECYCLE__) {
    window.__SUREBET_LIFECYCLE__ = {
      events: [],
      byAposta: {},
      export: () => JSON.stringify(window.__SUREBET_LIFECYCLE__?.events ?? [], null, 2),
      clear: () => {
        if (window.__SUREBET_LIFECYCLE__) {
          window.__SUREBET_LIFECYCLE__.events = [];
          window.__SUREBET_LIFECYCLE__.byAposta = {};
        }
      },
      summary: (apostaId: string) => window.__SUREBET_LIFECYCLE__?.byAposta[apostaId],
    };
  }
  return window.__SUREBET_LIFECYCLE__;
}

function pushEvent(evt: LifecycleEvent) {
  const buf = ensureBuffer();
  if (!buf) return;
  buf.events.push(evt);
  if (buf.events.length > MAX_EVENTS) buf.events.shift();
  const key = evt.apostaId || evt.correlationId || "__unknown__";
  if (!buf.byAposta[key]) buf.byAposta[key] = [];
  buf.byAposta[key].push(evt);
}

/**
 * Registra um checkpoint do ciclo de vida.
 * Persiste em `debug_logs` apenas quando `anomaly` é informado, para não
 * inundar a tabela em fluxos felizes.
 */
export function probeCheckpoint(
  checkpoint: LifecycleCheckpoint,
  params: {
    apostaId?: string | null;
    correlationId?: string | null;
    source?: string;
    data?: Record<string, unknown>;
    anomaly?: string;
  } = {},
): void {
  const evt: LifecycleEvent = {
    ts: Date.now(),
    checkpoint,
    apostaId: params.apostaId ?? null,
    correlationId: params.correlationId ?? null,
    source: params.source,
    data: params.data,
    anomaly: params.anomaly,
  };
  pushEvent(evt);

  if (params.anomaly) {
    // eslint-disable-next-line no-console
    console.warn(
      `[SUREBET_LIFECYCLE] ${checkpoint} anomaly=${params.anomaly}`,
      { apostaId: evt.apostaId, source: evt.source, data: evt.data },
    );
    // Persistência best-effort. Falhas são silenciosas no próprio logger.
    void logDebug({
      modulo: "surebet-lifecycle",
      evento: `${checkpoint}:${params.anomaly}`,
      payload: { apostaId: evt.apostaId, source: evt.source, data: evt.data },
    });
  }
}

/**
 * Helper específico para auditoria de leitura por aba.
 * Compara a contagem nas etapas raw → mapped → rendered e registra
 * anomalias quando uma aposta cai entre etapas.
 */
export function probeReadByTab(params: {
  tab: string;
  projetoId?: string;
  apostaIdsRaw: string[];
  apostaIdsMapped: string[];
  apostaIdsRendered?: string[];
}): void {
  const { tab, projetoId, apostaIdsRaw, apostaIdsMapped, apostaIdsRendered } = params;
  const raw = new Set(apostaIdsRaw);
  const mapped = new Set(apostaIdsMapped);
  const rendered = apostaIdsRendered ? new Set(apostaIdsRendered) : null;

  // Casos: raw mas não mapped → descartado em transformação
  const droppedInMapper: string[] = [];
  raw.forEach((id) => {
    if (!mapped.has(id)) droppedInMapper.push(id);
  });

  // Casos: mapped mas não rendered → removido por filtro
  const droppedInFilter: string[] = [];
  if (rendered) {
    mapped.forEach((id) => {
      if (!rendered.has(id)) droppedInFilter.push(id);
    });
  }

  probeCheckpoint("READ_QUERY_RETURNED", {
    source: tab,
    data: { projetoId, rawCount: raw.size, mappedCount: mapped.size, renderedCount: rendered?.size },
  });

  droppedInMapper.forEach((id) => {
    probeCheckpoint("MAPPER_OUTPUT", {
      apostaId: id,
      source: tab,
      anomaly: "MAPPER_DROPPED_OPERATION",
      data: { projetoId },
    });
  });

  droppedInFilter.forEach((id) => {
    probeCheckpoint("FILTER_OUTPUT", {
      apostaId: id,
      source: tab,
      anomaly: "READ_BUT_FILTERED",
      data: { projetoId },
    });
  });
}

/**
 * Verifica integridade estrutural mínima do payload de criação de Arbitragem.
 */
export function probeCreatePayload(payload: {
  projetoId?: string;
  workspaceId?: string;
  formaRegistro?: string;
  estrategia?: string;
  pernas?: Array<{ bookmaker_id?: string; stake?: number; odd?: number; moeda?: string }>;
}, source: string): void {
  const pernas = payload.pernas || [];
  const anomalies: string[] = [];

  if (!payload.projetoId) anomalies.push("MISSING_PROJETO_ID");
  if (!payload.workspaceId) anomalies.push("MISSING_WORKSPACE_ID");
  if (payload.formaRegistro !== "ARBITRAGEM") anomalies.push("FORMA_REGISTRO_NOT_ARBITRAGEM");
  if (pernas.length < 2) anomalies.push("PERNAS_LT_2");
  pernas.forEach((p, i) => {
    if (!p.bookmaker_id) anomalies.push(`PERNA_${i + 1}_SEM_BOOKMAKER`);
    if (!p.stake || p.stake <= 0) anomalies.push(`PERNA_${i + 1}_STAKE_INVALIDA`);
    if (!p.odd || p.odd <= 1) anomalies.push(`PERNA_${i + 1}_ODD_INVALIDA`);
    if (!p.moeda) anomalies.push(`PERNA_${i + 1}_SEM_MOEDA`);
  });

  probeCheckpoint("FORM_PAYLOAD_READY", {
    source,
    data: {
      projetoId: payload.projetoId,
      workspaceId: payload.workspaceId,
      formaRegistro: payload.formaRegistro,
      estrategia: payload.estrategia,
      pernasCount: pernas.length,
    },
    anomaly: anomalies.length > 0 ? anomalies.join(",") : undefined,
  });
}

/**
 * Audita a criação após o retorno da RPC.
 */
export function probeCreateResult(params: {
  apostaId?: string | null;
  success: boolean;
  source: string;
  error?: unknown;
}): void {
  probeCheckpoint("RPC_CREATE_RETURNED", {
    apostaId: params.apostaId ?? null,
    source: params.source,
    data: { success: params.success, error: params.error ? String((params.error as any)?.message ?? params.error) : undefined },
    anomaly: !params.success
      ? "CREATE_FAILED"
      : !params.apostaId
        ? "CREATE_OK_WITHOUT_ID"
        : undefined,
  });
}
