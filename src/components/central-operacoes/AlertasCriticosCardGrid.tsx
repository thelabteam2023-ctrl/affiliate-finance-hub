/**
 * AlertasCriticosCardGrid — Grid de cards para alertas críticos
 */

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alerta } from "@/hooks/useCentralOperacoesData";

interface AlertasCriticosCardGridProps {
  alertas: Alerta[];
}

export function AlertasCriticosCardGrid({ alertas }: AlertasCriticosCardGridProps) {
  if (alertas.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhum alerta crítico.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {alertas.slice(0, 5).map((alerta) => (
        <div
          key={alerta.entidade_id}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200",
            "bg-card/80 border-destructive/30",
            "hover:border-destructive/50 hover:shadow-sm"
          )}
        >
          {/* Row 1: Icon + Título */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate">{alerta.titulo}</span>
            </div>
          </div>

          {/* Row 2: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Resolver
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
