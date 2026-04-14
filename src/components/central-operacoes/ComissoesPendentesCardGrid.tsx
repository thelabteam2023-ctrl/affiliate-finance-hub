/**
 * ComissoesPendentesCardGrid — Grid de cards para comissões pendentes
 */

import { Button } from "@/components/ui/button";
import { Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { ComissaoPendente } from "@/hooks/useCentralOperacoesData";

function formatVal(valor: number) {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ComissoesPendentesCardGridProps {
  comissoes: ComissaoPendente[];
  onPagar: (comissao: ComissaoPendente) => void;
}

export function ComissoesPendentesCardGrid({ comissoes, onPagar }: ComissoesPendentesCardGridProps) {
  if (comissoes.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma comissão pendente.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {comissoes.map((comissao) => (
        <div
          key={comissao.parceriaId}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200",
            "bg-card/80 border-border/50",
            "hover:border-border hover:shadow-sm"
          )}
        >
          {/* Row 1: Icon + Indicador + Valor */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-teal-400 flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{comissao.indicadorNome}</span>
            </div>
            <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap flex-shrink-0">
              {formatVal(comissao.valorComissao)}
            </span>
          </div>

          {/* Row 2: Parceiro */}
          <div className="mt-1.5">
            <span className="text-[11px] text-muted-foreground truncate">
              → {getFirstLastName(comissao.parceiroNome)}
            </span>
          </div>

          {/* Row 3: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button size="sm" onClick={() => onPagar(comissao)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Pagar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
