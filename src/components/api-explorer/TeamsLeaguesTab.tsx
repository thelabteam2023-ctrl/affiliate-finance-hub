import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, RefreshCw, Shield, Trash2, Plus, Search, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------- helpers ----------------
const SPORT_BADGE: Record<string, { label: string; color: string }> = {
  soccer:           { label: "Futebol",       color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  basketball:       { label: "Basquete",      color: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  icehockey:        { label: "Hóquei",        color: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  baseball:         { label: "Beisebol",      color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  americanfootball: { label: "F. Americano",  color: "bg-red-500/15 text-red-300 border-red-500/30" },
  tennis:           { label: "Tênis",         color: "bg-lime-500/15 text-lime-300 border-lime-500/30" },
  esports:          { label: "eSports",       color: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
};

function SportBadge({ sport }: { sport: string }) {
  const cfg = SPORT_BADGE[sport] || { label: sport, color: "bg-muted text-foreground" };
  return <Badge variant="outline" className={cn("text-[10px] uppercase font-bold tracking-wider", cfg.color)}>{cfg.label}</Badge>;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function LogoCell({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const ok = !!url && !err;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full overflow-hidden border border-border/30 bg-muted/40"
      style={{ height: size, width: size }}
    >
      {ok ? (
        <img src={url!} alt={name} className="h-full w-full object-contain p-0.5" onError={() => setErr(true)} />
      ) : (
        <span className="text-[9px] font-black text-muted-foreground">{getInitials(name)}</span>
      )}
    </div>
  );
}

async function callJob(job: string, extra?: Record<string, any>) {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/run-job`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job, ...(extra || {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Falha na execução do job");
  return data;
}

// ---------------- main component ----------------
interface LeagueRow {
  league_key: string;
  sport: string;
  league_name: string;
  country: string | null;
  api_sports_id: number | null;
  current_season: number | null;
  league_logo: string | null;
  times_em_cache: number;
  cobertura_hoje_pct: number | null;
  eventos_hoje: number;
}

interface TeamRow {
  id: string;
  team_name_original: string;
  team_name_normalized: string;
  league_key: string;
  sport: string;
  short_name: string | null;
  country: string | null;
  logo_url: string | null;
  found: boolean;
}

interface AliasRow {
  id: string;
  league_key: string;
  alias_normalized: string;
  team_logo_id: string | null;
  team_logos: { team_name_original: string; logo_url: string | null } | null;
}

export default function TeamsLeaguesTab() {
  const [loading, setLoading] = useState(true);

  const [leagueStats, setLeagueStats] = useState({ total: 0, com_id: 0 });
  const [teamStats, setTeamStats] = useState({ total: 0, com_logo: 0 });

  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [aliases, setAliases] = useState<AliasRow[]>([]);

  // filtros ligas
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [leagueModeFilter, setLeagueModeFilter] = useState<"all" | "no_id" | "no_logo">("all");

  // filtros times
  const [teamSearch, setTeamSearch] = useState("");
  const [teamLeagueFilter, setTeamLeagueFilter] = useState<string>("all");
  const [teamCountryFilter, setTeamCountryFilter] = useState<string>("all");
  const [teamLogoFilter, setTeamLogoFilter] = useState<"all" | "with" | "without">("all");
  const [teamUniqueMode, setTeamUniqueMode] = useState<boolean>(true);
  const [teamsPage, setTeamsPage] = useState(0);
  const PAGE_SIZE = 50;

  // ações
  const [syncingLeague, setSyncingLeague] = useState<string | null>(null);
  const [globalAction, setGlobalAction] = useState<string | null>(null);

  // alias modal
  const [aliasOpen, setAliasOpen] = useState(false);
  const [aliasForm, setAliasForm] = useState({ league_key: "", alias: "", team_logo_id: "" });
  const [teamSearchInModal, setTeamSearchInModal] = useState("");

  const loadAll = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1) league + team stats
      const [{ data: lgStats }, { data: tlStats }] = await Promise.all([
        supabase.from("monitored_leagues").select("api_sports_id"),
        supabase.from("team_logos").select("logo_url, found"),
      ]);
      setLeagueStats({
        total: lgStats?.length || 0,
        com_id: lgStats?.filter((l: any) => l.api_sports_id != null).length || 0,
      });
      setTeamStats({
        total: tlStats?.length || 0,
        com_logo: tlStats?.filter((t: any) => t.found && t.logo_url).length || 0,
      });

      // 2) leagues with computed counts
      const [{ data: lgs }, { data: logos }, { data: tlAll }, { data: deToday }] = await Promise.all([
        supabase.from("monitored_leagues").select("league_key, sport, league_name, country, api_sports_id, current_season"),
        supabase.from("league_logos").select("league_key, logo_url, found"),
        supabase.from("team_logos").select("league_key"),
        supabase.from("daily_events").select("league_key, home_team_logo, away_team_logo").eq("event_date", today),
      ]);

      const logoMap = new Map<string, string | null>();
      (logos || []).forEach((l: any) => logoMap.set(l.league_key, l.found ? l.logo_url : null));

      const teamCountMap = new Map<string, number>();
      (tlAll || []).forEach((t: any) => teamCountMap.set(t.league_key, (teamCountMap.get(t.league_key) || 0) + 1));

      const coverageMap = new Map<string, { total: number; comLogo: number }>();
      (deToday || []).forEach((e: any) => {
        const k = e.league_key;
        const c = coverageMap.get(k) || { total: 0, comLogo: 0 };
        c.total += 2;
        if (e.home_team_logo) c.comLogo += 1;
        if (e.away_team_logo) c.comLogo += 1;
        coverageMap.set(k, c);
      });

      const built: LeagueRow[] = (lgs || []).map((l: any) => {
        const cov = coverageMap.get(l.league_key);
        return {
          league_key: l.league_key,
          sport: l.sport,
          league_name: l.league_name,
          country: l.country,
          api_sports_id: l.api_sports_id,
          current_season: l.current_season,
          league_logo: logoMap.get(l.league_key) || null,
          times_em_cache: teamCountMap.get(l.league_key) || 0,
          cobertura_hoje_pct: cov && cov.total > 0 ? Math.round((cov.comLogo / cov.total) * 100) : null,
          eventos_hoje: cov ? cov.total / 2 : 0,
        };
      });
      setLeagues(built);

      // 3) teams
      const { data: ts } = await supabase
        .from("team_logos")
        .select("id, team_name_original, team_name_normalized, league_key, sport, short_name, country, logo_url, found")
        .order("team_name_original", { ascending: true })
        .limit(5000);
      setTeams((ts as any) || []);

      // 4) aliases
      const { data: al } = await supabase
        .from("team_name_aliases")
        .select("id, league_key, alias_normalized, team_logo_id, team_logos(team_name_original, logo_url)")
        .order("league_key", { ascending: true });
      setAliases((al as any) || []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ---------------- derived ----------------
  const sportsAvailable = useMemo(() => Array.from(new Set(leagues.map((l) => l.sport))).sort(), [leagues]);
  const countriesAvailable = useMemo(
    () => Array.from(new Set(leagues.map((l) => l.country).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [leagues],
  );

  const filteredLeagues = useMemo(() => {
    return leagues
      .filter((l) => sportFilter === "all" || l.sport === sportFilter)
      .filter((l) => countryFilter === "all" || l.country === countryFilter)
      .filter((l) => {
        if (leagueModeFilter === "no_id") return l.api_sports_id == null;
        if (leagueModeFilter === "no_logo") return !l.league_logo;
        return true;
      })
      .sort((a, b) => {
        if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
        const aCov = a.cobertura_hoje_pct ?? -1;
        const bCov = b.cobertura_hoje_pct ?? -1;
        return aCov - bCov;
      });
  }, [leagues, sportFilter, countryFilter, leagueModeFilter]);

  // map league_key -> country (for team filtering)
  const leagueCountryMap = useMemo(() => {
    const m = new Map<string, string | null>();
    leagues.forEach((l) => m.set(l.league_key, l.country));
    return m;
  }, [leagues]);

  // Times "achatados" (1 linha por liga) filtrados
  const teamsFiltered = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return teams.filter((t) => {
      if (teamLeagueFilter !== "all" && t.league_key !== teamLeagueFilter) return false;
      if (teamCountryFilter !== "all" && leagueCountryMap.get(t.league_key) !== teamCountryFilter) return false;
      if (teamLogoFilter === "with" && !(t.found && t.logo_url)) return false;
      if (teamLogoFilter === "without" && t.found && t.logo_url) return false;
      if (q && !t.team_name_original.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [teams, teamSearch, teamLeagueFilter, teamCountryFilter, teamLogoFilter, leagueCountryMap]);

  // Times únicos (agrupados por api_sports_id ou nome normalizado dentro do esporte)
  interface UniqueTeamRow {
    key: string;
    team_name_original: string;
    sport: string;
    short_name: string | null;
    country: string | null;
    logo_url: string | null;
    found: boolean;
    api_sports_id: number | null;
    league_keys: string[];
  }
  const uniqueTeams = useMemo<UniqueTeamRow[]>(() => {
    const map = new Map<string, UniqueTeamRow>();
    for (const t of teamsFiltered) {
      const key = t.found && (t as any).logo_url
        ? `${t.sport}::id::${(teams as any) && (t as any) ? ((t as any).logo_url || "") : ""}::${t.team_name_normalized}`
        : `${t.sport}::name::${t.team_name_normalized}`;
      // Preferir agrupar por logo_url (que mapeia 1:1 ao api_sports_id) quando existir
      const groupKey = t.logo_url ? `${t.sport}::${t.logo_url}` : `${t.sport}::${t.team_name_normalized}`;
      const ex = map.get(groupKey);
      if (ex) {
        if (!ex.league_keys.includes(t.league_key)) ex.league_keys.push(t.league_key);
        if (!ex.logo_url && t.logo_url) {
          ex.logo_url = t.logo_url;
          ex.found = true;
        }
      } else {
        map.set(groupKey, {
          key: groupKey,
          team_name_original: t.team_name_original,
          sport: t.sport,
          short_name: t.short_name,
          country: t.country,
          logo_url: t.logo_url,
          found: t.found,
          api_sports_id: null,
          league_keys: [t.league_key],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.team_name_original.localeCompare(b.team_name_original));
  }, [teamsFiltered]);

  const filteredTeams = teamsFiltered;
  const displayRowsCount = teamUniqueMode ? uniqueTeams.length : filteredTeams.length;

  useEffect(() => { setTeamsPage(0); }, [teamSearch, teamLeagueFilter, teamCountryFilter, teamLogoFilter, teamUniqueMode]);

  const teamsPaged = useMemo(
    () => filteredTeams.slice(teamsPage * PAGE_SIZE, (teamsPage + 1) * PAGE_SIZE),
    [filteredTeams, teamsPage],
  );
  const uniqueTeamsPaged = useMemo(
    () => uniqueTeams.slice(teamsPage * PAGE_SIZE, (teamsPage + 1) * PAGE_SIZE),
    [uniqueTeams, teamsPage],
  );

  const teamModalCandidates = useMemo(() => {
    if (!aliasForm.league_key) return [];
    const q = teamSearchInModal.trim().toLowerCase();
    return teams
      .filter((t) => t.league_key === aliasForm.league_key)
      .filter((t) => !q || t.team_name_original.toLowerCase().includes(q))
      .slice(0, 30);
  }, [teams, aliasForm.league_key, teamSearchInModal]);

  // ---------------- actions ----------------
  const handleSyncLeague = async (leagueKey: string) => {
    setSyncingLeague(leagueKey);
    try {
      const data = await callJob("sync_league_teams", { leagueKey });
      toast.success(`Liga sincronizada: ${data.result?.teamsSaved ?? 0} times salvos`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncingLeague(null);
    }
  };

  const handleSyncAll = async () => {
    if (!confirm("Sincronizar TODAS as ligas: ~30 créditos da API-Sports. Continuar?")) return;
    setGlobalAction("all");
    try {
      await callJob("sync_all_teams");
      toast.success("Sincronização completa iniciada em background. Atualize em ~1min.");
      setTimeout(() => loadAll(), 15000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGlobalAction(null);
    }
  };

  const handleSyncMissing = async () => {
    if (!confirm("Sincronizar apenas as ligas que ainda não têm times cacheados. Continuar?")) return;
    setGlobalAction("missing");
    try {
      await callJob("sync_missing_only");
      toast.success("Sincronização das ligas faltantes iniciada. Atualize em ~3min.");
      setTimeout(() => loadAll(), 30000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGlobalAction(null);
    }
  };

  const handleSyncEvents = async () => {
    if (!confirm("Sincronizar eventos de hoje agora. Continuar?")) return;
    setGlobalAction("events");
    try {
      await callJob("fetch_events");
      toast.success("Sincronização de eventos iniciada em background.");
      setTimeout(() => loadAll(), 8000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGlobalAction(null);
    }
  };

  const handleReprocessLogos = async () => {
    setGlobalAction("reprocess");
    try {
      const data = await callJob("reprocess_event_logos");
      const r = data.result || {};
      toast.success(`Logos reprocessados: ${r.total ?? 0} (exato: ${r.exact ?? 0}, alias: ${r.alias ?? 0}, fallback: ${r.substring ?? 0})`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGlobalAction(null);
    }
  };

  const handleDeleteAlias = async (id: string) => {
    if (!confirm("Excluir este alias?")) return;
    const { error } = await supabase.from("team_name_aliases").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Alias removido");
    setAliases((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCreateAlias = async () => {
    if (!aliasForm.league_key || !aliasForm.alias || !aliasForm.team_logo_id) {
      return toast.error("Preencha todos os campos");
    }
    const aliasNorm = aliasForm.alias
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    const { data, error } = await supabase
      .from("team_name_aliases")
      .insert({ league_key: aliasForm.league_key, alias_normalized: aliasNorm, team_logo_id: aliasForm.team_logo_id })
      .select("id, league_key, alias_normalized, team_logo_id, team_logos(team_name_original, logo_url)")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Alias criado");
    setAliases((prev) => [data as any, ...prev]);
    setAliasOpen(false);
    setAliasForm({ league_key: "", alias: "", team_logo_id: "" });
    setTeamSearchInModal("");
  };

  // ---------------- render ----------------
  return (
    <div className="space-y-6">
      {/* SEÇÃO 1: CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Ligas monitoradas" value={leagueStats.total} />
        <SummaryCard
          label="Com ID API Sports"
          value={leagueStats.com_id}
          pct={leagueStats.total ? Math.round((leagueStats.com_id / leagueStats.total) * 100) : 0}
        />
        <SummaryCard label="Times em cache" value={teamStats.total} />
        <SummaryCard
          label="Com logo válida"
          value={teamStats.com_logo}
          pct={teamStats.total ? Math.round((teamStats.com_logo / teamStats.total) * 100) : 0}
        />
      </div>

      {/* SEÇÃO 2: TABELA DE LIGAS */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Ligas monitoradas</CardTitle>
              <CardDescription>Cobertura por liga e ações de sincronização</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sportFilter} onValueChange={setSportFilter}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Esporte" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os esportes</SelectItem>
                  {sportsAvailable.map((s) => (
                    <SelectItem key={s} value={s}>{SPORT_BADGE[s]?.label || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="País" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os países</SelectItem>
                  {countriesAvailable.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg">
                {[
                  { id: "all", label: "Todas" },
                  { id: "no_id", label: "Sem ID" },
                  { id: "no_logo", label: "Sem logo" },
                ].map((m) => (
                  <Button
                    key={m.id}
                    size="sm"
                    variant={leagueModeFilter === m.id ? "secondary" : "ghost"}
                    onClick={() => setLeagueModeFilter(m.id as any)}
                    className="h-7 px-3 text-[11px]"
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Logo</TableHead>
                  <TableHead>Liga</TableHead>
                  <TableHead>Esporte</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead className="text-right">api_sports_id</TableHead>
                  <TableHead className="text-right">Temp.</TableHead>
                  <TableHead className="text-right">Cache</TableHead>
                  <TableHead className="text-right">Cobertura hoje</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                ) : filteredLeagues.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma liga encontrada</TableCell></TableRow>
                ) : filteredLeagues.map((l) => (
                  <TableRow key={l.league_key}>
                    <TableCell><LogoCell name={l.league_name} url={l.league_logo} size={28} /></TableCell>
                    <TableCell className="font-medium">{l.league_name}</TableCell>
                    <TableCell><SportBadge sport={l.sport} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{l.country || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {l.api_sports_id ?? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                          <AlertCircle className="h-3 w-3 mr-1" /> Sem ID
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{l.current_season ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{l.times_em_cache}</TableCell>
                    <TableCell className="text-right">
                      {l.eventos_hoje === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono",
                            (l.cobertura_hoje_pct ?? 0) >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : (l.cobertura_hoje_pct ?? 0) >= 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30",
                          )}
                        >
                          {l.cobertura_hoje_pct ?? 0}% ({l.eventos_hoje})
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!l.api_sports_id || syncingLeague === l.league_key}
                                onClick={() => handleSyncLeague(l.league_key)}
                                className="h-8"
                              >
                                {syncingLeague === l.league_key ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                <span className="ml-2 text-[11px]">Sincronizar</span>
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!l.api_sports_id && <TooltipContent>Sem ID da API-Sports configurado</TooltipContent>}
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO 3: TIMES */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Times em cache</CardTitle>
              <CardDescription>
                {teamUniqueMode
                  ? `${uniqueTeams.length} times únicos (${filteredTeams.length} entradas no total)`
                  : `${filteredTeams.length} entradas (1 por liga)`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar time..."
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="h-9 pl-8 w-[200px]"
                />
              </div>
              <Select value={teamCountryFilter} onValueChange={setTeamCountryFilter}>
                <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="País" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os países</SelectItem>
                  {countriesAvailable.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={teamLeagueFilter} onValueChange={setTeamLeagueFilter}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Liga" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ligas</SelectItem>
                  {leagues
                    .filter((l) => teamCountryFilter === "all" || l.country === teamCountryFilter)
                    .map((l) => (
                      <SelectItem key={l.league_key} value={l.league_key}>{l.league_name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg">
                <Button
                  size="sm"
                  variant={teamUniqueMode ? "secondary" : "ghost"}
                  onClick={() => setTeamUniqueMode(true)}
                  className="h-7 px-3 text-[11px]"
                >Únicos</Button>
                <Button
                  size="sm"
                  variant={!teamUniqueMode ? "secondary" : "ghost"}
                  onClick={() => setTeamUniqueMode(false)}
                  className="h-7 px-3 text-[11px]"
                >Por liga</Button>
              </div>
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg">
                {[
                  { id: "all", label: "Todos" },
                  { id: "with", label: "Com logo" },
                  { id: "without", label: "Sem logo" },
                ].map((m) => (
                  <Button
                    key={m.id}
                    size="sm"
                    variant={teamLogoFilter === m.id ? "secondary" : "ghost"}
                    onClick={() => setTeamLogoFilter(m.id as any)}
                    className="h-7 px-3 text-[11px]"
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Logo</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>{teamUniqueMode ? "Ligas" : "Liga"}</TableHead>
                  <TableHead>Esporte</TableHead>
                  <TableHead>Short</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamUniqueMode ? (
                  uniqueTeamsPaged.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum time</TableCell></TableRow>
                  ) : uniqueTeamsPaged.map((t) => (
                    <TableRow key={t.key}>
                      <TableCell><LogoCell name={t.team_name_original} url={t.logo_url} size={32} /></TableCell>
                      <TableCell className="font-medium">{t.team_name_original}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {t.league_keys.map((lk) => (
                            <Badge key={lk} variant="outline" className="text-[10px] font-mono bg-muted/40">{lk.replace(/^soccer_/, "").replace(/^basketball_/, "").replace(/^icehockey_/, "")}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell><SportBadge sport={t.sport} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.short_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.country || "—"}</TableCell>
                      <TableCell className="text-right">
                        {t.found && t.logo_url ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> OK
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">
                            <XCircle className="h-3 w-3 mr-1" /> Sem logo
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : teamsPaged.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum time</TableCell></TableRow>
                ) : teamsPaged.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><LogoCell name={t.team_name_original} url={t.logo_url} size={32} /></TableCell>
                    <TableCell className="font-medium">{t.team_name_original}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.league_key}</TableCell>
                    <TableCell><SportBadge sport={t.sport} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.short_name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.country || "—"}</TableCell>
                    <TableCell className="text-right">
                      {t.found && t.logo_url ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> OK
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">
                          <XCircle className="h-3 w-3 mr-1" /> Sem logo
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {displayRowsCount > PAGE_SIZE && (
            <div className="flex items-center justify-between p-3 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                Página {teamsPage + 1} de {Math.ceil(displayRowsCount / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={teamsPage === 0} onClick={() => setTeamsPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={(teamsPage + 1) * PAGE_SIZE >= displayRowsCount} onClick={() => setTeamsPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEÇÃO 4: ALIASES */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Aliases de nomes</CardTitle>
              <CardDescription>Mapeamento entre nomes da The Odds API e nomes do API-Sports</CardDescription>
            </div>
            <Dialog open={aliasOpen} onOpenChange={setAliasOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar alias</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo alias</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground">Liga</label>
                    <Select value={aliasForm.league_key} onValueChange={(v) => setAliasForm((f) => ({ ...f, league_key: v, team_logo_id: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Escolha uma liga" /></SelectTrigger>
                      <SelectContent>
                        {leagues.map((l) => (<SelectItem key={l.league_key} value={l.league_key}>{l.league_name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground">Nome (Odds API)</label>
                    <Input placeholder="Ex: Wolves" value={aliasForm.alias} onChange={(e) => setAliasForm((f) => ({ ...f, alias: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground">Time real (API-Sports)</label>
                    <Input
                      placeholder="Buscar time..."
                      value={teamSearchInModal}
                      onChange={(e) => setTeamSearchInModal(e.target.value)}
                      disabled={!aliasForm.league_key}
                    />
                    <div className="mt-2 max-h-48 overflow-y-auto border border-border/30 rounded-md">
                      {teamModalCandidates.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">{aliasForm.league_key ? "Nenhum time" : "Selecione uma liga primeiro"}</p>
                      ) : teamModalCandidates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setAliasForm((f) => ({ ...f, team_logo_id: t.id }))}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors",
                            aliasForm.team_logo_id === t.id && "bg-primary/10",
                          )}
                        >
                          <LogoCell name={t.team_name_original} url={t.logo_url} size={24} />
                          <span className="flex-1">{t.team_name_original}</span>
                          {aliasForm.team_logo_id === t.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAliasOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreateAlias}>Confirmar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Liga</TableHead>
                  <TableHead>Alias (Odds API)</TableHead>
                  <TableHead>Aponta para</TableHead>
                  <TableHead className="text-right w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aliases.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum alias cadastrado</TableCell></TableRow>
                ) : aliases.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-muted-foreground">{a.league_key}</TableCell>
                    <TableCell className="font-mono text-xs">{a.alias_normalized}</TableCell>
                    <TableCell>
                      {a.team_logos ? (
                        <div className="flex items-center gap-2">
                          <LogoCell name={a.team_logos.team_name_original} url={a.team_logos.logo_url} size={24} />
                          <span className="text-sm">{a.team_logos.team_name_original}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteAlias(a.id)} className="h-8 w-8 text-red-400 hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO 5: AÇÕES GLOBAIS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ações globais</CardTitle>
          <CardDescription>Manutenção do banco de times e logos</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <GlobalActionRow
            title="Sincronizar todos os times"
            description="Baixa o roster atual de todas as ligas com api_sports_id (~30 créditos)"
            buttonLabel="Sincronizar"
            loading={globalAction === "all"}
            onClick={handleSyncAll}
          />
          <GlobalActionRow
            title="Sincronizar apenas ligas faltantes"
            description="Processa só as ligas sem times no cache (Brasileirão, NBA, NBB, MLS, etc). Serial, sem timeout."
            buttonLabel="Sincronizar faltantes"
            loading={globalAction === "missing"}
            onClick={handleSyncMissing}
          />
          <GlobalActionRow
            title="Sincronizar eventos de hoje"
            description="Roda manualmente o job do cron das 07h"
            buttonLabel="Sincronizar"
            loading={globalAction === "events"}
            onClick={handleSyncEvents}
          />
          <GlobalActionRow
            title="Reprocessar logos dos eventos"
            description="Re-resolve logos NULL nos eventos de hoje usando o cache atual (não consome créditos)"
            buttonLabel="Executar"
            loading={globalAction === "reprocess"}
            onClick={handleReprocessLogos}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, pct }: { label: string; value: number; pct?: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight">{value.toLocaleString("pt-BR")}</span>
          {pct !== undefined && (
            <span className="text-xs font-bold text-muted-foreground">({pct}%)</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GlobalActionRow({ title, description, buttonLabel, loading, onClick }: { title: string; description: string; buttonLabel: string; loading: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border/30 bg-muted/20">
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button onClick={onClick} disabled={loading} className="shrink-0">
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
        {buttonLabel}
      </Button>
    </div>
  );
}