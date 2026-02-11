import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartEmptyStateProps {
  /** Se true, exibe mensagem contextual para período de 1 dia */
  isSingleDayPeriod?: boolean;
  /** Mensagem principal para período genérico (fallback) */
  genericMessage?: string;
  /** Altura mínima do container */
  className?: string;
}

/**
 * Empty state padronizado para gráficos e módulos do projeto.
 * 
 * Distingue entre:
 * - Filtro "1 dia" sem apostas → mensagem contextual com ícone
 * - Outros períodos sem dados → mensagem genérica simples
 */
export function ChartEmptyState({
  isSingleDayPeriod = false,
  genericMessage = "Sem dados para exibir",
  className,
}: ChartEmptyStateProps) {
  if (isSingleDayPeriod) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full gap-3 text-center px-4", className)}>
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
          <BarChart3 className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Não há apostas registradas neste dia.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Quando houver apostas, o desempenho intradiário será exibido aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center h-full text-sm text-muted-foreground", className)}>
      {genericMessage}
    </div>
  );
}
