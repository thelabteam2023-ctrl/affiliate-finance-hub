import { useState, useEffect } from 'react';
import { useTopBar } from "@/contexts/TopBarContext";
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Globe, 
  RefreshCw, 
  Search, 
  Calendar,
  Clock,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, isFuture, parseISO, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Sports mapping
const SPORTS = [
  { id: 'soccer', label: 'Futebol' },
  { id: 'basketball', label: 'Basquete' },
  { id: 'tennis', label: 'Tênis' },
  { id: 'icehockey', label: 'Hockey' },
];

const LEAGUES_BY_SPORT: Record<string, { key: string; label: string }[]> = {
  soccer: [
    { key: 'soccer_brazil_campeonato', label: 'Brasileirão Série A' },
    { key: 'soccer_epl', label: 'Premier League (Inglaterra)' },
    { key: 'soccer_germany_bundesliga', label: 'Bundesliga (Alemanha)' },
    { key: 'soccer_spain_la_liga', label: 'La Liga (Espanha)' },
    { key: 'soccer_italy_serie_a', label: 'Serie A (Itália)' },
    { key: 'soccer_france_ligue_one', label: 'Ligue 1 (França)' },
    { key: 'soccer_uefa_champs_league', label: 'UEFA Champions League' },
    { key: 'soccer_uefa_europa_league', label: 'UEFA Europa League' },
    { key: 'soccer_usa_mls', label: 'MLS (EUA)' },
    { key: 'soccer_argentina_primera_division', label: 'Liga Argentina' },
    { key: 'soccer_saudi_professional_league', label: 'Saudi Pro League' },
    { key: 'soccer_turkey_super_league', label: 'Süper Lig (Turquia)' },
    { key: 'soccer_netherlands_eredivisie', label: 'Eredivisie (Holanda)' },
    { key: 'soccer_portugal_primeira_liga', label: 'Primeira Liga (Portugal)' },
    { key: 'soccer_mexico_ligamx', label: 'Liga MX (México)' },
    { key: 'soccer_chile_campeonato', label: 'Primera División (Chile)' },
    { key: 'soccer_colombia_primera_a', label: 'Liga BetPlay (Colômbia)' },
    { key: 'soccer_venezuela_primera', label: 'Liga FUTVE (Venezuela)' },
    { key: 'soccer_china_superleague', label: 'Chinese Super League' },
    { key: 'soccer_japan_j_league', label: 'J-League (Japão)' },
  ],
  basketball: [
    { key: 'basketball_nba', label: 'NBA' },
    { key: 'basketball_euroleague', label: 'EuroLeague' },
    { key: 'basketball_wnba', label: 'WNBA' },
    { key: 'basketball_ncaab', label: 'NCAA Basketball' },
  ],
  tennis: [
    { key: 'tennis_atp_french_open', label: 'ATP French Open' },
    { key: 'tennis_wta_french_open', label: 'WTA French Open' },
    { key: 'tennis_atp', label: 'ATP (geral)' },
    { key: 'tennis_wta', label: 'WTA (geral)' },
  ],
  icehockey: [
    { key: 'icehockey_nhl', label: 'NHL' },
    { key: 'icehockey_sweden_hockey_league', label: 'SHL (Suécia)' },
    { key: 'icehockey_ahl', label: 'AHL' },
  ],
};

interface Event {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

export default function ApiExplorer() {
  const { isSystemOwner } = useAuth();
  const { setContent: setTopBarContent } = useTopBar();
  
  const [selectedSport, setSelectedSport] = useState('soccer');
  const [selectedLeague, setSelectedLeague] = useState('soccer_brazil_campeonato');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [sessionCredits, setSessionCredits] = useState(0);
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

  const fetchEvents = async (leagueKey: string) => {
    if (!leagueKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/preview?api=odds_api&sport=${leagueKey}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      
      const remaining = res.headers.get('x-requests-remaining');
      if (remaining) setCreditsRemaining(parseInt(remaining));
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao buscar dados da API');
      }
      
      setEvents(data.rawData || []);
      setSessionCredits(prev => prev + 1);
      
    } catch (err: any) {
      console.error('Error fetching events:', err);
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when league changes
  useEffect(() => {
    fetchEvents(selectedLeague);
  }, [selectedLeague]);

  // Handle sport change
  const handleSportChange = (sportId: string) => {
    setSelectedSport(sportId);
    const firstLeague = LEAGUES_BY_SPORT[sportId][0].key;
    setSelectedLeague(firstLeague);
  };

  const getStatusBadge = (commenceTime: string) => {
    const date = parseISO(commenceTime);
    const now = new Date();
    
    if (date < now) {
      return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">ao vivo</Badge>;
    }
    
    const diffMin = differenceInMinutes(date, now);
    if (diffMin < 120) {
      return <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">em {diffMin} min</Badge>;
    }
    
    if (isToday(date)) {
      return <span className="text-xs font-medium text-muted-foreground">{format(date, 'HH:mm')}</span>;
    }
    
    return <span className="text-xs font-medium text-muted-foreground">{format(date, 'dd/MM')}</span>;
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

  const leagueName = LEAGUES_BY_SPORT[selectedSport]?.find(l => l.key === selectedLeague)?.label || '';

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      
      {/* BLOCO 1 — Seletor */}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {SPORTS.map(sport => (
              <Button
                key={sport.id}
                variant={selectedSport === sport.id ? "default" : "outline"}
                size="sm"
                onClick={() => handleSportChange(sport.id)}
                className={cn(
                  "rounded-full px-4 h-8 text-xs font-medium transition-all",
                  selectedSport === sport.id ? "shadow-lg shadow-primary/20" : "hover:bg-primary/5 hover:text-primary"
                )}
              >
                {sport.label}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1 rounded-full border">
              <RefreshCw className="h-3 w-3" />
              {sessionCredits} créditos usados
            </div>
          </div>

          <div className="flex gap-2">
            <Select value={selectedLeague} onValueChange={setSelectedLeague}>
              <SelectTrigger className="flex-1 bg-background/50">
                <SelectValue placeholder="Selecione uma liga" />
              </SelectTrigger>
              <SelectContent>
                {LEAGUES_BY_SPORT[selectedSport].map(league => (
                  <SelectItem key={league.key} value={league.key}>
                    {league.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={() => fetchEvents(selectedLeague)}
              disabled={loading}
              className="px-3"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2 — Lista de jogos */}
      <Card className="border-border/40 min-h-[400px] flex flex-col">
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                {leagueName}
                {events.length > 0 && (
                  <Badge variant="outline" className="font-mono text-[10px] py-0">{events.length} jogos</Badge>
                )}
              </CardTitle>
            </div>
            {creditsRemaining !== null && (
              <div className="text-xs text-muted-foreground font-medium">
                <span className="text-primary">{creditsRemaining}</span> créditos restantes
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
              <p className="text-sm text-muted-foreground animate-pulse">Buscando jogos...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/50 mb-4" />
              <h3 className="font-semibold text-destructive mb-1">Erro na API</h3>
              <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-6"
                onClick={() => fetchEvents(selectedLeague)}
              >
                Tentar novamente
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <Search className="h-10 w-10 text-muted-foreground/20 mb-4" />
              <p className="text-sm text-muted-foreground max-w-xs">
                Nenhum jogo encontrado para esta liga no momento. Pode não haver rodada programada nos próximos dias.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="divide-y divide-border/40">
                {events.map(event => (
                  <div key={event.id} className="group flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold truncate">{event.home_team}</span>
                            <span className="text-[10px] text-muted-foreground font-black italic">VS</span>
                            <span className="text-sm font-bold truncate">{event.away_team}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[9px] h-4 uppercase tracking-tighter px-1 bg-muted/50">
                              {leagueName}
                            </Badge>
                            <span className="text-[10px] font-mono text-muted-foreground/50">
                              ID: {event.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-right ml-4 shrink-0">
                      {getStatusBadge(event.commence_time)}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-primary/40 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 3 — Barra de status */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border/40 bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Créditos usados nesta sessão: <span className="text-foreground">{sessionCredits}</span>
          </div>
          {creditsRemaining !== null && (
            <div className="flex items-center gap-2 border-l border-border/40 pl-4">
              Restantes na conta: <span className="text-foreground">{creditsRemaining} / 500</span>
            </div>
          )}
        </div>
        <div className="hidden sm:block">
          The Odds API Data Explorer
        </div>
      </div>
    </div>
  );
}
