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
  
  // Dashboard (Visão Geral)
  DASHBOARD_CALENDARIO: "projeto-dashboard-calendario",
  DASHBOARD_APOSTAS: "projeto-dashboard-apostas",
  DASHBOARD_EXTRAS: "projeto-dashboard-extras",
  
  // Calendário por estratégia (Surebet, ValueBet, DuploGreen)
  CALENDAR_APOSTAS: "calendar-apostas",
  
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
/**
 * Tipo de operação financeira para invalidação granular.
 * Cada tipo invalida APENAS as queries afetadas.
 */
export type FinancialOperation = 
  | "aposta"           // criar/editar/liquidar/reverter apostas
  | "transacao"        // depósito/saque no caixa
  | "vinculo"          // vincular/desvincular bookmaker
  | "bonus"            // criar/editar/finalizar bônus
  | "giro"             // registrar giro grátis
  | "cashback"         // registrar cashback
  | "conciliacao"      // conciliar saldo
  | "full";            // invalidar TUDO (fallback)

/**
 * Mapa de quais query keys são afetadas por cada tipo de operação.
 */
const OPERATION_KEYS: Record<FinancialOperation, string[]> = {
  aposta: [
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS,
    FINANCIAL_STATE_KEYS.SALDO_OPERAVEL_RPC,
    FINANCIAL_STATE_KEYS.APOSTAS,
    FINANCIAL_STATE_KEYS.PROJETO_RESULTADO,
    FINANCIAL_STATE_KEYS.PROJETO_BREAKDOWNS,
    FINANCIAL_STATE_KEYS.DASHBOARD_CALENDARIO,
    FINANCIAL_STATE_KEYS.DASHBOARD_APOSTAS,
    FINANCIAL_STATE_KEYS.DASHBOARD_EXTRAS,
    FINANCIAL_STATE_KEYS.CALENDAR_APOSTAS,
    FINANCIAL_STATE_KEYS.EXPOSICAO_PROJETO,
    FINANCIAL_STATE_KEYS.CAPACIDADE_APOSTA,
  ],
  transacao: [
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS,
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS_FINANCEIRO,
    FINANCIAL_STATE_KEYS.SALDO_OPERAVEL_RPC,
    FINANCIAL_STATE_KEYS.PARCEIRO_FINANCEIRO,
    FINANCIAL_STATE_KEYS.PARCEIRO_CONSOLIDADO,
  ],
  vinculo: [
    FINANCIAL_STATE_KEYS.PROJETO_VINCULOS,
    FINANCIAL_STATE_KEYS.BOOKMAKERS_DISPONIVEIS,
    FINANCIAL_STATE_KEYS.BOOKMAKERS,
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS,
  ],
  bonus: [
    FINANCIAL_STATE_KEYS.BONUS,
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS,
    FINANCIAL_STATE_KEYS.PROJETO_RESULTADO,
  ],
  giro: [
    FINANCIAL_STATE_KEYS.GIROS_GRATIS,
    FINANCIAL_STATE_KEYS.GIROS_DISPONIVEIS,
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS,
    FINANCIAL_STATE_KEYS.PROJETO_RESULTADO,
  ],
  cashback: [
    FINANCIAL_STATE_KEYS.CASHBACK_MANUAL,
    FINANCIAL_STATE_KEYS.PROJETO_RESULTADO,
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS,
  ],
  conciliacao: [
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS,
    FINANCIAL_STATE_KEYS.BOOKMAKER_SALDOS_FINANCEIRO,
    FINANCIAL_STATE_KEYS.SALDO_OPERAVEL_RPC,
  ],
  full: Object.values(FINANCIAL_STATE_KEYS),
};

export function useInvalidateFinancialState() {
  const queryClient = useQueryClient();

  return useCallback(
    async (projetoId?: string, options?: {
      /** Se true, invalida queries globais além das do projeto */
      includeGlobal?: boolean;
      /** Se true, dispara evento para componentes legacy */
      dispatchEvent?: boolean;
      /** Tipo de operação — define quais queries invalidar (default: "full") */
      operation?: FinancialOperation;
    }) => {
      const { includeGlobal = false, dispatchEvent = true, operation = "full" } = options || {};
      
      const keysToInvalidate = OPERATION_KEYS[operation];
      const invalidations: Promise<void>[] = [];

      for (const key of keysToInvalidate) {
        if (projetoId) {
          // Invalidar com escopo de projeto
          invalidations.push(
            queryClient.invalidateQueries({ queryKey: [key, projetoId] })
          );
          // Variantes com sub-keys (historico, project prefix)
          if (key === FINANCIAL_STATE_KEYS.PROJETO_VINCULOS) {
            invalidations.push(
              queryClient.invalidateQueries({ queryKey: [key, "historico", projetoId] })
            );
          }
          if (key === FINANCIAL_STATE_KEYS.BONUS) {
            invalidations.push(
              queryClient.invalidateQueries({ queryKey: [key, "project", projetoId] })
            );
          }
        }
        
        if (includeGlobal || !projetoId) {
          // Invalidar globalmente (sem projetoId no key)
          invalidations.push(
            queryClient.invalidateQueries({ queryKey: [key] })
          );
        }
      }

      await Promise.all(invalidations);

      if (dispatchEvent && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lovable:financial-state-changed", {
          detail: { projetoId, timestamp: Date.now() }
        }));
      }
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
