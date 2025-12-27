import { useState } from 'react';
import { useInfluenceMetrics, PeriodType, InfluenceConfig } from '@/hooks/useInfluenceMetrics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart3, Trophy, Calendar, Settings2, RefreshCw, Play, 
  MessageSquare, FileText, Star, MessagesSquare, TrendingUp, Users, Activity
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function InfluenceMetricsTab() {
  const {
    selectedPeriodType,
    setSelectedPeriodType,
    useAvailablePeriods,
    useRankings,
    useConfig,
    updateConfig,
    useRecentEvents,
    useDailyMetrics,
    useStatsSummary,
    triggerAggregation,
    triggerRanking,
  } = useInfluenceMetrics();

  const [selectedPeriodStart, setSelectedPeriodStart] = useState<string | undefined>();
  const [isAggregating, setIsAggregating] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [configForm, setConfigForm] = useState<InfluenceConfig | null>(null);

  const { data: periods, isLoading: periodsLoading } = useAvailablePeriods(selectedPeriodType);
  const { data: rankings, isLoading: rankingsLoading } = useRankings(selectedPeriodType, selectedPeriodStart);
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: recentEvents, isLoading: eventsLoading } = useRecentEvents(20);
  const { data: dailyMetrics, isLoading: dailyLoading } = useDailyMetrics(7);
  const { data: stats, isLoading: statsLoading } = useStatsSummary();

  const handleAggregation = async () => {
    setIsAggregating(true);
    try {
      await triggerAggregation();
    } finally {
      setIsAggregating(false);
    }
  };

  const handleRankingCalculation = async () => {
    setIsCalculating(true);
    try {
      await triggerRanking();
    } finally {
      setIsCalculating(false);
    }
  };

  const handleConfigSave = () => {
    if (configForm) {
      updateConfig.mutate(configForm);
    }
  };

  const formatPeriodLabel = (start: string, end: string, type: PeriodType) => {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    
    if (type === 'weekly') {
      return `${format(startDate, 'dd/MM', { locale: ptBR })} - ${format(endDate, 'dd/MM/yyyy', { locale: ptBR })}`;
    }
    if (type === 'monthly') {
      return format(startDate, 'MMMM yyyy', { locale: ptBR });
    }
    return format(startDate, 'yyyy', { locale: ptBR });
  };

  const getRankBadge = (position: number) => {
    if (position === 1) return <span className="text-xl">🥇</span>;
    if (position === 2) return <span className="text-xl">🥈</span>;
    if (position === 3) return <span className="text-xl">🥉</span>;
    return <span className="text-muted-foreground font-mono">{position}</span>;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'topic_created': return <FileText className="h-3.5 w-3.5 text-blue-400" />;
      case 'topic_comment': return <MessageSquare className="h-3.5 w-3.5 text-green-400" />;
      case 'chat_message': return <MessagesSquare className="h-3.5 w-3.5 text-purple-400" />;
      case 'house_review': return <Star className="h-3.5 w-3.5 text-amber-400" />;
      default: return <Activity className="h-3.5 w-3.5" />;
    }
  };

  const getEventLabel = (type: string) => {
    switch (type) {
      case 'topic_created': return 'Tópico criado';
      case 'topic_comment': return 'Comentário';
      case 'chat_message': return 'Mensagem chat';
      case 'house_review': return 'Avaliação casa';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eventos Totais</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalEvents.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.uniqueActiveUsers}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dias Agregados</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalDailyRecords}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rankings Gerados</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalRankings}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ações Manuais</CardTitle>
          <CardDescription>Execute jobs manualmente para testes ou recuperação</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button 
            variant="outline" 
            onClick={handleAggregation} 
            disabled={isAggregating}
            className="gap-2"
          >
            {isAggregating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Executar Agregação Diária
          </Button>
          <Button 
            variant="outline" 
            onClick={handleRankingCalculation} 
            disabled={isCalculating}
            className="gap-2"
          >
            {isCalculating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trophy className="h-4 w-4" />
            )}
            Calcular Rankings
          </Button>
        </CardContent>
      </Card>

      {/* Sub-tabs */}
      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="ranking" className="gap-1.5 text-xs">
            <Trophy className="h-3.5 w-3.5" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="atividade" className="gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5" />
            Atividade
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            Configuração
          </TabsTrigger>
        </TabsList>

        {/* Rankings Tab */}
        <TabsContent value="ranking" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Ranking de Influência</CardTitle>
                  <CardDescription>Visualize rankings por período</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select 
                    value={selectedPeriodType} 
                    onValueChange={(v) => {
                      setSelectedPeriodType(v as PeriodType);
                      setSelectedPeriodStart(undefined);
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select 
                    value={selectedPeriodStart || ''} 
                    onValueChange={(v) => setSelectedPeriodStart(v || undefined)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Período mais recente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Mais recente</SelectItem>
                      {periods?.map((p) => (
                        <SelectItem key={p.period_start} value={p.period_start}>
                          {formatPeriodLabel(p.period_start, p.period_end, selectedPeriodType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {rankingsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : rankings && rankings.length > 0 ? (
                <>
                  <div className="mb-4 text-sm text-muted-foreground">
                    Período: {formatPeriodLabel(rankings[0].period_start, rankings[0].period_end, selectedPeriodType)}
                    <span className="ml-2 text-xs">
                      (calculado em {format(parseISO(rankings[0].calculated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })})
                    </span>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">#</TableHead>
                          <TableHead>Usuário</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead className="text-center" title="Tópicos">
                            <FileText className="h-4 w-4 inline" />
                          </TableHead>
                          <TableHead className="text-center" title="Comentários">
                            <MessageSquare className="h-4 w-4 inline" />
                          </TableHead>
                          <TableHead className="text-center" title="Mensagens">
                            <MessagesSquare className="h-4 w-4 inline" />
                          </TableHead>
                          <TableHead className="text-center" title="Avaliações">
                            <Star className="h-4 w-4 inline" />
                          </TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rankings.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{getRankBadge(r.rank_position)}</TableCell>
                            <TableCell>
                              <div className="font-mono text-xs text-muted-foreground">
                                {r.user_id.slice(0, 8)}...
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary" className="font-mono">
                                {r.influence_score}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">{r.topics_created}</TableCell>
                            <TableCell className="text-center">{r.comments_made}</TableCell>
                            <TableCell className="text-center">{r.chat_messages}</TableCell>
                            <TableCell className="text-center">{r.reviews_made}</TableCell>
                            <TableCell className="text-right font-medium">
                              {r.total_interactions}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum ranking disponível para este período</p>
                  <p className="text-sm mt-1">Execute o cálculo de rankings para gerar dados</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="atividade" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Events */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Eventos Recentes</CardTitle>
                <CardDescription>Últimas interações capturadas</CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : recentEvents && recentEvents.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-auto">
                    {recentEvents.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                        {getEventIcon(e.event_type)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {getEventLabel(e.event_type)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(parseISO(e.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum evento registrado
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Daily Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Métricas Diárias</CardTitle>
                <CardDescription>Últimos 7 dias agregados</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : dailyMetrics && dailyMetrics.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead className="text-right">Interações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyMetrics.slice(0, 7).map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>
                              {format(parseISO(d.metric_date), 'dd/MM/yyyy', { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {d.total_interactions}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma métrica agregada ainda
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Configuração de Pesos</CardTitle>
              <CardDescription>
                Ajuste os pesos para cálculo do score de influência
              </CardDescription>
            </CardHeader>
            <CardContent>
              {configLoading ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : config ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-400" />
                        Peso: Tópico Criado
                      </Label>
                      <Input
                        type="number"
                        value={configForm?.weight_topic ?? config.weight_topic}
                        onChange={(e) => setConfigForm(prev => ({
                          ...(prev || config),
                          weight_topic: Number(e.target.value)
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-green-400" />
                        Peso: Comentário
                      </Label>
                      <Input
                        type="number"
                        value={configForm?.weight_comment ?? config.weight_comment}
                        onChange={(e) => setConfigForm(prev => ({
                          ...(prev || config),
                          weight_comment: Number(e.target.value)
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MessagesSquare className="h-4 w-4 text-purple-400" />
                        Peso: Mensagem Chat
                      </Label>
                      <Input
                        type="number"
                        value={configForm?.weight_chat ?? config.weight_chat}
                        onChange={(e) => setConfigForm(prev => ({
                          ...(prev || config),
                          weight_chat: Number(e.target.value)
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-400" />
                        Peso: Avaliação de Casa
                      </Label>
                      <Input
                        type="number"
                        value={configForm?.weight_review ?? config.weight_review}
                        onChange={(e) => setConfigForm(prev => ({
                          ...(prev || config),
                          weight_review: Number(e.target.value)
                        }))}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg">
                    <h4 className="font-medium mb-2">Fórmula do Score</h4>
                    <code className="text-sm text-muted-foreground">
                      Score = (Tópicos × {configForm?.weight_topic ?? config.weight_topic}) + 
                      (Comentários × {configForm?.weight_comment ?? config.weight_comment}) + 
                      (Mensagens × {configForm?.weight_chat ?? config.weight_chat}) + 
                      (Avaliações × {configForm?.weight_review ?? config.weight_review})
                    </code>
                  </div>

                  <Button 
                    onClick={handleConfigSave}
                    disabled={updateConfig.isPending || !configForm}
                  >
                    {updateConfig.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Salvar Configuração
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
