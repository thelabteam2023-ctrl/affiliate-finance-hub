import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, RefreshCw, Loader2, AlertCircle, ChevronDown, Filter, Calendar as CalendarIcon, Map } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  synced_at: string;
}

export default function ApiExplorer() {
  const { isSystemOwner } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedSport, setSelectedSport] = useState('soccer');
  const [filters, setFilters] = useState({ continent: 'all', country: 'all' });

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('daily_events')
      .select('*')
      .eq('sport', selectedSport)
      .order('commence_time', { ascending: true });

    if (error) {
      toast.error('Erro ao carregar eventos');
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedSport]);

  const continents = useMemo(() => Array.from(new Set(events.map(e => e.continent).filter(Boolean))), [events]);
  const countries = useMemo(() => Array.from(new Set(events.filter(e => e.continent === filters.continent || filters.continent === 'all').map(e => e.country).filter(Boolean))), [events, filters.continent]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => 
      (filters.continent === 'all' || e.continent === filters.continent) &&
      (filters.country === 'all' || e.country === filters.country)
    );
  }, [events, filters]);

  // Hierarquia: Continente > Pais > Liga
  const hierarchy = useMemo(() => {
    return filteredEvents.reduce((acc, ev) => {
      const cont = ev.continent || 'Outros';
      const count = ev.country || 'Outros';
      const league = ev.league_name;
      
      if (!acc[cont]) acc[cont] = {};
      if (!acc[cont][count]) acc[cont][count] = {};
      if (!acc[cont][count][league]) acc[cont][count][league] = [];
      
      acc[cont][count][league].push(ev);
      return acc;
    }, {} as any);
  }, [filteredEvents]);

  if (!isSystemOwner) return <div>Acesso Restrito</div>;

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Explorador de Dados Esportivos</h1>
        
        <div className="flex gap-2">
          {['soccer', 'basketball', 'tennis', 'icehockey'].map(s => (
            <Button key={s} variant={selectedSport === s ? 'default' : 'outline'} onClick={() => setSelectedSport(s)}>
              {s.toUpperCase()}
            </Button>
          ))}
          <Button variant="secondary" className="ml-auto" onClick={loadData}>
            <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 p-4 bg-card rounded-lg border">
           <select className="bg-transparent border rounded p-2" onChange={e => setFilters({continent: e.target.value, country: 'all'})}>
             <option value="all">Todos Continentes</option>
             {continents.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
           <select className="bg-transparent border rounded p-2" onChange={e => setFilters({...filters, country: e.target.value})}>
             <option value="all">Todos Países</option>
             {countries.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <Loader2 className="h-12 w-12 animate-spin mx-auto mt-20" />
      ) : (
        <div className="space-y-8">
          {Object.entries(hierarchy).map(([continent, countries]: [string, any]) => (
            <motion.div key={continent} className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><Globe className="h-5 w-5" /> {continent}</h2>
              {Object.entries(countries).map(([country, leagues]: [string, any]) => (
                <div key={country} className="ml-4 space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2"><Map className="h-4 w-4" /> {country}</h3>
                  <div className="grid gap-3">
                    {Object.entries(leagues).map(([leagueName, matches]: [string, any]) => (
                       <Card key={leagueName} className="p-4">
                         <h4 className="font-bold text-primary mb-2">{leagueName} ({matches.length})</h4>
                         <div className="space-y-2">
                           {matches.map((match: any) => (
                             <div key={match.api_id} className="flex justify-between items-center text-sm border-b pb-1">
                               <span>{format(parseISO(match.commence_time), 'HH:mm')}</span>
                               <span className="font-bold">{match.home_team} vs {match.away_team}</span>
                               <Badge>{match.competition_type}</Badge>
                             </div>
                           ))}
                         </div>
                       </Card>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
