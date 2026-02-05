import { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from "react";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";

/**
 * PADRÃO OFICIAL DE FILTROS DE DATA (CONTÁBIL)
 * 
 * - 1dia: data_operacional = hoje
 * - 7dias: hoje - 6 dias até hoje (7 dias incluindo hoje)
 * - mes_atual: primeiro dia do mês atual até hoje
 * - mes_anterior: primeiro ao último dia do mês anterior
 * - custom: período personalizado
 */
export type StandardPeriodFilter = "1dia" | "7dias" | "mes_atual" | "mes_anterior" | "custom";
export type EstrategiaFilter = "all" | "PUNTER" | "SUREBET" | "VALUEBET" | "DUPLO_GREEN" | "EXTRACAO_FREEBET" | "EXTRACAO_BONUS";

export interface DateRangeResult {
  start: Date;
  end: Date;
}

export interface OperationalFiltersState {
  // Filtro de período
  period: StandardPeriodFilter;
  customDateRange: DateRange | undefined;
  
  // Filtros transversais
  bookmakerIds: string[];
  parceiroIds: string[];
  estrategias: EstrategiaFilter[];
  
  // Resultado computado do período
  dateRange: DateRangeResult | null;
}

export interface OperationalFiltersContextValue extends OperationalFiltersState {
  // Setters de período
  setPeriod: (period: StandardPeriodFilter) => void;
  setCustomDateRange: (range: DateRange | undefined) => void;
  
  // Setters de filtros transversais
  setBookmakerIds: (ids: string[]) => void;
  setParceiroIds: (ids: string[]) => void;
  setEstrategias: (estrategias: EstrategiaFilter[]) => void;
  
  // Helpers
  toggleBookmaker: (id: string) => void;
  toggleParceiro: (id: string) => void;
  toggleEstrategia: (estrategia: EstrategiaFilter) => void;
  clearFilters: () => void;
  
  // Pré-selecionar estratégia baseado na aba
  setPreselectedEstrategia: (estrategia: EstrategiaFilter | null) => void;
  preselectedEstrategia: EstrategiaFilter | null;
  
  // Contagem de filtros ativos
  activeFiltersCount: number;
}

const STORAGE_KEY = "operational-filters";

const OperationalFiltersContext = createContext<OperationalFiltersContextValue | null>(null);

export function getDateRangeFromPeriod(
  period: StandardPeriodFilter,
  customRange?: DateRange
): DateRangeResult | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (period) {
    case "1dia":
      return { start: today, end: endOfDay(now) };
    
    case "7dias":
      return { start: subDays(today, 6), end: endOfDay(now) };
    
    case "mes_atual":
      return { start: startOfMonth(now), end: endOfDay(now) };
    
    case "mes_anterior":
      const prevMonth = subMonths(now, 1);
      return { 
        start: startOfMonth(prevMonth), 
        end: endOfDay(endOfMonth(prevMonth)) 
      };
    
    case "custom":
      if (customRange?.from) {
        return {
          start: startOfDay(customRange.from),
          end: endOfDay(customRange.to || customRange.from),
        };
      }
      return null;
    
    default:
      return null;
  }
}

interface OperationalFiltersProviderProps {
  children: ReactNode;
  projetoId: string;
}

export function OperationalFiltersProvider({ children, projetoId }: OperationalFiltersProviderProps) {
  // Estado base - Mês atual é o padrão contábil
  const [period, setPeriodState] = useState<StandardPeriodFilter>("mes_atual");
  const [customDateRange, setCustomDateRangeState] = useState<DateRange | undefined>(undefined);
  const [bookmakerIds, setBookmakerIdsState] = useState<string[]>([]);
  const [parceiroIds, setParceiroIdsState] = useState<string[]>([]);
  const [estrategias, setEstrategiasState] = useState<EstrategiaFilter[]>(["all"]);
  const [preselectedEstrategia, setPreselectedEstrategia] = useState<EstrategiaFilter | null>(null);

  // Carregar estado salvo
  useEffect(() => {
    const storageKey = `${STORAGE_KEY}-${projetoId}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.period) setPeriodState(parsed.period);
        if (parsed.bookmakerIds) setBookmakerIdsState(parsed.bookmakerIds);
        if (parsed.parceiroIds) setParceiroIdsState(parsed.parceiroIds);
        // Não restaurar customDateRange e estrategias para evitar estados inválidos
      } catch (e) {
        console.error("Erro ao restaurar filtros:", e);
      }
    }
  }, [projetoId]);

  // Salvar estado
  useEffect(() => {
    const storageKey = `${STORAGE_KEY}-${projetoId}`;
    const toSave = {
      period,
      bookmakerIds,
      parceiroIds,
    };
    localStorage.setItem(storageKey, JSON.stringify(toSave));
  }, [projetoId, period, bookmakerIds, parceiroIds]);

  // Computar dateRange
  const dateRange = useMemo(
    () => getDateRangeFromPeriod(period, customDateRange),
    [period, customDateRange]
  );

  // Setters
  const setPeriod = useCallback((p: StandardPeriodFilter) => {
    setPeriodState(p);
  }, []);

  const setCustomDateRange = useCallback((range: DateRange | undefined) => {
    setCustomDateRangeState(range);
    if (range?.from && range?.to) {
      setPeriodState("custom");
    }
  }, []);

  const setBookmakerIds = useCallback((ids: string[]) => {
    setBookmakerIdsState(ids);
  }, []);

  const setParceiroIds = useCallback((ids: string[]) => {
    setParceiroIdsState(ids);
  }, []);

  const setEstrategias = useCallback((e: EstrategiaFilter[]) => {
    setEstrategiasState(e);
  }, []);

  // Toggles
  const toggleBookmaker = useCallback((id: string) => {
    setBookmakerIdsState(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const toggleParceiro = useCallback((id: string) => {
    setParceiroIdsState(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const toggleEstrategia = useCallback((estrategia: EstrategiaFilter) => {
    setEstrategiasState(prev => {
      if (estrategia === "all") {
        return ["all"];
      }
      const withoutAll = prev.filter(e => e !== "all");
      if (withoutAll.includes(estrategia)) {
        const newList = withoutAll.filter(e => e !== estrategia);
        return newList.length === 0 ? ["all"] : newList;
      }
      return [...withoutAll, estrategia];
    });
  }, []);

  const clearFilters = useCallback(() => {
    setPeriodState("mes_atual");
    setCustomDateRangeState(undefined);
    setBookmakerIdsState([]);
    setParceiroIdsState([]);
    setEstrategiasState(["all"]);
  }, []);

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (bookmakerIds.length > 0) count++;
    if (parceiroIds.length > 0) count++;
    if (!estrategias.includes("all")) count++;
    if (period === "custom") count++;
    return count;
  }, [bookmakerIds, parceiroIds, estrategias, period]);

  const value: OperationalFiltersContextValue = useMemo(() => ({
    // Estado
    period,
    customDateRange,
    bookmakerIds,
    parceiroIds,
    estrategias,
    dateRange,
    preselectedEstrategia,
    
    // Setters
    setPeriod,
    setCustomDateRange,
    setBookmakerIds,
    setParceiroIds,
    setEstrategias,
    setPreselectedEstrategia,
    
    // Helpers
    toggleBookmaker,
    toggleParceiro,
    toggleEstrategia,
    clearFilters,
    activeFiltersCount,
  }), [
    period,
    customDateRange,
    bookmakerIds,
    parceiroIds,
    estrategias,
    dateRange,
    preselectedEstrategia,
    setPeriod,
    setCustomDateRange,
    setBookmakerIds,
    setParceiroIds,
    setEstrategias,
    toggleBookmaker,
    toggleParceiro,
    toggleEstrategia,
    clearFilters,
    activeFiltersCount,
  ]);

  return (
    <OperationalFiltersContext.Provider value={value}>
      {children}
    </OperationalFiltersContext.Provider>
  );
}

export function useOperationalFilters() {
  const context = useContext(OperationalFiltersContext);
  if (!context) {
    throw new Error("useOperationalFilters must be used within OperationalFiltersProvider");
  }
  return context;
}

// Hook opcional para casos onde o provider pode não existir
export function useOperationalFiltersOptional() {
  return useContext(OperationalFiltersContext);
}
