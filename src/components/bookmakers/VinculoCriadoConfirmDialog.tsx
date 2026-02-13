import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { VinculoCriadoContext } from "./BookmakerDialog";

interface VinculoCriadoConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: VinculoCriadoContext | null;
  onConfirmDeposit: () => void;
}

export function VinculoCriadoConfirmDialog({
  open,
  onOpenChange,
  context,
  onConfirmDeposit,
}: VinculoCriadoConfirmDialogProps) {
  if (!context) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <AlertDialogTitle>Vínculo criado com sucesso</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm">
            <span className="font-medium text-foreground">{context.parceiroNome}</span>
            {" ↔ "}
            <span className="font-medium text-foreground">{context.bookmakerNome}</span>
            <br />
            <br />
            Deseja registrar um depósito agora?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Não agora</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmDeposit} className="gap-1">
            Sim, registrar depósito
            <ArrowRight className="h-4 w-4" />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
