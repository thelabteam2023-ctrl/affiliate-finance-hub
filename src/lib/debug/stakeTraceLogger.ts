/**
 * Observabilidade temporária — Auditoria de divergência de Stake.
 *
 * Ativa via:
 *   - localStorage.setItem('stake-trace', '1')
 *   - ou querystring ?debug=stake
 *
 * Registra qualquer divergência entre o stake_consolidado gravado no banco
 * (snapshot congelado no momento do registro) e o valor recomputado em runtime
 * pelos componentes de card (SurebetCard / ApostaCard).
 *
 * Deve ser removido após o encerramento da auditoria (docs/AUDITORIA_STAKE.md).
 */

export interface StakeTraceEvent {
  apostaId?: string | null;
  source: string;
  snapshot: number;
  recomputed: number;
  delta: number;
  moedaConsolidacao?: string | null;
}

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem("stake-trace") === "1") return true;
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "stake";
  } catch {
    return false;
  }
}

const bufferKey = "__stakeTraceBuffer";

export function stakeTraceLog(event: StakeTraceEvent): void {
  if (!isEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.warn("[stake-trace]", event);
    const w = window as any;
    if (!Array.isArray(w[bufferKey])) w[bufferKey] = [];
    w[bufferKey].push({ ts: new Date().toISOString(), ...event });
    if (w[bufferKey].length > 500) w[bufferKey].shift();
  } catch {
    /* noop */
  }
}

export function getStakeTraceBuffer(): StakeTraceEvent[] {
  if (typeof window === "undefined") return [];
  return ((window as any)[bufferKey] as StakeTraceEvent[]) || [];
}

export function clearStakeTraceBuffer(): void {
  if (typeof window === "undefined") return;
  (window as any)[bufferKey] = [];
}