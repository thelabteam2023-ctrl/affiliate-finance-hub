import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeleteBetInfo {
  id: string;
  evento: string;
  stake: number;
  bookmaker: string;
  tipo: "simples" | "multipla" | "surebet";
}

interface DeleteBetConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  betInfo: DeleteBetInfo | null;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
  formatCurrency?: (value: number) => string;
}

const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const TIPO_LABELS: Record<string, string> = {
  simples: "Aposta Simples",
  multipla: "Aposta Múltipla",
  surebet: "Surebet",
};

export function DeleteBetConfirmDialog({
  open,
  onOpenChange,
  betInfo,
  onConfirm,
  isDeleting,
  formatCurrency = defaultFormatCurrency,
}: DeleteBetConfirmDialogProps) {
  if (!betInfo) return null;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Excluir {TIPO_LABELS[betInfo.tipo] || "Aposta"}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <p>
              Tem certeza que deseja excluir esta operação? Esta ação não pode ser desfeita.
            </p>
            
            {/* Detalhes da aposta */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Evento:</span>
                <span className="font-medium text-foreground truncate max-w-[200px]">
                  {betInfo.evento || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stake:</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(betInfo.stake)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Casa:</span>
                <span className="font-medium text-foreground truncate max-w-[200px]">
                  {betInfo.bookmaker || "—"}
                </span>
              </div>
            </div>

            <p className="text-amber-400 text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              O saldo será automaticamente revertido para a(s) casa(s) de apostas.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className={cn(
              "bg-red-600 hover:bg-red-700 focus:ring-red-500",
              isDeleting && "opacity-50 cursor-not-allowed"
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Excluindo...
              </>
            ) : (
              "Excluir"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
