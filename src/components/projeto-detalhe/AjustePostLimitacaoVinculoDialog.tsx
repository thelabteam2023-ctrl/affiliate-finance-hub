import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegistrarAjustePostLimitacao } from "@/hooks/useAjustePostLimitacao";
import { format } from "date-fns";

interface AjustePostLimitacaoVinculoDialogProps {
  open: boolean;
  onClose: () => void;
  vinculo: {
    id: string;
    nome: string;
    moeda: string;
    saldo_real: number;
  };
  projetoId: string;
  workspaceId: string;
  onSuccess: () => void;
}

export function AjustePostLimitacaoVinculoDialog({
  open,
  onClose,
  vinculo,
  projetoId,
  workspaceId,
  onSuccess,
}: AjustePostLimitacaoVinculoDialogProps) {
  const [saldoFinal, setSaldoFinal] = useState("");
  const [dataAjuste, setDataAjuste] = useState(format(new Date(), "yyyy-MM-dd"));

  const mutation = useRegistrarAjustePostLimitacao(projetoId);

  useEffect(() => {
    if (open) {
      setSaldoFinal("");
      setDataAjuste(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open]);

  const saldoLimitacao = vinculo.saldo_real;
  const saldoFinalNum = parseFloat(saldoFinal.replace(",", "."));
  const ajuste = !isNaN(saldoFinalNum) ? saldoFinalNum - saldoLimitacao : null;
  const isValid = ajuste !== null && !isNaN(ajuste) && ajuste !== 0 && dataAjuste;

  const getCurrencySymbol = (moeda: string) => {
    const symbols: Record<string, string> = {
      BRL: "R$", USD: "$", EUR: "€", GBP: "£", MYR: "RM", USDT: "₮", USDC: "₮",
    };
    return symbols[moeda] || moeda;
  };

  const formatValue = (val: number) => {
    const symbol = getCurrencySymbol(vinculo.moeda);
    return `${symbol} ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleSave = () => {
    if (!isValid || ajuste === null) return;

    mutation.mutate(
      {
        bookmakerId: vinculo.id,
        bookmakerNome: vinculo.nome,
        moeda: vinculo.moeda,
        saldoLimitacao,
        saldoFinal: saldoFinalNum,
        dataAjuste,
        workspaceId,
      },
      {
        onSuccess: () => {
          onSuccess();
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Ajuste Pós-Limitação
          </DialogTitle>
          <DialogDescription>
            Registre o saldo final após as apostas realizadas para encerramento operacional da conta.
            Este ajuste não encerra o vínculo nem remove o acesso à conta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Conta */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Conta: <span className="font-medium text-foreground">{vinculo.nome}</span>
          </div>

          {/* Saldo no momento da limitação (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Saldo no momento da limitação</Label>
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/40 border border-border/50">
              <span className="font-mono font-semibold text-lg">{formatValue(saldoLimitacao)}</span>
              <Badge variant="secondary" className="text-xs">{vinculo.moeda}</Badge>
            </div>
          </div>

          {/* Saldo final */}
          <div className="space-y-1.5">
            <Label htmlFor="saldo-final-vinculo">Saldo final após encerramento operacional</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {getCurrencySymbol(vinculo.moeda)}
              </span>
              <Input
                id="saldo-final-vinculo"
                value={saldoFinal}
                onChange={(e) => setSaldoFinal(e.target.value)}
                placeholder="0,00"
                className="pl-10 font-mono text-lg"
                autoFocus
              />
            </div>
          </div>

          {/* Preview do ajuste */}
          {ajuste !== null && !isNaN(ajuste) && ajuste !== 0 && (
            <div className={cn(
              "flex items-center justify-between p-3 rounded-md border",
              ajuste > 0
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-red-500/10 border-red-500/30"
            )}>
              <div className="flex items-center gap-2">
                {ajuste > 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                )}
                <span className="text-sm font-medium">
                  {ajuste > 0 ? "Lucro adicional" : "Perda adicional"}
                </span>
              </div>
              <span className={cn(
                "font-mono font-bold text-lg",
                ajuste > 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {ajuste > 0 ? "+" : ""}{formatValue(ajuste)}
              </span>
            </div>
          )}

          {/* Data do ajuste */}
          <div className="space-y-1.5">
            <Label>Data do ajuste</Label>
            <DatePicker
              value={dataAjuste}
              onChange={setDataAjuste}
              maxDate={new Date()}
              placeholder="Selecione a data"
            />
          </div>

          {/* Info box */}
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md space-y-1">
            <p>✓ Afeta: Saldo, Juice, Performance de bônus</p>
            <p>✗ Não afeta: Quantidade de apostas, Winrate, Odds, ROI por aposta</p>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending || !isValid}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar Ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
