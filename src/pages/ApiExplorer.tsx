import { useState, useEffect } from 'react';
import { useTopBar } from "@/contexts/TopBarContext";
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Globe, 
  RefreshCw, 
  Search, 
  Clock,
  ChevronRight,
  AlertCircle,
  Loader2,
  Calendar
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, parseISO, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Sports mapping
const SPORTS = [
  { id: 'soccer', label: 'Futebol' },
  { id: 'basketball', label: 'Basquete' },
  { id: 'tennis', label: 'Tênis' },
  { id: 'icehockey', label: 'Hockey' },
];

interface Event {
  api_id: string;
  sport: string;
  league_key: string;
  league_name: string;
  league_flag: string | null;
  home_team: string;
  away_team: string;
  commence_time: string;
  status: string;
  result_home: string | null;
  result_away: string | null;
  synced_at: string;
}

interface LeagueCount {
  league_key: string;
  league_name: string;
  league_flag: string | null;
  game_count: number;
}

export default function ApiExplorer() {
  const { isSystemOwner } = useAuth();
  const { setContent: setTopBarContent } = useTopBar();
  
  const [selectedSport, setSelectedSport] = useState('soccer');
  const [events, setEvents] = useState<Event[]>([]);
  const [leagues, setLeagues] = useState<LeagueCount[]>([]);
  const [activeLeague, setActiveLeague] = useState('all');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Set TopBar content
  useEffect(() => {
    setTopBarContent(
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Globe className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm">Explorador de Dados</span>
      </div>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent]);

  const loadFromDatabase = async (sportKey: string) => {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().split('T')[0];

    try {
      // 1. Fetch events from database
      const { data: eventsData, error: eventsError } = await supabase
        .from('daily_events')
        .select('*')
        .eq('sport', sportKey)
        .eq('event_date', today)
        .order('commence_time', { ascending: true });

      if (eventsError) throw eventsError;

      // 2. Fetch league counts from view
      const { data: leaguesData, error: leaguesError } = await supabase
        .from('league_game_counts')
        .select('*')
        .eq('sport', sportKey)
        .eq('event_date', today)
        .order('game_count', { ascending: false });

      if (leaguesError) throw leaguesError;

      setEvents(eventsData || []);
      setLeagues(leaguesData || []);
      
      if (eventsData && eventsData.length > 0) {
        setLastSync(eventsData[0].synced_at);
      } else {
        setLastSync(null);
      }

    } catch (err: any) {
      console.error('Error loading from database:', err);
      setError('Erro ao carregar dados do banco local.');
      toast.error('Erro ao carregar dados locais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFromDatabase(selectedSport);
    setActiveLeague('all');
  }, [selectedSport]);

  const handleManualSync = async () => {
    const confirmed = window.confirm(
      'Sincronizar agora consumirá aproximadamente 20 créditos da API. Continuar?'
    );
    if (!confirmed) return;

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
      if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar');

      toast.success(`Sincronização concluída: ${data.result.totalSaved} eventos salvos.`);
      loadFromDatabase(selectedSport);
    } catch (err: any) {
      console.error('Sync error:', err);
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const filteredEvents = activeLeague === 'all'
    ? events
    : events.filter(ev => ev.league_key === activeLeague);

  // Group by league
  const groupedByLeague = filteredEvents.reduce((acc, ev) => {
    if (!acc[ev.league_key]) {
      acc[ev.league_key] = {
        name: ev.league_name,
        flag: ev.league_flag,
        games: []
      };
    }
    acc[ev.league_key].games.push(ev);
    return acc;
  }, {} as Record<string, { name: string, flag: string | null, games: Event[] }>);

  const getStatusBadge = (commenceTime: string) => {
    const date = parseISO(commenceTime);
    const now = new Date();
    const diffMin = differenceInMinutes(date, now);
    
    // Status color mapping for the user request
    // Label should be: 
    // - "ao vivo" (red) if now >= commenceTime AND now < commenceTime + 3h
    // - "encerrado" (gray) if now >= commenceTime + 3h
    // - "HH:MM" (blue) if today and not started
    // - "DD/MM" (neutral) if future

    const isLive = diffMin <= 0 && diffMin > -180;
    const isFinished = diffMin <= -180;
    
    if (isLive) {
      return { label: 'ao vivo', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
    }
    if (isFinished) {
      return { label: 'encerrado', color: 'bg-muted text-muted-foreground border-border' };
    }
    if (isToday(date)) {
      return { label: format(date, 'HH:mm'), color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
    }
    return { label: format(date, 'dd/MM'), color: 'bg-muted/50 text-muted-foreground border-border/40' };
  };

  if (!isSystemOwner) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold">Acesso Restrito</h1>
          <p className="text-muted-foreground">Esta tela é exclusiva para o proprietário do sistema.</p>
        </div>
      </div>
    );
  }

  const isOldSync = lastSync && (new Date().getTime() - new Date(lastSync).getTime()) > 6 * 60 * 60 * 1000;

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      
      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/50 backdrop-blur-sm p-6 rounded-xl border border-border/40">
        <div className="space-y-1">
          <h2 className="text-xl font-black flex items-center gap-2 tracking-tight">
            Explorador de Dados
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">v2 local</Badge>
          </h2>
          {lastSync ? (
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs font-medium",
                isOldSync ? "text-amber-500" : "text-muted-foreground"
              )}>
                Última sincronização: {format(new Date(lastSync), "eeee, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </span>
              {isOldSync && (
                <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/20 bg-amber-500/5">
                  Desatualizado
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Nenhuma sincronização realizada ainda hoje.</span>
          )}
        </div>
        <Button 
          onClick={handleManualSync} 
          disabled={syncing}
          className="gap-2 shadow-lg shadow-primary/20"
        >
          {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </Button>
      </div>

      {/* TABS DE ESPORTE */}
      <div className="flex flex-wrap gap-2">
        {SPORTS.map(sport => (
          <Button
            key={sport.id}
            variant={selectedSport === sport.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedSport(sport.id)}
            className={cn(
              "rounded-full px-6 h-9 text-xs font-bold uppercase tracking-wider transition-all",
              selectedSport === sport.id ? "shadow-lg shadow-primary/20" : "hover:bg-primary/5 hover:text-primary"
            )}
          >
            {sport.label}
          </Button>
        ))}
      </div>

      {/* FILTRO DE LIGAS */}
      {leagues.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2 overflow-x-auto no-scrollbar">
          <Button
            variant={activeLeague === 'all' ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveLeague('all')}
            className={cn(
              "h-8 text-[11px] font-bold rounded-lg px-3",
              activeLeague === 'all' ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground"
            )}
          >
            Todas ({events.length})
          </Button>
          {leagues.map(lg => (
            <Button
              key={lg.league_key}
              variant={activeLeague === lg.league_key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveLeague(lg.league_key)}
              className={cn(
                "h-8 text-[11px] font-bold rounded-lg px-3 gap-2",
                activeLeague === lg.league_key ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground"
              )}
            >
              <span>{lg.league_flag}</span>
              <span>{lg.league_name}</span>
              <span className="opacity-50 text-[10px] font-normal">({lg.game_count})</span>
            </Button>
          ))}
        </div>
      )}

      {/* LISTA DE JOGOS (FlashScore style) */}
      <Card className="border-border/40 min-h-[400px] flex flex-col bg-card/30">
        <CardContent className="flex-1 p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
              <p className="text-sm font-medium text-muted-foreground animate-pulse">Lendo banco de dados local...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/50 mb-4" />
              <h3 className="font-semibold text-destructive mb-1">Erro de Carregamento</h3>
              <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-6"
                onClick={() => loadFromDatabase(selectedSport)}
              >
                Tentar novamente
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
              <Search className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-base font-bold text-muted-foreground">Nenhum jogo encontrado para hoje.</p>
              <p className="text-sm text-muted-foreground/60 max-w-xs mt-1">
                Isso pode ocorrer porque o banco local ainda não foi sincronizado com a API.
              </p>
              {!lastSync && (
                <Button variant="default" className="mt-6" onClick={handleManualSync}>
                  Sincronizar Agora
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="p-4 space-y-6">
                {Object.entries(groupedByLeague).map(([leagueKey, league]) => (
                  <div key={leagueKey} className="space-y-1">
                    {/* LEAGUE HEADER */}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-t-lg border-x border-t border-border/40">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{league.flag}</span>
                        <span className="text-xs font-black uppercase tracking-wider">{league.name}</span>
                      </div>
                      <Badge variant="ghost" className="text-[10px] font-mono text-muted-foreground">
                        {league.games.length} jogos
                      </Badge>
                    </div>

                    {/* GAMES LIST */}
                    <div className="divide-y divide-border/40 border border-border/40 rounded-b-lg overflow-hidden bg-card/40">
                      {league.games.map(ev => {
                        const badge = getStatusBadge(ev.commence_time);
                        return (
                          <div key={ev.api_id} className="group flex items-center gap-4 p-3 hover:bg-primary/5 transition-colors">
                            {/* TIME/STATUS */}
                            <div className="w-16 flex flex-col items-center justify-center border-r border-border/40 pr-3">
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[10px] font-bold px-1.5 h-5 min-w-[50px] flex justify-center border-none",
                                  badge.color
                                )}
                              >
                                {badge.label}
                              </Badge>
                            </div>

                            {/* TEAMS */}
                            <div className="flex-1 flex flex-col gap-1">
                              <div className="flex justify-between items-center">
                                <span className={cn(
                                  "text-sm font-semibold",
                                  ev.result_home ? "text-foreground" : "text-foreground/90"
                                )}>
                                  {ev.home_team}
                                </span>
                                {ev.result_home !== null && (
                                  <span className="font-bold text-primary">{ev.result_home}</span>
                                )}
                              </div>
                              <div className="flex justify-between items-center">
                                <span className={cn(
                                  "text-sm font-semibold",
                                  ev.result_away ? "text-foreground" : "text-foreground/90"
                                )}>
                                  {ev.away_team}
                                </span>
                                {ev.result_away !== null && (
                                  <span className="font-bold text-primary">{ev.result_away}</span>
                                )}
                              </div>
                            </div>
                            
                            {/* ACTIONS */}
                            <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* FOOTER STATS */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 rounded-xl border border-border/40 bg-muted/30 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            Navegação Gratuita (Local DB)
          </div>
          <div className="flex items-center gap-2 border-l border-border/40 pl-6">
            Ligas Monitoradas: <span className="text-foreground">20</span>
          </div>
        </div>
        <div className="mt-2 sm:mt-0 opacity-50">
          Internal Data Service v2.0
        </div>
      </div>
    </div>
  );
}