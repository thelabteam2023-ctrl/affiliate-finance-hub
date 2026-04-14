/**
 * AlertasLucroCardGrid — Grid de cards para marcos de lucro atingidos
 */

import { Button } from "@/components/ui/button";
import { TrendingUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { AlertaLucroParceiro } from "@/hooks/useCentralOperacoesData";

function formatVal(valor: number) {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface AlertasLucroCardGridProps {
  alertas: AlertaLucroParceiro[];
  onConfirmar: (alerta: AlertaLucroParceiro) => void;
}

export function AlertasLucroCardGrid({ alertas, onConfirmar }: AlertasLucroCardGridProps) {
  if (alertas.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhum marco de lucro pendente.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {alertas.map((alerta) => (
        <div
          key={alerta.id}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200",
            "bg-card/80 border-emerald-500/20",
            "hover:border-emerald-500/40 hover:shadow-sm"
          )}
        >
          {/* Row 1: Icon + Name + Marco */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">
                {getFirstLastName(alerta.parceiro_nome)}
              </span>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums whitespace-nowrap flex-shrink-0">
              {formatVal(alerta.marco_valor)}
            </span>
          </div>

          {/* Row 2: Lucro atual */}
          <div className="mt-1.5">
            <span className="text-[11px] text-muted-foreground">
              Lucro atual: {formatVal(alerta.lucro_atual)}
            </span>
          </div>

          {/* Row 3: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onConfirmar(alerta)}
              className="h-6 text-[10px] px-2.5 shrink-0 font-semibold gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />OK
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
