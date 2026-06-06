import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NovaOcorrenciaDialog } from './NovaOcorrenciaDialog';
import { OcorrenciasList } from './OcorrenciasList';
import { IncidentesEstatisticasTab } from '@/components/projeto-detalhe/IncidentesEstatisticasTab';
import { useOcorrenciasKpis, useOcorrencias } from '@/hooks/useOcorrencias';
import {
  Plus,
  AlertTriangle,
  Clock,
  Zap,
  Users,
  Inbox,
  CheckCircle2,
  BarChart3,
  DollarSign,
  ArrowRight,
  Timer,
} from 'lucide-react';
import { TIPO_LABELS } from '@/types/ocorrencias';
import type { OcorrenciaTipo, OcorrenciaStatus } from '@/types/ocorrencias';
import { getCurrencySymbol } from '@/types/currency';
import { cn } from '@/lib/utils';

type FilterTab = 'todas' | 'minhas' | 'historico' | 'estatisticas';

export function OcorrenciasModule() {
  const [novaOpen, setNovaOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('todas');
  const [tipoFilter, setTipoFilter] = useState<OcorrenciaTipo | null>(null);
  const { data: kpis, isLoading: loadingKpis } = useOcorrenciasKpis();

  // Status filter for active vs historical
  const statusFilter: OcorrenciaStatus[] | undefined =
    filterTab === 'historico'
      ? ['resolvido', 'cancelado']
      : ['aberto', 'em_andamento', 'aguardando_terceiro'];

  // Get active occurrences for type breakdown
  const { data: activeOcorrencias = [] } = useOcorrencias({
    status: ['aberto', 'em_andamento', 'aguardando_terceiro'],
  });

  // Breakdown by type
  const tipoBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    activeOcorrencias.forEach((o) => {
      map[o.tipo] = (map[o.tipo] || 0) + 1;
    });
    return map;
  }, [activeOcorrencias]);

  const riscoByMoeda = kpis?.riscoByMoeda ?? {};
  const hasRisco = Object.keys(riscoByMoeda).length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Ocorrências Operacionais
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Central de comando para gestão de incidentes e disputas.
          </p>
        </div>
        <Button onClick={() => setNovaOpen(true)} className="gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nova Ocorrência
        </Button>
      </div>

      {/* KPI Section - Reorganized */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card: Atenção Necessária */}
        <Card className="bg-muted/30 border-border/40 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Atenção Necessária</span>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-3xl font-bold text-foreground">{kpis?.urgentes ?? 0}</p>
                <p className="text-[10px] uppercase font-medium text-muted-foreground">Urgentes</p>
              </div>
              <div className="w-px h-10 bg-border/60 self-center" />
              <div>
                <p className="text-3xl font-bold text-red-500">{kpis?.atrasadas_sla ?? 0}</p>
                <p className="text-[10px] uppercase font-medium text-muted-foreground">SLA Vencido</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Em Andamento */}
        <Card className="bg-muted/30 border-border/40 overflow-hidden relative">
           <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
           <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Em Andamento</span>
              <Timer className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-3xl font-bold text-foreground">{(kpis?.abertas_total ?? 0) - (kpis?.urgentes ?? 0)}</p>
                <p className="text-[10px] uppercase font-medium text-muted-foreground">Pendentes</p>
              </div>
              <div className="w-px h-10 bg-border/60 self-center" />
              <div>
                <p className="text-3xl font-bold text-foreground">{kpis?.aguardando_terceiro ?? 0}</p>
                <p className="text-[10px] uppercase font-medium text-muted-foreground">Aguardando</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Valor em Disputa - Standalone & Prominent */}
        <Card className="bg-red-500/5 border-red-500/20 overflow-hidden relative group">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-red-500/80">Valor em Disputa</span>
              <DollarSign className="h-4 w-4 text-red-500" />
            </div>
            <div className="space-y-1">
              {hasRisco ? (
                Object.entries(riscoByMoeda).map(([moeda, valor]) => (
                  <div key={moeda} className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-foreground">{getCurrencySymbol(moeda)}</span>
                    <span className="text-2xl font-black text-foreground">
                      {Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-2xl font-black text-foreground">0,00</p>
              )}
            </div>
            <div className="mt-4 flex items-center gap-1 text-[10px] text-red-500 font-bold uppercase group-hover:gap-2 transition-all cursor-pointer">
               Ver detalhes financeiros <ArrowRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* Navigation & Secondary Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
          <div className="flex items-center gap-1">
            {([
              { key: 'todas', label: 'Todas', icon: <Inbox className="h-4 w-4" /> },
              { key: 'minhas', label: 'Minhas', icon: <Users className="h-4 w-4" /> },
              { key: 'historico', label: 'Histórico', icon: <CheckCircle2 className="h-4 w-4" /> },
              { key: 'estatisticas', label: 'Estatísticas', icon: <BarChart3 className="h-4 w-4" /> },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all rounded-md",
                  filterTab === tab.key
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Type breakdown chips */}
          {filterTab !== 'estatisticas' && Object.keys(tipoBreakdown).length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <Badge
                variant={tipoFilter === null ? 'default' : 'outline'}
                className={cn(
                  "cursor-pointer text-[10px] uppercase font-bold tracking-tight px-3 py-1 border-none",
                  tipoFilter === null ? "bg-primary" : "bg-muted/50 text-muted-foreground"
                )}
                onClick={() => setTipoFilter(null)}
              >
                Todos
              </Badge>
              {Object.entries(tipoBreakdown).map(([tipo, count]) => (
                <Badge
                  key={tipo}
                  variant={tipoFilter === tipo ? 'default' : 'outline'}
                  className={cn(
                    "cursor-pointer text-[10px] uppercase font-bold tracking-tight px-3 py-1 border-none",
                    tipoFilter === tipo ? "bg-primary" : "bg-muted/50 text-muted-foreground"
                  )}
                  onClick={() => setTipoFilter(tipoFilter === tipo ? null : (tipo as OcorrenciaTipo))}
                >
                  {TIPO_LABELS[tipo as OcorrenciaTipo]}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-h-[400px]">
          {filterTab === 'estatisticas' ? (
            <IncidentesEstatisticasTab />
          ) : (
            <OcorrenciasList
              statusFilter={statusFilter}
              modoMinhas={filterTab === 'minhas'}
              tipoFilter={tipoFilter}
              emptyMessage={
                filterTab === 'historico'
                  ? 'Nenhuma ocorrência finalizada encontrada.'
                  : filterTab === 'minhas'
                  ? 'Nenhuma ocorrência atribuída a você.'
                  : 'Zero ocorrências ativas. Bom trabalho! ✨'
              }
            />
          )}
        </div>
      </div>

      <NovaOcorrenciaDialog open={novaOpen} onOpenChange={setNovaOpen} />
    </div>
  );
}
