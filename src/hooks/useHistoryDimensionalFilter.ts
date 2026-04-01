import { useState } from "react";
import type { HistoryDimensionalFilterState } from "@/components/projeto-detalhe/operations/HistoryDimensionalFilter";

export function useHistoryDimensionalFilter() {
  const [state, setState] = useState<HistoryDimensionalFilterState>({
    bookmakerIds: [],
    parceiroIds: [],
    resultados: [],
  });

  return { dimensionalFilter: state, setDimensionalFilter: setState };
}
