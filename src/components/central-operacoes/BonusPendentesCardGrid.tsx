/**
 * BonusPendentesCardGrid — Grid de cards para bônus de indicadores
 */

import { Button } from "@/components/ui/button";
import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BonusPendente } from "@/hooks/useCentralOperacoesData";

function formatVal(valor: number) {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface BonusPendentesCardGridProps {
  bonus: BonusPendente[];
  onPagar: (bonus: BonusPendente) => void;
}

export function BonusPendentesCardGrid({ bonus, onPagar }: BonusPendentesCardGridProps) {
  if (bonus.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhum bônus pendente.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {bonus.map((b) => (
        <div
          key={b.indicadorId}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200",
            "bg-card/80 border-border/50",
            "hover:border-border hover:shadow-sm"
          )}
        >
          {/* Row 1: Icon + Indicador + Valor */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <Gift className="h-4 w-4 text-pink-400 flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{b.indicadorNome}</span>
            </div>
            <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap flex-shrink-0">
              {formatVal(b.totalBonusPendente)}
            </span>
          </div>

          {/* Row 2: Ciclos info */}
          <div className="mt-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 font-medium">
              {b.ciclosPendentes} ciclo{b.ciclosPendentes > 1 ? "s" : ""} pendente{b.ciclosPendentes > 1 ? "s" : ""}
            </span>
          </div>

          {/* Row 3: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button size="sm" onClick={() => onPagar(b)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Pagar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
