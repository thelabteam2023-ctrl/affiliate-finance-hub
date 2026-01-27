import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * GRAFO ÚNICO DE INVALIDAÇÃO FINANCEIRA
 * 
 * Este hook centraliza a invalidação de TODAS as queries relacionadas
 * ao estado financeiro do sistema. Deve ser chamado após qualquer
 * mutation que afete dinheiro, saldos ou apostas.
 * 
 * REGRA FUNDAMENTAL:
 * Toda mutation financeira → invalidateFinancialState()
 * 
 * QUERIES INCLUÍDAS NO GRUPO FINANCIAL_STATE:
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ SALDOS                                                         │
 * │ - bookmaker-saldos (saldo real, operável, disponível)         │
 * │ - bookmaker-saldos-financeiro (visão financeira)              │
 * │ - saldo-operavel-rpc (RPC direto)                             │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ VÍNCULOS                                                       │
 * │ - projeto-vinculos (lista de casas vinculadas + saldos)       │
 * │ - projeto-vinculos/historico (histórico de vínculos)          │
 * │ - bookmakers-disponiveis (casas não vinculadas)               │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ KPIs                                                           │
 * │ - projeto-resultado (lucro, ROI, volume)                      │
 * │ - projeto-breakdowns (breakdown por módulo)                   │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ APOSTAS                                                        │
 * │ - apostas (lista de apostas do projeto)                       │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ EXPOSIÇÃO                                                      │
 * │ - exposicao-projeto (exposure financeira)                     │
 * │ - capacidade-aposta (capacidade de stake)                     │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ PARCEIROS                                                      │
 * │ - parceiro-financeiro (dados financeiros do parceiro)         │
 * │ - parceiro-consolidado (saldos agregados)                     │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * USO:
 * ```typescript
 * const invalidateFinancialState = useInvalidateFinancialState();
 * 
 * // Após qualquer mutation financeira:
 * await invalidateFinancialState(projetoId);
 * ```
 */

// Constantes das query keys para evitar typos
const FINANCIAL_STATE_KEYS = {
  // Saldos
  BOOKMAKER_SALDOS: "bookmaker-saldos",
  BOOKMAKER_SALDOS_FINANCEIRO: "bookmaker-saldos-financeiro",
  SALDO_OPERAVEL_RPC: "saldo-operavel-rpc",
  
  // Vínculos
  PROJETO_VINCULOS: "projeto-vinculos",
  BOOKMAKERS_DISPONIVEIS: "bookmakers-disponiveis",
  BOOKMAKERS: "bookmakers",
  
  // KPIs
  PROJETO_RESULTADO: "projeto-resultado",
  PROJETO_BREAKDOWNS: "projeto-breakdowns",
  
  // Apostas
  APOSTAS: "apostas",
  
  // Exposição
  EXPOSICAO_PROJETO: "exposicao-projeto",
  CAPACIDADE_APOSTA: "capacidade-aposta",
  
  // Parceiros
  PARCEIRO_FINANCEIRO: "parceiro-financeiro",
  PARCEIRO_CONSOLIDADO: "parceiro-consolidado",
  
  // Giros e Bônus
  GIROS_GRATIS: "giros-gratis",
  GIROS_DISPONIVEIS: "giros-disponiveis",
  BONUS: "bonus",
  CASHBACK_MANUAL: "cashback-manual",
} as const;

export type FinancialStateKey = keyof typeof FINANCIAL_STATE_KEYS;

/**
 * Hook principal para invalidação do estado financeiro completo.
 * 
 * USAR SEMPRE após:
 * - Criar/editar/excluir apostas
 * - Liquidar apostas (green/red)
 * - Reverter liquidação
 * - Conciliar saldos
 * - Transações no caixa (depósito/saque)
 * - Vincular/desvincular bookmakers
 * - Registrar giros grátis
 * - Registrar cashback
 */
export function useInvalidateFinancialState() {
  const queryClient = useQueryClient();

  return useCallback(
    async (projetoId?: string, options?: {
      /** Se true, invalida queries globais além das do projeto */
      includeGlobal?: boolean;
      /** Se true, dispara evento para componentes legacy */
      dispatchEvent?: boolean;
    }) => {
      const { includeGlobal = true, dispatchEvent = true } = options || {};
      
      const invalidations: Promise<void>[] = [];

      // ========================================
      // INVALIDAÇÃO POR PROJETO (quando temos projetoId)
      // ========================================
      if (projetoId) {
        // Saldos específicos do projeto
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS, projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.SALDO_OPERAVEL_RPC, projetoId] 
          })
        );

        // Vínculos do projeto
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.PROJETO_VINCULOS, projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.PROJETO_VINCULOS, "historico", projetoId] 
          })
        );

        // KPIs do projeto
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.PROJETO_RESULTADO, projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.PROJETO_BREAKDOWNS, projetoId] 
          })
        );

        // Apostas do projeto
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.APOSTAS, projetoId] 
          })
        );

        // Exposição do projeto
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.EXPOSICAO_PROJETO, projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.CAPACIDADE_APOSTA, projetoId] 
          })
        );

        // Giros e Bônus do projeto
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.GIROS_GRATIS, projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.GIROS_DISPONIVEIS, projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.BONUS, "project", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.CASHBACK_MANUAL, projetoId] 
          })
        );
      }

      // ========================================
      // INVALIDAÇÃO GLOBAL (sempre ou quando solicitado)
      // ========================================
      if (includeGlobal || !projetoId) {
        // Saldos globais
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS_FINANCEIRO] 
          })
        );

        // Bookmakers disponíveis (afetado por vínculos)
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.BOOKMAKERS_DISPONIVEIS] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.BOOKMAKERS] 
          })
        );

        // Parceiros (saldos consolidados de todas as casas)
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.PARCEIRO_FINANCEIRO] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: [FINANCIAL_STATE_KEYS.PARCEIRO_CONSOLIDADO] 
          })
        );
      }

      // Executar todas as invalidações em paralelo
      await Promise.all(invalidations);

      // Disparar evento para componentes legacy que ainda usam listeners
      if (dispatchEvent && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lovable:financial-state-changed", {
          detail: { projetoId, timestamp: Date.now() }
        }));
      }

      console.log(
        `[useInvalidateFinancialState] Invalidated FINANCIAL_STATE group`,
        { projetoId, includeGlobal, queriesInvalidated: invalidations.length }
      );
    },
    [queryClient]
  );
}

/**
 * Hook de conveniência que retorna uma função pré-configurada com o projetoId.
 * Útil para passar como callback para componentes filhos.
 */
export function useProjectFinancialInvalidation(projetoId: string) {
  const invalidateFinancialState = useInvalidateFinancialState();

  return useCallback(
    async (options?: Parameters<ReturnType<typeof useInvalidateFinancialState>>[1]) => {
      await invalidateFinancialState(projetoId, options);
    },
    [invalidateFinancialState, projetoId]
  );
}

/**
 * Exporta as constantes de query keys para uso em outros hooks.
 * Garante consistência de nomenclatura em todo o sistema.
 */
export { FINANCIAL_STATE_KEYS };
