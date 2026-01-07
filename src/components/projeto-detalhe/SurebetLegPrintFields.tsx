import { CheckCircle2, AlertTriangle, HelpCircle, X, ZoomIn, Camera, Loader2, Sparkles, RotateCcw, TrendingUp, DollarSign, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useState, useRef } from "react";
import type { ParsedBetSlip } from "@/hooks/useImportBetPrint";
import type { LegPrintData } from "@/hooks/useSurebetPrintImport";

interface SurebetLegPrintFieldsProps {
  legIndex: number;
  legLabel: string; // "1", "X", "2"
  legPrint: LegPrintData;
  onImportClick: () => void;
  onClear: () => void;
  onAcceptInference?: () => void;
  onRejectInference?: () => void;
  disabled?: boolean;
}

type ConfidenceLevel = "high" | "medium" | "low" | "none";

const getConfidenceIcon = (confidence: ConfidenceLevel) => {
  switch (confidence) {
    case "high":
      return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    case "medium":
      return <AlertTriangle className="h-3 w-3 text-amber-500" />;
    case "low":
      return <HelpCircle className="h-3 w-3 text-orange-500" />;
    default:
      return null;
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

interface DetectedFieldProps {
  label: string;
  value: string | null;
  confidence: ConfidenceLevel;
  icon?: React.ReactNode;
}

function DetectedField({ label, value, confidence, icon }: DetectedFieldProps) {
  if (!value) return null;
  
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${getConfidenceColor(confidence)}`}>
      {icon || getConfidenceIcon(confidence)}
      <span className="font-medium">{label}:</span>
      <span className="font-semibold truncate max-w-[80px]" title={value}>{value}</span>
    </div>
  );
}

export function SurebetLegPrintFields({
  legIndex,
  legLabel,
  legPrint,
  onImportClick,
  onClear,
  onAcceptInference,
  onRejectInference,
  disabled = false,
}: SurebetLegPrintFieldsProps) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { parsedData, imagePreview, isProcessing, isInferred, inferredFrom } = legPrint;
  const hasData = parsedData !== null;

  // Handle file input
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      // The actual processing is handled by parent through onImportClick
      // We need to pass the file up
    }
  };

  // Loading state
  if (isProcessing) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2 justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-xs text-primary font-medium">Analisando perna {legLabel}...</span>
        </div>
      </div>
    );
  }

  // Inferred state (suggested line from another leg)
  if (isInferred && parsedData) {
    return (
      <div className="rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-amber-500">
              Linha sugerida (Perna {(inferredFrom ?? 0) + 1})
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onAcceptInference}
              className="h-6 px-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
              title="Aceitar sugestão"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              <span className="text-xs">Aceitar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRejectInference}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Rejeitar e importar print"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        
        {/* Show inferred line */}
        <div className="flex items-center justify-center gap-2">
          <DetectedField
            label="Linha"
            value={parsedData.selecao?.value}
            confidence="medium"
            icon={<Target className="h-3 w-3 text-amber-500" />}
          />
        </div>
        
        <p className="text-[10px] text-center text-muted-foreground">
          ODD e Stake não inferidos - importe print se necessário
        </p>
      </div>
    );
  }

  // Has print data
  if (hasData && imagePreview) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
        {/* Header with image thumbnail */}
        <div className="flex items-stretch">
          {/* Image thumbnail with zoom */}
          <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
            <DialogTrigger asChild>
              <div className="relative w-16 h-16 flex-shrink-0 cursor-pointer group border-r border-emerald-500/20">
                <img 
                  src={imagePreview} 
                  alt="Print" 
                  className="w-full h-full object-cover transition-opacity group-hover:opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                  <ZoomIn className="h-4 w-4 text-white" />
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-4xl p-2">
              <img 
                src={imagePreview} 
                alt="Print da aposta" 
                className="w-full h-auto max-h-[80vh] object-contain rounded-md"
              />
            </DialogContent>
          </Dialog>
          
          {/* Detected fields */}
          <div className="flex-1 p-2 flex flex-wrap gap-1.5 items-center">
            <DetectedField
              label="ODD"
              value={parsedData!.odd?.value}
              confidence={parsedData!.odd?.confidence || "none"}
              icon={<TrendingUp className="h-3 w-3 text-blue-500" />}
            />
            <DetectedField
              label="Stake"
              value={parsedData!.stake?.value}
              confidence={parsedData!.stake?.confidence || "none"}
              icon={<DollarSign className="h-3 w-3 text-green-500" />}
            />
            <DetectedField
              label="Linha"
              value={parsedData!.selecao?.value}
              confidence={parsedData!.selecao?.confidence || "none"}
              icon={<Target className="h-3 w-3 text-purple-500" />}
            />
          </div>
          
          {/* Clear button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-auto px-2 rounded-none border-l border-emerald-500/20 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Limpar print"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Empty state - show import button
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onImportClick}
      disabled={disabled}
      className="w-full h-10 border-dashed hover:border-primary hover:bg-primary/5 gap-2"
    >
      <Camera className="h-4 w-4" />
      <span className="text-xs">Importar Print</span>
    </Button>
  );
}

// Compact version for inline use in leg columns
export function SurebetLegPrintCompact({
  legPrint,
  onImportClick,
  onClear,
  disabled = false,
}: {
  legPrint: LegPrintData;
  onImportClick: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { parsedData, imagePreview, isProcessing, isInferred } = legPrint;

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      </div>
    );
  }

  if (isInferred && parsedData) {
    return (
      <Badge variant="outline" className="text-[9px] h-5 gap-1 bg-amber-500/10 text-amber-500 border-amber-500/30">
        <Sparkles className="h-2.5 w-2.5" />
        Sugerido
      </Badge>
    );
  }

  if (parsedData && imagePreview) {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[9px] h-5 gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Print
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onImportClick}
      disabled={disabled}
      className="h-6 px-2 text-muted-foreground hover:text-primary gap-1"
      title="Importar via print"
    >
      <Camera className="h-3 w-3" />
      <span className="text-[10px]">Print</span>
    </Button>
  );
}
