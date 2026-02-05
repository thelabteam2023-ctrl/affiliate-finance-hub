import { AlertTriangle, AlertOctagon, Check, Pencil } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DateAnomalyResult } from "@/lib/dateAnomalyDetection";
import { formatDateForDisplay } from "@/lib/dateAnomalyDetection";

interface DateAnomalyAlertProps {
  anomaly: DateAnomalyResult;
  origin: "ocr" | "ai" | "manual";
  onConfirm: () => void;
  onEdit: () => void;
  className?: string;
}

/**
 * Componente de alerta para datas anômalas detectadas por OCR/IA
 * 
 * REGRA INEGOCIÁVEL: Nunca salvar automaticamente uma data anômala.
 * O usuário DEVE confirmar conscientemente ou corrigir manualmente.
 */
export function DateAnomalyAlert({
  anomaly,
  origin,
  onConfirm,
  onEdit,
  className,
}: DateAnomalyAlertProps) {
  if (!anomaly.isAnomalous) return null;

  const isCritical = anomaly.severity === "critical";
  const originLabel = origin === "ocr" ? "OCR" : origin === "ai" ? "IA" : "Manual";

  return (
    <Alert
      variant="destructive"
      className={cn(
        "border-2 animate-in fade-in slide-in-from-top-2 duration-300",
        isCritical
          ? "border-destructive bg-destructive/10"
          : "border-amber-500 bg-amber-500/10",
        className
      )}
    >
      {isCritical ? (
        <AlertOctagon className="h-5 w-5 text-destructive" />
      ) : (
        <AlertTriangle className="h-5 w-5 text-amber-500" />
      )}
      
      <AlertTitle className={cn(
        "text-sm font-semibold",
        isCritical ? "text-destructive" : "text-amber-600 dark:text-amber-400"
      )}>
        {isCritical ? "⚠️ Data Crítica Detectada" : "⚠️ Data Fora do Padrão"}
      </AlertTitle>
      
      <AlertDescription className="mt-2 space-y-3">
        <div className="text-sm text-foreground/90">
          <p className="mb-2">{anomaly.message}</p>
          
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
            <span>
              <strong>Data detectada:</strong> {formatDateForDisplay(anomaly.detectedDate)}
            </span>
            <span>
              <strong>Data atual:</strong> {formatDateForDisplay(anomaly.baseDate)}
            </span>
            <span>
              <strong>Diferença:</strong> {Math.abs(anomaly.differenceInDays)} dias
            </span>
            <span>
              <strong>Origem:</strong> {originLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant={isCritical ? "outline" : "default"}
            onClick={onConfirm}
            className={cn(
              "gap-1.5",
              !isCritical && "bg-amber-600 hover:bg-amber-700 text-white"
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Confirmar esta data
          </Button>
          
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onEdit}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Corrigir manualmente
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground italic mt-1">
          A IA não pode corrigir datas automaticamente. Toda correção exige ação humana.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Versão compacta do alerta para uso em listas ou espaços menores
 */
interface DateAnomalyBadgeProps {
  anomaly: DateAnomalyResult;
  onClick?: () => void;
  className?: string;
}

export function DateAnomalyBadge({ anomaly, onClick, className }: DateAnomalyBadgeProps) {
  if (!anomaly.isAnomalous) return null;

  const isCritical = anomaly.severity === "critical";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
        "border cursor-pointer hover:opacity-80",
        isCritical
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
        className
      )}
    >
      {isCritical ? (
        <AlertOctagon className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      Data suspeita: {Math.abs(anomaly.differenceInDays)}d {anomaly.anomalyType === "past" ? "atrás" : "à frente"}
    </button>
  );
}
