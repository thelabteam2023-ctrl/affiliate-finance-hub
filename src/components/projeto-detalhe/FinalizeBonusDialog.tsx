import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertTriangle, Clock, XCircle } from "lucide-react";
import { FinalizeReason } from "@/hooks/useProjectBonuses";

interface FinalizeBonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bonusAmount: number;
  currency: string;
  onConfirm: (reason: FinalizeReason) => Promise<boolean>;
}

const FINALIZE_REASONS: { value: FinalizeReason; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "rollover_completed",
    label: "Rollover concluído",
    description: "O requisito de rollover foi cumprido com sucesso",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  },
  {
    value: "bonus_consumed",
    label: "Bônus consumido/zerado",
    description: "O saldo do bônus foi totalmente utilizado",
    icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  },
  {
    value: "expired",
    label: "Expirou",
    description: "O prazo de validade do bônus expirou",
    icon: <Clock className="h-4 w-4 text-gray-400" />,
  },
  {
    value: "cancelled_reversed",
    label: "Cancelado/Revertido",
    description: "O bônus foi cancelado ou estornado pela casa",
    icon: <XCircle className="h-4 w-4 text-red-400" />,
  },
];

const formatCurrency = (value: number, currency: string = "BRL") => {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    USDT: "USDT",
  };
  return `${symbols[currency] || currency} ${value.toFixed(2)}`;
};

export function FinalizeBonusDialog({
  open,
  onOpenChange,
  bonusAmount,
  currency,
  onConfirm,
}: FinalizeBonusDialogProps) {
  const [selectedReason, setSelectedReason] = useState<FinalizeReason>("rollover_completed");
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    const success = await onConfirm(selectedReason);
    setConfirming(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Finalizar Bônus</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Você está finalizando um bônus de{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(bonusAmount, currency)}
              </span>
              .
            </p>
            <p className="text-amber-500">
              Após finalizar, o bônus deixará de compor o saldo operável da casa.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">Motivo da finalização:</Label>
          <RadioGroup
            value={selectedReason}
            onValueChange={(value) => setSelectedReason(value as FinalizeReason)}
            className="space-y-2"
          >
            {FINALIZE_REASONS.map((reason) => (
              <div
                key={reason.value}
                className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedReason === reason.value
                    ? "bg-primary/10 border-primary"
                    : "hover:bg-muted/50"
                }`}
                onClick={() => setSelectedReason(reason.value)}
              >
                <RadioGroupItem value={reason.value} id={reason.value} className="mt-0.5" />
                <div className="flex-1">
                  <Label
                    htmlFor={reason.value}
                    className="flex items-center gap-2 cursor-pointer font-medium"
                  >
                    {reason.icon}
                    {reason.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{reason.description}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirming}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Finalizando...
              </>
            ) : (
              "Confirmar Finalização"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
