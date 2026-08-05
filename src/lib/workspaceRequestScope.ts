import { getTabWorkspaceId } from "@/lib/tabWorkspace";

const PATCH_FLAG = "__lovable_workspace_fetch_patched__";

function shouldPatchUrl(url: string): boolean {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (typeof base !== "string" || base.length === 0 || !url.startsWith(base)) {
    return false;
  }

  // We inject on Edge Functions and REST (PostgREST).
  // We EXPLICITLY avoid Auth and Storage to prevent CORS issues on bootstrap.
  const isFunction = url.includes("/functions/v1/");
  const isRest = url.includes("/rest/v1/");
  
  return isFunction || isRest;
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
    // Determine the URL string safely
    let urlString = "";
    if (typeof input === "string") {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.toString();
    } else if (input && typeof input === "object" && "url" in input) {
      urlString = (input as Request).url;
    }

    if (!shouldPatchUrl(urlString)) {
      return originalFetch(input, init);
    }

    const workspaceId = getTabWorkspaceId();
    if (!workspaceId) {
      return originalFetch(input, init);
    }

    // Safety: only use native constructors if they are available
    if (typeof Headers !== "function" || typeof Request !== "function") {
      console.warn("[WorkspaceRequestScope] Headers/Request constructor missing, skipping patch");
      return originalFetch(input, init);
    }

    try {
      const baseHeaders =
        init?.headers ?? (input instanceof Request ? input.headers : undefined);

      const headers = new Headers(baseHeaders);
      if (!headers.has("x-workspace-id")) {
        headers.set("x-workspace-id", workspaceId);
      }

      if (input instanceof Request) {
        // Clone request with new headers
        const req = new Request(input, { ...init, headers });
        return originalFetch(req);
      }

      return originalFetch(input, { ...init, headers });
    } catch (err) {
      console.error("[WorkspaceRequestScope] Failed to apply workspace headers:", err);
      return originalFetch(input, init);
    }
  };
}
