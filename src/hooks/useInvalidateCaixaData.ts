import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { PENDING_TRANSACTIONS_QUERY_KEY } from "./usePendingTransactions";

/**
 * Query keys centralizadas para o módulo Caixa Operacional.
 * Permite invalidação precisa após mutações.
 */
export const CAIXA_QUERY_KEYS = {
  transacoes: "caixa-transacoes",
  saldosFiat: "caixa-saldos-fiat",
  saldosCrypto: "caixa-saldos-crypto",
  saldosBookmakers: "caixa-saldos-bookmakers",
  saldoContasParceiros: "caixa-saldos-contas-parceiros",
  saldoWalletsParceiros: "caixa-saldos-wallets-parceiros",
} as const;

/**
 * Hook centralizado para invalidação reativa de dados do Caixa Operacional.
 * 
 * Deve ser chamado após qualquer mutação que afete:
 * - Transações (depósito, saque, transferência, aporte, liquidação)
 * - Saldos de caixa (FIAT e Crypto)
 * - Saldos de bookmakers
 * - Pending transactions (conciliação)
 * 
 * @example
 * const invalidateCaixa = useInvalidateCaixaData();
 * 
 * // Após criar transação:
 * await supabase.from("cash_ledger").insert(...);
 * invalidateCaixa(); // Força refetch de todos os dados
 */
export function useInvalidateCaixaData() {
  const queryClient = useQueryClient();

  return useCallback(
    async (options?: {
      /** Invalidar apenas chaves específicas (performance) */
      only?: (keyof typeof CAIXA_QUERY_KEYS | "pending")[];
    }) => {
      const { only } = options || {};

      const shouldInvalidate = (key: string) => {
        if (!only || only.length === 0) return true;
        return only.includes(key as any);
      };

      const invalidations: Promise<void>[] = [];

      // Transações do ledger
      if (shouldInvalidate("transacoes")) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: [CAIXA_QUERY_KEYS.transacoes],
          })
        );
      }

      // Saldos FIAT
      if (shouldInvalidate("saldosFiat")) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: [CAIXA_QUERY_KEYS.saldosFiat],
          })
        );
      }

      // Saldos Crypto
      if (shouldInvalidate("saldosCrypto")) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: [CAIXA_QUERY_KEYS.saldosCrypto],
          })
        );
      }

      // Saldos de Bookmakers (afeta Posição de Capital + FINANCIAL_STATE)
      if (shouldInvalidate("saldosBookmakers")) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: [CAIXA_QUERY_KEYS.saldosBookmakers],
          }),
          // FINANCIAL_STATE - Transações de caixa afetam saldos em todas as telas
          queryClient.invalidateQueries({
            queryKey: ["bookmaker-saldos"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["bookmaker-saldos-financeiro"],
          }),
          // Vínculos (saldos aparecem na aba vínculos)
          queryClient.invalidateQueries({
            queryKey: ["projeto-vinculos"],
          }),
          // KPIs (podem ser afetados por ajustes de saldo)
          queryClient.invalidateQueries({
            queryKey: ["projeto-resultado"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["projeto-breakdowns"],
          }),
          // Exposição
          queryClient.invalidateQueries({
            queryKey: ["exposicao-projeto"],
          }),
          // Parceiros
          queryClient.invalidateQueries({
            queryKey: ["parceiro-financeiro"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["parceiro-consolidado"],
          })
        );
      }

      // Saldos de Contas de Parceiros
      if (shouldInvalidate("saldoContasParceiros")) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: [CAIXA_QUERY_KEYS.saldoContasParceiros],
          })
        );
      }

      // Saldos de Wallets de Parceiros
      if (shouldInvalidate("saldoWalletsParceiros")) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: [CAIXA_QUERY_KEYS.saldoWalletsParceiros],
          })
        );
      }

      // Transações pendentes (conciliação)
      if (shouldInvalidate("pending")) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: [PENDING_TRANSACTIONS_QUERY_KEY],
          })
        );
      }

      await Promise.all(invalidations);

      console.log("[useInvalidateCaixaData] Cache invalidado", {
        keys: only || "ALL",
        timestamp: new Date().toISOString(),
      });
    },
    [queryClient]
  );
}

/**
 * Dispara evento global para componentes que usam estado local
 * (fallback para componentes não migrados para React Query)
 */
export const CAIXA_DATA_CHANGED_EVENT = "lovable:caixa-data-changed";

export function dispatchCaixaDataChanged() {
  const event = new CustomEvent(CAIXA_DATA_CHANGED_EVENT, {
    detail: { timestamp: Date.now() },
  });
  window.dispatchEvent(event);
}

/**
 * Hook para escutar mudanças de dados do Caixa.
 * Útil para componentes que ainda usam estado local.
 */
export function useCaixaDataChangedListener(callback: () => void) {
  const callbackRef = useCallback(callback, [callback]);

  // Usar useEffect com cleanup adequado
  if (typeof window !== "undefined") {
    window.addEventListener(CAIXA_DATA_CHANGED_EVENT, callbackRef as any);
    return () => {
      window.removeEventListener(CAIXA_DATA_CHANGED_EVENT, callbackRef as any);
    };
  }
}
