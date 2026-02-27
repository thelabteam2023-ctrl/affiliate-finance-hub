import { useState, useMemo } from 'react';
import { useOcorrencias, useAtualizarStatusOcorrencia } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useFinanceiroConsolidado } from '@/hooks/useFinanceiroConsolidado';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiSummaryBar } from '@/components/ui/kpi-summary-bar';
import { OcorrenciaCollapseCard } from '@/components/ocorrencias/OcorrenciaCollapseCard';
import { OcorrenciaDetalheDialog } from '@/components/ocorrencias/OcorrenciaDetalheDialog';
import { NovaOcorrenciaDialog } from '@/components/ocorrencias/NovaOcorrenciaDialog';
import type { OcorrenciaStatus, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { PRIORIDADE_LABELS, PRIORIDADE_COLORS, PRIORIDADE_BG } from '@/types/ocorrencias';
import { Plus, Inbox, Zap, AlertTriangle, ArrowUp, ArrowDown, ShieldAlert, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ProjetoOcorrenciasTabProps {
  projetoId: string;
  onDataChange?: () => void;
  formatCurrency?: (value: number) => string;
}

const defaultFormatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/** Fetch bookmaker names and logos for a set of IDs */
function useBookmakerInfo(ids: string[]) {
  return useQuery({
    queryKey: ['bookmaker-info', ids],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const { data } = await supabase
        .from('bookmakers')
        .select('id, nome, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)')
        .in('id', ids);
      const map: Record<string, { nome: string; logo_url: string | null }> = {};
      data?.forEach((b: any) => {
        map[b.id] = { nome: b.nome, logo_url: b.bookmakers_catalogo?.logo_url || null };
      });
      return map;
    },
    enabled: ids.length > 0,
  });
}

/** Fetch parceiro names */
function useParceiroNames(ids: string[]) {
  return useQuery({
    queryKey: ['parceiro-names', ids],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const { data } = await supabase.from('parceiros').select('id, nome').in('id', ids);
      const map: Record<string, string> = {};
      data?.forEach((p) => { map[p.id] = p.nome; });
      return map;
    },
    enabled: ids.length > 0,
  });
}

export function ProjetoOcorrenciasTab({ projetoId, onDataChange, formatCurrency: formatCurrencyProp }: ProjetoOcorrenciasTabProps) {
  const { converterParaBRL, formatBRL } = useFinanceiroConsolidado();
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const { user } = useAuth();
  const { isOwnerOrAdmin } = useRole();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'abertas' | 'historico'>('abertas');

  const { mutate: atualizarStatus } = useAtualizarStatusOcorrencia();

  // Ocorrências abertas do projeto
  const { data: abertas = [], isLoading: loadingAbertas } = useOcorrencias({
    projetoId,
    status: ['aberto', 'em_andamento', 'aguardando_terceiro'],
  });

  // Ocorrências encerradas do projeto
  const { data: historico = [], isLoading: loadingHistorico } = useOcorrencias({
    projetoId,
    status: ['resolvido', 'cancelado'],
  });

  const todas = [...abertas, ...historico];

  // KPIs - consolidação multi-moeda via PTAX
  const valorRiscoAberto = useMemo(() => {
    return abertas.reduce((acc, o) => {
      const valor = Number((o as any).valor_risco || 0);
      const moeda = (o as any).moeda || 'BRL';
      if (valor <= 0) return acc;
      return acc + converterParaBRL(valor, moeda).valorBRL;
    }, 0);
  }, [abertas, converterParaBRL]);

  const perdasConfirmadas = historico.filter((o) => (o as any).resultado_financeiro === 'perda_confirmada' || (o as any).resultado_financeiro === 'perda_parcial');
  const totalPerdasConfirmadas = useMemo(() => {
    return perdasConfirmadas.reduce((acc, o) => {
      const valor = Number((o as any).valor_perda || 0);
      const moeda = (o as any).moeda || 'BRL';
      if (valor <= 0) return acc;
      return acc + converterParaBRL(valor, moeda).valorBRL;
    }, 0);
  }, [perdasConfirmadas, converterParaBRL]);

  const resolvidasSemImpacto = historico.filter((o) => o.status === 'resolvido' && !(o as any).resultado_financeiro);

  // Entity names
  const bookmakerIds = useMemo(
    () => [...new Set(todas.filter((o) => o.bookmaker_id).map((o) => o.bookmaker_id!))],
    [todas]
  );
  const parceiroIds = useMemo(
    () => [...new Set(todas.filter((o) => o.parceiro_id).map((o) => o.parceiro_id!))],
    [todas]
  );
  const { data: bookmakerMap = {} } = useBookmakerInfo(bookmakerIds);
  const { data: parceiroMap = {} } = useParceiroNames(parceiroIds);

  // Kanban grouping
  const PRIORIDADE_ORDER: OcorrenciaPrioridade[] = ['urgente', 'alta', 'media', 'baixa'];
  const PRIORIDADE_ICONS: Record<OcorrenciaPrioridade, React.ReactNode> = {
    urgente: <Zap className="h-4 w-4" />,
    alta: <AlertTriangle className="h-4 w-4" />,
    media: <ArrowUp className="h-4 w-4" />,
    baixa: <ArrowDown className="h-4 w-4" />,
  };

  const listaAtual = subTab === 'abertas' ? abertas : historico;

  const groupedByPrioridade = useMemo(() => {
    const groups: Record<OcorrenciaPrioridade, typeof listaAtual> = {
      urgente: [], alta: [], media: [], baixa: [],
    };
    listaAtual.forEach((o) => { groups[o.prioridade].push(o); });
    return groups;
  }, [listaAtual]);

  const activePrioridades = PRIORIDADE_ORDER.filter((p) => groupedByPrioridade[p].length > 0);
  const isLoading = loadingAbertas || loadingHistorico;

  const renderCard = (ocorrencia: typeof listaAtual[0]) => (
    <OcorrenciaCollapseCard
      key={ocorrencia.id}
      ocorrencia={ocorrencia}
      currentUserId={user?.id}
      isAdmin={isOwnerOrAdmin}
      onVerDetalhe={() => setDetalheId(ocorrencia.id)}
      onAtualizarStatus={(novoStatus) =>
        atualizarStatus({
          id: ocorrencia.id,
          novoStatus,
          statusAnterior: ocorrencia.status,
        })
      }
      bookmakerNome={ocorrencia.bookmaker_id ? bookmakerMap[ocorrencia.bookmaker_id]?.nome : undefined}
      bookmakerLogoUrl={ocorrencia.bookmaker_id ? bookmakerMap[ocorrencia.bookmaker_id]?.logo_url : undefined}
      parceiroNome={ocorrencia.parceiro_id ? parceiroMap[ocorrencia.parceiro_id] : undefined}
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* KPIs */}
      <div className="flex items-center gap-3 flex-wrap">
        <KpiSummaryBar
          className="flex-1"
          items={[
            {
              label: 'Abertas',
              value: String(abertas.length),
              tooltip: (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Ocorrências Abertas</p>
                  <p className="text-muted-foreground">Incidentes em andamento neste projeto.</p>
                  <div className="flex justify-between gap-4 border-t border-border/50 pt-1">
                    <span>Valor em risco</span>
                    <span className="font-semibold text-foreground">{formatBRL(valorRiscoAberto)}</span>
                  </div>
                </div>
              ),
              valueClassName: abertas.length > 0 ? 'text-amber-500' : 'text-muted-foreground',
              subtitle: <span className="text-muted-foreground">{formatBRL(valorRiscoAberto)} em risco</span>,
            },
            {
              label: 'Perdas Confirmadas',
              value: formatBRL(totalPerdasConfirmadas),
              tooltip: (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Perdas Confirmadas</p>
                  <p className="text-muted-foreground">Impactam o resultado do projeto via ledger.</p>
                  <div className="flex justify-between gap-4 border-t border-border/50 pt-1">
                    <span>Registros</span>
                    <span className="font-semibold text-foreground">{perdasConfirmadas.length}</span>
                  </div>
                </div>
              ),
              valueClassName: totalPerdasConfirmadas > 0 ? 'text-red-500' : 'text-muted-foreground',
              subtitle: <span className="text-muted-foreground">{perdasConfirmadas.length} registro(s)</span>,
            },
            {
              label: 'Resolvidas',
              value: String(resolvidasSemImpacto.length),
              tooltip: (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Resolvidas sem Impacto</p>
                  <p className="text-muted-foreground">Ocorrências encerradas sem perda financeira.</p>
                </div>
              ),
              valueClassName: 'text-emerald-500',
              subtitle: <span className="text-muted-foreground">sem impacto financeiro</span>,
            },
          ]}
        />
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Nova Ocorrência
        </Button>
      </div>

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as 'abertas' | 'historico')}>
        <TabsList>
          <TabsTrigger value="abertas" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Pendentes
            {abertas.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{abertas.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Histórico
            {historico.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{historico.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abertas" className="mt-4">
          {abertas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhuma ocorrência pendente neste projeto.</p>
            </div>
          ) : (
            <div
              className={cn(
                'grid gap-4',
                activePrioridades.length === 1 && 'grid-cols-1',
                activePrioridades.length === 2 && 'grid-cols-1 md:grid-cols-2',
                activePrioridades.length === 3 && 'grid-cols-1 md:grid-cols-3',
                activePrioridades.length >= 4 && 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
              )}
            >
              {activePrioridades.map((prioridade) => (
                <div key={prioridade} className="flex flex-col gap-2">
                  <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border', PRIORIDADE_BG[prioridade], PRIORIDADE_COLORS[prioridade])}>
                    {PRIORIDADE_ICONS[prioridade]}
                    <span className="font-semibold text-sm">{PRIORIDADE_LABELS[prioridade]}</span>
                    <span className="ml-auto text-xs opacity-70 font-medium">{groupedByPrioridade[prioridade].length}</span>
                  </div>
                  <div className="space-y-2">
                    {groupedByPrioridade[prioridade].map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {historico.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhuma ocorrência encerrada neste projeto.</p>
            </div>
          ) : (
            <div
              className={cn(
                'grid gap-4',
                activePrioridades.length === 1 && 'grid-cols-1',
                activePrioridades.length === 2 && 'grid-cols-1 md:grid-cols-2',
                activePrioridades.length === 3 && 'grid-cols-1 md:grid-cols-3',
                activePrioridades.length >= 4 && 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
              )}
            >
              {activePrioridades.map((prioridade) => (
                <div key={prioridade} className="flex flex-col gap-2">
                  <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border', PRIORIDADE_BG[prioridade], PRIORIDADE_COLORS[prioridade])}>
                    {PRIORIDADE_ICONS[prioridade]}
                    <span className="font-semibold text-sm">{PRIORIDADE_LABELS[prioridade]}</span>
                    <span className="ml-auto text-xs opacity-70 font-medium">{groupedByPrioridade[prioridade].length}</span>
                  </div>
                  <div className="space-y-2">
                    {groupedByPrioridade[prioridade].map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <NovaOcorrenciaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contextoInicial={{ projeto_id: projetoId }}
      />

      {detalheId && (
        <OcorrenciaDetalheDialog
          ocorrenciaId={detalheId}
          open={!!detalheId}
          onOpenChange={(open) => !open && setDetalheId(null)}
        />
      )}
    </div>
  );
}
