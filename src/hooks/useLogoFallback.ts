import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const normalize = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Stop-words / sufixos comuns em nomes de clubes que atrapalham matching parcial
const STOPWORDS = [
  'fc', 'cf', 'sc', 'ac', 'afc', 'cfc', 'sk', 'rc', 'as',
  'club', 'clube', 'futebol', 'football', 'soccer',
  'de', 'do', 'da', 'of', 'the',
  'ec', 'ce', 'se', 'aa', 'aac',
];

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
      // Variante sem stopwords/dígitos para matching parcial
      const stripped = stripStopwordsAndDigits(t.team_name_normalized);
      if (stripped && stripped.length >= 3) {
        const altKey = `${t.league_key}|@stripped|${stripped}`;
        if (!m.has(altKey)) m.set(altKey, t.logo_url);
      }
    }
    return m;
  }, [teams]);

  const teamByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      if (!m.has(t.team_name_normalized)) m.set(t.team_name_normalized, t.logo_url);
      const stripped = stripStopwordsAndDigits(t.team_name_normalized);
      if (stripped && stripped.length >= 3 && !m.has(`@stripped|${stripped}`)) {
        m.set(`@stripped|${stripped}`, t.logo_url);
      }
    }
    return m;
  }, [teams]);

  // Index por liga: lista de [normalized, stripped, logo] para fallback contains
  const teamsByLeague = useMemo(() => {
    const m = new Map<string, Array<{ norm: string; stripped: string; logo: string }>>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      const arr = m.get(t.league_key) || [];
      arr.push({
        norm: t.team_name_normalized,
        stripped: stripStopwordsAndDigits(t.team_name_normalized),
        logo: t.logo_url,
      });
      m.set(t.league_key, arr);
    }
    return m;
  }, [teams]);

  // Lista global para fallback de contains entre ligas (ex.: API="Grêmio Novorizontino"
  // vs cache="Novorizontino" sob outra league_key vinda de fonte distinta).
  const teamsGlobal = useMemo(() => {
    const arr: Array<{ norm: string; stripped: string; logo: string }> = [];
    const seen = new Set<string>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      const stripped = stripStopwordsAndDigits(t.team_name_normalized);
      const k = `${t.team_name_normalized}|${stripped}`;
      if (seen.has(k)) continue;
      seen.add(k);
      arr.push({ norm: t.team_name_normalized, stripped, logo: t.logo_url });
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
      // 6. Fallback global contains — última tentativa quando o nome do explorer
      //    é uma forma estendida (ex.: "Grêmio Novorizontino") e o cache só tem
      //    o radical curto ("Novorizontino"), ou vice-versa.
      if (normStripped && normStripped.length >= 5) {
        for (const t of teamsGlobal) {
          if (t.norm.length < 5) continue;
          if (norm.includes(t.norm) || t.norm.includes(norm)) return t.logo;
          if (t.stripped && t.stripped.length >= 5) {
            if (normStripped.includes(t.stripped) || t.stripped.includes(normStripped)) return t.logo;
          }
        }
      }
      return null;
    },
    [teamByLeagueName, teamByName, teamsByLeague, teamsGlobal],
  );

  const getLeagueLogo = useCallback(
    (leagueKey: string): string | null => leagueByKey.get(leagueKey) || null,
    [leagueByKey],
  );

  return { getTeamLogo, getLeagueLogo, loaded: teams.length > 0 || leagues.length > 0 };
}