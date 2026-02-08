import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, BarChart3, List, Globe } from "lucide-react";
import { useLimitationEvents } from "@/hooks/useLimitationEvents";
import { LimitationStatsCards } from "./LimitationStatsCards";
import { LimitationRankingTable } from "./LimitationRankingTable";
import { LimitationGlobalRankingTable } from "./LimitationGlobalRankingTable";
import { LimitationEventsTimeline } from "./LimitationEventsTimeline";

interface LimitationSectionProps {
  projetoId: string;
}

export function LimitationSection({ projetoId }: LimitationSectionProps) {
  const { events, stats, globalStats, isLoading, deleteEvent } = useLimitationEvents(projetoId);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Carregando dados de limitação...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Estatísticas de Limitação</h3>
          <p className="text-sm text-muted-foreground">
            Inteligência estratégica — dados capturados automaticamente ao limitar contas
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <LimitationStatsCards events={events} stats={stats} />

      {/* Tabs: Ranking Projeto / Ranking Global / Timeline */}
      <Card className="border-border/50">
        <Tabs defaultValue="global">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Análise por Casa</CardTitle>
              <TabsList className="h-8">
                <TabsTrigger value="global" className="text-xs gap-1 px-3">
                  <Globe className="h-3.5 w-3.5" />
                  Global ({globalStats.length})
                </TabsTrigger>
                <TabsTrigger value="ranking" className="text-xs gap-1 px-3">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Projeto ({stats.length})
                </TabsTrigger>
                <TabsTrigger value="timeline" className="text-xs gap-1 px-3">
                  <List className="h-3.5 w-3.5" />
                  Eventos ({events.length})
                </TabsTrigger>
              </TabsList>
            </div>
            <CardDescription>
              Classificação estratégica longitudinal e histórico de limitações
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TabsContent value="global" className="mt-0">
              <LimitationGlobalRankingTable stats={globalStats} />
            </TabsContent>
            <TabsContent value="ranking" className="mt-0">
              <LimitationRankingTable stats={stats} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-0">
              <LimitationEventsTimeline
                events={events}
                onDelete={(id) => deleteEvent.mutate(id)}
              />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
