import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const normalize = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Tokenização preservando palavras (para matching token-a-token sem risco
// de substring "encaixar" em outro nome — ex.: "inter" dentro de "internacional").
const tokenize = (s: string): string[] =>
  (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 6 && !STOPWORDS.includes(t));

// Stop-words / sufixos comuns em nomes de clubes que atrapalham matching parcial
const STOPWORDS = [
  'fc', 'cf', 'sc', 'ac', 'afc', 'cfc', 'sk', 'rc', 'as',
  'club', 'clube', 'futebol', 'football', 'soccer',
  'de', 'do', 'da', 'of', 'the',
  'ec', 'ce', 'se', 'aa', 'aac',
];

const GENERIC_MATCH_TOKENS = new Set([
  'athletic', 'atletico', 'sporting', 'racing', 'central', 'united',
  'city', 'real', 'deportivo', 'nacional', 'independiente', 'wanderers',
  'rangers', 'rovers', 'county', 'town',
]);

const stripStopwordsAndDigits = (norm: string): string => {
  // Remove dígitos (anos como "07", "1900") e stopwords
  let s = norm.replace(/[0-9]/g, '');
  for (const w of STOPWORDS) {
    // remove ocorrências do stopword como prefixo/sufixo/standalone
    const re = new RegExp(`(^${w}|${w}$)`, 'g');
    s = s.replace(re, '');
  }
  return s;
};

interface TeamRow {
  league_key: string;
  team_name_normalized: string;
  team_name_original: string;
  logo_url: string | null;
}
interface LeagueRow {
  league_key: string;
  league_name: string;
  logo_url: string | null;
}

const pickSafeTokenLogo = (
  queryTokens: string[],
  candidates: Array<{ tokens: string[]; logo: string; tokenCount: number }>,
): string | null => {
  if (queryTokens.length === 0) return null;
  const qSet = new Set(queryTokens);
  const valid = candidates
    .map((candidate) => {
      const matchedTokens = candidate.tokens.filter((token) => qSet.has(token));
      const matched = matchedTokens.length;
      if (matched === 0) return null;
      const minSide = Math.min(candidate.tokenCount, queryTokens.length);
      if (matched < minSide) return null;

      // Se o match depende de uma única palavra, ela precisa ser distintiva.
      // Evita Athletic Club (MG) herdar Athletic Club/Bilbao apenas por "athletic".
      if (minSide === 1) {
        const onlyToken = matchedTokens[0];
        if (!onlyToken || onlyToken.length < 7 || GENERIC_MATCH_TOKENS.has(onlyToken)) return null;
      }

      const ratio = matched / Math.max(candidate.tokenCount, queryTokens.length);
      const matchedChars = matchedTokens.reduce((sum, token) => sum + token.length, 0);
      return { logo: candidate.logo, matched, ratio, matchedChars };
    })
    .filter((item): item is { logo: string; matched: number; ratio: number; matchedChars: number } => !!item)
    .sort((a, b) =>
      b.ratio - a.ratio ||
      b.matched - a.matched ||
      b.matchedChars - a.matchedChars
    );

  if (valid.length === 0) return null;
  const best = valid[0];
  const tied = valid.filter((item) =>
    item.ratio === best.ratio &&
    item.matched === best.matched &&
    item.matchedChars === best.matchedChars
  );
  const uniqueLogos = new Set(tied.map((item) => item.logo));
  return uniqueLogos.size === 1 ? best.logo : null;
};

/**
 * Carrega logos cacheados (team_logos + league_logos) para um esporte
 * e expõe lookups para usar como fallback quando os eventos não trazem
 * logo do API direto. Single source of truth: banco local.
 */
export function useLogoFallback(sport: string | null | undefined) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);

  useEffect(() => {
    if (!sport) return;
    let cancelled = false;
    (async () => {
      // Paginação manual: Supabase tem limite default de 1000 linhas por query
      // e team_logos tem >2k registros de soccer. Sem paginação, Coritiba/Bahia
      // e outros times caem fora do retorno e nunca casam o fallback.
      const fetchAllTeams = async (): Promise<TeamRow[]> => {
        const pageSize = 1000;
        const out: TeamRow[] = [];
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from('team_logos')
            .select('league_key, team_name_normalized, team_name_original, logo_url')
            .eq('sport', sport)
            .not('logo_url', 'is', null)
            .range(from, from + pageSize - 1);
          if (error || !data || data.length === 0) break;
          out.push(...(data as TeamRow[]));
          if (data.length < pageSize) break;
        }
        return out;
      };

      const [teamRows, leaguesRes] = await Promise.all([
        fetchAllTeams(),
        supabase
          .from('league_logos')
          .select('league_key, league_name, logo_url')
          .eq('sport', sport)
          .not('logo_url', 'is', null)
          .range(0, 4999),
      ]);
      if (cancelled) return;
      setTeams(teamRows);
      setLeagues((leaguesRes.data as LeagueRow[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sport]);

  const teamByLeagueName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      m.set(`${t.league_key}|${t.team_name_normalized}`, t.logo_url);
    }
    return m;
  }, [teams]);

  const teamByName = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      const logos = grouped.get(t.team_name_normalized) || new Set<string>();
      logos.add(t.logo_url);
      grouped.set(t.team_name_normalized, logos);
    }
    const m = new Map<string, string>();
    for (const [name, logos] of grouped.entries()) {
      if (logos.size === 1) m.set(name, Array.from(logos)[0]);
    }
    return m;
  }, [teams]);

  // Index por liga: fallback conservador por tokens distintivos e únicos.
  const teamsByLeague = useMemo(() => {
    const m = new Map<string, Array<{ tokens: string[]; logo: string; tokenCount: number }>>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      const tokens = tokenize(t.team_name_original || '');
      if (tokens.length === 0) continue;
      const arr = m.get(t.league_key) || [];
      arr.push({
        tokens,
        logo: t.logo_url,
        tokenCount: tokens.length,
      });
      m.set(t.league_key, arr);
    }
    return m;
  }, [teams]);

  // Lista global para fallback por TOKEN COMPLETO (palavra inteira, mín 6 chars).
  // Evita falsos positivos do substring (ex.: "inter" casando "internacional").
  // Requer que o nome original esteja disponível para tokenizar com fronteira.
  const teamsGlobalTokens = useMemo(() => {
    const arr: Array<{ tokens: string[]; logo: string; tokenCount: number }> = [];
    const seen = new Set<string>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      const tokens = tokenize(t.team_name_original || '');
      if (tokens.length === 0) continue;
      const k = tokens.sort().join('|');
      if (seen.has(k + '|' + t.logo_url)) continue;
      seen.add(k + '|' + t.logo_url);
      arr.push({ tokens, logo: t.logo_url, tokenCount: tokens.length });
    }
    return arr;
  }, [teams]);

  const leagueByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leagues) {
      if (l.logo_url) m.set(l.league_key, l.logo_url);
    }
    return m;
  }, [leagues]);

  const getTeamLogo = useCallback(
    (teamName: string, leagueKey?: string | null): string | null => {
      const norm = normalize(teamName);
      if (!norm) return null;
      const normStripped = stripStopwordsAndDigits(norm);

      if (leagueKey) {
        // 1. Match exato por liga
        const exact = teamByLeagueName.get(`${leagueKey}|${norm}`);
        if (exact) return exact;
        // 2. Match stripped por liga
        if (normStripped && normStripped.length >= 3) {
          const stripped = teamByLeagueName.get(`${leagueKey}|@stripped|${normStripped}`);
          if (stripped) return stripped;
        }
        // 3. Contains dentro da liga (ex: API="Paderborn" vs DB="scpaderborn07")
        const arr = teamsByLeague.get(leagueKey);
        if (arr && normStripped && normStripped.length >= 4) {
          for (const t of arr) {
            if (
              t.norm.includes(normStripped) ||
              normStripped.includes(t.stripped && t.stripped.length >= 4 ? t.stripped : '____nope____') ||
              (t.stripped && t.stripped.length >= 4 && t.stripped.includes(normStripped))
            ) {
              return t.logo;
            }
          }
        }
      }
      // 4. Fallback global exato
      const globalExact = teamByName.get(norm);
      if (globalExact) return globalExact;
      // 5. Fallback global stripped
      if (normStripped && normStripped.length >= 3) {
        const globalStripped = teamByName.get(`@stripped|${normStripped}`);
        if (globalStripped) return globalStripped;
      }
      // 6. Fallback global por TOKEN COMPLETO. Só casa se TODOS os tokens do
      //    lado mais curto aparecem como palavras inteiras no outro lado.
      //    Ex.: "Grêmio Novorizontino" → ["gremio","novorizontino"]
      //         cache "Novorizontino"   → ["novorizontino"]
      //         intersecção = ["novorizontino"] == cache inteiro → match.
      //    Mas "Internacional" → ["internacional"] vs "Inter Miami" → ["miami"]
      //         sem token em comum → não casa.
      const queryTokens = tokenize(teamName);
      if (queryTokens.length > 0) {
        let best: { logo: string; matched: number; ratio: number; matchedChars: number } | null = null;
        for (const t of teamsGlobalTokens) {
          const qSet = new Set(queryTokens);
          let matched = 0;
          let matchedChars = 0;
          for (const tk of t.tokens) {
            if (qSet.has(tk)) {
              matched += 1;
              matchedChars += tk.length;
            }
          }
          if (matched === 0) continue;
          // Exige que TODOS os tokens do lado menor sejam casados.
          const minSide = Math.min(t.tokenCount, queryTokens.length);
          if (matched < minSide) continue;
          const ratio = matched / Math.max(t.tokenCount, queryTokens.length);
          if (
            !best ||
            ratio > best.ratio ||
            (ratio === best.ratio && matched > best.matched) ||
            (ratio === best.ratio && matched === best.matched && matchedChars > best.matchedChars)
          ) {
            best = { logo: t.logo, matched, ratio, matchedChars };
          }
        }
        if (best) return best.logo;
      }
      return null;
    },
    [teamByLeagueName, teamByName, teamsByLeague, teamsGlobalTokens],
  );

  const getLeagueLogo = useCallback(
    (leagueKey: string): string | null => leagueByKey.get(leagueKey) || null,
    [leagueByKey],
  );

  return { getTeamLogo, getLeagueLogo, loaded: teams.length > 0 || leagues.length > 0 };
}