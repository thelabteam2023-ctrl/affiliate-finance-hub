/**
 * ConciliacaoPendenteCardGrid — Grid de cards para casas pendentes de conciliação
 */

import { Button } from "@/components/ui/button";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { ShieldAlert, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { CasaPendenteConciliacao } from "@/hooks/useCentralOperacoesData";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", USDT: "US$", USDC: "US$", MXN: "MX$",
};

function formatVal(valor: number, moeda: string) {
  const sym = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${sym} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ConciliacaoPendenteCardGridProps {
  casas: CasaPendenteConciliacao[];
  onConciliar: (casa: CasaPendenteConciliacao) => void;
  onVincular: (casa: CasaPendenteConciliacao) => void;
}

export function ConciliacaoPendenteCardGrid({ casas, onConciliar, onVincular }: ConciliacaoPendenteCardGridProps) {
  if (casas.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma casa pendente de conciliação.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {casas.map((casa) => {
        const parceiroShort = casa.parceiro_nome ? getFirstLastName(casa.parceiro_nome) : "";
        return (
          <div
            key={casa.bookmaker_id}
            className={cn(
              "group rounded-xl border p-3 transition-all duration-200",
              "bg-card/80 border-amber-500/20",
              "hover:border-amber-500/40 hover:shadow-sm"
            )}
          >
            {/* Row 1: Logo + Name + Value */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <BookmakerLogo logoUrl={casa.bookmaker_logo_url} alt={casa.bookmaker_nome} size="h-5 w-5" iconSize="h-3 w-3" />
                <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{casa.bookmaker_nome}</span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0">
                <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap">{formatVal(casa.valor_total_pendente, casa.moeda)}</span>
                <span className="text-[9px] text-muted-foreground font-mono">{casa.moeda}</span>
              </div>
            </div>

            {/* Row 2: Parceiro + Projeto */}
            <div className="flex items-center justify-between gap-1.5 mt-1.5">
              {parceiroShort && (
                <span className="text-[11px] text-muted-foreground truncate">{parceiroShort}</span>
              )}
              <span className="text-[9px] text-muted-foreground/70 truncate">
                {casa.projeto_nome || "Sem projeto"}
              </span>
            </div>

            {/* Row 3: Transações count + Ações */}
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">
                {casa.qtd_transacoes_pendentes} transaç{casa.qtd_transacoes_pendentes === 1 ? "ão" : "ões"}
              </span>
              <div className="flex items-center gap-1">
                {!casa.projeto_nome && (
                  <Button size="sm" variant="ghost" onClick={() => onVincular(casa)} className="h-6 text-[10px] px-1.5">
                    <FolderKanban className="h-3 w-3" />
                  </Button>
                )}
                <Button size="sm" onClick={() => onConciliar(casa)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
                  Conciliar
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
