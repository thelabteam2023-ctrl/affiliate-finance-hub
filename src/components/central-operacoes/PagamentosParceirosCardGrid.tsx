/**
 * PagamentosParceirosCardGrid — Grid de cards para pagamentos a parceiros
 */

import { Button } from "@/components/ui/button";
import { User, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { PagamentoParceiroPendente } from "@/hooks/useCentralOperacoesData";

function formatVal(valor: number) {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PagamentosParceirosCardGridProps {
  pagamentos: PagamentoParceiroPendente[];
  onPagar: (pag: PagamentoParceiroPendente) => void;
  onDispensar: (pag: PagamentoParceiroPendente) => void;
}

export function PagamentosParceirosCardGrid({ pagamentos, onPagar, onDispensar }: PagamentosParceirosCardGridProps) {
  if (pagamentos.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhum pagamento pendente.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {pagamentos.map((pag) => (
        <div
          key={pag.parceriaId}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200",
            "bg-card/80 border-border/50",
            "hover:border-border hover:shadow-sm"
          )}
        >
          {/* Row 1: Icon + Name + Value */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">
                {getFirstLastName(pag.parceiroNome)}
              </span>
            </div>
            <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap flex-shrink-0">
              {formatVal(pag.valorParceiro)}
            </span>
          </div>

          {/* Row 2: Ações */}
          <div className="flex items-center justify-end gap-1 mt-2">
            <Button size="sm" variant="ghost" onClick={() => onDispensar(pag)} className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-destructive">
              <XCircle className="h-3 w-3" />Dispensar
            </Button>
            <Button size="sm" onClick={() => onPagar(pag)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Pagar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
