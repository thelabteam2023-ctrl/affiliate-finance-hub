/**
 * Hook que envolve o callback `onEdit` de uma surebet.
 *
 * - Se a aposta está PENDENTE → executa onEdit direto
 * - Se a aposta está liquidada → abre dialog de confirmação;
 *   após reabertura bem-sucedida, executa onEdit
 *
 * Uso:
 * ```tsx
 * const { wrapOnEdit, ReaberturaDialog } = useReabrirSurebetGuard();
 *
 * <SurebetCard
 *   surebet={s}
 *   onEdit={wrapOnEdit((surebet) => abrirDialogEdicao(surebet), s)}
 * />
 * {ReaberturaDialog}
 * ```
 */

import { useState, useCallback, useRef } from "react";
import { ConfirmReaberturaDialog } from "@/components/surebet/ConfirmReaberturaDialog";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_LIQUIDADOS = new Set([
  "GREEN",
  "RED",
  "VOID",
  "MEIO_GREEN",
  "MEIO_RED",
]);

interface SurebetMinimal {
  id: string;
  status?: string | null;
  forma_registro?: string | null;
}

export function useReabrirSurebetGuard() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingApostaId, setPendingApostaId] = useState<string | null>(null);
  const pendingCallbackRef = useRef<((id: string) => void) | null>(null);
  const queryClient = useQueryClient();

  const wrapOnEdit = useCallback(
    <T extends SurebetMinimal>(
      originalOnEdit: ((surebet: T) => void) | undefined,
      surebet: T
    ) => {
      return () => {
        if (!originalOnEdit) return;

        const status = (surebet.status || "PENDENTE").toUpperCase();
        const isLiquidada = STATUS_LIQUIDADOS.has(status);

        if (!isLiquidada) {
          // Aposta pendente: edita direto
          originalOnEdit(surebet);
          return;
        }

        // Aposta liquidada: abre confirmação
        pendingCallbackRef.current = () => originalOnEdit(surebet);
        setPendingApostaId(surebet.id);
        setDialogOpen(true);
      };
    },
    []
  );

  const handleAfterReabertura = useCallback(
    (apostaId: string) => {
      // Invalidar caches para refletir o novo status PENDENTE
      queryClient.invalidateQueries({ queryKey: ["apostas"] });
      queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
      queryClient.invalidateQueries({ queryKey: ["financial-events"] });

      // Executar callback original (abrir editor)
      // Pequeno delay para o cache atualizar antes do dialog de edição abrir
      setTimeout(() => {
        pendingCallbackRef.current?.(apostaId);
        pendingCallbackRef.current = null;
      }, 150);
    },
    [queryClient]
  );

  const ReaberturaDialog = (
    <ConfirmReaberturaDialog
      apostaId={pendingApostaId}
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          pendingCallbackRef.current = null;
          setPendingApostaId(null);
        }
      }}
      onReabertura={handleAfterReabertura}
    />
  );

  return { wrapOnEdit, ReaberturaDialog };
}
