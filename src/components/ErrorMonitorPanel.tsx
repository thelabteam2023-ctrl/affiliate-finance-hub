import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, X, Check, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

interface ErrorRow {
  id: string;
  occurred_at: string;
  error_type: string | null;
  message: string | null;
  stack: string | null;
  context: any;
  url: string | null;
  resolved: boolean;
}

const POLL_MS = 15000;

export function ErrorMonitorPanel() {
  const { user, role, isSystemOwner } = useAuth();
  const canSee = !!user && (isSystemOwner || role === "owner" || role === "admin");

  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchErrors = useCallback(async () => {
    if (!canSee) return;
    const query = supabase
      .from("error_logs")
      .select("id, occurred_at, error_type, message, stack, context, url, resolved")
      .order("occurred_at", { ascending: false })
      .limit(50);
    const { data } = showAll
      ? await query
      : await query.eq("resolved", false);
    setErrors((data as ErrorRow[]) || []);
  }, [canSee, showAll]);

  useEffect(() => {
    if (!canSee) return;
    fetchErrors();
    const id = setInterval(fetchErrors, POLL_MS);
    return () => clearInterval(id);
  }, [canSee, fetchErrors]);

  const markResolved = async (id: string) => {
    await supabase
      .from("error_logs")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id })
      .eq("id", id);
    setErrors((prev) => prev.filter((e) => e.id !== id));
  };

  if (!canSee) return null;
  const unresolved = errors.filter((e) => !e.resolved).length;

  return (
    <div className="fixed bottom-6 left-6 z-[9998] font-sans">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Monitor de erros"
          className={`relative flex items-center justify-center w-[44px] h-[44px] rounded-full shadow-lg transition ${
            unresolved > 0
              ? "bg-destructive text-destructive-foreground animate-pulse"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
          {unresolved > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] rounded-full bg-background text-destructive text-[11px] font-bold flex items-center justify-center border border-destructive px-1">
              {unresolved > 99 ? "99+" : unresolved}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="w-[420px] max-h-[60vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Erros {showAll ? "(todos)" : "não resolvidos"} · {errors.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchErrors}
                className="p-1 rounded hover:bg-accent"
                title="Atualizar"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowAll((s) => !s)}
                className="text-[11px] px-2 py-1 rounded hover:bg-accent border border-border"
              >
                {showAll ? "Só ativos" : "Ver todos"}
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-accent">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {errors.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhum erro registrado.
              </div>
            )}
            {errors.map((e) => {
              const isOpen = expanded === e.id;
              return (
                <div key={e.id} className="p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                          {e.error_type || "Error"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(e.occurred_at).toLocaleString()}
                        </span>
                        {e.resolved && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                            resolvido
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-foreground break-words">{e.message}</div>
                      {e.context?.screen && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          tela: <span className="font-mono">{e.context.screen}</span>
                          {e.context.action && (
                            <> · ação: <span className="font-mono">{e.context.action}</span></>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        className="p-1 rounded hover:bg-accent"
                        title="Detalhes"
                      >
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {!e.resolved && (
                        <button
                          onClick={() => markResolved(e.id)}
                          className="p-1 rounded hover:bg-emerald-500/10 text-emerald-500"
                          title="Marcar resolvido"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-2 space-y-2">
                      {e.context && (
                        <pre className="text-[10px] bg-muted/40 p-2 rounded overflow-x-auto max-h-40">
                          {JSON.stringify(e.context, null, 2)}
                        </pre>
                      )}
                      {e.stack && (
                        <pre className="text-[10px] bg-muted/40 p-2 rounded overflow-x-auto max-h-60 whitespace-pre-wrap">
                          {e.stack}
                        </pre>
                      )}
                      {e.url && (
                        <div className="text-[10px] text-muted-foreground break-all">{e.url}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}