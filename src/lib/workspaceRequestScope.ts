import { getTabWorkspaceId } from "@/lib/tabWorkspace";

const PATCH_FLAG = "__lovable_workspace_fetch_patched__";

function shouldPatchUrl(url: string): boolean {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (typeof base !== "string" || base.length === 0 || !url.startsWith(base)) {
    return false;
  }

  // IMPORTANT: only inject workspace header on backend functions.
  // Injecting custom headers on REST/Auth endpoints can trigger CORS/preflight
  // rejections and block app bootstrap (infinite "Carregando...").
  return url.includes("/functions/v1/");
}

/**
 * Patches window.fetch (idempotent) to inject `x-workspace-id` into every
 * backend request, using the current tab workspace (sessionStorage).
 *
 * This is the missing link between the UI-selected workspace and RLS that
 * depends on `get_current_workspace()`.
 */
export function initWorkspaceRequestScope() {
  const w = window as unknown as Record<string, unknown>;
  if (w[PATCH_FLAG]) return;
  w[PATCH_FLAG] = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();

    if (!shouldPatchUrl(url)) {
      return originalFetch(input as any, init);
    }

    const workspaceId = getTabWorkspaceId();
    if (!workspaceId) {
      return originalFetch(input as any, init);
    }

    const baseHeaders =
      init?.headers ?? (input instanceof Request ? input.headers : undefined);

    const headers = new Headers(baseHeaders);
    if (!headers.has("x-workspace-id")) {
      headers.set("x-workspace-id", workspaceId);
    }

    // If input is a Request, clone it with merged headers to preserve method/body.
    if (input instanceof Request) {
      const req = new Request(input, { ...init, headers });
      return originalFetch(req);
    }

    return originalFetch(input as any, { ...init, headers });
  };
}
