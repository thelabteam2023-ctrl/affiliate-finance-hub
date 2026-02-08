import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, Plus, BarChart3, List } from "lucide-react";
import { useLimitationEvents } from "@/hooks/useLimitationEvents";
import { LimitationStatsCards } from "./LimitationStatsCards";
import { LimitationRankingTable } from "./LimitationRankingTable";
import { LimitationEventsTimeline } from "./LimitationEventsTimeline";
import { RegistrarLimitacaoDialog } from "./RegistrarLimitacaoDialog";

interface LimitationSectionProps {
  projetoId: string;
}

export function LimitationSection({ projetoId }: LimitationSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { events, stats, isLoading, createEvent, deleteEvent } = useLimitationEvents(projetoId);

  const handleCreate = (input: Parameters<typeof createEvent.mutate>[0]) => {
    createEvent.mutate(input, {
      onSuccess: () => setDialogOpen(false),
    });
  };

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Estatísticas de Limitação</h3>
            <p className="text-sm text-muted-foreground">
              Inteligência estratégica sobre comportamento de casas
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Registrar Limitação
        </Button>
      </div>

      {/* KPI Cards */}
      <LimitationStatsCards events={events} stats={stats} />

      {/* Tabs: Ranking / Timeline */}
      <Card className="border-border/50">
        <Tabs defaultValue="ranking">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Análise por Casa</CardTitle>
              <TabsList className="h-8">
                <TabsTrigger value="ranking" className="text-xs gap-1 px-3">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Ranking
                </TabsTrigger>
                <TabsTrigger value="timeline" className="text-xs gap-1 px-3">
                  <List className="h-3.5 w-3.5" />
                  Eventos ({events.length})
                </TabsTrigger>
              </TabsList>
            </div>
            <CardDescription>
              Classificação estratégica e histórico de limitações
            </CardDescription>
          </CardHeader>
          <CardContent>
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

      {/* Dialog */}
      <RegistrarLimitacaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        onSubmit={handleCreate}
        isSubmitting={createEvent.isPending}
      />
    </div>
  );
}
