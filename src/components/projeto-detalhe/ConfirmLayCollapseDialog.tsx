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
import { AlertTriangle } from "lucide-react";

export interface LayCollapseEntryPreview {
  /** Identificador opcional (id da entrada) — usado só para key */
  id?: string;
  /** Nome da casa (preferencial) ou fallback */
  bookmaker_nome: string;
  /** Stake da entrada como string formatada (ex: "R$ 50,00") */
  stake_formatado?: string;
  /** Odd da entrada (opcional, para contexto) */
  odd?: number | string | null;
}

interface ConfirmLayCollapseDialogProps {
  open: boolean;
  /** Entradas que serão REMOVIDAS ao confirmar (não inclui a entrada principal que permanece) */
  entriesToRemove: LayCollapseEntryPreview[];
  /** Casa que ficará como a única casa da perna após o colapso */
  remainingBookmakerNome?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Modal de confirmação exigido pela regra de produto:
 * "Perna LAY não pode ter sub-entradas (composição multi-casa)".
 *
 * Quando o usuário tenta marcar como LAY uma perna que tem 2+ entradas,
 * exibimos exatamente quais entradas (e seus stakes/casas) serão removidas
 * — nunca remoção silenciosa.
 *
 * Reutilizável: qualquer futura tela que exponha toggle BACK/LAY por perna
 * deve chamar este componente antes de aplicar o colapso.
 */
export function ConfirmLayCollapseDialog({
  open,
  entriesToRemove,
  remainingBookmakerNome,
  onCancel,
  onConfirm,
}: ConfirmLayCollapseDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Mudar para LAY vai remover {entriesToRemove.length} casa{entriesToRemove.length === 1 ? "" : "s"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Pernas LAY suportam apenas <strong>1 casa</strong>. As entradas adicionais
                abaixo serão removidas desta perna:
              </p>
              <ul className="border rounded-md divide-y bg-muted/30">
                {entriesToRemove.map((e, i) => (
                  <li key={e.id ?? i} className="flex items-center justify-between px-3 py-2">
                    <span className="font-medium">{e.bookmaker_nome}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {e.odd != null && e.odd !== "" ? `@${e.odd}` : ""}
                      {e.stake_formatado ? ` · ${e.stake_formatado}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {remainingBookmakerNome && (
                <p className="text-xs text-muted-foreground">
                  A perna ficará apenas com <strong>{remainingBookmakerNome}</strong> como casa.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Esta ação não afeta saldo nem ledger — apenas reorganiza o formulário antes
                de enviar. Você pode cancelar e manter o modo BACK.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Remover e mudar para LAY
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}