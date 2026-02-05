import { useMemo } from "react";
import { 
  useOperationalFiltersOptional,
  type EstrategiaFilter,
  type DateRangeResult,
  getDateRangeFromPeriod
} from "@/contexts/OperationalFiltersContext";
import { parseLocalDateTime } from "@/utils/dateUtils";

/**
 * Hook para aplicar filtros transversais em uma lista de operações.
 * Funciona com ou sem o OperationalFiltersProvider.
 */
export interface FilterableOperation {
  bookmaker_id?: string | null;
  parceiro_id?: string | null;
  estrategia?: string | null;
  data_aposta?: string;
  // Para surebets com pernas
  pernas?: Array<{
    bookmaker_id?: string;
    parceiro_id?: string;
  }>;
  // Parceiro pode estar no bookmaker
  bookmaker?: {
    parceiro_id?: string;
    parceiro?: {
      id?: string;
    };
  };
}

interface UseOperationalFiltersOptions {
  // Fallback para quando não há contexto
  defaultDateRange?: DateRangeResult | null;
  // Estratégia fixa (ignora o filtro de estratégia do contexto)
  fixedEstrategia?: string;
}

export function useOperationalFiltersQuery<T extends FilterableOperation>(
  operations: T[],
  options: UseOperationalFiltersOptions = {}
): {
  filtered: T[];
  dateRange: DateRangeResult | null;
  hasActiveFilters: boolean;
} {
  const contextFilters = useOperationalFiltersOptional();
  
  const filtered = useMemo(() => {
    if (!contextFilters) {
      // Sem contexto, retornar tudo (filtro de período via options)
      return operations;
    }
    
    const { bookmakerIds, parceiroIds, estrategias, dateRange } = contextFilters;
    
    return operations.filter(op => {
      // Filtro por período (se dateRange definido)
      if (dateRange && op.data_aposta) {
        const opDate = parseLocalDateTime(op.data_aposta);
        if (opDate < dateRange.start || opDate > dateRange.end) {
          return false;
        }
      }
      
      // Filtro por bookmaker (verifica pernas também)
      if (bookmakerIds.length > 0) {
        const opBookmakerId = op.bookmaker_id;
        const pernaBookmakerIds = (op.pernas || []).map(p => p.bookmaker_id).filter(Boolean);
        
        const hasBookmaker = 
          (opBookmakerId && bookmakerIds.includes(opBookmakerId)) ||
          pernaBookmakerIds.some(id => id && bookmakerIds.includes(id));
        
        if (!hasBookmaker) return false;
      }
      
      // Filtro por parceiro
      if (parceiroIds.length > 0) {
        const opParceiroId = 
          op.parceiro_id || 
          op.bookmaker?.parceiro_id || 
          op.bookmaker?.parceiro?.id;
        
        const pernaParceiroIds = (op.pernas || []).map(p => p.parceiro_id).filter(Boolean);
        
        const hasParceiro = 
          (opParceiroId && parceiroIds.includes(opParceiroId)) ||
          pernaParceiroIds.some(id => id && parceiroIds.includes(id));
        
        if (!hasParceiro) return false;
      }
      
      // Filtro por estratégia (a menos que seja fixa)
      if (!options.fixedEstrategia && !estrategias.includes("all")) {
        if (!op.estrategia || !estrategias.includes(op.estrategia as EstrategiaFilter)) {
          return false;
        }
      }
      
      return true;
    });
  }, [operations, contextFilters, options.fixedEstrategia]);

  const dateRange = contextFilters?.dateRange ?? options.defaultDateRange ?? null;
  
  const hasActiveFilters = useMemo(() => {
    if (!contextFilters) return false;
    return contextFilters.activeFiltersCount > 0;
  }, [contextFilters]);

  return { filtered, dateRange, hasActiveFilters };
}

/**
 * Hook simplificado para obter apenas o dateRange do contexto
 */
export function useFiltersDateRange(fallbackPeriod: "1dia" | "7dias" | "mes_atual" | "mes_anterior" = "mes_atual") {
  const contextFilters = useOperationalFiltersOptional();
  
  return useMemo(() => {
    if (contextFilters) {
      return contextFilters.dateRange;
    }
    return getDateRangeFromPeriod(fallbackPeriod);
  }, [contextFilters, fallbackPeriod]);
}

/**
 * Hook para verificar se um bookmaker específico está selecionado nos filtros
 */
export function useBookmakerFilterMatch(bookmakerIds: string[]): boolean {
  const contextFilters = useOperationalFiltersOptional();
  
  return useMemo(() => {
    if (!contextFilters || contextFilters.bookmakerIds.length === 0) {
      return true; // Sem filtro = todos passam
    }
    return bookmakerIds.some(id => contextFilters.bookmakerIds.includes(id));
  }, [contextFilters, bookmakerIds]);
}

/**
 * Hook para verificar se um parceiro específico está selecionado nos filtros
 */
export function useParceiroFilterMatch(parceiroIds: string[]): boolean {
  const contextFilters = useOperationalFiltersOptional();
  
  return useMemo(() => {
    if (!contextFilters || contextFilters.parceiroIds.length === 0) {
      return true; // Sem filtro = todos passam
    }
    return parceiroIds.some(id => contextFilters.parceiroIds.includes(id));
  }, [contextFilters, parceiroIds]);
}
