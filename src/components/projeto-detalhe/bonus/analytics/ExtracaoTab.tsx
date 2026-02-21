import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Trophy } from "lucide-react";
import { parseISO, subDays } from "date-fns";
import { AnalyticsTabProps, ExtracaoStats, formatCurrency } from "./types";

export function ExtracaoTab({ bonuses, dateRange }: AnalyticsTabProps) {
  const ranking = useMemo((): ExtracaoStats[] => {
    const startDate = dateRange?.start || subDays(new Date(), 30);
    const endDate = dateRange?.end || new Date();
    
    // Filter bonuses that are finalized with rollover_completed within the period
    const extractedBonuses = bonuses.filter(b => {
      if (b.status !== 'finalized' || b.finalize_reason !== 'rollover_completed') return false;
      if (!b.finalized_at) return false;
      const finalizedDate = parseISO(b.finalized_at);
      return finalizedDate >= startDate && finalizedDate <= endDate;
    });

    // Group by bookmaker
    const byBookmaker: Record<string, { count: number; total: number; bonus: typeof bonuses[0] }> = {};
    
    extractedBonuses.forEach(b => {
      if (!byBookmaker[b.bookmaker_id]) {
        byBookmaker[b.bookmaker_id] = { count: 0, total: 0, bonus: b };
      }
      byBookmaker[b.bookmaker_id].count++;
      byBookmaker[b.bookmaker_id].total += b.bonus_amount;
    });

    // Convert to array and sort
    const stats: ExtracaoStats[] = Object.entries(byBookmaker).map(([id, data]) => ({
      bookmaker_id: id,
      bookmaker_nome: data.bonus.bookmaker_nome || 'Casa',
      bookmaker_login: data.bonus.bookmaker_login || '',
      logo_url: data.bonus.bookmaker_logo_url || null,
      count: data.count,
      total_extracted: data.total,
      currency: data.bonus.currency || 'BRL',
    }));

    // Sort by total extracted (desc), then by count (desc)
    stats.sort((a, b) => {
      if (b.total_extracted !== a.total_extracted) {
        return b.total_extracted - a.total_extracted;
      }
      return b.count - a.count;
    });

    return stats;
  }, [bonuses, dateRange]);

  if (ranking.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>Nenhum bônus extraído no período selecionado</p>
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
              <Badge variant="secondary" className="text-xs">
                {bk.count}x
              </Badge>
              <div className="text-right min-w-[80px]">
                <p className="font-bold text-primary text-sm">{formatCurrency(bk.total_extracted, bk.currency)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
