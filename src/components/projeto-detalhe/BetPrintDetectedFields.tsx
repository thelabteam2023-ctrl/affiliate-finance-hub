import { CheckCircle2, AlertTriangle, HelpCircle, X, ZoomIn, Maximize2, DollarSign, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
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

const getConfidenceColor = (confidence: ConfidenceLevel) => {
  switch (confidence) {
    case "high":
      return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
    case "medium":
      return "text-amber-500 bg-amber-500/10 border-amber-500/30";
    case "low":
      return "text-orange-500 bg-orange-500/10 border-orange-500/30";
    default:
      return "text-muted-foreground bg-muted/50 border-border";
  }
};

interface FieldRowProps {
  label: string;
  value: string | null;
  confidence: ConfidenceLevel;
  icon?: React.ReactNode;
  isFinancial?: boolean;
}

function FieldRow({ label, value, confidence, icon, isFinancial }: FieldRowProps) {
  const hasValue = value && confidence !== "none";

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-md ${
      hasValue ? getConfidenceColor(confidence) : 'bg-muted/30'
    } border`}>
      <div className="flex items-center gap-2">
        {icon || getConfidenceIcon(confidence)}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {hasValue ? (
          <>
            <span className={`text-xs font-semibold max-w-[160px] truncate ${isFinancial ? 'font-mono' : ''}`} title={value}>
              {isFinancial && value ? value : value}
            </span>
            {confidence !== "high" && (
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0 ${getConfidenceColor(confidence)}`}
              >
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
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  
  const contextFields = [
    { label: "Mandante", value: parsedData.mandante?.value, confidence: parsedData.mandante?.confidence || "none" },
    { label: "Visitante", value: parsedData.visitante?.value, confidence: parsedData.visitante?.confidence || "none" },
    { label: "Data/Hora", value: parsedData.dataHora?.value, confidence: parsedData.dataHora?.confidence || "none" },
    { label: "Esporte", value: parsedData.esporte?.value, confidence: parsedData.esporte?.confidence || "none" },
    { label: "Mercado", value: parsedData.mercado?.value, confidence: parsedData.mercado?.confidence || "none" },
    { label: "Seleção", value: parsedData.selecao?.value, confidence: parsedData.selecao?.confidence || "none" },
  ];

  const financialFields = [
    { 
      label: "ODD", 
      value: parsedData.odd?.value, 
      confidence: parsedData.odd?.confidence || "none",
      icon: <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
    },
    { 
      label: "Stake", 
      value: parsedData.stake?.value, 
      confidence: parsedData.stake?.confidence || "none",
      icon: <DollarSign className="h-3.5 w-3.5 text-green-500" />
    },
  ];

  const allFields = [...contextFields, ...financialFields];
  const detectedCount = allFields.filter(f => f.confidence !== "none" && f.value).length;
  const reviewCount = allFields.filter(f => f.confidence === "medium" || f.confidence === "low").length;
  const financialDetected = financialFields.filter(f => f.confidence !== "none" && f.value).length;

  return (
    <div className="rounded-lg border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-500/5 to-transparent overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <div>
            <span className="text-sm font-semibold text-emerald-500">
              Detectado do Print
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                {detectedCount}/8 campos
              </Badge>
              {financialDetected > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-500 bg-blue-500/10">
                  {financialDetected}/2 financeiros
                </Badge>
              )}
              {reviewCount > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30">
                  {reviewCount} revisar
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Image Preview with Zoom */}
      {imagePreview && (
        <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
          <DialogTrigger asChild>
            <div className="relative group cursor-pointer border-b border-border/50">
              <img 
                src={imagePreview} 
                alt="Print do boletim" 
                className="w-full h-28 object-cover transition-opacity group-hover:opacity-80"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                <div className="flex items-center gap-2 bg-background/90 px-3 py-1.5 rounded-full text-xs font-medium">
                  <ZoomIn className="h-3.5 w-3.5" />
                  Ampliar
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent className="max-w-4xl p-2">
            <img 
              src={imagePreview} 
              alt="Print do boletim" 
              className="w-full h-auto max-h-[80vh] object-contain rounded-md"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Fields Grid */}
      <div className="p-3 space-y-3">
        {/* Context Fields */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 px-1">
            Contexto do Evento
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {contextFields.map((field) => (
              <FieldRow
                key={field.label}
                label={field.label}
                value={field.value}
                confidence={field.confidence as ConfidenceLevel}
              />
            ))}
          </div>
        </div>

        {/* Financial Fields - Highlighted */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 px-1">
            Valores Financeiros
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {financialFields.map((field) => (
              <FieldRow
                key={field.label}
                label={field.label}
                value={field.value}
                confidence={field.confidence as ConfidenceLevel}
                icon={field.icon}
                isFinancial
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-muted/30 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground text-center">
          Compare os valores detectados com o formulário • Campos editáveis antes de salvar
        </p>
      </div>
    </div>
  );
}
