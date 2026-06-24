import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AGE_BUCKETS,
  EMPTY_FILTER_STATE,
  FacetKey,
  FilterState,
  ItemAdapter,
  ageBucketOf,
} from "./types";

function storageKey(cardId: string, userId: string | null) {
  return `central-ops:filter:${cardId}:${userId || "anon"}`;
}

function loadState(cardId: string, userId: string | null): FilterState {
  if (typeof window === "undefined") return EMPTY_FILTER_STATE;
  try {
    const raw = localStorage.getItem(storageKey(cardId, userId));
    if (!raw) return EMPTY_FILTER_STATE;
    const parsed = JSON.parse(raw);
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      facets: (parsed.facets && typeof parsed.facets === "object") ? parsed.facets : {},
      sort: parsed.sort?.field && parsed.sort?.dir ? parsed.sort : EMPTY_FILTER_STATE.sort,
    };
  } catch {
    return EMPTY_FILTER_STATE;
  }
}

function ageLabelOf(key: string): string {
  return AGE_BUCKETS.find((b) => b.key === key)?.label || key;
}

export interface UseOperacoesFilterResult<T> {
  state: FilterState;
  setSearch: (s: string) => void;
  toggleFacet: (key: FacetKey, value: string) => void;
  clearFacet: (key: FacetKey) => void;
  clearAll: () => void;
  applyState: (s: FilterState) => void;
  toggleSort: (field: "data" | "valor") => void;
  /** Items filtrados + ordenados. */
  filtered: T[];
  /** Totais agregados pelos items filtrados, por moeda. */
  totalsByMoeda: { moeda: string; total: number }[];
  /** Opções de faceta com count + total agregado (dos items SEM o próprio filtro aplicado). */
  facetOptions: Record<FacetKey, FacetOption[]>;
  hasActiveFilters: boolean;
  totalItems: number;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  totalsByMoeda: { moeda: string; total: number }[];
}

export function useOperacoesFilter<T>(
  cardId: string,
  items: T[],
  adapter: ItemAdapter<T>,
  userId: string | null,
): UseOperacoesFilterResult<T> {
  const [state, setState] = useState<FilterState>(() => loadState(cardId, userId));
  const firstRun = useRef(true);

  // Persiste em localStorage (debounced via microtask).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey(cardId, userId), JSON.stringify(state));
    } catch {
      /* quota / privacy mode */
    }
  }, [state, cardId, userId]);

  const setSearch = useCallback((s: string) => setState((p) => ({ ...p, search: s })), []);

  const toggleFacet = useCallback((key: FacetKey, value: string) => {
    setState((p) => {
      const current = p.facets[key] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const facets = { ...p.facets };
      if (next.length === 0) delete facets[key];
      else facets[key] = next;
      return { ...p, facets };
    });
  }, []);

  const clearFacet = useCallback((key: FacetKey) => {
    setState((p) => {
      const facets = { ...p.facets };
      delete facets[key];
      return { ...p, facets };
    });
  }, []);

  const clearAll = useCallback(
    () => setState((p) => ({ ...EMPTY_FILTER_STATE, sort: p.sort })),
    [],
  );

  const applyState = useCallback((s: FilterState) => setState(s), []);

  const toggleSort = useCallback((field: "data" | "valor") => {
    setState((p) => {
      if (p.sort.field !== field) return { ...p, sort: { field, dir: "asc" } };
      return { ...p, sort: { field, dir: p.sort.dir === "asc" ? "desc" : "asc" } };
    });
  }, []);

  const dimensionOf = useCallback(
    (item: T, key: FacetKey): string | null => {
      switch (key) {
        case "parceiro": return adapter.getParceiro(item);
        case "casa": return adapter.getCasa(item);
        case "moeda": return adapter.getMoeda(item);
        case "projeto": return adapter.getProjeto(item);
        case "idade": return ageBucketOf(adapter.getCreatedAt(item));
      }
    },
    [adapter],
  );

  /** Aplica TODAS as facetas exceto `except`. Usado para options agnósticas. */
  const applyFacetsExcept = useCallback(
    (list: T[], except: FacetKey | null): T[] => {
      let result = list;
      (Object.keys(state.facets) as FacetKey[]).forEach((k) => {
        if (k === except) return;
        const allowed = state.facets[k];
        if (!allowed || allowed.length === 0) return;
        result = result.filter((item) => {
          const v = dimensionOf(item, k);
          return v != null && allowed.includes(v);
        });
      });
      return result;
    },
    [state.facets, dimensionOf],
  );

  const searchFiltered = useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => adapter.getSearchText(item).toLowerCase().includes(q));
  }, [items, state.search, adapter]);

  const filtered = useMemo(() => {
    const afterFacets = applyFacetsExcept(searchFiltered, null);
    const sorted = [...afterFacets].sort((a, b) => {
      if (state.sort.field === "valor") {
        const diff = adapter.getValor(b) - adapter.getValor(a);
        return state.sort.dir === "asc" ? -diff : diff;
      }
      const diff =
        new Date(adapter.getCreatedAt(b)).getTime() -
        new Date(adapter.getCreatedAt(a)).getTime();
      return state.sort.dir === "asc" ? -diff : diff;
    });
    return sorted;
  }, [searchFiltered, applyFacetsExcept, state.sort, adapter]);

  const totalsByMoeda = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((item) => {
      const m = adapter.getMoeda(item);
      map.set(m, (map.get(m) || 0) + adapter.getValor(item));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moeda, total]) => ({ moeda, total }));
  }, [filtered, adapter]);

  const facetOptions = useMemo(() => {
    const facetKeys: FacetKey[] = ["parceiro", "casa", "moeda", "projeto", "idade"];
    const out = {} as Record<FacetKey, FacetOption[]>;
    for (const key of facetKeys) {
      const pool = applyFacetsExcept(searchFiltered, key);
      const map = new Map<string, { count: number; totals: Map<string, number> }>();
      pool.forEach((item) => {
        const v = dimensionOf(item, key);
        if (!v) return;
        const cur = map.get(v) || { count: 0, totals: new Map() };
        cur.count += 1;
        const m = adapter.getMoeda(item);
        cur.totals.set(m, (cur.totals.get(m) || 0) + adapter.getValor(item));
        map.set(v, cur);
      });
      const options: FacetOption[] = Array.from(map.entries()).map(([value, info]) => ({
        value,
        label: key === "idade" ? ageLabelOf(value) : value,
        count: info.count,
        totalsByMoeda: Array.from(info.totals.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([moeda, total]) => ({ moeda, total })),
      }));
      // Ordem: por count desc; idade segue ordem dos buckets.
      if (key === "idade") {
        options.sort(
          (a, b) =>
            AGE_BUCKETS.findIndex((bk) => bk.key === a.value) -
            AGE_BUCKETS.findIndex((bk) => bk.key === b.value),
        );
      } else {
        options.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      }
      out[key] = options;
    }
    return out;
  }, [searchFiltered, applyFacetsExcept, dimensionOf, adapter]);

  const hasActiveFilters =
    state.search.trim().length > 0 ||
    Object.values(state.facets).some((arr) => arr && arr.length > 0);

  return {
    state,
    setSearch,
    toggleFacet,
    clearFacet,
    clearAll,
    applyState,
    toggleSort,
    filtered,
    totalsByMoeda,
    facetOptions,
    hasActiveFilters,
    totalItems: items.length,
  };
}