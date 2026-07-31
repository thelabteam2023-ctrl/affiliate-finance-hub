/**
 * Hook compartilhado de sincronização de formulários financeiros (Caixa Operacional).
 *
 * PROBLEMA QUE RESOLVE:
 * Os dialogs financeiros carregam suas fontes de dados (contas, wallets, bookmakers,
 * saldos) em estado local, dentro de um `useEffect([open])`. Quando o formulário
 * permanece aberto após registrar uma transação, nada dispara um novo fetch — o
 * usuário continua vendo saldos e seletores do estado ANTERIOR à transação.
 *
 * PADRÃO CONSOLIDADO REUTILIZADO:
 * `useInvalidateCaixaData()` + `dispatchCaixaDataChanged()` já são o mecanismo
 * oficial de propagação. Este hook faz os formulários passarem a ser CONSUMIDORES
 * desse mesmo sinal (via `useCaixaDataChangedListener`), em vez de criar um
 * mecanismo paralelo.
 *
 * USO:
 *   const sync = useCaixaFormSync({ open, refresh: refreshDataSources });
 *   // após sucesso:
 *   await sync.notifySuccess("Transação registrada — saldos atualizados");
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useCaixaDataChangedListener } from "./useInvalidateCaixaData";

interface UseCaixaFormSyncOptions {
  /** Dialog aberto? Refresh só ocorre com o formulário visível. */
  open: boolean;
  /** Recarrega TODAS as fontes de dados locais do formulário. */
  refresh: () => Promise<void> | void;
}

export interface CaixaFormSync {
  /** True enquanto as fontes de dados estão sendo relidas. */
  isRefreshing: boolean;
  /** Quantidade de lançamentos registrados nesta sessão do dialog. */
  successCount: number;
  /** Mensagem de confirmação inline (null = oculta). */
  confirmation: string | null;
  /** Oculta a confirmação manualmente. */
  dismissConfirmation: () => void;
  /** Força um refresh imediato das fontes de dados. */
  refresh: () => Promise<void>;
  /**
   * Chamar após sucesso: recarrega as fontes de dados do formulário.
   * Com `silent: true` (padrão dos formulários que já exibem toast) NÃO
   * popula a confirmação inline nem o contador de sessão.
   */
  notifySuccess: (message?: string, opts?: { silent?: boolean }) => Promise<void>;
}

const DEFAULT_MESSAGE = "Transação registrada — saldos atualizados";
const CONFIRMATION_TTL_MS = 4000;

export function useCaixaFormSync({ open, refresh }: UseCaixaFormSyncOptions): CaixaFormSync {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Ref evita recriar callbacks a cada render (a função `refresh` normalmente
  // é redefinida em todo render do dialog).
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const openRef = useRef(open);
  openRef.current = open;

  // Descarta respostas fora de ordem (usuário lança em sequência rápida).
  const requestIdRef = useRef(0);

  const doRefresh = useCallback(async () => {
    if (!openRef.current) return;
    const requestId = ++requestIdRef.current;
    setIsRefreshing(true);
    try {
      await refreshRef.current();
    } catch (error) {
      console.error("[useCaixaFormSync] Falha ao recarregar fontes de dados:", error);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsRefreshing(false);
      }
    }
  }, []);

  // Reage a QUALQUER mutação de caixa disparada no app enquanto o form está aberto.
  useCaixaDataChangedListener(
    useCallback(() => {
      void doRefresh();
    }, [doRefresh])
  );

  const notifySuccess = useCallback(
    async (message: string = DEFAULT_MESSAGE, opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setSuccessCount((c) => c + 1);
        setConfirmation(message);
      }
      await doRefresh();
    },
    [doRefresh]
  );

  const dismissConfirmation = useCallback(() => setConfirmation(null), []);

  // Auto-hide da confirmação inline
  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), CONFIRMATION_TTL_MS);
    return () => clearTimeout(timer);
  }, [confirmation]);

  // Reset ao fechar o dialog (nova sessão = novo contador)
  useEffect(() => {
    if (!open) {
      setConfirmation(null);
      setSuccessCount(0);
      requestIdRef.current++;
      setIsRefreshing(false);
    }
  }, [open]);

  return {
    isRefreshing,
    successCount,
    confirmation,
    dismissConfirmation,
    refresh: doRefresh,
    notifySuccess,
  };
}
