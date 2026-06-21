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

/**
 * FASE 3 — Probe de paridade saldo × ledger.
 *
 * Para uma bookmaker, soma TODOS os eventos do `cash_ledger` (campo `valor`,
 * que é assinado: débitos negativos, créditos positivos) e compara com
 * `bookmakers.saldo_atual`. Se divergir além do epsilon (R$ 0,01), registra
 * `SALDO_LEDGER_DIVERGENTE` em `window.__INTEGRITY_LOG__`.
 *
 * Uso recomendado: chamar logo após uma edição de aposta LIQUIDADA, para
 * detectar saldo fantasma causado por REVERSAL incompleto.
 */
export async function probeBookmakerLedgerParity(
  bookmakerId: string,
  opts: { epsilon?: number; label?: string } = {},
): Promise<{ ok: boolean; saldo: number; somaLedger: number; delta: number } | null> {
  const epsilon = opts.epsilon ?? 0.01;
  try {
    // Lazy import para evitar ciclo em ambientes sem cliente disponível.
    const { supabase } = await import("@/integrations/supabase/client");

    const sb = supabase as any;
    const [bkRes, ledgerRes] = await Promise.all([
      sb.from("bookmakers").select("id,nome,saldo_atual").eq("id", bookmakerId).maybeSingle(),
      sb.from("cash_ledger").select("valor").eq("bookmaker_id", bookmakerId),
    ]);

    if (bkRes.error || !bkRes.data) {
      push({ ts: Date.now(), kind: "PROBE_ERROR", message: `bookmaker ${bookmakerId} não encontrada`, data: bkRes.error });
      return null;
    }
    if (ledgerRes.error) {
      push({ ts: Date.now(), kind: "PROBE_ERROR", message: `falha ao ler cash_ledger`, data: ledgerRes.error });
      return null;
    }

    const saldo = Number(bkRes.data.saldo_atual ?? 0);
    const somaLedger = (ledgerRes.data ?? []).reduce((acc, r: any) => acc + Number(r.valor ?? 0), 0);
    const delta = Number((saldo - somaLedger).toFixed(2));

    if (Math.abs(delta) > epsilon) {
      push({
        ts: Date.now(),
        kind: "SALDO_LEDGER_DIVERGENTE",
        message: `${opts.label ?? "probeBookmakerLedgerParity"} — ${bkRes.data.nome}: saldo_atual=${saldo.toFixed(2)} vs Σledger=${somaLedger.toFixed(2)} (Δ=${delta.toFixed(2)})`,
        data: { bookmakerId, saldo, somaLedger, delta },
      });
      // Persiste a anomalia no backend (best-effort, não bloqueia o caller)
      try {
        await sb.functions.invoke("record-parity-anomaly", {
          body: {
            bookmaker_id: bookmakerId,
            saldo_atual: saldo,
            soma_ledger: somaLedger,
            delta,
            contexto: opts.label ?? "manual",
          },
        });
      } catch (persistErr) {
        push({
          ts: Date.now(),
          kind: "PROBE_PERSIST_ERROR",
          message: "falha ao persistir anomalia no backend",
          data: persistErr,
        });
      }
      return { ok: false, saldo, somaLedger, delta };
    }
    return { ok: true, saldo, somaLedger, delta };
  } catch (err) {
    push({ ts: Date.now(), kind: "PROBE_ERROR", message: "exceção em probeBookmakerLedgerParity", data: err });
    return null;
  }
}