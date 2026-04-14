/**
 * EntregasPendentesCardGrid — Grid de cards para entregas pendentes
 */

import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntregaPendente } from "@/hooks/useCentralOperacoesData";

function formatVal(valor: number) {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface EntregasPendentesCardGridProps {
  entregas: EntregaPendente[];
  onConciliar: (entrega: EntregaPendente) => void;
}

export function EntregasPendentesCardGrid({ entregas, onConciliar }: EntregasPendentesCardGridProps) {
  if (entregas.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma entrega pendente.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {entregas.map((entrega) => (
        <div
          key={entrega.id}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200",
            "bg-card/80",
            entrega.nivel_urgencia === "CRITICA"
              ? "border-destructive/30 hover:border-destructive/50"
              : "border-border/50 hover:border-border",
            "hover:shadow-sm"
          )}
        >
          {/* Row 1: Icon + Operador + Valor */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <Package className={cn("h-4 w-4 flex-shrink-0", entrega.nivel_urgencia === "CRITICA" ? "text-destructive" : "text-muted-foreground")} />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{entrega.operador_nome}</span>
            </div>
            <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap flex-shrink-0">
              {formatVal(entrega.resultado_nominal)}
            </span>
          </div>

          {/* Row 2: Projeto + Entrega */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[11px] text-muted-foreground truncate">{entrega.projeto_nome}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground font-medium">
              Entrega #{entrega.numero_entrega}
            </span>
          </div>

          {/* Row 3: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button size="sm" onClick={() => onConciliar(entrega)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Conciliar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
