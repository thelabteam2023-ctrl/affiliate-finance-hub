import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { FinalizeReason } from "@/hooks/useProjectBonuses";

const REASONS: { value: FinalizeReason; label: string; icon: React.ElementType; description: string }[] = [
  { value: "rollover_completed", label: "Rollover Concluído (Saque)", icon: CheckCircle2, description: "Rollover atingido, saque liberado" },
  { value: "cycle_completed", label: "Ciclo Encerrado", icon: CheckCircle2, description: "Bônus utilizado, ciclo finalizado" },
  { value: "expired", label: "Expirado", icon: XCircle, description: "Prazo expirou sem conclusão" },
  { value: "cancelled_reversed", label: "Cancelado / Revertido", icon: RotateCcw, description: "Bônus cancelado ou revertido" },
];

interface EditFinalizeReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentReason: FinalizeReason | null;
  bonusTitle: string;
  bookmakerNome: string;
  onSave: (reason: FinalizeReason) => Promise<void>;
}

export function EditFinalizeReasonDialog({
  open,
  onOpenChange,
  currentReason,
  bonusTitle,
  bookmakerNome,
  onSave,
}: EditFinalizeReasonDialogProps) {
  const [selected, setSelected] = useState<FinalizeReason>(currentReason || "cycle_completed");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (selected === currentReason) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(selected);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Motivo de Finalização</DialogTitle>
          <DialogDescription>
            {bookmakerNome} — {bonusTitle || "Bônus"}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selected} onValueChange={(v) => setSelected(v as FinalizeReason)} className="space-y-3">
          {REASONS.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.value} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelected(r.value)}>
                <RadioGroupItem value={r.value} id={r.value} className="mt-0.5" />
                <Label htmlFor={r.value} className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{r.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                </Label>
              </div>
            );
          })}
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
