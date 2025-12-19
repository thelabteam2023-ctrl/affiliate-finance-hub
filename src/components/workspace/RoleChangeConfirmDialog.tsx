import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, ArrowRight, Loader2 } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { getRoleLabel } from "@/lib/roleLabels";

type AppRole = Database["public"]["Enums"]["app_role"];

interface RoleChangeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  memberEmail: string;
  currentRole: AppRole;
  newRole: AppRole;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
}

const roleHierarchy: Record<AppRole, number> = {
  owner: 5,
  admin: 4,
  master: 4,
  finance: 3,
  operator: 2,
  user: 1,
  viewer: 0,
};

const roleDescriptions: Record<AppRole, string> = {
  owner: "Controle total do workspace, incluindo exclusão",
  admin: "Pode gerenciar membros, configurações e todos os módulos",
  master: "Papel legado, equivalente a admin",
  finance: "Acesso a operações financeiras e relatórios",
  operator: "Execução operacional: apostas e bookmakers",
  user: "Acesso básico ao sistema",
  viewer: "Apenas visualização, sem ações",
};

export function RoleChangeConfirmDialog({
  open,
  onOpenChange,
  memberName,
  memberEmail,
  currentRole,
  newRole,
  onConfirm,
  isLoading = false,
}: RoleChangeConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [understoodRisks, setUnderstoodRisks] = useState(false);

  // Determinar se é escalação (promoção para role mais alta)
  const isEscalation = roleHierarchy[newRole] > roleHierarchy[currentRole];
  const isPromotingToAdmin = newRole === "admin";

  // Texto de confirmação baseado no tipo de alteração
  const getRequiredText = () => {
    if (isPromotingToAdmin) {
      return "TORNAR ADMINISTRADOR";
    }
    return "CONFIRMAR";
  };

  const requiredText = getRequiredText();
  const isTextValid = confirmText.toUpperCase().trim() === requiredText;
  const canConfirm = isTextValid && (!isPromotingToAdmin || understoodRisks);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setUnderstoodRisks(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!canConfirm || isLoading) return;
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Confirmar Alteração de Permissão
          </DialogTitle>
          <DialogDescription>
            Esta ação requer confirmação explícita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info do membro */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Membro:</span>
              <span className="font-medium">{memberName || memberEmail}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email:</span>
              <span className="text-sm">{memberEmail}</span>
            </div>
          </div>

          {/* Alteração de role */}
          <div className="flex items-center justify-center gap-3 py-2">
            <Badge variant="outline" className="text-base px-3 py-1">
              {getRoleLabel(currentRole)}
            </Badge>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <Badge 
              variant={isEscalation ? "default" : "secondary"} 
              className="text-base px-3 py-1"
            >
              {getRoleLabel(newRole)}
            </Badge>
          </div>

          {/* Aviso de impacto */}
          <div className={`rounded-lg border p-3 ${isPromotingToAdmin ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/30'}`}>
            <div className="flex gap-2">
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${isPromotingToAdmin ? 'text-destructive' : 'text-muted-foreground'}`} />
              <div className="text-sm">
                <p className="font-medium mb-1">
                  {isEscalation ? "Promoção de permissões" : "Redução de permissões"}
                </p>
                <p className="text-muted-foreground">
                  {roleDescriptions[newRole]}
                </p>
              </div>
            </div>
          </div>

          {/* Campo de confirmação por digitação */}
          <div className="space-y-2">
            <Label htmlFor="confirmText">
              Digite <span className="font-mono font-bold text-primary">{requiredText}</span> para confirmar:
            </Label>
            <Input
              id="confirmText"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={requiredText}
              className={isTextValid ? "border-green-500 focus-visible:ring-green-500" : ""}
              autoComplete="off"
              disabled={isLoading}
            />
          </div>

          {/* Checkbox extra para promoção a admin */}
          {isPromotingToAdmin && (
            <div className="flex items-start space-x-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <Checkbox
                id="understoodRisks"
                checked={understoodRisks}
                onCheckedChange={(checked) => setUnderstoodRisks(checked === true)}
                disabled={isLoading}
                className="mt-0.5"
              />
              <Label htmlFor="understoodRisks" className="text-sm leading-relaxed cursor-pointer">
                Entendo que Administradores podem gerenciar membros, alterar configurações e 
                acessar todos os dados do workspace.
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            variant={isPromotingToAdmin ? "destructive" : "default"}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Alteração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}