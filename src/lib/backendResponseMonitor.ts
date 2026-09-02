import { logError } from "@/lib/errorLogger";

/**
 * Backend response monitor (Etapa 3 — instrumentação permanente).
 *
 * Objetivo: quando uma requisição ao backend falhar em produção, deixar
 * rastro estruturado no console (endpoint, status, corpo, request id) para
 * que a captura de runtime do preview registre a evidência automaticamente.
 *
 * Não altera nenhuma requisição — apenas observa a resposta.
 */

const PATCH_FLAG = "__lovable_backend_response_monitor__";
const MAX_BODY_CHARS = 1200;

export type BackendFailure = {
  url: string;
  method: string;
  status: number;
  statusText: string;
  body: string;
  requestId: string | null;
  at: string;
};

const recentFailures: BackendFailure[] = [];
const MAX_RECENT = 25;

export function getRecentBackendFailures(): BackendFailure[] {
  return [...recentFailures];
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input === "object" && "url" in input) return (input as Request).url;
  return "";
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function isBackendUrl(url: string): boolean {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (typeof base === "string" && base.length > 0 && url.startsWith(base)) return true;
  // Navegações/assets do próprio host também interessam (5xx da borda/CDN).
  return url.startsWith("/") || (typeof location !== "undefined" && url.startsWith(location.origin));
}

async function readBody(response: Response): Promise<string> {
  try {
    const text = await response.clone().text();
    return text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…[truncado]` : text;
  } catch {
    return "";
  }
}

export function installBackendResponseMonitor() {
  const w = window as unknown as Record<string, unknown>;
  if (w[PATCH_FLAG]) return;
  w[PATCH_FLAG] = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveUrl(input);

    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (networkError) {
      if (isBackendUrl(url)) {
        console.error("[BackendMonitor] Falha de rede", {
          url,
          method: resolveMethod(input, init),
          error: networkError,
        });
      }
      throw networkError;
    }

    if (!response.ok && isBackendUrl(url)) {
      const failure: BackendFailure = {
        url,
        method: resolveMethod(input, init),
        status: response.status,
        statusText: response.statusText,
        body: await readBody(response),
        requestId:
          response.headers.get("x-request-id") ||
          response.headers.get("cf-ray") ||
          response.headers.get("sb-request-id"),
        at: new Date().toISOString(),
      };

      recentFailures.push(failure);
      if (recentFailures.length > MAX_RECENT) recentFailures.shift();

      console.error(`[BackendMonitor] ${failure.status} ${failure.method} ${failure.url}`, failure);

      // Falhas 5xx são as que precisamos correlacionar com a tela branca.
      if (response.status >= 500) {
        void logError(
          new Error(`Backend ${failure.status} em ${failure.method} ${failure.url}`),
          { ...failure, action: "backend_5xx" },
          "BackendServerError",
        );
      }
    }

    return response;
  };
}
