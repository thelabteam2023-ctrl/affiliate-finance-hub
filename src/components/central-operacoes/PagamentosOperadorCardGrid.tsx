/**
 * PagamentosOperadorCardGrid — Grid de cards para pagamentos de operador
 */

import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PagamentoOperadorPendente } from "@/hooks/useCentralOperacoesData";

function formatVal(valor: number) {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PagamentosOperadorCardGridProps {
  pagamentos: PagamentoOperadorPendente[];
  onPagar: (pag: PagamentoOperadorPendente) => void;
}

export function PagamentosOperadorCardGrid({ pagamentos, onPagar }: PagamentosOperadorCardGridProps) {
  if (pagamentos.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhum pagamento pendente.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {pagamentos.map((pag) => (
        <div
          key={pag.id}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200 cursor-pointer",
            "bg-card/80 border-border/50",
            "hover:border-border hover:shadow-sm"
          )}
          onClick={() => onPagar(pag)}
        >
          {/* Row 1: Icon + Name + Value */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{pag.operador_nome}</span>
            </div>
            <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap flex-shrink-0">
              {formatVal(pag.valor)}
            </span>
          </div>

          {/* Row 2: Tipo + Projeto */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground font-medium">
              {pag.tipo_pagamento}
            </span>
            {pag.projeto_nome && (
              <span className="text-[11px] text-muted-foreground truncate">{pag.projeto_nome}</span>
            )}
          </div>

          {/* Row 3: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onPagar(pag); }} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Pagar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
