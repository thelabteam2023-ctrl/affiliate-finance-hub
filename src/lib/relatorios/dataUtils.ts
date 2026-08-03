
import { formatCurrency } from "@/utils/formatCurrency";

export type DataClassification = {
  display: string;
  flag: string | null;
  semantic: "pos" | "neg" | "neutral" | "warn";
};

/**
 * Regra 6.2: Zero vs. Sem dado vs. Bug
 */
export function classifyFinancialValue(
  value: number,
  dependencyCount: number,
  label: string
): DataClassification {
  // Zero real: Houve volume mas o resultado é zero (ou volume é zero e count é zero)
  if (value === 0 && dependencyCount === 0) {
    return {
      display: formatCurrency(0),
      flag: null,
      semantic: "neutral",
    };
  }

  // Zero suspeito: Existe contagem mas o valor é zero
  if (value === 0 && dependencyCount > 0) {
    return {
      display: "—",
      flag: `Inconsistência: ${label} zerado com ${dependencyCount} registros`,
      semantic: "warn",
    };
  }

  return {
    display: formatCurrency(value),
    flag: null,
    semantic: value > 0 ? "pos" : value < 0 ? "neg" : "neutral",
  };
}

/**
 * Regra 6.3: Reconciliação automática
 */
export function checkReconciliation(
  components: number[],
  reference: number,
  tolerance = 1.0
): {
  formula: string;
  calculated: number;
  diff: number;
  show: boolean;
} {
  const calculated = components.reduce((a, b) => a + b, 0);
  const diff = calculated - reference;
  const show = Math.abs(diff) > tolerance;

  return {
    formula: components.map(c => formatCurrency(c)).join(" + "),
    calculated,
    diff,
    show,
  };
}

/**
 * Regra 6.5: Mapeamento semântico
 */
export function getSemanticColor(type: "pos" | "neg" | "neutral" | "warn"): string {
  const colors = {
    pos: "#34D399",
    neg: "#F87171",
    neutral: "#9098A8",
    warn: "#FBBF24",
  };
  return colors[type];
}
