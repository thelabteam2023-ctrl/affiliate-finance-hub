import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import {
  validarReaberturaSurebet,
  reabrirSurebet,
  type ValidacaoReaberturaResult,
} from "@/services/aposta/reabertura/ReaberturaService";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/formatCurrency";

interface ConfirmReaberturaDialogProps {
  apostaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após reabertura bem-sucedida — aqui o pai abre o editor real */
  onReabertura: (apostaId: string) => void;
}

export function ConfirmReaberturaDialog({
  apostaId,
  open,
  onOpenChange,
  onReabertura,
}: ConfirmReaberturaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [validacao, setValidacao] = useState<ValidacaoReaberturaResult | null>(
    null
  );

  useEffect(() => {
    if (!open || !apostaId) {
      setValidacao(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    validarReaberturaSurebet(apostaId)
      .then((res) => {
        if (!cancelled) setValidacao(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apostaId, open]);

  async function handleConfirm() {
    if (!apostaId) return;
    setExecutando(true);
    const result = await reabrirSurebet(apostaId);
    setExecutando(false);

    if (!result.success) {
      toast.error(result.error || "Falha ao reabrir aposta", {
        description: result.blockers
          ?.map((b) => `• ${b.message}`)
          .join("\n"),
      });
      return;
    }

    toast.success("Aposta reaberta com sucesso", {
      description: `${result.reversoes_aplicadas || 0} estorno(s) aplicado(s) — ${formatCurrency(
        result.total_revertido || 0,
        "BRL"
      )}`,
    });
    onOpenChange(false);
    onReabertura(apostaId);
  }

  const elegivel = validacao?.elegible ?? false;
  const blockers = validacao?.blockers ?? [];
  const pernas = validacao?.preview.pernas ?? [];
  const total = validacao?.preview.total_a_reverter ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Editar aposta liquidada
          </DialogTitle>
          <DialogDescription>
            Esta aposta já foi resolvida. Para editá-la, ela será reaberta e os
            prêmios pagos serão estornados no histórico financeiro.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Validando elegibilidade...
          </div>
        )}

        {!loading && validacao && !elegivel && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Reabertura bloqueada</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1 text-sm">
                {blockers.map((b, i) => (
                  <li key={i}>• {b.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {!loading && validacao && elegivel && (
          <div className="space-y-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Impacto financeiro previsto</AlertTitle>
              <AlertDescription className="text-sm">
                Stakes permanecem reservadas. Apenas os prêmios serão
                estornados. Tudo ficará registrado no histórico de auditoria.
              </AlertDescription>
            </Alert>

            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              {pernas.map((p) => (
                <div
                  key={p.perna_id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0">
                      #{p.ordem}
                    </Badge>
                    <span className="truncate">{p.bookmaker_nome}</span>
                    {p.resultado_atual && (
                      <Badge variant="secondary" className="text-[10px]">
                        {p.resultado_atual}
                      </Badge>
                    )}
                  </div>
                  <span
                    className={
                      p.payout_a_reverter > 0
                        ? "font-mono font-medium text-destructive"
                        : "font-mono text-muted-foreground"
                    }
                  >
                    {p.payout_a_reverter > 0
                      ? `-${formatCurrency(p.payout_a_reverter, p.moeda)}`
                      : "—"}
                  </span>
                </div>
              ))}

              {total > 0 && (
                <>
                  <div className="border-t pt-2 mt-2 flex items-center justify-between text-sm font-semibold">
                    <span>Total a estornar</span>
                    <span className="font-mono text-destructive">
                      -{formatCurrency(total, "BRL")}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Status: <span className="font-medium">{validacao.status_atual}</span>
              {" → "}
              <span className="font-medium text-foreground">PENDENTE</span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={executando}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!elegivel || executando || loading}
          >
            {executando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reabrir e editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
