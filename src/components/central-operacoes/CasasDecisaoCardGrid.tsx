/**
 * CasasDecisaoCardGrid — Grid de cards para casas aguardando decisão e desvinculadas
 */

import { Button } from "@/components/ui/button";
import { Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { BookmakerDesvinculado } from "@/hooks/useCentralOperacoesData";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", USDT: "US$", USDC: "US$", MXN: "MX$",
};

function formatVal(valor: number, moeda: string) {
  const sym = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${sym} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CasasDecisaoCardGridProps {
  casas: BookmakerDesvinculado[];
  variant: "decisao" | "desvinculada";
  onPrimary: (casa: BookmakerDesvinculado) => void;
  onSecondary: (casa: BookmakerDesvinculado) => void;
}

export function CasasDecisaoCardGrid({ casas, variant, onPrimary, onSecondary }: CasasDecisaoCardGridProps) {
  if (casas.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma casa encontrada.</p>;
  }

  const isDec = variant === "decisao";

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {casas.map((casa) => {
        const parceiroShort = casa.parceiro_nome ? getFirstLastName(casa.parceiro_nome) : "Sem parceiro";
        return (
          <div
            key={casa.id}
            className={cn(
              "group rounded-xl border p-3 transition-all duration-200",
              "bg-card/80",
              isDec ? "border-purple-500/20 hover:border-purple-500/40" : "border-border/50 hover:border-border",
              "hover:shadow-sm"
            )}
          >
            {/* Row 1: Icon + Name + Value */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <Unlink className={cn("h-4 w-4 flex-shrink-0", isDec ? "text-purple-400" : "text-muted-foreground")} />
                <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{casa.nome}</span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0">
                <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap">{formatVal(casa.saldo_efetivo, casa.moeda)}</span>
                <span className="text-[9px] text-muted-foreground font-mono">{casa.moeda}</span>
              </div>
            </div>

            {/* Row 2: Parceiro */}
            <div className="mt-1.5">
              <span className="text-[11px] text-muted-foreground truncate">{parceiroShort}</span>
            </div>

            {/* Row 3: Ações */}
            <div className="flex items-center justify-end gap-1 mt-2">
              {isDec ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => onPrimary(casa)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
                    Disponibilizar
                  </Button>
                  <Button size="sm" onClick={() => onSecondary(casa)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
                    Marcar Saque
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => onPrimary(casa)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
                    Sacar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onSecondary(casa)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
                    Ciente
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
