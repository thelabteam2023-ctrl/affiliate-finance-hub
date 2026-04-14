/**
 * ParticipacoesCardGrid — Grid de cards para participações de investidores
 */

import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParticipacaoPendente } from "@/hooks/useCentralOperacoesData";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£",
};

function formatVal(valor: number, moeda = "BRL") {
  const sym = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${sym} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ParticipacoesCardGridProps {
  participacoes: ParticipacaoPendente[];
  onPagar: (part: ParticipacaoPendente) => void;
}

export function ParticipacoesCardGrid({ participacoes, onPagar }: ParticipacoesCardGridProps) {
  if (participacoes.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma participação pendente.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {participacoes.map((part) => (
        <div
          key={part.id}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200 cursor-pointer",
            "bg-card/80 border-indigo-500/20",
            "hover:border-indigo-500/40 hover:shadow-sm"
          )}
          onClick={() => onPagar(part)}
        >
          {/* Row 1: Icon + Name + Value */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <User className="h-4 w-4 text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{part.investidor_nome}</span>
            </div>
            <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap flex-shrink-0">
              {formatVal(part.valor_participacao)}
            </span>
          </div>

          {/* Row 2: Projeto + Ciclo */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[11px] text-muted-foreground truncate">{part.projeto_nome}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium">
              Ciclo {part.ciclo_numero}
            </span>
          </div>

          {/* Row 3: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onPagar(part); }} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Pagar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
