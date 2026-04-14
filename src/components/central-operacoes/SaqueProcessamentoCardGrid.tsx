/**
 * SaqueProcessamentoCardGrid — Grid de cards para saques pendentes de processamento
 * Design premium seguindo o padrão do SaqueCardGrid
 */

import { Button } from "@/components/ui/button";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { Clock, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { Alerta } from "@/hooks/useCentralOperacoesData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", USDT: "US$", USDC: "US$", MXN: "MX$",
};

function formatVal(valor: number, moeda: string) {
  const sym = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${sym} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface SaqueProcessamentoCardGridProps {
  alertas: Alerta[];
  onProcessar: (alerta: Alerta) => void;
  onCancelar: (alerta: Alerta) => void;
}

export function SaqueProcessamentoCardGrid({ alertas, onProcessar, onCancelar }: SaqueProcessamentoCardGridProps) {
  if (alertas.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhum saque pendente de processamento.
      </p>
    );
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}
    >
      {alertas.map((alerta) => {
        const parceiroShort = alerta.parceiro_nome ? getFirstLastName(alerta.parceiro_nome) : "";
        const moeda = alerta.moeda || "BRL";
        const valor = alerta.valor || 0;

        return (
          <div
            key={alerta.entidade_id}
            className={cn(
              "group rounded-xl border p-3 transition-all duration-200",
              "bg-card/80 border-border/50",
              "hover:border-border hover:shadow-sm"
            )}
          >
            {/* Row 1: Logo + Casa name + Valor */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <BookmakerLogo
                  logoUrl={alerta.bookmaker_logo_url}
                  alt={alerta.titulo}
                  size="h-5 w-5"
                  iconSize="h-3 w-3"
                />
                <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">
                  {alerta.titulo}
                </span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0">
                <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap">
                  {formatVal(valor, moeda)}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono">{moeda}</span>
              </div>
            </div>

            {/* Row 2: Parceiro */}
            {parceiroShort && (
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[11px] text-muted-foreground truncate">
                  {parceiroShort}
                </span>
              </div>
            )}

            {/* Row 3: Projeto + Tempo + Ações */}
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {alerta.projeto_nome && (
                  <span className="text-[9px] text-muted-foreground/70 truncate max-w-[100px]">
                    {alerta.projeto_nome}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground/50 flex items-center gap-0.5 flex-shrink-0">
                  <Clock className="h-2.5 w-2.5" />
                  {timeAgo(alerta.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  size="sm"
                  onClick={() => onProcessar(alerta)}
                  className="h-6 text-[10px] px-2.5 shrink-0 font-semibold"
                >
                  Processar
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onCancelar(alerta)} className="text-xs gap-2">
                      Cancelar Liberação
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
