import type { DailyEvent } from "@/hooks/useDailyEventsByDate";
import { normalizeEsporte } from "./mapDailyEventToFormFields";

/**
 * Normaliza variações de nome de país que aparecem em `daily_events`
 * (ex.: "EUA" e "Estados Unidos" coexistem para MLB).
 */
const COUNTRY_ALIASES: Record<string, string> = {
  eua: "Estados Unidos",
  usa: "Estados Unidos",
  "estados unidos": "Estados Unidos",
  uk: "Reino Unido",
  inglaterra: "Inglaterra",
  brasil: "Brasil",
  brazil: "Brasil",
};

export function normalizeCountry(country: string | null | undefined): string {
  if (!country) return "—";
  const raw = country.trim();
  const key = raw.toLowerCase();
  return COUNTRY_ALIASES[key] ?? raw;
}

export interface ExploradorFilterState {
  sports: string[];      // labels já normalizados (ex.: "Futebol")
  countries: string[];   // países já normalizados
  leagues: string[];     // nome da liga (raw, comparação case-insensitive)
}

export const EMPTY_FILTERS: ExploradorFilterState = {
  sports: [],
  countries: [],
  leagues: [],
};

export function isFiltersEmpty(f: ExploradorFilterState): boolean {
  return f.sports.length === 0 && f.countries.length === 0 && f.leagues.length === 0;
}

export function countActiveFilters(f: ExploradorFilterState): number {
  return f.sports.length + f.countries.length + f.leagues.length;
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface FilterOptions {
  sports: FilterOption[];
  countries: FilterOption[];
  leagues: FilterOption[];
}

/**
 * Deriva opções (com contagem) a partir dos eventos carregados.
 * Cada nível considera os filtros aplicados aos demais — para que contadores
 * reflitam o resultado real após aplicar os outros filtros (estilo facetado).
 */
export function computeFilterOptions(
  events: DailyEvent[],
  filters: ExploradorFilterState
): FilterOptions {
  const inc = (map: Map<string, number>, key: string) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const sports = new Map<string, number>();
  const countries = new Map<string, number>();
  const leagues = new Map<string, number>();

  for (const ev of events) {
    const sport = normalizeEsporte(ev.sport);
    const country = normalizeCountry(ev.country);
    const league = (ev.league_name ?? "—").trim() || "—";

    const matchSport = filters.sports.length === 0 || filters.sports.includes(sport);
    const matchCountry = filters.countries.length === 0 || filters.countries.includes(country);
    const matchLeague = filters.leagues.length === 0 || filters.leagues.includes(league);

    if (matchCountry && matchLeague) inc(sports, sport);
    if (matchSport && matchLeague) inc(countries, country);
    if (matchSport && matchCountry) inc(leagues, league);
  }

  const sortByCountDesc = (a: FilterOption, b: FilterOption) =>
    b.count - a.count || a.value.localeCompare(b.value, "pt-BR");

  return {
    sports: Array.from(sports, ([value, count]) => ({ value, count })).sort(sortByCountDesc),
    countries: Array.from(countries, ([value, count]) => ({ value, count })).sort(sortByCountDesc),
    leagues: Array.from(leagues, ([value, count]) => ({ value, count })).sort(sortByCountDesc),
  };
}

/** Aplica o conjunto de filtros a uma lista de eventos. */
export function applyExploradorFilters(
  events: DailyEvent[],
  filters: ExploradorFilterState
): DailyEvent[] {
  if (isFiltersEmpty(filters)) return events;
  return events.filter((ev) => {
    if (filters.sports.length > 0) {
      if (!filters.sports.includes(normalizeEsporte(ev.sport))) return false;
    }
    if (filters.countries.length > 0) {
      if (!filters.countries.includes(normalizeCountry(ev.country))) return false;
    }
    if (filters.leagues.length > 0) {
      const lg = (ev.league_name ?? "—").trim() || "—";
      if (!filters.leagues.includes(lg)) return false;
    }
    return true;
  });
}

// ---------------- Persistência (localStorage) ----------------

const STORAGE_KEY = "labbet.explorador.filters.v1";

export function loadStoredFilters(): ExploradorFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw);
    return {
      sports: Array.isArray(parsed?.sports) ? parsed.sports : [],
      countries: Array.isArray(parsed?.countries) ? parsed.countries : [],
      leagues: Array.isArray(parsed?.leagues) ? parsed.leagues : [],
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export function saveStoredFilters(f: ExploradorFilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota / private mode */
  }
}