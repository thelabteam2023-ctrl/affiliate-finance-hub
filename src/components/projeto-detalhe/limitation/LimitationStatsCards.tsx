import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert, BarChart3, Timer, Zap } from "lucide-react";
import type { LimitationEvent, LimitationStats } from "@/hooks/useLimitationEvents";

interface LimitationStatsCardsProps {
  events: LimitationEvent[];
  stats: LimitationStats[];
}

export function LimitationStatsCards({ events, stats }: LimitationStatsCardsProps) {
  const totalEvents = events.length;
  const uniqueBookmakers = new Set(events.map((e) => e.bookmaker_id)).size;
  const avgBets =
    totalEvents > 0
      ? events.reduce((sum, e) => sum + e.total_bets_before_limitation, 0) / totalEvents
      : 0;

  const earlyCount = events.filter((e) => e.limitation_bucket === "early").length;
  const earlyPct = totalEvents > 0 ? (earlyCount / totalEvents) * 100 : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Total de Eventos</span>
          </div>
          <p className="text-2xl font-bold">{totalEvents}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            em {uniqueBookmakers} casa{uniqueBookmakers !== 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="h-4 w-4 text-yellow-500" />
            <span className="text-xs text-muted-foreground">Média de Apostas</span>
          </div>
          <p className="text-2xl font-bold">{avgBets.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">antes da limitação</p>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-red-400" />
            <span className="text-xs text-muted-foreground">Early Limiters</span>
          </div>
          <p className="text-2xl font-bold">{earlyPct.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {earlyCount} de {totalEvents} eventos
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Casas Analisadas</span>
          </div>
          <p className="text-2xl font-bold">{stats.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">com dados de limitação</p>
        </CardContent>
      </Card>
    </div>
  );
}
