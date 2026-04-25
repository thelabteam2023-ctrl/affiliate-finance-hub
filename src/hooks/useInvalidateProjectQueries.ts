import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook centralizado para invalidação de cache do projeto.
 * 
 * FONTE ÚNICA DE VERDADE para garantir sincronização automática de KPIs
 * após qualquer mutação (INSERT, UPDATE, DELETE) em módulos do projeto.
 * 
 * Uso:
 * const invalidateProject = useInvalidateProjectQueries();
 * await invalidateProject(projetoId); // Dispara após mutação
 * 
 * Chaves invalidadas:
 * - projeto-resultado: KPIs de lucro, ROI, volume
 * - projeto-breakdowns: Breakdown por módulo (apostas, giros, cashback)
 * - bookmaker-saldos: Saldos das casas vinculadas
 * - bookmakers: Lista de bookmakers (após vincular/desvincular)
 * - vinculos: Vínculos do projeto com bookmakers
 * - apostas: Lista de apostas do projeto
 * - bonus: Bônus do projeto
 * - giros-gratis: Giros grátis (resultados)
 * - giros-disponiveis: Promoções disponíveis
 * - cashback-manual: Registros de cashback
 */
export function useInvalidateProjectQueries() {
  const queryClient = useQueryClient();

  return useCallback(
    async (projetoId: string, options?: { 
      /** Invalidar apenas chaves específicas (performance) */
      only?: (
        | "resultado" 
        | "breakdowns" 
        | "saldos" 
        | "bookmakers" 
        | "vinculos"
        | "apostas" 
        | "bonus" 
        | "giros" 
        | "cashback"
        | "dashboard"
        | "operacoes"
        | "central"
      )[];
    }) => {
      const { only } = options || {};
      
      const shouldInvalidate = (key: string) => {
        if (!only || only.length === 0) return true;
        return only.includes(key as any);
      };

      const invalidations: Promise<void>[] = [];

      // KPIs Centrais
      if (shouldInvalidate("resultado")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-resultado", projetoId] 
          })
        );
      }

      if (shouldInvalidate("breakdowns")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-breakdowns", projetoId] 
          })
        );
      }

      // Saldos de Bookmakers (afeta KPIs de Saldo Operável E aba Vínculos)
      if (shouldInvalidate("saldos")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["bookmaker-saldos", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["bookmaker-saldos"] 
          }),
          // CRITICAL: Also invalidate the saldo-operavel-rpc query
          queryClient.invalidateQueries({ 
            queryKey: ["saldo-operavel-rpc", projetoId] 
          }),
          // CRÍTICO: Saldos alimentam a aba Vínculos - SEMPRE invalidar juntos
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-vinculos", projetoId] 
          }),
          // CRÍTICO: Painel de Relacionamentos (contagem de contas/parceiros)
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-painel-contas", projetoId] 
          }),
          // Rollover por casa
          queryClient.invalidateQueries({ 
            queryKey: ["rollover-por-casa", projetoId] 
          })
        );
      }

      // Lista de Bookmakers
      if (shouldInvalidate("bookmakers")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["bookmakers", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["bookmakers"] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["bookmakers-disponiveis"] 
          })
        );
      }

      // Vínculos do projeto
      if (shouldInvalidate("vinculos")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-vinculos", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-vinculos", "historico", projetoId] 
          }),
          // Também invalidar parceiros consolidados (exposição muda)
          queryClient.invalidateQueries({ 
            queryKey: ["parceiro-financeiro"] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["parceiro-consolidado"] 
          }),
          // CRÍTICO: Painel de Relacionamentos - atualizar contadores
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-painel-contas", projetoId] 
          }),
          // Bookmakers disponíveis (lista muda quando vincula/desvincula)
          queryClient.invalidateQueries({ 
            queryKey: ["bookmakers-disponiveis"] 
          }),
          // Saldo operável - atualizar quando vínculos mudam
          queryClient.invalidateQueries({ 
            queryKey: ["saldo-operavel-rpc", projetoId] 
          }),
          // Rollover por casa
          queryClient.invalidateQueries({ 
            queryKey: ["rollover-por-casa", projetoId] 
          })
        );
      }

      // Apostas
      if (shouldInvalidate("apostas")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["apostas", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["surebets-tab", projetoId],
            refetchType: "active",
          })
        );
      }

      // Listas operacionais filtradas por aba/período
      if (shouldInvalidate("operacoes")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["surebets-tab", projetoId],
            refetchType: "active",
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["apostas", projetoId],
            refetchType: "active",
          })
        );
      }

      // Bônus
      if (shouldInvalidate("bonus")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["bonus", "project", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["bonus-bets-summary", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["bonus-bets-juice", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["bonus-analytics", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["bonus-ajustes-pos-limitacao", projetoId] 
          })
        );
      }

      // Central de Operações usa workspace/role na chave, então invalidamos por prefixo.
      if (shouldInvalidate("central") || !only || only.length === 0) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ["central-operacoes-data"],
            refetchType: "active",
          })
        );
      }

      // Giros Grátis
      if (shouldInvalidate("giros")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["giros-gratis", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["giros-disponiveis", projetoId] 
          })
        );
      }

      // Cashback
      if (shouldInvalidate("cashback")) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["cashback-manual", projetoId] 
          })
        );
      }

      // Dashboard (Evolução do Lucro, Calendário, Extras, Indicadores Financeiros)
      // CRÍTICO: Sempre invalidar quando qualquer dado financeiro muda
      if (shouldInvalidate("dashboard") || !only || only.length === 0) {
        invalidations.push(
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-dashboard-extras", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-dashboard-apostas", projetoId] 
          }),
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-dashboard-calendario", projetoId] 
          }),
          // CRÍTICO: Indicadores Financeiros (Fluxo Líquido Ajustado, Break-Even, etc.)
          queryClient.invalidateQueries({ 
            queryKey: ["projeto-financial-metrics", projetoId] 
          })
        );
      }

      await Promise.all(invalidations);
      
      console.log(`[useInvalidateProjectQueries] Invalidated queries for project ${projetoId}`, {
        keys: only || "ALL",
      });
    },
    [queryClient]
  );
}

/**
 * Hook para criar uma função de callback que invalida o projeto.
 * Útil para passar para sub-componentes sem precisar passar o projetoId.
 */
export function useProjectInvalidationCallback(projetoId: string) {
  const invalidateProject = useInvalidateProjectQueries();

  return useCallback(
    async (options?: Parameters<ReturnType<typeof useInvalidateProjectQueries>>[1]) => {
      await invalidateProject(projetoId, options);
    },
    [invalidateProject, projetoId]
  );
}
