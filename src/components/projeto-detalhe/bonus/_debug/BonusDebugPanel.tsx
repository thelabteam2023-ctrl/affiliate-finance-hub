import { useEffect, useState } from "react";
import { bonusDebug, type BonusDebugEvent } from "@/lib/debug/bonusTabDebugger";
import { Button } from "@/components/ui/button";
import { Bug, Copy, Trash2, X } from "lucide-react";

/**
 * Painel flutuante de diagnóstico da aba Bônus.
 * Só renderiza quando bonusDebug.enabled === true.
 */
export function BonusDebugPanel() {
  const [enabled, setEnabled] = useState(bonusDebug.enabled);
  const [events, setEvents] = useState<BonusDebugEvent[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setEnabled(bonusDebug.enabled);
    if (typeof window === "undefined") return;
    const g = (window as unknown as { __BONUS_DEBUG__?: { subscribe: (fn: () => void) => () => void; events: BonusDebugEvent[] } }).__BONUS_DEBUG__;
    if (!g) return;
    setEvents([...g.events]);
    const unsub = g.subscribe(() => setEvents([...g.events]));
    return () => {
      unsub();
    };
  }, []);

  if (!enabled) return null;

  const last = events.slice(-40).reverse();
  const filterStages = events.filter((e) =>
    typeof e.stage === "string" && (e.stage.startsWith("FILTER.") || e.stage.startsWith("QUERY."))
  );

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] w-[420px] max-h-[70vh] rounded-lg border border-border bg-background/95 shadow-2xl backdrop-blur flex flex-col"
      style={{ fontFamily: "ui-monospace, monospace" }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Bug className="h-3.5 w-3.5" />
          Bonus Debug ({events.length})
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title="Copiar snapshot"
            onClick={() => {
              const json = (window as any).__BONUS_DEBUG__?.export?.();
              // eslint-disable-next-line no-console
              console.log("[BONUS_DBG] snapshot copiado", json?.length ?? 0, "chars");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title="Limpar buffer"
            onClick={() => (window as any).__BONUS_DEBUG__?.clear?.()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title={open ? "Minimizar" : "Expandir"}
            onClick={() => setOpen((o) => !o)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="flex-1 overflow-auto text-[11px] leading-tight">
          <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
            <div className="font-semibold mb-1">Descartes (últimos)</div>
            {filterStages.length === 0 && <div className="text-muted-foreground">nenhum</div>}
            {filterStages.slice(-8).reverse().map((e, i) => {
              const p = e.payload as any;
              return (
                <div key={i} className="mb-1">
                  <span className="font-semibold">{e.stage}</span>{" "}
                  <span className="text-muted-foreground">
                    {p?.rows !== undefined
                      ? `rows=${p.rows}`
                      : `${p?.inputCount ?? "?"}→${p?.outputCount ?? "?"}`}
                  </span>{" "}
                  <span className="opacity-70">{p?.rule || p?.reason || ""}</span>
                </div>
              );
            })}
          </div>

          <div className="px-3 py-2">
            <div className="font-semibold mb-1">Timeline</div>
            {last.map((e, i) => (
              <div key={i} className="mb-0.5">
                <span className="text-muted-foreground">
                  {new Date(e.ts).toLocaleTimeString("pt-BR", { hour12: false })}
                </span>{" "}
                <span className="font-semibold">{e.stage}</span>{" "}
                <span className="opacity-70">{summary(e.payload)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function summary(payload?: Record<string, unknown>) {
  if (!payload) return "";
  const keys = ["rows", "inputCount", "outputCount", "droppedCount", "rule", "ms"];
  return keys
    .filter((k) => payload[k] !== undefined)
    .map((k) => `${k}=${JSON.stringify(payload[k])}`)
    .join(" ");
}