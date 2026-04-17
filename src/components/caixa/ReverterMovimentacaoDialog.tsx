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
import { Undo2 } from "lucide-react";
import { useReverterMovimentacao } from "@/hooks/useReverterMovimentacao";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacao: any | null;
  resumoTransacao?: string;
}

export function ReverterMovimentacaoDialog({ open, onOpenChange, transacao, resumoTransacao }: Props) {
  const [motivo, setMotivo] = useState("");
  const { reverter } = useReverterMovimentacao();

  const handleConfirm = async () => {
    if (!transacao || motivo.trim().length < 5) return;
    try {
      await reverter.mutateAsync({
        transacaoId: transacao.id,
        motivo: motivo.trim(),
        projetoIdSnapshot: transacao.projeto_id_snapshot,
      });
      setMotivo("");
      onOpenChange(false);
    } catch {
      /* toast já mostrado no hook */
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) setMotivo(""); onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" />
            Reverter movimentação
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Será criado um <strong>lançamento espelho</strong> com origem e destino invertidos,
                anulando o efeito desta movimentação no caixa.
              </p>
              {resumoTransacao && (
                <div className="rounded-md border bg-muted/40 p-2 font-mono text-xs">
                  {resumoTransacao}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A transação original permanece visível no histórico para fins de auditoria.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-medium">Motivo (mín. 5 caracteres) *</label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Lançamento errado para o destino X"
            maxLength={200}
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={reverter.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={motivo.trim().length < 5 || reverter.isPending}
          >
            {reverter.isPending ? "Revertendo..." : "Reverter"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
