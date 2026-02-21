import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Shield, TrendingUp, TrendingDown } from "lucide-react";
import { parseISO, subDays } from "date-fns";
import { AnalyticsTabProps, ConfiabilidadeStats, formatCurrency, getClassificationBadge } from "./types";

const PROBLEM_REASONS = [
  'cancelled_reversed',
  'bonus_consumed', 
  'account_blocked',
  'limit_reached',
  'confiscated'
];

function calculateClassification(icc: number, raroi: number): ConfiabilidadeStats['classification'] {
  if (icc > 80 && raroi > 50) return 'excellent';
  if (icc > 60 && raroi > 20) return 'good';
  if (icc > 40 || raroi > 0) return 'average';
  return 'toxic';
}

export function ConfiabilidadeTab({ bonuses, dateRange }: AnalyticsTabProps) {
  const ranking = useMemo((): ConfiabilidadeStats[] => {
    const startDate = dateRange?.start || subDays(new Date(), 30);
    const endDate = dateRange?.end || new Date();
    
    // Filter bonuses within period
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
      problems: number;
      extracted: number;
      invested: number;
      lost: number;
      bonus: typeof bonuses[0];
    }> = {};
    
    relevantBonuses.forEach(b => {
      if (!byBookmaker[b.bookmaker_id]) {
        byBookmaker[b.bookmaker_id] = { 
          received: 0, 
          converted: 0, 
          problems: 0,
          extracted: 0,
          invested: 0,
          lost: 0,
          bonus: b 
        };
      }
      
      const data = byBookmaker[b.bookmaker_id];
      
      // Count received (credited or finalized)
      if (b.status === 'credited' || b.status === 'finalized') {
        data.received++;
        data.invested += b.deposit_amount || 0;
      }
      
      // Count converted and extracted
      if (b.status === 'finalized' && b.finalize_reason === 'rollover_completed') {
        data.converted++;
        data.extracted += b.bonus_amount;
      }
      
      // Count problems
      const isProblem = b.status === 'failed' || b.status === 'expired' || b.status === 'reversed' ||
                       (b.status === 'finalized' && PROBLEM_REASONS.includes(b.finalize_reason || ''));
      if (isProblem) {
        data.problems++;
        data.lost += b.bonus_amount;
      }
    });

    // Convert to array and calculate metrics
    const stats: ConfiabilidadeStats[] = Object.entries(byBookmaker)
      .filter(([_, data]) => data.received > 0)
      .map(([id, data]) => {
        // ICC = (converted - problems) / received * 100
        const icc = data.received > 0 
          ? ((data.converted - data.problems) / data.received) * 100 
          : 0;
        
        // RAROI = (extracted - lost) / invested * 100
        const raroi = data.invested > 0 
          ? ((data.extracted - data.lost) / data.invested) * 100 
          : 0;
        
        const classification = calculateClassification(icc, raroi);
        
        return {
          bookmaker_id: id,
          bookmaker_nome: data.bonus.bookmaker_nome || 'Casa',
          bookmaker_login: data.bonus.bookmaker_login || '',
          logo_url: data.bonus.bookmaker_logo_url || null,
          icc: Math.max(-100, Math.min(100, icc)), // Clamp between -100 and 100
          raroi: Math.round(raroi * 100) / 100,
          classification,
          total_received: data.received,
          total_converted: data.converted,
          total_problems: data.problems,
          total_extracted: data.extracted,
          total_invested: data.invested,
          value_lost: data.lost,
          currency: data.bonus.currency || 'BRL',
        };
      });

    // Sort by classification (excellent first), then by ICC
    const classOrder = { excellent: 0, good: 1, average: 2, toxic: 3 };
    stats.sort((a, b) => {
      if (classOrder[a.classification] !== classOrder[b.classification]) {
        return classOrder[a.classification] - classOrder[b.classification];
      }
      return b.icc - a.icc;
    });

    return stats;
  }, [bonuses, dateRange]);

  if (ranking.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>Sem dados suficientes para análise</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[320px]">
      <div className="space-y-2">
        {ranking.map((bk) => {
          const badge = getClassificationBadge(bk.classification);
          
          return (
            <div key={bk.bookmaker_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              {bk.logo_url ? (
                <img src={bk.logo_url} alt={bk.bookmaker_nome} className="h-8 w-8 rounded-lg object-contain logo-blend p-0.5" />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{bk.bookmaker_nome}</p>
                  <Badge variant={badge.variant} className={`text-[10px] px-1.5 py-0 h-4 ${badge.className}`}>
                    {badge.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{bk.bookmaker_login}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-muted-foreground" />
                    <span className={`font-bold ${bk.icc >= 60 ? 'text-emerald-500' : bk.icc >= 30 ? 'text-yellow-500' : 'text-red-500'}`}>
                      {bk.icc.toFixed(0)}%
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[10px]">ICC</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    {bk.raroi >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span className={`font-bold ${bk.raroi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {bk.raroi.toFixed(0)}%
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[10px]">RAROI</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
