import { QueryClient } from "@tanstack/react-query";

/**
 * FONTE ÚNICA das query keys que dependem, direta ou indiretamente,
 * do saldo atual das bookmakers (`bookmakers.saldo_atual` / `saldo_freebet`).
 *
 * Qualquer componente que exiba saldo/patrimônio DEVE usar uma destas keys —
 * assim a sincronização global (useGlobalFinancialSync) o mantém atualizado
 * sem F5, independente de qual janela/aba executou a mutação.
 */
export const BALANCE_DEPENDENT_QUERY_KEYS: string[] = [
  // Saldos canônicos
  "bookmaker-saldos",
  "bookmaker-saldos-financeiro",
  "saldo-operavel-rpc",
  "bookmakers",
  "bookmakers-disponiveis",
  "projeto-vinculos",
  // KPIs de patrimônio / métricas financeiras
  "projeto-financial-metrics",
  "projeto-resultado",
  "projeto-breakdowns",
  "projeto-lucro-kpi-canonical",
  "projeto-dashboard-data",
  "projeto-recuperacao-capital",
  "exposicao-financeira",
  "exposicao-projeto",
  "capacidade-aposta",
  "posicao-capital",
  "capital-snapshots",
  // Consolidações globais
  "financeiro-data",
  "parceiros-data",
  "parceiro-financeiro",
  "parceiro-financeiro-consolidado",
  "parceiro-consolidado",
  "central-operacoes-data",
  "bookmaker-analise",
  "freebet-estoque",
];

/**
 * Invalida TODAS as queries dependentes de saldo (escopo global — sem projetoId),
 * marcando-as como stale e refazendo fetch das que estão montadas.
 */
export async function invalidateBalanceDependentQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    BALANCE_DEPENDENT_QUERY_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: [key], refetchType: "active" }),
    ),
  );
}
