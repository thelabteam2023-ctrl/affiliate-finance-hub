import { useState, useCallback, useMemo, useEffect } from "react";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";

/**
 * Sistema de Filtros Independentes por Aba
 * 
 * ARQUITETURA:
 * - Cada aba mantém seu próprio estado de filtros
 * - Filtros NÃO são compartilhados entre abas
 * - Mudanças em uma aba NÃO afetam outras abas
 * - Estado pode ser persistido no localStorage por aba
 * 
 * PADRÃO OFICIAL DE FILTROS:
 * - 1dia: data_operacional = hoje (timezone operacional)
 * - 7dias: hoje - 6 dias até hoje
 * - mes_atual: primeiro dia do mês atual até hoje
 * - mes_anterior: primeiro dia do mês anterior até último dia do mês anterior
 * - custom: data_inicio selecionada até data_fim selecionada
 */

// Tipos de filtros - PADRÃO CONTÁBIL
export type StandardPeriodFilter = "1dia" | "7dias" | "mes_atual" | "mes_anterior" | "ano" | "custom";
export type EstrategiaFilter = "all" | "PUNTER" | "SUREBET" | "VALUEBET" | "DUPLO_GREEN" | "EXTRACAO_FREEBET" | "EXTRACAO_BONUS";
export type ResultadoFilter = "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID" | "PENDENTE";

export const RESULTADO_FILTER_OPTIONS: { value: ResultadoFilter; label: string; color: string }[] = [
  { value: "GREEN", label: "Green", color: "text-emerald-400" },
  { value: "RED", label: "Red", color: "text-red-400" },
  { value: "MEIO_GREEN", label: "Meio Green", color: "text-emerald-300" },
  { value: "MEIO_RED", label: "Meio Red", color: "text-red-300" },
  { value: "VOID", label: "Void", color: "text-muted-foreground" },
  { value: "PENDENTE", label: "Pendente", color: "text-yellow-400" },
];

export interface DateRangeResult {
  start: Date;
  end: Date;
}

export interface TabFiltersState {
  period: StandardPeriodFilter;
  customDateRange: DateRange | undefined;
  bookmakerIds: string[];
  parceiroIds: string[];
  estrategias: EstrategiaFilter[];
  resultados: ResultadoFilter[];
  dateRange: DateRangeResult | null;
}

export interface UseTabFiltersOptions {
  /** Identificador único da aba (ex: "surebet", "apostas", "promocoes") */
  tabId: string;
  /** ID do projeto para escopo de persistência */
  projetoId: string;
  /** Período padrão inicial */
  defaultPeriod?: StandardPeriodFilter;
  /** Se true, persiste estado no localStorage */
  persist?: boolean;
}

/**
 * Converte período em DateRange
 * 
 * REGRA-MÃE: Todas as datas respeitam timezone operacional (America/Sao_Paulo)
 */
export function getDateRangeFromPeriod(
  period: StandardPeriodFilter,
  customRange?: DateRange
): DateRangeResult | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (period) {
    case "1dia":
      // data_operacional = hoje
      return { start: today, end: endOfDay(now) };
    
    case "7dias":
      // hoje - 6 dias até hoje (7 dias total incluindo hoje)
      return { start: subDays(today, 6), end: endOfDay(now) };
    
    case "mes_atual":
      // primeiro dia do mês atual até hoje
      return { start: startOfMonth(now), end: endOfDay(now) };
    
    case "mes_anterior":
      // primeiro dia do mês anterior até último dia do mês anterior
      const prevMonth = subMonths(now, 1);
      return { 
        start: startOfMonth(prevMonth), 
        end: endOfDay(endOfMonth(prevMonth)) 
      };
    
    case "ano":
      // primeiro dia do ano atual até hoje
      return { start: startOfYear(now), end: endOfDay(now) };
    
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

/**
 * Hook de filtros independentes por aba.
 * 
 * IMPORTANTE: Este hook cria estado LOCAL para cada aba.
 * Filtros de uma aba NÃO afetam outras abas.
 * 
 * @example
 * ```tsx
 * // Na aba Surebet
 * const filters = useTabFilters({ tabId: "surebet", projetoId: "abc123" });
 * 
 * // Na aba Apostas (estado completamente separado)
 * const filters = useTabFilters({ tabId: "apostas", projetoId: "abc123" });
 * ```
 */
export function useTabFilters({
  tabId,
  projetoId,
  defaultPeriod = "mes_atual",
  persist = true,
}: UseTabFiltersOptions) {
  const storageKey = `tab-filters-${projetoId}-${tabId}`;

  // Estado local da aba
  const [period, setPeriodState] = useState<StandardPeriodFilter>(defaultPeriod);
  const [customDateRange, setCustomDateRangeState] = useState<DateRange | undefined>(undefined);
  const [bookmakerIds, setBookmakerIdsState] = useState<string[]>([]);
  const [parceiroIds, setParceiroIdsState] = useState<string[]>([]);
  const [estrategias, setEstrategiasState] = useState<EstrategiaFilter[]>(["all"]);
  const [resultados, setResultadosState] = useState<ResultadoFilter[]>([]);

  // Carregar estado salvo (apenas se persist=true)
  useEffect(() => {
    if (!persist) return;
    
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.period) setPeriodState(parsed.period);
        if (parsed.bookmakerIds) setBookmakerIdsState(parsed.bookmakerIds);
        if (parsed.parceiroIds) setParceiroIdsState(parsed.parceiroIds);
        // Não restaurar customDateRange e estrategias para evitar estados inválidos
      } catch (e) {
        console.error(`[useTabFilters] Erro ao restaurar filtros da aba ${tabId}:`, e);
      }
    }
  }, [storageKey, persist, tabId]);

  // Salvar estado (apenas se persist=true)
  useEffect(() => {
    if (!persist) return;
    
    const toSave = {
      period,
      bookmakerIds,
      parceiroIds,
    };
    localStorage.setItem(storageKey, JSON.stringify(toSave));
  }, [storageKey, persist, period, bookmakerIds, parceiroIds]);

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

  const setResultados = useCallback((r: ResultadoFilter[]) => {
    setResultadosState(r);
  }, []);

  const toggleResultado = useCallback((resultado: ResultadoFilter) => {
    setResultadosState(prev => {
      if (prev.includes(resultado)) {
        return prev.filter(r => r !== resultado);
      }
      return [...prev, resultado];
    });
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
    setPeriodState(defaultPeriod);
    setCustomDateRangeState(undefined);
    setBookmakerIdsState([]);
    setParceiroIdsState([]);
    setEstrategiasState(["all"]);
    setResultadosState([]);
  }, [defaultPeriod]);

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (bookmakerIds.length > 0) count++;
    if (parceiroIds.length > 0) count++;
    if (!estrategias.includes("all")) count++;
    if (resultados.length > 0) count++;
    if (period === "custom") count++;
    return count;
  }, [bookmakerIds, parceiroIds, estrategias, resultados, period]);

  return {
    // Identificação
    tabId,
    projetoId,
    
    // Estado
    period,
    customDateRange,
    bookmakerIds,
    parceiroIds,
    resultados,
    estrategias,
    dateRange,
    
    // Setters
    setPeriod,
    setCustomDateRange,
    setBookmakerIds,
    setParceiroIds,
    setEstrategias,
    setResultados,
    
    // Helpers
    toggleBookmaker,
    toggleParceiro,
    toggleEstrategia,
    toggleResultado,
    clearFilters,
    activeFiltersCount,
    
    // Verificações
    hasActiveFilters: activeFiltersCount > 0,
  };
}

// Tipo de retorno para uso em componentes
export type TabFiltersReturn = ReturnType<typeof useTabFilters>;
