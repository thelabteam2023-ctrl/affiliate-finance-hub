import { CheckCircle2, AlertTriangle, HelpCircle, XCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

interface OcrFieldConfidenceIndicatorProps {
  confidence: ConfidenceLevel;
  fieldName: string;
  value?: string | null;
  className?: string;
  showInline?: boolean;
}

const getConfidenceDetails = (confidence: ConfidenceLevel, fieldName: string) => {
  switch (confidence) {
    case "high":
      return {
        icon: CheckCircle2,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        label: "Alta confiança",
        description: `${fieldName} identificado com clareza no print`,
      };
    case "medium":
      return {
        icon: AlertTriangle,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        label: "Revisar",
        description: `${fieldName} inferido — verifique se está correto`,
      };
    case "low":
      return {
        icon: HelpCircle,
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/30",
        label: "Baixa confiança",
        description: `${fieldName} parcialmente visível — revisão recomendada`,
      };
    case "none":
    default:
      return {
        icon: XCircle,
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
        borderColor: "border-border",
        label: "Não identificado",
        description: `${fieldName} não foi encontrado no print`,
      };
  }
};

export function OcrFieldConfidenceIndicator({
  confidence,
  fieldName,
  value,
  className,
  showInline = false,
}: OcrFieldConfidenceIndicatorProps) {
  const details = getConfidenceDetails(confidence, fieldName);
  const Icon = details.icon;

  // Don't show indicator if no value and confidence is none
  if (!value && confidence === "none") {
    return null;
  }

  if (showInline) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
                details.bgColor,
                details.borderColor,
                details.color,
                className
              )}
            >
              <Icon className="h-3 w-3" />
              <span className="truncate max-w-[100px]">{value}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px]">
            <div className="space-y-1">
              <p className={cn("text-xs font-semibold", details.color)}>{details.label}</p>
              <p className="text-xs text-muted-foreground">{details.description}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon
            className={cn(
              "h-3.5 w-3.5 cursor-help transition-colors",
              details.color,
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <div className="space-y-1">
            <p className={cn("text-xs font-semibold", details.color)}>{details.label}</p>
            <p className="text-xs text-muted-foreground">{details.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Badge component for displaying OCR detection summary
interface OcrDetectionBadgeProps {
  fieldsDetected: number;
  fieldsNeedingReview: number;
  fieldsNotFound: number;
  className?: string;
}

export function OcrDetectionBadge({
  fieldsDetected,
  fieldsNeedingReview,
  fieldsNotFound,
  className,
}: OcrDetectionBadgeProps) {
  return (
    <div className={cn("flex items-center gap-2 text-[10px]", className)}>
      {fieldsDetected > 0 && (
        <span className="flex items-center gap-1 text-emerald-500">
          <CheckCircle2 className="h-3 w-3" />
          {fieldsDetected}
        </span>
      )}
      {fieldsNeedingReview > 0 && (
        <span className="flex items-center gap-1 text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          {fieldsNeedingReview}
        </span>
      )}
      {fieldsNotFound > 0 && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <XCircle className="h-3 w-3" />
          {fieldsNotFound}
        </span>
      )}
    </div>
  );
}

// Component for displaying all parsed fields with confidence
interface OcrParsedFieldsSummaryProps {
  parsedData: {
    evento?: { value: string | null; confidence: ConfidenceLevel };
    dataHora?: { value: string | null; confidence: ConfidenceLevel };
    esporte?: { value: string | null; confidence: ConfidenceLevel };
    mercado?: { value: string | null; confidence: ConfidenceLevel };
    selecao?: { value: string | null; confidence: ConfidenceLevel };
    odd?: { value: string | null; confidence: ConfidenceLevel };
    stake?: { value: string | null; confidence: ConfidenceLevel };
    retorno?: { value: string | null; confidence: ConfidenceLevel };
    resultado?: { value: string | null; confidence: ConfidenceLevel };
    bookmakerNome?: { value: string | null; confidence: ConfidenceLevel };
  };
  className?: string;
}

export function OcrParsedFieldsSummary({ parsedData, className }: OcrParsedFieldsSummaryProps) {
  const fields = [
    { key: "evento", label: "Evento", ...parsedData.evento },
    { key: "dataHora", label: "Data/Hora", ...parsedData.dataHora },
    { key: "esporte", label: "Esporte", ...parsedData.esporte },
    { key: "mercado", label: "Mercado", ...parsedData.mercado },
    { key: "selecao", label: "Seleção", ...parsedData.selecao },
    { key: "odd", label: "Odd", ...parsedData.odd },
    { key: "stake", label: "Stake", ...parsedData.stake },
    { key: "retorno", label: "Retorno", ...parsedData.retorno },
    { key: "resultado", label: "Resultado", ...parsedData.resultado },
    { key: "bookmakerNome", label: "Casa", ...parsedData.bookmakerNome },
  ].filter((f) => f.value);

  if (fields.length === 0) return null;

  // Count by confidence
  const counts = {
    detected: fields.filter((f) => f.confidence === "high").length,
    needsReview: fields.filter((f) => f.confidence === "medium" || f.confidence === "low").length,
    notFound: Object.keys(parsedData).length - fields.length,
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Summary badges */}
      <OcrDetectionBadge
        fieldsDetected={counts.detected}
        fieldsNeedingReview={counts.needsReview}
        fieldsNotFound={counts.notFound}
      />

      {/* Field chips */}
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <OcrFieldConfidenceIndicator
            key={field.key}
            confidence={field.confidence || "none"}
            fieldName={field.label}
            value={field.value}
            showInline
          />
        ))}
      </div>
    </div>
  );
}
