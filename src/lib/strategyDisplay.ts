/**
 * Mapa canônico ÚNICO de exibição de estratégia.
 *
 * REGRA: A fonte da verdade visual é `aposta.estrategia` (enum ApostaEstrategia).
 * Os valores BONUS, FREEBET e NORMAL NÃO existem aqui — esses são
 * `contexto_operacional` (de qual aba o formulário foi aberto), nunca
 * estratégia. Misturar os dois causa o bug de label divergente entre abas.
 */
import { Coins, Gift, ArrowLeftRight, TrendingUp, Zap, Target } from "lucide-react";
import type { ApostaEstrategia } from "./apostaConstants";

export interface StrategyDisplayConfig {
  label: string;
  short: string;
  icon: typeof Zap;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const STRATEGY_DISPLAY: Record<ApostaEstrategia, StrategyDisplayConfig> = {
  EXTRACAO_BONUS: {
    label: "Extração de Bônus",
    short: "BÔNUS",
    icon: Coins,
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-500/15 dark:bg-yellow-500/20",
    borderColor: "border-yellow-600/30 dark:border-yellow-500/30",
  },
  EXTRACAO_FREEBET: {
    label: "Extração de Freebet",
    short: "FREEBET",
    icon: Gift,
    color: "text-cyan-700 dark:text-cyan-400",
    bgColor: "bg-cyan-500/15 dark:bg-cyan-500/20",
    borderColor: "border-cyan-600/30 dark:border-cyan-500/30",
  },
  SUREBET: {
    label: "Surebet",
    short: "SUREBET",
    icon: ArrowLeftRight,
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-500/15 dark:bg-amber-500/20",
    borderColor: "border-amber-600/30 dark:border-amber-500/30",
  },
  VALUEBET: {
    label: "Valuebet",
    short: "VALUE",
    icon: TrendingUp,
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-500/15 dark:bg-purple-500/20",
    borderColor: "border-purple-600/30 dark:border-purple-500/30",
  },
  DUPLO_GREEN: {
    label: "Duplo Green",
    short: "DG",
    icon: Zap,
    color: "text-teal-700 dark:text-teal-400",
    bgColor: "bg-teal-500/15 dark:bg-teal-500/20",
    borderColor: "border-teal-600/30 dark:border-teal-500/30",
  },
  PUNTER: {
    label: "Punter",
    short: "PUNTER",
    icon: Target,
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-500/15 dark:bg-blue-500/20",
    borderColor: "border-blue-600/30 dark:border-blue-500/30",
  },
};

/**
 * Retorna o display canônico da estratégia da aposta.
 * IGNORA contexto_operacional (BONUS/FREEBET/NORMAL) — eles não são estratégia.
 * Fallback: PUNTER (estratégia neutra para dados legados sem `estrategia`).
 */
export function getStrategyDisplay(aposta: { estrategia?: string | null }): StrategyDisplayConfig {
  const key = aposta?.estrategia as ApostaEstrategia | undefined;
  if (key && key in STRATEGY_DISPLAY) return STRATEGY_DISPLAY[key];
  return STRATEGY_DISPLAY.PUNTER;
}