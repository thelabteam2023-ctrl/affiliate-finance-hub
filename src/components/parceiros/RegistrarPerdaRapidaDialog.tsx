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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registrarPerdaOperacionalViaLedger } from "@/lib/ledgerService";
import { toast } from "sonner";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "$", EUR: "€", GBP: "£", USDT: "USDT", MYR: "RM",
};

interface RegistrarPerdaRapidaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmakerId: string;
  bookmakerNome: string;
  moeda: string;
  saldoAtual: number;
  onSuccess?: () => void;
}

export function RegistrarPerdaRapidaDialog({
  open,
  onOpenChange,
  bookmakerId,
  bookmakerNome,
  moeda,
  saldoAtual,
  onSuccess,
}: RegistrarPerdaRapidaDialogProps) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const symbol = CURRENCY_SYMBOLS[moeda] || moeda;
  const parsedValor = parseFloat(valor.replace(",", "."));
  const isValid = parsedValor > 0 && !isNaN(parsedValor) && motivo.trim().length > 0;

  const handleConfirm = async () => {
    if (!isValid) return;
    setSaving(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const { data: bkInfo } = await supabase
        .from("bookmakers")
        .select("workspace_id, saldo_irrecuperavel")
        .eq("id", bookmakerId)
        .single();

      if (!bkInfo) throw new Error("Bookmaker não encontrada");

      // 1. Registrar perda no ledger (debita saldo)
      await registrarPerdaOperacionalViaLedger({
        bookmakerId,
        valor: parsedValor,
        moeda,
        workspaceId: bkInfo.workspace_id,
        userId: userData.user.id,
        descricao: `Saldo irrecuperável: ${motivo}`,
        categoria: "saldo_irrecuperavel",
      });

      // 2. Acumular no campo saldo_irrecuperavel
      const currentIrrec = Number(bkInfo.saldo_irrecuperavel || 0);
      await supabase
        .from("bookmakers")
        .update({ saldo_irrecuperavel: currentIrrec + parsedValor })
        .eq("id", bookmakerId);

      toast.success(`Perda de ${symbol} ${parsedValor.toFixed(2)} registrada em ${bookmakerNome}`);
      setValor("");
      setMotivo("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Erro ao registrar perda:", error);
      toast.error("Erro ao registrar perda: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Registrar Perda
          </AlertDialogTitle>
          <AlertDialogDescription>
            Debitar saldo irrecuperável de <span className="font-semibold text-foreground">{bookmakerNome}</span>.
            <span className="block mt-1 text-xs">
              Saldo atual: {symbol} {saldoAtual.toFixed(2)}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Valor perdido</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">{symbol}</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="max-w-[160px]"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Motivo *</Label>
            <Textarea
              placeholder="Ex: Casa limitada, saldo retido sem possibilidade de saque..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={saving || !isValid}
            className="bg-destructive hover:bg-destructive/90"
          >
            {saving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando...</>
            ) : (
              "Confirmar Perda"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
