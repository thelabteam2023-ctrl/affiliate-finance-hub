import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  PT_EN_TEAM_ALIASES,
  applyPtAlias,
  normalizeLogoName,
} from './useLogoFallback';

/**
 * Bandeiras de países desacopladas do esporte.
 *
 * Motivação: o cache `team_logos` armazena as bandeiras das seleções
 * nacionais quase exclusivamente sob `sport = 'soccer'`. Ao registrar
 * uma aposta em outro esporte (ex.: polo aquático Austrália x Itália),
 * o resolvedor sport-específico (`useLogoFallback`) não encontrava o
 * escudo. Aqui carregamos uma única vez as bandeiras dos países
 * conhecidos e expomos um lookup independente do esporte.
 */

// Whitelist de nomes normalizados que representam países/seleções.
// Inclui as chaves PT-BR e os alvos em inglês do mapa de aliases.
const COUNTRY_WHITELIST: Set<string> = new Set([
  ...Object.keys(PT_EN_TEAM_ALIASES),
  ...Object.values(PT_EN_TEAM_ALIASES),
]);

type FlagMap = Map<string, string>;

// Cache module-level: evita refetch a cada montagem de card.
let cachedFlagMap: FlagMap | null = null;
let inflight: Promise<FlagMap> | null = null;

const pickPreferred = (urls: string[]): string => {
  const apiSports = urls.find((u) => u.includes('api-sports.io'));
  return apiSports ?? urls[0];
};

async function loadFlagMap(): Promise<FlagMap> {
  if (cachedFlagMap) return cachedFlagMap;
  if (inflight) return inflight;

  inflight = (async () => {
    const names = Array.from(COUNTRY_WHITELIST);
    const pageSize = 1000;
    const grouped = new Map<string, Set<string>>();

    // Consulta uma única vez (paginada por segurança) o cache de soccer,
    // que é a fonte canônica das bandeiras.
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('team_logos')
        .select('team_name_normalized, logo_url')
        .eq('sport', 'soccer')
        .in('team_name_normalized', names)
        .not('logo_url', 'is', null)
        .range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      for (const row of data) {
        const key = (row as { team_name_normalized: string }).team_name_normalized;
        const url = (row as { logo_url: string | null }).logo_url;
        if (!key || !url) continue;
        const set = grouped.get(key) ?? new Set<string>();
        set.add(url);
        grouped.set(key, set);
      }
      if (data.length < pageSize) break;
    }

    const map: FlagMap = new Map();
    for (const [name, urls] of grouped.entries()) {
      map.set(name, pickPreferred(Array.from(urls)));
    }
    cachedFlagMap = map;
    return map;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function useCountryFlag() {
  const [map, setMap] = useState<FlagMap | null>(cachedFlagMap);

  useEffect(() => {
    if (cachedFlagMap) {
      if (!map) setMap(cachedFlagMap);
      return;
    }
    let cancelled = false;
    loadFlagMap().then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [map]);

  const getCountryFlag = useCallback(
    (teamName: string | null | undefined): string | null => {
      if (!teamName) return null;
      const norm = applyPtAlias(normalizeLogoName(teamName));
      if (!norm || !COUNTRY_WHITELIST.has(norm)) return null;
      return (map ?? cachedFlagMap)?.get(norm) ?? null;
    },
    [map],
  );

  return { getCountryFlag, loaded: !!map };
}