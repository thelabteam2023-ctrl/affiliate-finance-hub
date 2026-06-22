export const ARBITRAGEM_FORMA_REGISTRO = "ARBITRAGEM";

type OperationVisibilityInput = {
  forma_registro?: string | null;
  estrategia?: string | null;
  cancelled_at?: string | null;
};

export function isArbitrageOperation(operation: OperationVisibilityInput): boolean {
  return operation.forma_registro === ARBITRAGEM_FORMA_REGISTRO;
}

export function shouldLoadInSurebetOperations(operation: OperationVisibilityInput): boolean {
  return isArbitrageOperation(operation) && !operation.cancelled_at;
}

export function surebetMatchesEstrategiaFilter(
  operation: OperationVisibilityInput,
  selectedEstrategias: string[]
): boolean {
  if (selectedEstrategias.includes("all")) return true;

  const estrategia = operation.estrategia || "SUREBET";
  if (selectedEstrategias.includes(estrategia)) return true;

  // In the unified "Todas Apostas" filter, the "Surebet" option is also used
  // operationally by users to find anything created by the Arbitragem/Surebet form.
  return isArbitrageOperation(operation) && selectedEstrategias.includes("SUREBET");
}