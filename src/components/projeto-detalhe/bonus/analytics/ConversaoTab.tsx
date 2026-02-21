import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, RefreshCw } from "lucide-react";
import { parseISO, subDays } from "date-fns";
import { AnalyticsTabProps, ConversaoStats, formatCurrency } from "./types";

export function ConversaoTab({ bonuses, dateRange }: AnalyticsTabProps) {
  const ranking = useMemo((): ConversaoStats[] => {
    const startDate = dateRange?.start || subDays(new Date(), 30);
    const endDate = dateRange?.end || new Date();
    
    // Filter bonuses within period (by credited_at or finalized_at)
    const relevantBonuses = bonuses.filter(b => {
      const relevantDate = b.credited_at ? parseISO(b.credited_at) : 
                          b.finalized_at ? parseISO(b.finalized_at) : null;
      if (!relevantDate) return false;
      return relevantDate >= startDate && relevantDate <= endDate;
    });

    // Group by bookmaker
    const byBookmaker: Record<string, { 
      received: number; 
      converted: number; 
      bonus: typeof bonuses[0];
      currency: string;
    }> = {};
    
    relevantBonuses.forEach(b => {
      if (!byBookmaker[b.bookmaker_id]) {
        byBookmaker[b.bookmaker_id] = { 
          received: 0, 
          converted: 0, 
          bonus: b,
          currency: b.currency || 'BRL'
        };
      }
      
      // Count as received if credited or finalized
      if (b.status === 'credited' || b.status === 'finalized') {
        byBookmaker[b.bookmaker_id].received++;
      }
      
      // Count as converted if finalized with rollover_completed
      if (b.status === 'finalized' && b.finalize_reason === 'rollover_completed') {
        byBookmaker[b.bookmaker_id].converted++;
      }
    });

    // Convert to array
    const stats: ConversaoStats[] = Object.entries(byBookmaker)
      .filter(([_, data]) => data.received > 0)
      .map(([id, data]) => ({
        bookmaker_id: id,
        bookmaker_nome: data.bonus.bookmaker_nome || 'Casa',
        bookmaker_login: data.bonus.bookmaker_login || '',
        logo_url: data.bonus.bookmaker_logo_url || null,
        received: data.received,
        converted: data.converted,
        rate: data.received > 0 ? (data.converted / data.received) * 100 : 0,
        currency: data.currency,
      }));

    // Sort by rate (desc), then by converted count (desc)
    stats.sort((a, b) => {
      if (b.rate !== a.rate) {
        return b.rate - a.rate;
      }
      return b.converted - a.converted;
    });

    return stats;
  }, [bonuses, dateRange]);

  if (ranking.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <RefreshCw className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>Nenhum dado de conversão no período</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[320px]">
      <div className="space-y-2">
        {ranking.map((bk, index) => (
          <div key={bk.bookmaker_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
              {index + 1}
            </div>
            {bk.logo_url ? (
              <img src={bk.logo_url} alt={bk.bookmaker_nome} className="h-8 w-8 rounded-lg object-contain logo-blend p-0.5" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{bk.bookmaker_nome}</p>
              <p className="text-xs text-muted-foreground truncate">{bk.bookmaker_login}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{bk.converted}</span>/{bk.received}
              </div>
              <Badge 
                variant="secondary" 
                className={`text-xs min-w-[50px] justify-center ${
                  bk.rate >= 70 ? 'bg-emerald-500/20 text-emerald-500' :
                  bk.rate >= 40 ? 'bg-yellow-500/20 text-yellow-500' :
                  'bg-red-500/20 text-red-500'
                }`}
              >
                {bk.rate.toFixed(0)}%
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
