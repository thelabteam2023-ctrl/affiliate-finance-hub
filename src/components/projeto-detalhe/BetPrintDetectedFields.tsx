import { CheckCircle2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import type { ParsedBetSlip } from "@/hooks/useImportBetPrint";

interface BetPrintDetectedFieldsProps {
  parsedData: ParsedBetSlip;
  imagePreview: string | null;
  onClear: () => void;
}

export function BetPrintDetectedFields({ parsedData, imagePreview, onClear }: BetPrintDetectedFieldsProps) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
      {/* Thumbnail da imagem */}
      {imagePreview && (
        <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
          <DialogTrigger asChild>
            <div className="relative flex-shrink-0 cursor-pointer group">
              <img 
                src={imagePreview} 
                alt="Print" 
                className="h-10 w-14 object-cover rounded border border-border/50 transition-opacity group-hover:opacity-80"
              />
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

      {/* Label com ícone */}
      <div className="flex items-center gap-2 flex-1">
        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium text-foreground">Print importado</span>
      </div>

      {/* Botão fechar */}
      <button
        onClick={onClear}
        className="flex-shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Remover print"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
