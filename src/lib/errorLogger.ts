import { supabase } from "@/integrations/supabase/client";

/**
 * Global error logger — captura erros em produção e grava em public.error_logs
 * para visualização pelo painel do owner. Não bloqueia execução.
 */

export type ErrorContext = Record<string, unknown> & {
  screen?: string;
  action?: string;
  aposta_id?: string;
  projeto_id?: string;
};

type QueueItem = {
  error_type: string;
  message: string;
  stack?: string | null;
  context?: ErrorContext | null;
};

// Dedupe burst: mesma message+stack em 5s só loga 1x
const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5000;

function keyFor(e: QueueItem): string {
  return `${e.error_type}::${e.message}::${(e.stack || "").slice(0, 200)}`;
}

function safeStr(v: unknown, max = 8000): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : (() => {
    try { return JSON.stringify(v); } catch { return String(v); }
  })();
  return s.length > max ? s.slice(0, max) + "…[truncado]" : s;
}

let currentScreen = "";
export function setErrorScreen(screen: string) {
  currentScreen = screen;
}

let isLogging = false; // evita loops (insert que falha não deve re-logar)

export async function logError(
  err: unknown,
  context: ErrorContext = {},
  type?: string,
): Promise<void> {
  if (isLogging) return;
  try {
    const e = err as any;
    const item: QueueItem = {
      error_type: type || e?.name || (typeof err === "string" ? "StringError" : "Error"),
      message: safeStr(e?.message ?? err, 2000),
      stack: safeStr(e?.stack, 6000) || null,
      context: {
        screen: currentScreen || (typeof location !== "undefined" ? location.pathname : ""),
        ...context,
      },
    };

    const k = keyFor(item);
    const now = Date.now();
    const last = recent.get(k);
    if (last && now - last < DEDUPE_WINDOW_MS) return;
    recent.set(k, now);
    if (recent.size > 200) {
      // GC simples
      for (const [kk, t] of recent) if (now - t > 60000) recent.delete(kk);
    }

    isLogging = true;

    const { data: { user } } = await supabase.auth.getUser();
    const workspaceId =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("workspace_id") || localStorage.getItem("active_workspace_id")
        : null;

    await supabase.from("error_logs").insert({
      error_type: item.error_type.slice(0, 100),
      message: item.message,
      stack: item.stack,
      context: item.context as any,
      user_id: user?.id ?? null,
      workspace_id: workspaceId ?? null,
      url: typeof location !== "undefined" ? location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch {
    // silencioso por design — não queremos cascata de erros
  } finally {
    isLogging = false;
  }
}

let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    logError(event.error || event.message, {
      action: "window.onerror",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    }, "WindowError");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = event.reason;
    logError(reason, { action: "unhandledrejection" }, "UnhandledRejection");
  });
}