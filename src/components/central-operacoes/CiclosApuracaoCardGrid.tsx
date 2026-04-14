/**
 * CiclosApuracaoCardGrid — Grid de cards para ciclos de apuração
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FolderKanban, Clock, Target, Zap, XCircle, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CicloAlerta {
  id: string;
  projeto_id: string;
  projeto_nome: string;
  numero_ciclo: number;
  tipo_gatilho: string;
  urgencia: string;
  meta_volume?: number;
  progresso_volume: number;
  dismissed?: boolean;
}

interface CiclosApuracaoCardGridProps {
  ciclos: CicloAlerta[];
  onNavigate: (projetoId: string) => void;
  onDismiss: (id: string) => void;
  onUndismiss: (id: string) => void;
}

export function CiclosApuracaoCardGrid({ ciclos, onNavigate, onDismiss, onUndismiss }: CiclosApuracaoCardGridProps) {
  if (ciclos.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Todos os ciclos foram ocultos.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {ciclos.map((ciclo) => {
        const isDismissed = ciclo.dismissed;
        const hasProgress = (ciclo.tipo_gatilho === "VOLUME" || ciclo.tipo_gatilho === "HIBRIDO") && ciclo.meta_volume;

        return (
          <div
            key={ciclo.id}
            className={cn(
              "group rounded-xl border p-3 transition-all duration-200 cursor-pointer",
              "bg-card/80",
              isDismissed
                ? "border-muted/30 opacity-60"
                : ciclo.urgencia === "CRITICA"
                ? "border-destructive/30 hover:border-destructive/50"
                : ciclo.urgencia === "ALTA"
                ? "border-orange-500/20 hover:border-orange-500/40"
                : "border-border/50 hover:border-border",
              "hover:shadow-sm"
            )}
            onClick={() => onNavigate(ciclo.projeto_id)}
          >
            {/* Row 1: Icon + Projeto + Ciclo badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <FolderKanban className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">{ciclo.projeto_nome}</span>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">Ciclo {ciclo.numero_ciclo}</Badge>
            </div>

            {/* Row 2: Gatilho info + Progress */}
            <div className="mt-2">
              <div className="flex items-center gap-1.5">
                {ciclo.tipo_gatilho === "TEMPO" && <Clock className="h-3 w-3 text-muted-foreground" />}
                {ciclo.tipo_gatilho === "VOLUME" && <Target className="h-3 w-3 text-muted-foreground" />}
                {ciclo.tipo_gatilho === "HIBRIDO" && <Zap className="h-3 w-3 text-muted-foreground" />}
                <span className="text-[10px] text-muted-foreground capitalize">
                  {ciclo.tipo_gatilho.toLowerCase()}
                </span>
              </div>
              {hasProgress && (
                <div className="mt-1.5">
                  <Progress value={Math.min(100, ciclo.progresso_volume)} className="h-1" />
                  <p className="text-[9px] text-muted-foreground mt-0.5">{ciclo.progresso_volume.toFixed(0)}%</p>
                </div>
              )}
            </div>

            {/* Row 3: Dismiss */}
            <div className="flex items-center justify-end mt-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); isDismissed ? onUndismiss(ciclo.id) : onDismiss(ciclo.id); }}
                  >
                    {isDismissed ? <Undo2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">{isDismissed ? "Tornar visível" : "Ocultar"}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
}
