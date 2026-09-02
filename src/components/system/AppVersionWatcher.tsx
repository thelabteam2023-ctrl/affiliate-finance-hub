import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { hardReload } from "@/lib/lazyWithRetry";

/**
 * Detecta que uma versão nova do app foi publicada comparando o script principal
 * declarado no index.html servido com o que esta aba está executando.
 * Ao divergir, oferece atualização antes que o usuário esbarre em chunk 404.
 */

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function currentEntryScript(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const entry = scripts.map((s) => s.getAttribute("src") || "").find((src) => src.includes("/assets/"));
  return entry || null;
}

async function fetchServedEntryScript(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function AppVersionWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const local = currentEntryScript();
    if (!local) return;

    let cancelled = false;

    const check = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const served = await fetchServedEntryScript();
      if (cancelled || !served) return;
      if (served !== local) setStale(true);
    };

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]">
      <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
        <span className="text-sm text-muted-foreground">Nova versão disponível</span>
        <button
          onClick={hardReload}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>
    </div>
  );
}
