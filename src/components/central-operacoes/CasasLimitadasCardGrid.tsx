/**
 * CasasLimitadasCardGrid — Grid de cards para casas limitadas
 */

import { Button } from "@/components/ui/button";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { Alerta } from "@/hooks/useCentralOperacoesData";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", USDT: "US$", USDC: "US$", MXN: "MX$",
};

function formatVal(valor: number, moeda: string) {
  const sym = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${sym} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CasasLimitadasCardGridProps {
  alertas: Alerta[];
  onSacar: (alerta: Alerta) => void;
  onFantasma: (alerta: Alerta) => void;
}

export function CasasLimitadasCardGrid({ alertas, onSacar, onFantasma }: CasasLimitadasCardGridProps) {
  if (alertas.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma casa encontrada com os filtros aplicados.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {alertas.map((alerta) => {
        const parceiroShort = alerta.parceiro_nome ? getFirstLastName(alerta.parceiro_nome) : "";
        const moeda = alerta.moeda || "BRL";
        const valor = alerta.valor || 0;

        return (
          <div
            key={alerta.entidade_id}
            className={cn(
              "group rounded-xl border p-3 transition-all duration-200",
              "bg-card/80 border-orange-500/20",
              "hover:border-orange-500/40 hover:shadow-sm"
            )}
          >
            {/* Row 1: Logo + Name + Value */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <BookmakerLogo logoUrl={alerta.bookmaker_logo_url} alt={alerta.titulo} size="h-5 w-5" iconSize="h-3 w-3" />
                <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{alerta.titulo}</span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0">
                <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap">{formatVal(valor, moeda)}</span>
                <span className="text-[9px] text-muted-foreground font-mono">{moeda}</span>
              </div>
            </div>

            {/* Row 2: Parceiro */}
            {parceiroShort && (
              <div className="mt-1.5">
                <span className="text-[11px] text-muted-foreground truncate">{parceiroShort}</span>
              </div>
            )}

            {/* Row 3: Sublabel + Ações */}
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-[9px] text-muted-foreground/70">Sacar ou realocar saldo</span>
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => onFantasma(alerta)} className="h-6 text-[10px] px-2 gap-1 border-destructive/30 text-destructive hover:bg-destructive/10">
                        <Ghost className="h-3 w-3" />Fantasma
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-3 space-y-1">
                      <p className="font-medium text-sm">Saldo Fantasma</p>
                      <p className="text-xs text-muted-foreground">Registra como perda operacional o saldo residual que não pode ser sacado.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button size="sm" onClick={() => onSacar(alerta)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
                  Sacar
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
