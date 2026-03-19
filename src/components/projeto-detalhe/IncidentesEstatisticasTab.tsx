import { useMemo, useState } from 'react';
import { useOcorrencias } from '@/hooks/useOcorrencias';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useFinanceiroConsolidado } from '@/hooks/useFinanceiroConsolidado';
import { useProjetoCurrency } from '@/hooks/useProjetoCurrency';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TIPO_LABELS, PRIORIDADE_LABELS, STATUS_LABELS } from '@/types/ocorrencias';
import { CURRENCY_SYMBOLS, type SupportedCurrency } from '@/types/currency';
import type { Ocorrencia, OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { getFirstLastName } from '@/lib/utils';
import {
  Clock,
  TrendingDown,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Timer,
  Building2,
  Users,
  DollarSign,
  ShieldAlert,
  Target,
  Zap,
  ArrowRight,
  CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  projetoId?: string;
  formatCurrency?: (value: number) => string;
}

const defaultFormat = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function parseDataLocal(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0);
  }
  return new Date(dateStr);
}

function diffHours(from: string, to: string): number {
  return (parseDataLocal(to).getTime() - parseDataLocal(from).getTime()) / (1000 * 60 * 60);
}

function formatDuration(hours: number): string {
  if (hours < 0) return '—';
  if (hours < 24) return '< 1 dia';
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

function formatDateShort(dateStr: string): string {
  try {
    return format(parseDataLocal(dateStr), 'dd/MM/yy', { locale: ptBR });
  } catch {
    return dateStr.slice(0, 10);
  }
}

// ====== Types for per-casa stats ======
interface CasaIncidenteDetail {
  id: string;
  titulo: string;
  status: string;
  prioridade: string;
  dataInicio: string;
  dataFim: string | null;
  horasResolucao: number | null;
  valorPerda: number;
  moeda: string;
}

interface CasaStats {
  bookmaker_id: string;
  nome: string;
  logo_url: string | null;
  count: number;
  abertas: number;
  resolvidas: number;
  perdaBRL: number;
  tempoMedioHoras: number | null;
  incidentes: CasaIncidenteDetail[];
}

export function IncidentesEstatisticasTab({ projetoId, formatCurrency }: Props) {
  const { converterParaBRL, formatBRL } = useFinanceiroConsolidado();
  const { convertToConsolidation, formatCurrency: formatProjectCurrency, moedaConsolidacao } = useProjetoCurrency(projetoId);
  
  // In project context: use project consolidation currency
  // In workspace context: show per-currency breakdown
  const isProjectContext = !!projetoId;
  const fmt = formatCurrency || (isProjectContext ? formatProjectCurrency : defaultFormat);
  const convertValue = isProjectContext
    ? (valor: number, moeda: string) => convertToConsolidation(valor, moeda)
    : (valor: number, moeda: string) => converterParaBRL(valor, moeda).valorBRL;
  const formatConsolidated = isProjectContext ? formatProjectCurrency : formatBRL;
  
  const filters = projetoId ? { projetoId } : undefined;
  const { data: ocorrencias = [], isLoading } = useOcorrencias(filters);
  const { data: members = [] } = useWorkspaceMembers();

  const [statsSubTab, setStatsSubTab] = useState<'geral' | 'por-casa'>('geral');
  const [selectedCasa, setSelectedCasa] = useState<CasaStats | null>(null);

  // Collect unique bookmaker IDs
  const bookmakerIds = useMemo(() => {
    const ids = new Set<string>();
    ocorrencias.forEach((o) => {
      if (o.bookmaker_id) ids.add(o.bookmaker_id);
    });
    return Array.from(ids);
  }, [ocorrencias]);

  // Fetch bookmaker names + logos
  const { data: bookmakerInfo = {} } = useQuery({
    queryKey: ['bookmaker-info-incidentes', bookmakerIds],
    queryFn: async () => {
      if (bookmakerIds.length === 0) return {};
      const { data } = await supabase
        .from('bookmakers')
        .select('id, nome, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)')
        .in('id', bookmakerIds);
      const map: Record<string, { nome: string; logo_url: string | null }> = {};
      data?.forEach((b: any) => {
        map[b.id] = {
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
        };
      });
      return map;
    },
    enabled: bookmakerIds.length > 0,
  });

  const getInicio = (o: Ocorrencia) => (o as any).data_ocorrencia || o.created_at;

  // ====== Per-casa detailed stats ======
  const casaStats = useMemo((): CasaStats[] => {
    if (!ocorrencias.length) return [];
    const map: Record<string, CasaStats> = {};

    ocorrencias.forEach((o) => {
      if (!o.bookmaker_id) return;
      const bid = o.bookmaker_id;
      if (!map[bid]) {
        map[bid] = {
          bookmaker_id: bid,
          nome: bookmakerInfo[bid]?.nome || bid.slice(0, 8),
          logo_url: bookmakerInfo[bid]?.logo_url || null,
          count: 0, abertas: 0, resolvidas: 0,
          perdaBRL: 0,
          tempoMedioHoras: null,
          incidentes: [],
        };
      }
      const c = map[bid];
      c.count += 1;

      const moeda = (o as any).moeda || 'BRL';
      const isAberta = !['resolvido', 'cancelado'].includes(o.status);
      const isResolvida = o.status === 'resolvido';

      if (isAberta) {
        c.abertas += 1;
      }
      if (isResolvida) {
        c.resolvidas += 1;
        const perda = Number((o as any).valor_perda || 0);
        if (perda > 0) c.perdaBRL += convertValue(perda, moeda);
      }

      const inicio = getInicio(o);
      const fim = o.resolved_at || null;
      const horas = fim ? diffHours(inicio, fim) : null;

      c.incidentes.push({
        id: o.id,
        titulo: o.titulo,
        status: o.status,
        prioridade: o.prioridade,
        dataInicio: inicio,
        dataFim: fim,
        horasResolucao: horas,
        valorPerda: Number((o as any).valor_perda || 0),
        moeda,
      });
    });

    // Compute tempo médio per casa
    Object.values(map).forEach((c) => {
      const resolved = c.incidentes.filter((i) => i.horasResolucao !== null);
      if (resolved.length > 0) {
        c.tempoMedioHoras = resolved.reduce((s, i) => s + i.horasResolucao!, 0) / resolved.length;
      }
    });

    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [ocorrencias, bookmakerInfo, convertValue]);

  // ====== General stats ======
  const stats = useMemo(() => {
    if (!ocorrencias.length) return null;
    const total = ocorrencias.length;
    const resolvidas = ocorrencias.filter((o) => o.status === 'resolvido');
    const abertas = ocorrencias.filter((o) => !['resolvido', 'cancelado'].includes(o.status));

    const taxaResolucao = total > 0 ? (resolvidas.length / total) * 100 : 0;

    const temposResolucao = resolvidas
      .filter((o) => o.resolved_at)
      .map((o) => diffHours(getInicio(o), o.resolved_at!));
    const tempoMedio = temposResolucao.length > 0
      ? temposResolucao.reduce((a, b) => a + b, 0) / temposResolucao.length : 0;

    const maisAntigas = [...abertas]
      .sort((a, b) => new Date(getInicio(a)).getTime() - new Date(getInicio(b)).getTime())
      .slice(0, 5)
      .map((o) => ({
        id: o.id, titulo: o.titulo,
        horasAbertas: diffHours(getInicio(o), new Date().toISOString()),
        prioridade: o.prioridade,
      }));

    const porTipo: Record<string, number> = {};
    ocorrencias.forEach((o) => { porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1; });
    const topTipos = Object.entries(porTipo)
      .sort(([, a], [, b]) => b - a)
      .map(([tipo, count]) => ({ tipo: tipo as OcorrenciaTipo, count, pct: (count / total) * 100 }));

    const porPrioridade: Record<string, number> = {};
    ocorrencias.forEach((o) => { porPrioridade[o.prioridade] = (porPrioridade[o.prioridade] || 0) + 1; });

    const porExecutor: Record<string, { count: number; resolvidas: number }> = {};
    ocorrencias.forEach((o) => {
      // Use all executors from contexto_metadata when available (multi-executor)
      const meta = (o as any).contexto_metadata;
      const executorIds: string[] = (meta && Array.isArray(meta.executor_ids) && meta.executor_ids.length > 0)
        ? meta.executor_ids
        : [o.executor_id];

      executorIds.forEach((uid: string) => {
        if (!porExecutor[uid]) porExecutor[uid] = { count: 0, resolvidas: 0 };
        porExecutor[uid].count += 1;
        if (o.status === 'resolvido') porExecutor[uid].resolvidas += 1;
      });
    });

    const riscoPorMoeda: Record<string, number> = {};
    let valorRiscoAbertoBRL = 0;
    abertas.forEach((o) => {
      const valor = Number((o as any).valor_risco || 0);
      const moeda = (o as any).moeda || 'BRL';
      if (valor > 0) {
        riscoPorMoeda[moeda] = (riscoPorMoeda[moeda] || 0) + valor;
        valorRiscoAbertoBRL += convertValue(valor, moeda);
      }
    });

    const perdaPorMoeda: Record<string, number> = {};
    let valorPerdaConfirmadaBRL = 0;
    resolvidas.forEach((o) => {
      const valor = Number((o as any).valor_perda || 0);
      const moeda = (o as any).moeda || 'BRL';
      if (valor > 0) {
        perdaPorMoeda[moeda] = (perdaPorMoeda[moeda] || 0) + valor;
        valorPerdaConfirmadaBRL += convertValue(valor, moeda);
      }
    });

    const resolvidasSemImpacto = resolvidas.filter((o) => (o as any).resultado_financeiro === 'sem_impacto').length;
    const resolvidasComPerda = resolvidas.filter((o) =>
      ['perda_confirmada', 'perda_parcial'].includes((o as any).resultado_financeiro || '')
    ).length;

    return {
      total, abertas: abertas.length, resolvidas: resolvidas.length,
      taxaResolucao, tempoMedio, maisAntigas, topTipos,
      porPrioridade, porExecutor,
      valorRiscoAbertoBRL, valorPerdaConfirmadaBRL,
      riscoPorMoeda, perdaPorMoeda,
      resolvidasSemImpacto, resolvidasComPerda,
    };
  }, [ocorrencias, converterParaBRL]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <BarChart3 className="h-12 w-12 opacity-30" />
        <p className="text-sm">{projetoId ? 'Nenhuma ocorrência registrada neste projeto.' : 'Nenhuma ocorrência registrada.'}</p>
      </div>
    );
  }

  const prioridadeOrder: OcorrenciaPrioridade[] = ['urgente', 'alta', 'media', 'baixa'];
  const prioridadeColors: Record<string, string> = {
    urgente: 'bg-red-500', alta: 'bg-orange-500', media: 'bg-blue-500', baixa: 'bg-muted-foreground',
  };
  const statusColors: Record<string, string> = {
    aberto: 'text-yellow-400', em_andamento: 'text-blue-400', resolvido: 'text-emerald-400', cancelado: 'text-muted-foreground',
  };

  return (
    <div className="space-y-4 p-4 overflow-y-auto">
      {/* KPIs principais - always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi icon={<Target className="h-4 w-4" />} label="Total" value={String(stats.total)} sub={`${stats.abertas} abertas`} />
        <MiniKpi icon={<CheckCircle className="h-4 w-4 text-emerald-400" />} label="Taxa Resolução" value={`${stats.taxaResolucao.toFixed(0)}%`} sub={`${stats.resolvidas} resolvidas`} />
        <MiniKpi icon={<Timer className="h-4 w-4 text-blue-400" />} label="Tempo Médio" value={formatDuration(stats.tempoMedio)} sub="para resolução" />
        <MiniKpi icon={<DollarSign className="h-4 w-4 text-red-400" />} label="Perda Total" value={formatBRL(stats.valorPerdaConfirmadaBRL)} sub={`${stats.resolvidasComPerda} com perda`} />
      </div>

      {/* Sub-tabs */}
      <Tabs value={statsSubTab} onValueChange={(v) => setStatsSubTab(v as any)}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="por-casa" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Por Casa
          </TabsTrigger>
        </TabsList>

        {/* ====== TAB GERAL ====== */}
        <TabsContent value="geral" className="space-y-6 mt-4">
          {/* Distribuição por prioridade + Tipos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  Distribuição por Prioridade
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {prioridadeOrder.map((p) => {
                  const count = stats.porPrioridade[p] || 0;
                  const pct = (count / stats.total) * 100;
                  return (
                    <div key={p} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{PRIORIDADE_LABELS[p]}</span>
                        <span className="font-medium">{count} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', prioridadeColors[p])} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  Tipos Mais Frequentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {stats.topTipos.map(({ tipo, count, pct }) => (
                  <div key={tipo} className="flex items-center justify-between">
                    <span className="text-sm truncate max-w-[200px]">{TIPO_LABELS[tipo] || tipo}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{count}</Badge>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Impacto financeiro + Executores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  Impacto Financeiro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor em disputa (abertas)</span>
                  <span className="font-medium text-yellow-400">{formatBRL(stats.valorRiscoAbertoBRL)}</span>
                </div>
                {Object.keys(stats.riscoPorMoeda).length > 1 && (
                  <div className="pl-2 space-y-0.5">
                    {Object.entries(stats.riscoPorMoeda).map(([moeda, valor]) => (
                      <div key={moeda} className="flex justify-between text-xs text-muted-foreground">
                        <span>{moeda}</span>
                        <span>{CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda} {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Perdas confirmadas</span>
                  <span className="font-medium text-red-400">{formatBRL(stats.valorPerdaConfirmadaBRL)}</span>
                </div>
                {Object.keys(stats.perdaPorMoeda).length > 1 && (
                  <div className="pl-2 space-y-0.5">
                    {Object.entries(stats.perdaPorMoeda).map(([moeda, valor]) => (
                      <div key={moeda} className="flex justify-between text-xs text-muted-foreground">
                        <span>{moeda}</span>
                        <span>{CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda} {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-border/50 pt-2 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Resolvidas sem impacto</span>
                    <span className="text-emerald-400">{stats.resolvidasSemImpacto}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Resolvidas com perda</span>
                    <span className="text-red-400">{stats.resolvidasComPerda}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Carga por Executor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {Object.entries(stats.porExecutor)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .slice(0, 8)
                  .map(([uid, data]) => {
                    const member = members.find((m) => m.user_id === uid);
                    const name = member ? getFirstLastName(member.full_name || member.email || '') : uid.slice(0, 8);
                    const taxaExec = data.count > 0 ? (data.resolvidas / data.count) * 100 : 0;
                    return (
                      <div key={uid} className="flex items-center justify-between">
                        <span className="text-sm truncate max-w-[180px]">{name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{data.count}</Badge>
                          <span className="text-xs text-muted-foreground w-10 text-right">{taxaExec.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(stats.porExecutor).length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem dados</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ocorrências abertas há mais tempo */}
          {stats.maisAntigas.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  Ocorrências Abertas Há Mais Tempo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.maisAntigas.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn('h-2 w-2 rounded-full shrink-0', prioridadeColors[o.prioridade])} />
                      <span className="text-sm truncate">{o.titulo}</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 text-yellow-400 border-yellow-400/30">
                      {formatDuration(o.horasAbertas)}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ====== TAB POR CASA ====== */}
        <TabsContent value="por-casa" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Incidências por Casa
              </CardTitle>
            </CardHeader>
            <CardContent>
              {casaStats.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma casa vinculada a incidências</p>
              ) : (
                <div className="space-y-0">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_70px_70px_90px_100px] gap-2 pb-2 border-b border-border/50 text-xs text-muted-foreground">
                    <span>Casa</span>
                    <span className="text-center">Total</span>
                    <span className="text-center">Abertas</span>
                    <span className="text-center">Tempo ø</span>
                    <span className="text-right">Perda</span>
                  </div>
                  {/* Rows */}
                  {casaStats.map((c) => (
                    <div
                      key={c.bookmaker_id}
                      className="grid grid-cols-[1fr_70px_70px_90px_100px] gap-2 py-2.5 border-b border-border/30 last:border-b-0 items-center"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt={c.nome} className="h-5 w-5 rounded object-contain shrink-0" />
                        ) : (
                          <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-sm truncate font-medium">{c.nome}</span>
                      </div>
                      <div className="flex justify-center">
                        <button
                          onClick={() => setSelectedCasa(c)}
                          className="cursor-pointer hover:scale-110 transition-transform"
                          title="Ver detalhes das incidências"
                        >
                          <Badge variant="secondary" className="text-xs hover:bg-primary/20 cursor-pointer">
                            {c.count}
                          </Badge>
                        </button>
                      </div>
                      <div className="flex justify-center">
                        {c.abertas > 0 ? (
                          <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">{c.abertas}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </div>
                      <span className="text-xs text-center font-medium text-muted-foreground">
                        {c.tempoMedioHoras !== null ? formatDuration(c.tempoMedioHoras) : '—'}
                      </span>
                      <span className={cn("text-xs text-right font-medium", c.perdaBRL > 0 ? "text-red-400" : "text-muted-foreground")}>
                        {c.perdaBRL > 0 ? formatBRL(c.perdaBRL) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ====== MODAL: Detalhes de Incidências de uma Casa ====== */}
      <Dialog open={!!selectedCasa} onOpenChange={(open) => { if (!open) setSelectedCasa(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCasa?.logo_url ? (
                <img src={selectedCasa.logo_url} alt={selectedCasa.nome} className="h-6 w-6 rounded object-contain" />
              ) : (
                <Building2 className="h-5 w-5 text-muted-foreground" />
              )}
              {selectedCasa?.nome}
              <Badge variant="secondary" className="ml-2">{selectedCasa?.count} incidências</Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedCasa && (
            <div className="space-y-4">
              {/* KPIs do modal */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg border border-border/50 p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Abertas</p>
                  <p className="text-lg font-semibold text-yellow-400">{selectedCasa.abertas}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Resolvidas</p>
                  <p className="text-lg font-semibold text-emerald-400">{selectedCasa.resolvidas}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Tempo ø</p>
                  <p className="text-lg font-semibold">{selectedCasa.tempoMedioHoras !== null ? formatDuration(selectedCasa.tempoMedioHoras) : '—'}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Perda Total</p>
                  <p className={cn("text-lg font-semibold", selectedCasa.perdaBRL > 0 ? "text-red-400" : "text-muted-foreground")}>
                    {selectedCasa.perdaBRL > 0 ? formatBRL(selectedCasa.perdaBRL) : '—'}
                  </p>
                </div>
              </div>

              {/* Lista de incidentes */}
              <div className="space-y-0 rounded-lg border border-border/50 overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_90px_70px_80px_90px] gap-2 px-3 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
                  <span>Título</span>
                  <span className="text-center">Período</span>
                  <span className="text-center">Status</span>
                  <span className="text-center">Tempo</span>
                  <span className="text-right">Perda</span>
                </div>
                {selectedCasa.incidentes
                  .sort((a, b) => new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime())
                  .map((inc) => (
                    <div
                      key={inc.id}
                      className="grid grid-cols-[1fr_90px_70px_80px_90px] gap-2 px-3 py-2.5 border-t border-border/30 items-center"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn('h-2 w-2 rounded-full shrink-0', prioridadeColors[inc.prioridade])} />
                        <span className="text-sm truncate">{inc.titulo}</span>
                      </div>
                      <div className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                        <span>{formatDateShort(inc.dataInicio)}</span>
                        {inc.dataFim && (
                          <>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                            <span>{formatDateShort(inc.dataFim)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex justify-center">
                        <span className={cn("text-xs font-medium", statusColors[inc.status] || 'text-muted-foreground')}>
                          {STATUS_LABELS[inc.status as keyof typeof STATUS_LABELS] || inc.status}
                        </span>
                      </div>
                      <span className="text-xs text-center font-medium">
                        {inc.horasResolucao !== null ? formatDuration(inc.horasResolucao) : (
                          <span className="text-yellow-400">Em aberto</span>
                        )}
                      </span>
                      <span className={cn(
                        "text-xs text-right font-medium",
                        inc.valorPerda > 0 ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {inc.valorPerda > 0
                          ? `${CURRENCY_SYMBOLS[inc.moeda as SupportedCurrency] || inc.moeda} ${inc.valorPerda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === Mini KPI Card ===
function MiniKpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3.5">
        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
