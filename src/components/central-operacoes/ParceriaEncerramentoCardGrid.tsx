/**
 * ParceriaEncerramentoCardGrid — Grid de cards para parcerias encerrando
 * Design premium seguindo o padrão do SaqueCardGrid
 */

import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { ParceriaAlertaEncerramento } from "@/hooks/useCentralOperacoesData";

interface ParceriaEncerramentoCardGridProps {
  parcerias: ParceriaAlertaEncerramento[];
  onRenovar: (parc: ParceriaAlertaEncerramento) => void;
  onEncerrar: (parc: ParceriaAlertaEncerramento) => void;
}

export function ParceriaEncerramentoCardGrid({ parcerias, onRenovar, onEncerrar }: ParceriaEncerramentoCardGridProps) {
  if (parcerias.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhuma parceria próxima do encerramento.
      </p>
    );
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}
    >
      {parcerias.map((parc) => {
        const isExpired = parc.diasRestantes <= 0;
        const isUrgent = parc.diasRestantes <= 5;
        const parceiroShort = getFirstLastName(parc.parceiroNome);
        const diasLabel = isExpired
          ? `${Math.abs(parc.diasRestantes)}d atrás`
          : `${parc.diasRestantes}d restantes`;

        return (
          <div
            key={parc.id}
            className={cn(
              "group rounded-xl border p-3 transition-all duration-200",
              "bg-card/80",
              isUrgent
                ? "border-destructive/30 hover:border-destructive/50"
                : "border-border/50 hover:border-border",
              "hover:shadow-sm"
            )}
          >
            {/* Row 1: Icon + Nome parceiro + Dias badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <Calendar className={cn(
                  "h-4 w-4 flex-shrink-0",
                  isUrgent ? "text-destructive" : "text-muted-foreground"
                )} />
                <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">
                  {parceiroShort}
                </span>
              </div>
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1",
                isUrgent
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted/50 text-muted-foreground"
              )}>
                <Clock className="h-2.5 w-2.5" />
                {diasLabel}
              </span>
            </div>

            {/* Row 2: Datas */}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-muted-foreground">
                {new Date(parc.dataInicio).toLocaleDateString("pt-BR")} → {new Date(parc.dataFim).toLocaleDateString("pt-BR")}
              </span>
              <span className="text-[9px] text-muted-foreground/50">
                ({parc.duracaoDias}d)
              </span>
            </div>

            {/* Row 3: Origem + Ações */}
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground font-medium">
                {parc.origem_tipo === "FORNECEDOR" ? "Fornecedor" : "Indicação"}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRenovar(parc)}
                  className="h-6 text-[10px] px-2.5 shrink-0 font-semibold"
                >
                  Renovar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onEncerrar(parc)}
                  className="h-6 text-[10px] px-2.5 shrink-0 font-semibold"
                >
                  Encerrar
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
