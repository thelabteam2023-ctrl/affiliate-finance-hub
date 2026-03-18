import { useMemo } from 'react';
import { useOcorrencias } from '@/hooks/useOcorrencias';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useFinanceiroConsolidado } from '@/hooks/useFinanceiroConsolidado';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TIPO_LABELS, PRIORIDADE_LABELS } from '@/types/ocorrencias';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  if (hours < 24) return '< 1 dia';
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

export function IncidentesEstatisticasTab({ projetoId, formatCurrency }: Props) {
  const fmt = formatCurrency || defaultFormat;
  const filters = projetoId ? { projetoId } : undefined;
  const { data: ocorrencias = [], isLoading } = useOcorrencias(filters);
  const { data: members = [] } = useWorkspaceMembers();
  const { converterParaBRL, formatBRL } = useFinanceiroConsolidado();

  // Collect unique bookmaker IDs to resolve names
  const bookmakerIds = useMemo(() => {
    const ids = new Set<string>();
    ocorrencias.forEach((o) => {
      if (o.bookmaker_id) ids.add(o.bookmaker_id);
    });
    return Array.from(ids);
  }, [ocorrencias]);

  // Fetch bookmaker names
  const { data: bookmakerNames = {} } = useQuery({
    queryKey: ['bookmaker-names-incidentes', bookmakerIds],
    queryFn: async () => {
      if (bookmakerIds.length === 0) return {};
      const { data } = await supabase
        .from('bookmakers')
        .select('id, nome')
        .in('id', bookmakerIds);
      const map: Record<string, string> = {};
      data?.forEach((b: any) => { map[b.id] = b.nome; });
      return map;
    },
    enabled: bookmakerIds.length > 0,
  });

  const stats = useMemo(() => {
    if (!ocorrencias.length) return null;

    const total = ocorrencias.length;
    const resolvidas = ocorrencias.filter((o) => o.status === 'resolvido');
    const abertas = ocorrencias.filter((o) => !['resolvido', 'cancelado'].includes(o.status));
    const canceladas = ocorrencias.filter((o) => o.status === 'cancelado');

    const taxaResolucao = total > 0 ? (resolvidas.length / total) * 100 : 0;

    const getInicio = (o: Ocorrencia) => (o as any).data_ocorrencia || o.created_at;

    const temposResolucao = resolvidas
      .filter((o) => o.resolved_at)
      .map((o) => diffHours(getInicio(o), o.resolved_at!));
    const tempoMedio = temposResolucao.length > 0
      ? temposResolucao.reduce((a, b) => a + b, 0) / temposResolucao.length
      : 0;

    // === OCORRÊNCIAS MAIS ANTIGAS ABERTAS ===
    const maisAntigas = [...abertas]
      .sort((a, b) => new Date(getInicio(a)).getTime() - new Date(getInicio(b)).getTime())
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        titulo: o.titulo,
        horasAbertas: diffHours(getInicio(o), new Date().toISOString()),
        prioridade: o.prioridade,
      }));

    // === CASAS COM MAIS INCIDÊNCIAS (com financeiro) ===
    const porCasa: Record<string, { count: number; nome: string; riscoBRL: number; perdaBRL: number; abertas: number; resolvidas: number }> = {};
    ocorrencias.forEach((o) => {
      if (o.bookmaker_id) {
        const nome = bookmakerNames[o.bookmaker_id] || o.bookmaker_id.slice(0, 8);
        if (!porCasa[o.bookmaker_id]) porCasa[o.bookmaker_id] = { count: 0, nome, riscoBRL: 0, perdaBRL: 0, abertas: 0, resolvidas: 0 };
        porCasa[o.bookmaker_id].count += 1;

        const moeda = (o as any).moeda || 'BRL';
        const isAberta = !['resolvido', 'cancelado'].includes(o.status);
        const isResolvida = o.status === 'resolvido';

        if (isAberta) {
          porCasa[o.bookmaker_id].abertas += 1;
          const risco = Number((o as any).valor_risco || 0);
          if (risco > 0) {
            porCasa[o.bookmaker_id].riscoBRL += converterParaBRL(risco, moeda).valorBRL;
          }
        }
        if (isResolvida) {
          porCasa[o.bookmaker_id].resolvidas += 1;
          const perda = Number((o as any).valor_perda || 0);
          if (perda > 0) {
            porCasa[o.bookmaker_id].perdaBRL += converterParaBRL(perda, moeda).valorBRL;
          }
        }
      }
    });
    const topCasas = Object.values(porCasa)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // === TIPOS MAIS FREQUENTES ===
    const porTipo: Record<string, number> = {};
    ocorrencias.forEach((o) => {
      porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1;
    });
    const topTipos = Object.entries(porTipo)
      .sort(([, a], [, b]) => b - a)
      .map(([tipo, count]) => ({ tipo: tipo as OcorrenciaTipo, count, pct: (count / total) * 100 }));

    // === PRIORIDADE DISTRIBUIÇÃO ===
    const porPrioridade: Record<string, number> = {};
    ocorrencias.forEach((o) => {
      porPrioridade[o.prioridade] = (porPrioridade[o.prioridade] || 0) + 1;
    });

    // === POR EXECUTOR ===
    const porExecutor: Record<string, { count: number; resolvidas: number }> = {};
    ocorrencias.forEach((o) => {
      if (!porExecutor[o.executor_id]) porExecutor[o.executor_id] = { count: 0, resolvidas: 0 };
      porExecutor[o.executor_id].count += 1;
      if (o.status === 'resolvido') porExecutor[o.executor_id].resolvidas += 1;
    });

    // === IMPACTO FINANCEIRO (MULTI-MOEDA) ===
    const riscoPorMoeda: Record<string, number> = {};
    let valorRiscoAbertoBRL = 0;
    abertas.forEach((o) => {
      const valor = Number((o as any).valor_risco || 0);
      const moeda = (o as any).moeda || 'BRL';
      if (valor > 0) {
        riscoPorMoeda[moeda] = (riscoPorMoeda[moeda] || 0) + valor;
        valorRiscoAbertoBRL += converterParaBRL(valor, moeda).valorBRL;
      }
    });

    const perdaPorMoeda: Record<string, number> = {};
    let valorPerdaConfirmadaBRL = 0;
    resolvidas.forEach((o) => {
      const valor = Number((o as any).valor_perda || 0);
      const moeda = (o as any).moeda || 'BRL';
      if (valor > 0) {
        perdaPorMoeda[moeda] = (perdaPorMoeda[moeda] || 0) + valor;
        valorPerdaConfirmadaBRL += converterParaBRL(valor, moeda).valorBRL;
      }
    });

    const resolvidasSemImpacto = resolvidas.filter((o) => (o as any).resultado_financeiro === 'sem_impacto').length;
    const resolvidasComPerda = resolvidas.filter((o) =>
      ['perda_confirmada', 'perda_parcial'].includes((o as any).resultado_financeiro || '')
    ).length;

    return {
      total,
      abertas: abertas.length,
      resolvidas: resolvidas.length,
      canceladas: canceladas.length,
      taxaResolucao,
      tempoMedio,
      maisAntigas,
      topCasas,
      topTipos,
      porPrioridade,
      porExecutor,
      valorRiscoAbertoBRL,
      valorPerdaConfirmadaBRL,
      riscoPorMoeda,
      perdaPorMoeda,
      resolvidasSemImpacto,
      resolvidasComPerda,
    };
  }, [ocorrencias, converterParaBRL, bookmakerNames]);

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
    urgente: 'bg-red-500',
    alta: 'bg-orange-500',
    media: 'bg-blue-500',
    baixa: 'bg-muted-foreground',
  };

  return (
    <div className="space-y-6 p-4 overflow-y-auto">
      {/* ROW 1: KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi
          icon={<Target className="h-4 w-4" />}
          label="Total"
          value={String(stats.total)}
          sub={`${stats.abertas} abertas`}
        />
        <MiniKpi
          icon={<CheckCircle className="h-4 w-4 text-emerald-400" />}
          label="Taxa Resolução"
          value={`${stats.taxaResolucao.toFixed(0)}%`}
          sub={`${stats.resolvidas} resolvidas`}
        />
        <MiniKpi
          icon={<Timer className="h-4 w-4 text-blue-400" />}
          label="Tempo Médio"
          value={formatDuration(stats.tempoMedio)}
          sub="para resolução"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <MiniKpi
                  icon={<DollarSign className="h-4 w-4 text-yellow-400" />}
                  label="Risco Aberto"
                  value={formatBRL(stats.valorRiscoAbertoBRL)}
                  sub={`${formatBRL(stats.valorPerdaConfirmadaBRL)} perdido`}
                />
              </div>
            </TooltipTrigger>
            {Object.keys(stats.riscoPorMoeda).length > 0 && (
              <TooltipContent side="bottom" className="text-xs space-y-1">
                <p className="font-medium mb-1">Risco por moeda (PTAX):</p>
                {Object.entries(stats.riscoPorMoeda).map(([moeda, valor]) => (
                  <p key={moeda}>
                    {CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda}{' '}
                    {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                ))}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ROW 2: Distribuição por prioridade + Tipos mais frequentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Distribuição por prioridade */}
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
                    <div
                      className={cn('h-full rounded-full transition-all', prioridadeColors[p])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Tipos */}
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

      {/* ROW 3: Incidências por Casa (com financeiro) — full width */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Incidências por Casa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topCasas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma casa vinculada</p>
          ) : (
            <div className="space-y-0">
              {/* Header */}
              <div className="grid grid-cols-[1fr_60px_80px_100px_100px] gap-2 pb-2 border-b border-border/50 text-xs text-muted-foreground">
                <span>Casa</span>
                <span className="text-center">Total</span>
                <span className="text-center">Abertas</span>
                <span className="text-right">Risco</span>
                <span className="text-right">Perda</span>
              </div>
              {/* Rows */}
              {stats.topCasas.map((c, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_60px_80px_100px_100px] gap-2 py-2 border-b border-border/30 last:border-b-0 items-center"
                >
                  <span className="text-sm truncate font-medium">{c.nome}</span>
                  <div className="flex justify-center">
                    <Badge variant="secondary" className="text-xs">{c.count}</Badge>
                  </div>
                  <div className="flex justify-center">
                    {c.abertas > 0 ? (
                      <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">{c.abertas}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">0</span>
                    )}
                  </div>
                  <span className={cn(
                    "text-xs text-right font-medium",
                    c.riscoBRL > 0 ? "text-yellow-400" : "text-muted-foreground"
                  )}>
                    {c.riscoBRL > 0 ? formatBRL(c.riscoBRL) : '—'}
                  </span>
                  <span className={cn(
                    "text-xs text-right font-medium",
                    c.perdaBRL > 0 ? "text-red-400" : "text-muted-foreground"
                  )}>
                    {c.perdaBRL > 0 ? formatBRL(c.perdaBRL) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ROW 4: Impacto financeiro + Executores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Impacto financeiro */}
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

        {/* Executores */}
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

      {/* ROW 5: Ocorrências abertas há mais tempo */}
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
    </div>
  );
}

// === Mini KPI Card ===
function MiniKpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
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
