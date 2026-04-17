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
import { supabase } from "@/integrations/supabase/client";

// Valores que indicam aposta liquidada — pode aparecer tanto na coluna `status`
// (LIQUIDADA) quanto na coluna `resultado` (GREEN/RED/VOID/MEIO_*).
// Em alguns cards o `surebet.status` recebe na verdade o valor de `resultado`,
// por isso aceitamos ambos os conjuntos.
const STATUS_LIQUIDADOS = new Set([
  "LIQUIDADA",
  "GREEN",
  "RED",
  "VOID",
  "MEIO_GREEN",
  "MEIO_RED",
]);

interface SurebetMinimal {
  id: string;
  status?: string | null;
  resultado?: string | null;
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
        const resultado = (surebet.resultado || "").toUpperCase();
        const isLiquidada =
          STATUS_LIQUIDADOS.has(status) || STATUS_LIQUIDADOS.has(resultado);

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
      // Capturar callback ANTES de qualquer cleanup do dialog
      const cb = pendingCallbackRef.current;
      pendingCallbackRef.current = null;

      // Invalidar caches para refletir o novo status PENDENTE
      queryClient.invalidateQueries({ queryKey: ["apostas"] });
      queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
      queryClient.invalidateQueries({ queryKey: ["financial-events"] });

      // Executar callback original (abrir editor)
      // Pequeno delay para o cache atualizar antes do dialog de edição abrir
      setTimeout(() => {
        cb?.(apostaId);
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
          // NÃO limpar pendingCallbackRef aqui — handleAfterReabertura já cuida disso.
          // Limpar aqui causaria race condition: o onReabertura chama onOpenChange(false)
          // antes de disparar o callback, fazendo com que o editor nunca abra.
          setPendingApostaId(null);
        }
      }}
      onReabertura={handleAfterReabertura}
    />
  );

  return { wrapOnEdit, ReaberturaDialog };
}
