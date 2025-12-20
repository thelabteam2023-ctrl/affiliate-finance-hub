import { CheckCircle2, AlertTriangle, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ParsedBetSlip } from "@/hooks/useImportBetPrint";

interface BetPrintDetectedFieldsProps {
  parsedData: ParsedBetSlip;
  imagePreview: string | null;
  onClear: () => void;
}

type ConfidenceLevel = "high" | "medium" | "low" | "none";

const getConfidenceIcon = (confidence: ConfidenceLevel) => {
  switch (confidence) {
    case "high":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "medium":
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case "low":
      return <HelpCircle className="h-3.5 w-3.5 text-orange-500" />;
    default:
      return <span className="h-3.5 w-3.5 text-muted-foreground">—</span>;
  }
};

const getConfidenceLabel = (confidence: ConfidenceLevel) => {
  switch (confidence) {
    case "high":
      return "Detectado";
    case "medium":
      return "Revisar";
    case "low":
      return "Incerto";
    default:
      return "Não detectado";
  }
};

const getConfidenceVariant = (confidence: ConfidenceLevel): "default" | "secondary" | "outline" | "destructive" => {
  switch (confidence) {
    case "high":
      return "default";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
};

interface FieldRowProps {
  label: string;
  value: string | null;
  confidence: ConfidenceLevel;
}

function FieldRow({ label, value, confidence }: FieldRowProps) {
  const hasValue = value && confidence !== "none";

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        {getConfidenceIcon(confidence)}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {hasValue ? (
          <>
            <span className="text-xs font-medium text-foreground max-w-[140px] truncate" title={value}>
              {value}
            </span>
            {confidence !== "high" && (
              <Badge variant={getConfidenceVariant(confidence)} className="text-[10px] px-1.5 py-0">
                {getConfidenceLabel(confidence)}
              </Badge>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
      </div>
    </div>
  );
}

export function BetPrintDetectedFields({ parsedData, imagePreview, onClear }: BetPrintDetectedFieldsProps) {
  const fields = [
    { label: "Mandante", value: parsedData.mandante?.value, confidence: parsedData.mandante?.confidence || "none" },
    { label: "Visitante", value: parsedData.visitante?.value, confidence: parsedData.visitante?.confidence || "none" },
    { label: "Data/Hora", value: parsedData.dataHora?.value, confidence: parsedData.dataHora?.confidence || "none" },
    { label: "Esporte", value: parsedData.esporte?.value, confidence: parsedData.esporte?.confidence || "none" },
    { label: "Mercado", value: parsedData.mercado?.value, confidence: parsedData.mercado?.confidence || "none" },
    { label: "Seleção", value: parsedData.selecao?.value, confidence: parsedData.selecao?.confidence || "none" },
  ];

  const detectedCount = fields.filter(f => f.confidence !== "none" && f.value).length;
  const reviewCount = fields.filter(f => f.confidence === "medium" || f.confidence === "low").length;

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">
            Detectado do Print
          </span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-500">
            {detectedCount}/6
          </Badge>
          {reviewCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30">
              {reviewCount} para revisar
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {imagePreview && (
        <div className="mb-3">
          <img 
            src={imagePreview} 
            alt="Print do boletim" 
            className="w-full h-16 object-cover rounded-md opacity-60"
          />
        </div>
      )}

      <div className="space-y-0">
        {fields.map((field) => (
          <FieldRow
            key={field.label}
            label={field.label}
            value={field.value}
            confidence={field.confidence as ConfidenceLevel}
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 text-center">
        Os campos podem ser editados antes de salvar
      </p>
    </div>
  );
}
