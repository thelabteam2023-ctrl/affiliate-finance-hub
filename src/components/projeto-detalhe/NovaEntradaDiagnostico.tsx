import { useEffect, useState } from "react";
import { X, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface DiagnosticoPayload {
  timestamp: string;
  id_gerado: string | null;
  erro: string | null;
  campos_analiticos: {
    is_novo_formulario?: boolean | null;
    mercado_categoria?: string | null;
    mercado_objeto?: string | null;
    mercado_display?: string | null;
    estrategia?: string | null;
    projeto_id?: string | null;
  };
  estrategia_esperada: string;
}

type Status = "success" | "warning" | "error";

interface RowVerificada {
  id: string;
  estrategia: string | null;
  is_novo_formulario: boolean | null;
  mercado: string | null;
  mercado_categoria: string | null;
  projeto_id: string | null;
}

interface Props {
  diag: DiagnosticoPayload | null;
  onClose: () => void;
}

export function NovaEntradaDiagnostico({ diag, onClose }: Props) {
  const [row, setRow] = useState<RowVerificada | null>(null);
  const [rowLoading, setRowLoading] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Auto-dismiss após 30s
  useEffect(() => {
    if (!diag) return;
    const t = setTimeout(onClose, 30000);
    return () => clearTimeout(t);
  }, [diag, onClose]);

  // Verificação pós-salvamento
  useEffect(() => {
    if (!diag?.id_gerado) {
      setRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRowLoading(true);
      setRowError(null);
      const { data, error } = await supabase
        .from("apostas_unificada")
        .select("id, mercado, mercado_categoria, is_novo_formulario, estrategia, projeto_id")
        .eq("id", diag.id_gerado)
        .maybeSingle();
      if (cancelled) return;
      if (error) setRowError(error.message);
      setRow((data as RowVerificada | null) ?? null);
      setRowLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [diag?.id_gerado]);

  if (!diag) return null;

  // Determinar status global
  let status: Status = "success";
  const warnings: string[] = [];
  if (diag.erro || !diag.id_gerado) {
    status = "error";
  } else {
    if (!diag.campos_analiticos.is_novo_formulario) {
      warnings.push("is_novo_formulario está false/null no payload");
      status = "warning";
    }
    if (
      !diag.campos_analiticos.estrategia ||
      diag.campos_analiticos.estrategia !== diag.estrategia_esperada
    ) {
      warnings.push(
        `estrategia=${diag.campos_analiticos.estrategia || "vazio"} (esperado ${diag.estrategia_esperada})`,
      );
      status = "warning";
    }
    if (row) {
      if (row.estrategia !== diag.estrategia_esperada) {
        warnings.push(`Banco gravou estrategia=${row.estrategia}`);
        status = "warning";
      }
      if (!row.is_novo_formulario) {
        warnings.push("Banco gravou is_novo_formulario=false");
        status = "warning";
      }
    } else if (!rowLoading && diag.id_gerado) {
      warnings.push("Aposta NÃO encontrada no banco após save");
      status = "warning";
    }
  }

  const palette: Record<Status, { border: string; bg: string; icon: JSX.Element; label: string }> = {
    success: {
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/10",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      label: "Sucesso",
    },
    warning: {
      border: "border-amber-500/40",
      bg: "bg-amber-500/10",
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      label: "Atenção",
    },
    error: {
      border: "border-destructive/40",
      bg: "bg-destructive/10",
      icon: <XCircle className="h-4 w-4 text-destructive" />,
      label: "Erro",
    },
  };
  const p = palette[status];

  const fmtBool = (v: boolean | null | undefined) =>
    v === true ? "true" : v === false ? "false" : "—";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[100] w-[360px] max-w-[calc(100vw-2rem)]",
        "rounded-lg border shadow-xl backdrop-blur",
        "bg-card/95 text-card-foreground",
        p.border,
      )}
      role="status"
      aria-live="polite"
    >
      <div className={cn("flex items-center justify-between gap-2 px-3 py-2 rounded-t-lg", p.bg)}>
        <div className="flex items-center gap-2 min-w-0">
          {p.icon}
          <span className="text-xs font-semibold uppercase tracking-wider truncate">
            Diagnóstico · {p.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-background/40 transition-colors shrink-0"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2 text-[11px]">
        <Row label="Timestamp" value={new Date(diag.timestamp).toLocaleTimeString()} />
        <Row label="ID gerado" value={diag.id_gerado || "—"} mono />
        {diag.erro && (
          <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">
            <div className="font-semibold mb-0.5">Erro Supabase</div>
            <div className="font-mono text-[10px] break-all">{diag.erro}</div>
          </div>
        )}

        <div className="pt-1 border-t border-border/50">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Payload enviado
          </div>
          <Row label="estrategia" value={diag.campos_analiticos.estrategia || "—"} />
          <Row
            label="is_novo_formulario"
            value={fmtBool(diag.campos_analiticos.is_novo_formulario)}
          />
          <Row label="categoria" value={diag.campos_analiticos.mercado_categoria || "—"} />
          <Row label="objeto" value={diag.campos_analiticos.mercado_objeto || "—"} />
          <Row label="display" value={diag.campos_analiticos.mercado_display || "—"} />
        </div>

        {diag.id_gerado && (
          <div className="pt-1 border-t border-border/50">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Verificação no banco
            </div>
            {rowLoading ? (
              <div className="text-muted-foreground">Consultando…</div>
            ) : rowError ? (
              <div className="text-destructive">{rowError}</div>
            ) : !row ? (
              <div className="text-amber-600 dark:text-amber-400">
                Aposta NÃO encontrada (RLS ou ID inválido)
              </div>
            ) : (
              <>
                <Row label="Encontrada" value="SIM" />
                <Row label="estrategia DB" value={row.estrategia || "—"} />
                <Row
                  label="is_novo_formulario DB"
                  value={fmtBool(row.is_novo_formulario)}
                />
                <Row label="projeto_id" value={row.projeto_id || "—"} mono />
              </>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="pt-1 border-t border-border/50">
            <div className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
              Avisos
            </div>
            <ul className="space-y-0.5 list-disc list-inside text-amber-700 dark:text-amber-300">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground text-right pt-1">
          Fecha em 30s
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span
        className={cn(
          "text-right break-all min-w-0",
          mono && "font-mono text-[10px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}