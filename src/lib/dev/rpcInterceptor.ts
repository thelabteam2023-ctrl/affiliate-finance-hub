/**
 * RPC Call Interceptor — captura todas as chamadas supabase.rpc() para o Ledger Monitor.
 * Buffer em memória (max 500 entries), apenas frontend, zero impacto em produção.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RpcCallLog {
  id: string;
  fn_name: string;
  args: unknown;
  status: "pending" | "success" | "error";
  duration_ms: number | null;
  error: string | null;
  result_preview: string | null;
  started_at: string;
}

const MAX_LOGS = 500;
const buffer: RpcCallLog[] = [];
const listeners = new Set<() => void>();
let installed = false;

export function getRpcLogs(): RpcCallLog[] {
  return buffer;
}

export function clearRpcLogs() {
  buffer.length = 0;
  listeners.forEach((fn) => fn());
}

export function subscribeRpcLogs(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

function pushLog(log: RpcCallLog) {
  buffer.unshift(log);
  if (buffer.length > MAX_LOGS) buffer.length = MAX_LOGS;
  notify();
}

export function installRpcInterceptor() {
  if (installed) return;
  installed = true;

  const originalRpc = supabase.rpc.bind(supabase);
  
  (supabase as any).rpc = (fn: string, args?: unknown, options?: unknown) => {
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const log: RpcCallLog = {
      id,
      fn_name: fn,
      args: args ?? null,
      status: "pending",
      duration_ms: null,
      error: null,
      result_preview: null,
      started_at: startedAt,
    };
    pushLog(log);

    
    const builder = (originalRpc as any)(fn, args, options);

    const originalThen = builder.then.bind(builder);
    builder.then = (onFulfilled: any, onRejected: any) =>
      originalThen(
        (res: any) => {
          const duration = Math.round(performance.now() - t0);
          log.duration_ms = duration;
          if (res?.error) {
            log.status = "error";
            log.error = String(res.error.message || res.error);
          } else {
            log.status = "success";
            try {
              const preview = JSON.stringify(res?.data);
              log.result_preview = preview ? preview.slice(0, 200) : null;
            } catch {
              log.result_preview = "[unserializable]";
            }
          }
          notify();
          return onFulfilled ? onFulfilled(res) : res;
        },
        (err: any) => {
          log.duration_ms = Math.round(performance.now() - t0);
          log.status = "error";
          log.error = String(err?.message || err);
          notify();
          if (onRejected) return onRejected(err);
          throw err;
        }
      );

    return builder;
  };
}
