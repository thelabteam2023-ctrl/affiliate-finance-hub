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
import { Trash2, AlertTriangle } from "lucide-react";
import { useReverterMovimentacao } from "@/hooks/useReverterMovimentacao";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacao: any | null;
  resumoTransacao?: string;
}

export function ExcluirMovimentacaoDialog({ open, onOpenChange, transacao, resumoTransacao }: Props) {
  const [motivo, setMotivo] = useState("");
  const { excluir } = useReverterMovimentacao();

  const handleConfirm = async () => {
    if (!transacao || motivo.trim().length < 5) return;
    try {
      await excluir.mutateAsync({
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
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Excluir movimentação
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <span>
                  Ação <strong>irreversível</strong>. A movimentação será removida do histórico,
                  mas um snapshot completo será gravado no log de auditoria.
                </span>
              </div>
              {resumoTransacao && (
                <div className="rounded-md border bg-muted/40 p-2 font-mono text-xs">
                  {resumoTransacao}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Disponível apenas nos primeiros 30 minutos após criação. Para movimentações mais antigas, use Reverter.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-medium">Motivo (mín. 5 caracteres) *</label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Duplicidade — lançado por engano"
            maxLength={200}
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={motivo.trim().length < 5 || excluir.isPending}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {excluir.isPending ? "Excluindo..." : "Excluir definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
