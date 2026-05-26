import { useState, useEffect, useMemo } from 'react';
import { useTopBar } from "@/contexts/TopBarContext";
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Globe, 
  RefreshCw, 
  Search, 
  Clock, 
  AlertCircle, 
  Loader2, 
  Map as MapIcon, 
  Calendar as CalendarIcon, 
  Filter, 
  ChevronRight,
  Database,
  CheckCircle2,
  XCircle,
  LayoutGrid,
  Info,
  ListFilter,
  CalendarDays
} from 'lucide-react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetTrigger 
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import TeamsLeaguesTab from '@/components/api-explorer/TeamsLeaguesTab';
import { useLogoFallback } from '@/hooks/useLogoFallback';

// Sports mapping
const TRADITIONAL_SPORTS = [
  { id: 'soccer', label: 'Futebol', icon: '⚽', status: 'supported' },
  { id: 'basketball', label: 'Basquete', icon: '🏀', status: 'supported' },
  { id: 'americanfootball', label: 'F. Americano', icon: '🏈', status: 'supported' },
  { id: 'baseball', label: 'Beisebol', icon: '⚾', status: 'supported' },
  { id: 'tennis', label: 'Tênis', icon: '🎾', status: 'supported' },
  { id: 'icehockey', label: 'Hóquei', icon: '🏒', status: 'partial' },
];

const ESPORTS = [
  { id: 'leagueoflegends', label: 'LoL', icon: '🎮', status: 'unavailable' },
  { id: 'csgo', label: 'CS2', icon: '🔫', status: 'unavailable' },
  { id: 'valorant', label: 'Valorant', icon: '🎯', status: 'unavailable' },
  { id: 'dota2', label: 'Dota 2', icon: '🧙', status: 'unavailable' },
  { id: 'soccer_fifa', label: 'EA FC / FIFA', icon: '🎮', status: 'unavailable' },
];

interface Event {
  api_id: string;
  sport: string;
  league_key: string;
  league_name: string;
  league_flag: string | null;
  continent: string | null;
  country: string | null;
  competition_type: string | null;
  home_team: string;
  away_team: string;
  commence_time: string;
  result_home: string | null;
  result_away: string | null;
  home_team_logo: string | null;
  away_team_logo: string | null;
  league_logo: string | null;
  synced_at: string;
}


// Paleta determinística premium para fallback (HSL — combina com design system)
const TEAM_GRADIENTS = [
  ['hsl(217 91% 60%)', 'hsl(224 76% 38%)'],   // azul royal
  ['hsl(142 71% 45%)', 'hsl(160 84% 30%)'],   // verde esmeralda
  ['hsl(0 84% 60%)',   'hsl(346 87% 43%)'],   // vermelho carmim
  ['hsl(38 92% 50%)',  'hsl(24 95% 53%)'],    // âmbar/laranja
  ['hsl(271 91% 65%)', 'hsl(262 83% 48%)'],   // violeta
  ['hsl(189 94% 43%)', 'hsl(199 89% 38%)'],   // ciano
  ['hsl(330 81% 60%)', 'hsl(316 70% 43%)'],   // magenta
  ['hsl(48 96% 53%)',  'hsl(36 92% 45%)'],    // dourado
  ['hsl(173 80% 40%)', 'hsl(180 84% 28%)'],   // teal
  ['hsl(280 65% 55%)', 'hsl(252 70% 42%)'],   // índigo/púrpura
];

const hashName = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
};

const getInitials = (name: string) => {
  const clean = name.trim().replace(/[^\p{L}\p{N}\s]/gu, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const TeamLogo = ({
  name,
  url,
  fallbackUrl,
  className,
}: {
  name: string;
  url?: string | null;
  fallbackUrl?: string | null;
  className?: string;
}) => {
  // Constrói lista de candidatos (API → DB fallback), filtrando vazios/duplicatas
  const candidates = useMemo(() => {
    const arr = [url, fallbackUrl]
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
    return Array.from(new Set(arr));
  }, [url, fallbackUrl]);

  const [idx, setIdx] = useState(0);

  // RESET quando as URLs mudam (caso contrário, um erro antigo trava para sempre
  // mesmo depois do fallback do DB carregar com uma URL válida)
  useEffect(() => {
    setIdx(0);
  }, [candidates.join('|')]);

  const current = candidates[idx];
  const hasImage = !!current;

  const [c1, c2] = TEAM_GRADIENTS[hashName(name) % TEAM_GRADIENTS.length];
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] ring-1 ring-black/20",
        className
      )}
      style={hasImage ? undefined : { background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      aria-label={name}
    >
      {hasImage ? (
        <img
          key={current}
          src={current}
          alt={name}
          className="aspect-square h-full w-full object-contain p-0.5"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <>
          <span
            className="relative z-10 text-[10px] font-black uppercase tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
            style={{ fontFeatureSettings: '"ss01"' }}
          >
            {initials}
          </span>
          {/* gloss overlay premium */}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/20" />
        </>
      )}
    </div>
  );
};

export default function ApiExplorer() {
  const { isSystemOwner } = useAuth();
  const { setContent: setTopBarContent } = useTopBar();
  
  const [sportType, setSportType] = useState<'traditional' | 'esports'>('traditional');
  const [selectedSport, setSelectedSport] = useState('soccer');
  const [events, setEvents] = useState<Event[]>([]);
  const [monitoredLeagues, setMonitoredLeagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingLogos, setSyncingLogos] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'matches' | 'coverage' | 'teams'>('matches');
  const [timeFilter, setTimeFilter] = useState<'today' | 'tomorrow' | 'yesterday' | 'upcoming' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Filters
  const [filters, setFilters] = useState({
    continent: 'all',
    country: 'all',
    type: 'all',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  // Fallback de logos a partir do cache local (team_logos / league_logos)
  const { getTeamLogo, getLeagueLogo } = useLogoFallback(selectedSport);

  // Set TopBar
  useEffect(() => {
    setTopBarContent(
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Database className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm">Explorador de Dados v2</span>
      </div>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsRes, leaguesRes] = await Promise.all([
        supabase
          .from('daily_events')
          .select('*')
          .eq('sport', selectedSport)
          .order('commence_time', { ascending: true }),
        supabase
          .from('monitored_leagues')
          .select('*')
          .eq('sport', selectedSport)
          .order('continent', { ascending: true })
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (leaguesRes.error) throw leaguesRes.error;

      setEvents(eventsRes.data || []);
      setMonitoredLeagues(leaguesRes.data || []);
      
      if (eventsRes.data && eventsRes.data.length > 0) {
        setLastSync(eventsRes.data[0].synced_at);
      }
    } catch (err: any) {
      toast.error('Erro ao carregar dados locais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedSport]);

  const handleManualSync = async () => {
    if (!window.confirm('Sincronizar agora consumirá créditos da API. Continuar?')) return;
    setSyncing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/run-job`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ job: 'fetch_events' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.result?.queued) {
        toast.success(data.result.message || 'Sincronização iniciada em background.');
        setTimeout(() => loadData(), 8000);
      } else {
        toast.success(`Sincronização concluída: ${data.result.totalSaved} eventos.`);
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncLogos = async () => {
    if (!window.confirm('Sincronização completa de escudos: ~30 créditos da API-Sports (1 por liga monitorada). Continuar?')) return;
    setSyncingLogos(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/run-job`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ job: 'sync_all_teams' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast.success(data.result.message || 'Sincronização completa iniciada em background.');
      setTimeout(() => loadData(), 15000);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingLogos(false);
    }
  };


  // Derived Data
  const continents = useMemo(() => Array.from(new Set(events.map(e => e.continent).filter(Boolean))), [events]);
  const countries = useMemo(() => Array.from(new Set(events.filter(e => e.continent === filters.continent || filters.continent === 'all').map(e => e.country).filter(Boolean))), [events, filters.continent]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchSearch = e.home_team.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          e.away_team.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          e.league_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchContinent = filters.continent === 'all' || e.continent === filters.continent;
      const matchCountry = filters.country === 'all' || e.country === filters.country;
      const matchType = filters.type === 'all' || e.competition_type === filters.type;
      
      // Time filtering logic (considering local timezone)
      const eventDate = parseISO(e.commence_time);
      const localDateStr = format(eventDate, 'yyyy-MM-dd');
      
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      const tomorrowStr = format(new Date(new Date().setDate(today.getDate() + 1)), 'yyyy-MM-dd');
      const yesterdayStr = format(new Date(new Date().setDate(today.getDate() - 1)), 'yyyy-MM-dd');
      
      let matchTime = false;
      if (timeFilter === 'today') matchTime = localDateStr === todayStr;
      else if (timeFilter === 'tomorrow') matchTime = localDateStr === tomorrowStr;
      else if (timeFilter === 'yesterday') matchTime = localDateStr === yesterdayStr;
      else if (timeFilter === 'upcoming') matchTime = localDateStr > tomorrowStr;
      else if (timeFilter === 'custom') matchTime = localDateStr === customDate;
      
      return matchSearch && matchContinent && matchCountry && matchType && matchTime;
    });
  }, [events, searchTerm, filters, timeFilter, customDate]);

  // Match counts per date for calendar indicators
  const matchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(ev => {
      const date = ev.commence_time.split('T')[0];
      counts[date] = (counts[date] || 0) + 1;
    });
    return counts;
  }, [events]);

  // Hierarchy for matches
  const groupedMatches = useMemo(() => {
    return filteredEvents.reduce((acc, ev) => {
      const cont = ev.continent || 'Outros';
      const ctry = ev.country || 'Outros';
      const type = ev.competition_type === 'continental' ? 'Continental' : (ev.competition_type === 'cup' ? 'Copas' : 'Ligas');
      
      if (!acc[cont]) acc[cont] = {};
      if (!acc[cont][ctry]) acc[cont][ctry] = {};
      if (!acc[cont][ctry][type]) acc[cont][ctry][type] = {};
      if (!acc[cont][ctry][type][ev.league_name]) acc[cont][ctry][type][ev.league_name] = [];
      
      acc[cont][ctry][type][ev.league_name].push(ev);
      return acc;
    }, {} as any);
  }, [filteredEvents]);

  // Coverage Stats
  const coverage = useMemo(() => {
    const map = new Map<string, { name: string, continent: string, country: string, flag: string | null, type: string, count: number }>();
    events.forEach(e => {
      const key = `${e.continent}|${e.country}|${e.league_name}`;
      if (!map.has(key)) {
        map.set(key, { 
          name: e.league_name, 
          continent: e.continent || 'Outros', 
          country: e.country || 'Outros', 
          flag: e.league_flag,
          type: e.competition_type || 'league',
          count: 0 
        });
      }
      const item = map.get(key);
      if (item) item.count++;
    });
    return Array.from(map.values()).sort((a, b) => (a.continent || '').localeCompare(b.continent || ''));
  }, [events]);

  if (!isSystemOwner) return <div className="p-10 text-center">Acesso Restrito</div>;

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      
      {/* HEADER SECTION */}
      <div className="grid md:grid-cols-[1fr_auto] items-center gap-6 bg-card border p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            Explorador de Dados Esportivos
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">V2 REAL-TIME</Badge>
          </h1>
          <p className="text-muted-foreground text-sm">
            Auditoria de cobertura de ligas e monitoramento de calendário esportivo.
          </p>
          {lastSync && (
            <div className="flex items-center gap-2 pt-2">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Sincronizado em: {format(new Date(lastSync), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline"
            onClick={handleSyncLogos} 
            disabled={syncingLogos || syncing}
            className="rounded-full h-11 px-6 font-bold border-primary/20 hover:bg-primary/5 text-primary"
          >
            {syncingLogos ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
            {syncingLogos ? 'Sincronizando...' : 'Sincronizar Todos os Times'}
          </Button>
          <Button 
            onClick={handleManualSync} 
            disabled={syncing || syncingLogos}
            className="rounded-full shadow-lg shadow-primary/20 h-11 px-6 font-bold"
          >
            {syncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {syncing ? 'Sincronizando...' : 'Sincronizar Jogos'}
          </Button>
        </div>

      </div>

      {/* NAVIGATION TABS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-1 bg-muted/30 p-1.5 rounded-2xl w-fit border border-border/10 backdrop-blur-sm">
          <Button 
            variant={activeTab === 'matches' ? 'default' : 'ghost'} 
            size="sm" 
            onClick={() => setActiveTab('matches')}
            className={cn(
              "rounded-xl px-6 h-10 transition-all duration-300 font-bold",
              activeTab === 'matches' ? "shadow-lg shadow-primary/20 scale-105" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarIcon className="h-4 w-4 mr-2" /> Calendário
          </Button>
          <Button 
            variant={activeTab === 'coverage' ? 'default' : 'ghost'} 
            size="sm" 
            onClick={() => setActiveTab('coverage')}
            className={cn(
              "rounded-xl px-6 h-10 transition-all duration-300 font-bold",
              activeTab === 'coverage' ? "shadow-lg shadow-primary/20 scale-105" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Globe className="h-4 w-4 mr-2" /> Cobertura
          </Button>
          <Button
            variant={activeTab === 'teams' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('teams')}
            className={cn(
              "rounded-xl px-6 h-10 transition-all duration-300 font-bold",
              activeTab === 'teams' ? "shadow-lg shadow-primary/20 scale-105" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Database className="h-4 w-4 mr-2" /> Times & Ligas
          </Button>
        </div>

        {activeTab === 'matches' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/20 shadow-sm">
              {[
                { id: 'yesterday', label: 'Ontem' },
                { id: 'today', label: 'Hoje' },
                { id: 'tomorrow', label: 'Amanhã' },
                { id: 'upcoming', label: 'Próximos' }
              ].map((t) => (
                <Button 
                  key={t.id}
                  variant={timeFilter === t.id ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setTimeFilter(t.id as any)}
                  className={cn(
                    "rounded-lg px-4 h-8 text-[11px] font-black uppercase tracking-tight transition-all duration-200",
                    timeFilter === t.id ? "bg-background shadow-md text-primary scale-105" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant={timeFilter === 'custom' ? 'secondary' : 'outline'}
                  size="sm"
                  className={cn(
                    "h-10 rounded-xl px-4 border-border/40 bg-card shadow-sm hover:bg-accent transition-all flex items-center gap-2",
                    timeFilter === 'custom' && "border-primary/40 bg-primary/5 text-primary font-bold"
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="text-xs">
                    {timeFilter === 'custom' ? format(parseISO(customDate), "dd 'de' MMM", { locale: ptBR }) : 'Selecionar Data'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-auto p-0 border-none shadow-2xl rounded-2xl overflow-hidden z-[100]" 
                align="end"
                sideOffset={8}
              >
                <div className="bg-card/95 backdrop-blur-md border rounded-2xl">
                  <div className="p-4 border-b bg-muted/30 flex flex-col gap-3">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Navegação Rápida</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 text-[10px] font-bold rounded-xl border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
                        onClick={() => {
                          const d = format(new Date(), 'yyyy-MM-dd');
                          setCustomDate(d);
                          setTimeFilter('today');
                        }}
                      >
                        Hoje
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 text-[10px] font-bold rounded-xl border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
                        onClick={() => {
                          const d = format(new Date(new Date().setDate(new Date().getDate() + 1)), 'yyyy-MM-dd');
                          setCustomDate(d);
                          setTimeFilter('tomorrow');
                        }}
                      >
                        Amanhã
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 text-[10px] font-bold rounded-xl border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
                        onClick={() => {
                          const d = format(new Date(new Date().setDate(new Date().getDate() + 7)), 'yyyy-MM-dd');
                          setCustomDate(d);
                          setTimeFilter('custom');
                        }}
                      >
                        Próx. 7 Dias
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 text-[10px] font-bold rounded-xl border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
                        onClick={() => {
                          const d = format(new Date(new Date().setDate(new Date().getDate() + 30)), 'yyyy-MM-dd');
                          setCustomDate(d);
                          setTimeFilter('custom');
                        }}
                      >
                        Próx. 30 Dias
                      </Button>
                    </div>
                  </div>
                  <Calendar
                    mode="single"
                    selected={parseISO(customDate)}
                    onSelect={(date) => {
                      if (date) {
                        setCustomDate(format(date, 'yyyy-MM-dd'));
                        setTimeFilter('custom');
                      }
                    }}
                    locale={ptBR}
                    captionLayout="dropdown-buttons"
                    fromYear={2024}
                    toYear={2027}
                    className="p-4 pointer-events-auto"
                    classNames={{
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary rounded-xl transition-all scale-110 shadow-lg shadow-primary/30",
                      day_today: "bg-primary/10 text-primary font-bold border-none rounded-xl ring-1 ring-primary/30",
                      day: "h-9 w-9 p-0 font-medium aria-selected:opacity-100 hover:bg-primary/5 hover:text-primary rounded-xl transition-all relative",
                      head_cell: "text-muted-foreground rounded-md w-9 font-black text-[10px] uppercase tracking-wider",
                    }}
                    modifiers={{
                      hasGames: (date) => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        return !!matchCounts[dateStr];
                      }
                    }}
                    modifiersClassNames={{
                      hasGames: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-emerald-500 after:rounded-full after:shadow-[0_0_5px_rgba(16,185,129,0.8)]"
                    }}
                    initialFocus
                  />
                  <div className="p-3 bg-muted/20 border-t flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Dias com jogos</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] font-black uppercase text-primary hover:bg-primary/10"
                      onClick={() => {
                        const d = format(new Date(), 'yyyy-MM-dd');
                        setCustomDate(d);
                        setTimeFilter('today');
                      }}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className={cn("grid gap-6", activeTab === 'teams' ? "grid-cols-1" : "lg:grid-cols-[280px_1fr]")}>

        {/* SIDEBAR FILTERS */}
        {activeTab !== 'teams' && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" /> Filtros Avançados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex p-1 bg-muted/50 rounded-xl">
                  <Button 
                    variant={sportType === 'traditional' ? 'secondary' : 'ghost'} 
                    size="sm"
                    onClick={() => {
                      setSportType('traditional');
                      setSelectedSport('soccer');
                    }}
                    className="flex-1 h-8 text-[10px] font-black uppercase tracking-tight"
                  >
                    Esportes
                  </Button>
                  <Button 
                    variant={sportType === 'esports' ? 'secondary' : 'ghost'} 
                    size="sm"
                    onClick={() => {
                      setSportType('esports');
                      setSelectedSport('leagueoflegends');
                    }}
                    className="flex-1 h-8 text-[10px] font-black uppercase tracking-tight"
                  >
                    E-Sports
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Esporte Selecionado</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(sportType === 'traditional' ? TRADITIONAL_SPORTS : ESPORTS).map(s => (
                      <Button 
                        key={s.id} 
                        variant={selectedSport === s.id ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => setSelectedSport(s.id)}
                        className="h-10 text-[11px] font-bold"
                      >
                        {s.icon} {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Continente</label>
                <select 
                  className="w-full bg-muted/50 border rounded-lg p-2 text-xs font-semibold"
                  value={filters.continent}
                  onChange={e => setFilters({...filters, continent: e.target.value, country: 'all'})}
                >
                  <option value="all">Todos os Continentes</option>
                  {continents.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">País</label>
                <select 
                  className="w-full bg-muted/50 border rounded-lg p-2 text-xs font-semibold"
                  value={filters.country}
                  onChange={e => setFilters({...filters, country: e.target.value})}
                  disabled={filters.continent === 'all'}
                >
                  <option value="all">Todos os Países</option>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Tipo</label>
                <select 
                  className="w-full bg-muted/50 border rounded-lg p-2 text-xs font-semibold"
                  value={filters.type}
                  onChange={e => setFilters({...filters, type: e.target.value})}
                >
                  <option value="all">Todas Competições</option>
                  <option value="league">Ligas Nacionais</option>
                  <option value="cup">Copas Nacionais</option>
                  <option value="continental">Continentais</option>
                </select>
              </div>

              <div className="pt-2">
                <Input 
                  placeholder="Buscar time ou liga..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-muted/50 border-none h-10 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* QUICK STATS */}
          <div className="space-y-4">
            <Card className="rounded-2xl border-border/40 bg-primary/5 border-primary/10">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total de Jogos</span>
                  <span className="text-xl font-black text-primary">{events.length}</span>
                </div>
                
                <Sheet>
                  <SheetTrigger asChild>
                    <button className="w-full flex justify-between items-center hover:bg-primary/5 p-2 -m-2 rounded-lg transition-colors group">
                      <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest group-hover:text-primary">Ligas Monitoradas</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-primary">{monitoredLeagues.length}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                      </div>
                    </button>
                  </SheetTrigger>
                  <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 border-l">
                    <SheetHeader className="p-6 border-b">
                      <SheetTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                        <ListFilter className="h-5 w-5 text-primary" />
                        Auditoria de Ligas: {(sportType === 'traditional' ? TRADITIONAL_SPORTS : ESPORTS).find(s => s.id === selectedSport)?.label}
                      </SheetTitle>
                      <SheetDescription className="text-xs font-bold uppercase tracking-wider">
                        Controle de cobertura e integridade de dados.
                      </SheetDescription>
                    </SheetHeader>
                    
                    <ScrollArea className="h-[calc(100vh-120px)]">
                      <div className="p-6 space-y-8">
                        {/* Sport Coverage Status */}
                        <Card className="border-border/40 bg-muted/30 overflow-hidden">
                          <div className="p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status da Integração</span>
                              {(() => {
                                const sport = (sportType === 'traditional' ? TRADITIONAL_SPORTS : ESPORTS).find(s => s.id === selectedSport);
                                if (sport?.status === 'supported') return <Badge className="bg-emerald-500 text-white border-none text-[9px] font-black">TOTALMENTE SUPORTADO</Badge>;
                                if (sport?.status === 'partial') return <Badge className="bg-amber-500 text-white border-none text-[9px] font-black">SUPORTE PARCIAL</Badge>;
                                return <Badge className="bg-rose-500 text-white border-none text-[9px] font-black">INDISPONÍVEL NA API ATUAL</Badge>;
                              })()}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                              {(() => {
                                const sport = (sportType === 'traditional' ? TRADITIONAL_SPORTS : ESPORTS).find(s => s.id === selectedSport);
                                if (sport?.status === 'supported') return "Esta modalidade possui cobertura completa e estável através da The Odds API, incluindo eventos diários e mercados principais.";
                                if (sport?.status === 'partial') return "Algumas ligas desta modalidade podem não estar disponíveis dependendo da região ou temporada esportiva na API.";
                                return "ATENÇÃO: Este esporte foi identificado como sem cobertura ativa na chave da API atual. Nenhuma partida será encontrada.";
                              })()}
                            </p>
                          </div>
                        </Card>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-muted/50 p-4 rounded-xl border border-border/40 shadow-sm hover:border-emerald-500/30 transition-colors">
                            <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Ligas com Jogos</span>
                            <span className="text-2xl font-black text-emerald-500">
                              {monitoredLeagues.filter(l => events.some(e => e.league_key === l.league_key)).length}
                            </span>
                          </div>
                          <div className="bg-muted/50 p-4 rounded-xl border border-border/40 shadow-sm hover:border-rose-500/30 transition-colors">
                            <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Ligas Vazias</span>
                            <span className="text-2xl font-black text-rose-500">
                              {monitoredLeagues.filter(l => !events.some(e => e.league_key === l.league_key)).length}
                            </span>
                          </div>
                        </div>

                        {/* List by Continent */}
                        {Array.from(new Set(monitoredLeagues.map(l => l.continent))).sort().map(continent => (
                          <div key={continent} className="space-y-4">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-foreground text-background font-black px-3 py-0.5 rounded-full uppercase tracking-widest text-[9px]">
                                {continent || 'Outros'}
                              </Badge>
                              <div className="h-[1px] flex-1 bg-border/40" />
                            </div>
                            
                            <div className="space-y-2">
                              {monitoredLeagues
                                .filter(l => l.continent === continent)
                                .map(league => {
                                  const gameCount = events.filter(e => e.league_key === league.league_key).length;
                                  const firstGame = events.find(e => e.league_key === league.league_key);
                                  return (
                                    <div key={league.league_key} className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-card/50 hover:bg-muted/50 transition-colors">
                                      <div className="flex items-center gap-3">
                                        {firstGame?.league_logo ? (
                                          <img src={firstGame.league_logo} alt={league.league_name} className="h-6 w-6 object-contain" />
                                        ) : getLeagueLogo(league.league_key) ? (
                                          <img src={getLeagueLogo(league.league_key)!} alt={league.league_name} className="h-6 w-6 object-contain" />
                                        ) : (
                                          <span className="text-lg">{league.league_flag}</span>
                                        )}

                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold leading-none">{league.league_name}</span>
                                          <span className="text-[10px] text-muted-foreground font-semibold uppercase">{league.country}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {gameCount > 0 ? (
                                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-black">
                                            {gameCount} JOGOS
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-muted-foreground/40 border-muted-foreground/20 text-[10px] font-black">
                                            Vazio
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/40 bg-muted/20">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-3 w-3" />
                  Ligas sem jogos indicam que não há partidas programadas para as próximas 24h na API.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
        )}

        {/* MAIN FEED */}
        <div className="space-y-6">
          {activeTab === 'teams' ? (
            <TeamsLeaguesTab />
          ) : activeTab === 'matches' ? (
            <div className="space-y-10">
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
                  <p className="text-sm font-bold text-muted-foreground tracking-widest uppercase">Consultando Calendário...</p>
                </div>
              ) : Object.keys(groupedMatches).length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <Search className="h-12 w-12 text-muted-foreground/20 mx-auto" />
                  <p className="text-muted-foreground font-bold">Nenhuma partida encontrada para os filtros atuais.</p>
                </div>
              ) : (
                Object.entries(groupedMatches).map(([continent, countries]: [string, any]) => (
                  <div key={continent} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-[1px] flex-1 bg-border/40" />
                      <Badge className="bg-foreground text-background font-black px-4 py-1 rounded-full uppercase tracking-widest text-[10px]">
                        {continent}
                      </Badge>
                      <div className="h-[1px] flex-1 bg-border/40" />
                    </div>

                    {Object.entries(countries).map(([country, types]: [string, any]) => (
                      <div key={country} className="space-y-4">
                        <div className="flex items-center gap-2 px-2">
                          <MapIcon className="h-4 w-4 text-primary" />
                          <h3 className="text-lg font-black tracking-tight">{country}</h3>
                        </div>

                        {Object.entries(types).map(([type, leagues]: [string, any]) => (
                          <div key={type} className="space-y-4">
                            {Object.entries(leagues).map(([leagueName, matches]: [string, any]) => (
                              <Card key={leagueName} className="overflow-hidden border-border/40 shadow-sm rounded-xl">
                                <div className="bg-muted/40 px-4 py-2 flex justify-between items-center border-b border-border/40">
                                  <div className="flex items-center gap-2">
                                    {matches[0].league_logo ? (
                                      <img src={matches[0].league_logo} alt={leagueName} className="h-5 w-5 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    ) : getLeagueLogo(matches[0].league_key) ? (
                                      <img src={getLeagueLogo(matches[0].league_key)!} alt={leagueName} className="h-5 w-5 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    ) : (
                                      <span className="text-base">{matches[0].league_flag}</span>
                                    )}

                                    <span className="text-[11px] font-black uppercase tracking-wider">{leagueName}</span>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-bold uppercase border-primary/20 text-primary">
                                      {type}
                                    </Badge>
                                  </div>
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{matches.length} partidas</span>
                                </div>
                                <div className="divide-y divide-border/20">
                                  {matches.map((ev: Event) => {
                                    const startsAt = parseISO(ev.commence_time);
                                    const isPast = startsAt.getTime() < Date.now();
                                    return (
                                    <div
                                      key={ev.api_id}
                                      className={cn(
                                        "grid grid-cols-[80px_1fr_100px] items-center p-4 transition-colors group",
                                        isPast
                                          ? "bg-amber-500/10 hover:bg-amber-500/15"
                                          : "hover:bg-primary/5"
                                      )}
                                    >
                                      {/* TIME */}
                                      <div className="flex flex-col items-center justify-center border-r pr-4">
                                        <span className={cn(
                                          "text-sm font-black",
                                          isPast ? "text-amber-700 dark:text-amber-500 line-through decoration-amber-700/40" : "text-foreground"
                                        )}>
                                          {format(startsAt, 'HH:mm')}
                                        </span>
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase">
                                          {format(startsAt, 'dd/MM')}
                                        </span>
                                      </div>

                                      {/* TEAMS */}
                                      <div className="px-6 flex flex-col gap-3">
                                        <div className="flex justify-between items-center group/team">
                                          <div className="flex items-center gap-3">
                                            <TeamLogo name={ev.home_team} url={ev.home_team_logo} fallbackUrl={getTeamLogo(ev.home_team, ev.league_key)} className="h-7 w-7 border-primary/10 shadow-none group-hover/team:scale-110 transition-transform" />
                                            <span className="text-sm font-bold group-hover:text-primary transition-colors">{ev.home_team}</span>
                                          </div>
                                          {ev.result_home && <span className="font-black text-primary bg-primary/5 px-2 py-0.5 rounded text-xs">{ev.result_home}</span>}
                                        </div>
                                        <div className="flex justify-between items-center group/team">
                                          <div className="flex items-center gap-3">
                                            <TeamLogo name={ev.away_team} url={ev.away_team_logo} fallbackUrl={getTeamLogo(ev.away_team, ev.league_key)} className="h-7 w-7 border-primary/10 shadow-none group-hover/team:scale-110 transition-transform" />
                                            <span className="text-sm font-bold group-hover:text-primary transition-colors">{ev.away_team}</span>
                                          </div>
                                          {ev.result_away && <span className="font-black text-primary bg-primary/5 px-2 py-0.5 rounded text-xs">{ev.result_away}</span>}
                                        </div>
                                      </div>

                                      {/* STATUS / INFO */}
                                      <div className="flex justify-end pr-2">
                                        {isPast && (
                                          <Badge
                                            variant="outline"
                                            className="mr-1 h-5 px-1.5 text-[9px] font-black uppercase tracking-wider border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                          >
                                            Encerrado
                                          </Badge>
                                        )}
                                        <Button variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0">
                                          <Info className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                  })}
                                </div>
                              </Card>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="rounded-2xl border-border/40">
                <CardHeader>
                  <CardTitle className="text-lg font-black tracking-tight">Mapeamento de Cobertura</CardTitle>
                  <CardDescription>Lista completa de campeonatos integrados e volume de dados encontrados.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-hidden rounded-b-2xl">
                    <table className="w-full text-left">
                      <thead className="bg-muted/50 text-[10px] font-black uppercase text-muted-foreground tracking-widest border-y">
                        <tr>
                          <th className="px-6 py-4">Liga / Campeonato</th>
                          <th className="px-6 py-4">Localização</th>
                          <th className="px-6 py-4">Tipo</th>
                          <th className="px-6 py-4 text-right">Jogos Ativos</th>
                          <th className="px-6 py-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {coverage.map((item, idx) => (
                          <tr key={idx} className="hover:bg-primary/5 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{item.flag}</span>
                                <span className="text-xs font-bold">{item.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-muted-foreground">{item.continent}</span>
                                <span className="text-xs font-semibold">{item.country}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant="outline" className="text-[9px] font-black uppercase px-2 py-0 h-5 border-primary/20 text-primary">
                                {item.type === 'league' ? 'Liga' : (item.type === 'cup' ? 'Copa' : 'Continental')}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-black text-primary">{item.count}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {item.count > 0 ? (
                                <div className="flex items-center justify-center gap-1 text-emerald-500">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className="text-[10px] font-black uppercase">Coberto</span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1 text-muted-foreground/40">
                                  <XCircle className="h-4 w-4" />
                                  <span className="text-[10px] font-black uppercase">Sem Dados</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
