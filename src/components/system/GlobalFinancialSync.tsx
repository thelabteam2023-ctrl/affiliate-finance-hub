import { useGlobalFinancialSync } from "@/hooks/useGlobalFinancialSync";

/**
 * Componente invisível montado uma única vez no App.
 * Mantém saldos, KPIs de patrimônio e calculadoras sincronizados
 * após qualquer operação financeira (inclusive em outra janela), sem F5.
 */
export function GlobalFinancialSync() {
  useGlobalFinancialSync();
  return null;
}
