import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, AlertTriangle, XCircle, Ban, Clock, Lock } from "lucide-react";
import { parseISO, subDays } from "date-fns";
import { AnalyticsTabProps, ProblemaStats, formatCurrency } from "./types";

const PROBLEM_REASONS = [
  'cancelled_reversed',
  'bonus_consumed', 
  'account_blocked',
  'limit_reached',
  'confiscated'
];

const PROBLEM_NOTES_KEYWORDS = [
  'limitado',
  'bloqueado', 
  'confiscado',
  'cancelado',
  'rollback',
  'reversão'
];

function getProblemIcon(type: string) {
  switch (type) {
    case 'expired': return <Clock className="h-3 w-3" />;
    case 'cancelled_reversed': return <XCircle className="h-3 w-3" />;
    case 'account_blocked': return <Lock className="h-3 w-3" />;
    case 'limit_reached': return <Ban className="h-3 w-3" />;
    default: return <AlertTriangle className="h-3 w-3" />;
  }
}

function getProblemLabel(type: string): string {
  switch (type) {
    case 'expired': return 'Expirado';
    case 'failed': return 'Falha';
    case 'reversed': return 'Revertido';
    case 'cancelled_reversed': return 'Cancelado';
    case 'bonus_consumed': return 'Consumido';
    case 'account_blocked': return 'Bloqueado';
    case 'limit_reached': return 'Limitado';
    case 'confiscated': return 'Confiscado';
    default: return type;
  }
}

export function ProblemasTab({ bonuses, dateRange }: AnalyticsTabProps) {
  const ranking = useMemo((): ProblemaStats[] => {
    const startDate = dateRange?.start || subDays(new Date(), 30);
    const endDate = dateRange?.end || new Date();
    
    // Filter bonuses with problems within period
    const problemBonuses = bonuses.filter(b => {
      // Check date
      const relevantDate = b.finalized_at ? parseISO(b.finalized_at) : 
                          b.credited_at ? parseISO(b.credited_at) : null;
      if (!relevantDate) return false;
      if (relevantDate < startDate || relevantDate > endDate) return false;

      // Check if it's a problem
      if (b.status === 'failed' || b.status === 'expired' || b.status === 'reversed') return true;
      if (b.status === 'finalized' && PROBLEM_REASONS.includes(b.finalize_reason || '')) return true;
      
      // Check notes for problem keywords
      const notes = (b.notes || '').toLowerCase();
      return PROBLEM_NOTES_KEYWORDS.some(kw => notes.includes(kw));
    });

    // Group by bookmaker
    const byBookmaker: Record<string, { 
      count: number; 
      value: number; 
      types: Set<string>;
      bonus: typeof bonuses[0];
    }> = {};
    
    problemBonuses.forEach(b => {
      if (!byBookmaker[b.bookmaker_id]) {
        byBookmaker[b.bookmaker_id] = { 
          count: 0, 
          value: 0, 
          types: new Set(),
          bonus: b 
        };
      }
      byBookmaker[b.bookmaker_id].count++;
      byBookmaker[b.bookmaker_id].value += b.bonus_amount;
      
      // Track problem type
      if (b.status === 'failed') byBookmaker[b.bookmaker_id].types.add('failed');
      if (b.status === 'expired') byBookmaker[b.bookmaker_id].types.add('expired');
      if (b.status === 'reversed') byBookmaker[b.bookmaker_id].types.add('reversed');
      if (b.finalize_reason) byBookmaker[b.bookmaker_id].types.add(b.finalize_reason);
    });

    // Convert to array
    const stats: ProblemaStats[] = Object.entries(byBookmaker).map(([id, data]) => ({
      bookmaker_id: id,
      bookmaker_nome: data.bonus.bookmaker_nome || 'Casa',
      bookmaker_login: data.bonus.bookmaker_login || '',
      logo_url: data.bonus.bookmaker_logo_url || null,
      problem_count: data.count,
      value_lost: data.value,
      problem_types: Array.from(data.types),
      currency: data.bonus.currency || 'BRL',
    }));

    // Sort by problem count (desc), then by value lost (desc)
    stats.sort((a, b) => {
      if (b.problem_count !== a.problem_count) {
        return b.problem_count - a.problem_count;
      }
      return b.value_lost - a.value_lost;
    });

    return stats;
  }, [bonuses, dateRange]);

  if (ranking.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>Nenhum problema registrado no período</p>
        <p className="text-xs mt-1">Boas notícias! 🎉</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[320px]">
      <div className="space-y-2">
        {ranking.map((bk, index) => (
          <div key={bk.bookmaker_id} className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-destructive/20 flex items-center justify-center text-destructive font-bold text-xs">
              {index + 1}
            </div>
            {bk.logo_url ? (
              <img src={bk.logo_url} alt={bk.bookmaker_nome} className="h-8 w-8 rounded-lg object-contain logo-blend p-0.5" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-destructive" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{bk.bookmaker_nome}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {bk.problem_types.slice(0, 3).map(type => (
                  <Badge key={type} variant="outline" className="text-[10px] px-1 py-0 h-4 border-destructive/30 text-destructive">
                    {getProblemIcon(type)}
                    <span className="ml-1">{getProblemLabel(type)}</span>
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="destructive" className="text-xs">
                {bk.problem_count} problema{bk.problem_count > 1 ? 's' : ''}
              </Badge>
              <span className="text-xs text-destructive font-medium">
                -{formatCurrency(bk.value_lost, bk.currency)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
