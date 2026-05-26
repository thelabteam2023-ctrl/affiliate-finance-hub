import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const normalize = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

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
      const [t, l] = await Promise.all([
        supabase
          .from('team_logos')
          .select('league_key, team_name_normalized, team_name_original, logo_url')
          .eq('sport', sport)
          .not('logo_url', 'is', null),
        supabase
          .from('league_logos')
          .select('league_key, league_name, logo_url')
          .eq('sport', sport)
          .not('logo_url', 'is', null),
      ]);
      if (cancelled) return;
      setTeams((t.data as TeamRow[]) || []);
      setLeagues((l.data as LeagueRow[]) || []);
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
    // Fallback global por esporte (quando não sabemos a liga)
    const m = new Map<string, string>();
    for (const t of teams) {
      if (!t.logo_url) continue;
      if (!m.has(t.team_name_normalized)) m.set(t.team_name_normalized, t.logo_url);
    }
    return m;
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
      if (leagueKey) {
        const hit = teamByLeagueName.get(`${leagueKey}|${norm}`);
        if (hit) return hit;
      }
      return teamByName.get(norm) || null;
    },
    [teamByLeagueName, teamByName],
  );

  const getLeagueLogo = useCallback(
    (leagueKey: string): string | null => leagueByKey.get(leagueKey) || null,
    [leagueByKey],
  );

  return { getTeamLogo, getLeagueLogo, loaded: teams.length > 0 || leagues.length > 0 };
}