import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NovaOcorrenciaDialog } from './NovaOcorrenciaDialog';
import { OcorrenciasList } from './OcorrenciasList';
import { useOcorrenciasKpis, useOcorrencias } from '@/hooks/useOcorrencias';
import {
  Plus,
  AlertTriangle,
  Clock,
  Zap,
  Users,
  Inbox,
  CheckCircle2,
  Filter,
  LayoutGrid,
  List,
} from 'lucide-react';
import { TIPO_LABELS } from '@/types/ocorrencias';
import type { OcorrenciaTipo, OcorrenciaStatus } from '@/types/ocorrencias';

type ViewMode = 'list' | 'board';
type FilterTab = 'todas' | 'minhas' | 'historico';

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

  const kpiCards = [
    {
      label: 'Pendentes',
      value: (kpis?.abertas_total ?? 0) - (kpis?.urgentes ?? 0),
      icon: <Clock className="h-5 w-5 text-yellow-400" />,
      color: 'text-yellow-400',
    },
    {
      label: 'Urgentes',
      value: kpis?.urgentes ?? 0,
      icon: <Zap className="h-5 w-5 text-red-400" />,
      color: 'text-red-400',
    },
    {
      label: 'Aguardando Terceiro',
      value: kpis?.aguardando_terceiro ?? 0,
      icon: <Users className="h-5 w-5 text-purple-400" />,
      color: 'text-purple-400',
    },
    {
      label: 'SLA Vencido',
      value: kpis?.atrasadas_sla ?? 0,
      icon: <AlertTriangle className="h-5 w-5 text-orange-400" />,
      color: 'text-orange-400',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            Ocorrências Operacionais
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitore e resolva incidentes em tempo real
          </p>
        </div>
        <Button onClick={() => setNovaOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Ocorrência
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loadingKpis
          ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)
          : kpiCards.map((card) => (
              <Card key={card.label} className={card.value > 0 ? '' : 'opacity-60'}>
                <CardContent className="p-3 flex items-center gap-3">
                  {card.icon}
                  <div>
                    <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Type breakdown chips */}
      {Object.keys(tipoBreakdown).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Por tipo:</span>
          <Badge
            variant={tipoFilter === null ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setTipoFilter(null)}
          >
            Todos ({activeOcorrencias.length})
          </Badge>
          {Object.entries(tipoBreakdown).map(([tipo, count]) => (
            <Badge
              key={tipo}
              variant={tipoFilter === tipo ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => setTipoFilter(tipoFilter === tipo ? null : (tipo as OcorrenciaTipo))}
            >
              {TIPO_LABELS[tipo as OcorrenciaTipo]} ({count})
            </Badge>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {([
          { key: 'todas', label: 'Fila', icon: <Inbox className="h-3.5 w-3.5" /> },
          { key: 'minhas', label: 'Minhas', icon: <Users className="h-3.5 w-3.5" /> },
          { key: 'historico', label: 'Histórico', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              filterTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <OcorrenciasList
        statusFilter={statusFilter}
        modoMinhas={filterTab === 'minhas'}
        tipoFilter={tipoFilter}
        emptyMessage={
          filterTab === 'historico'
            ? 'Nenhuma ocorrência resolvida ou cancelada.'
            : filterTab === 'minhas'
            ? 'Você não possui ocorrências ativas.'
            : 'Nenhuma ocorrência em aberto. Tudo em dia! 🎉'
        }
      />

      <NovaOcorrenciaDialog open={novaOpen} onOpenChange={setNovaOpen} />
    </div>
  );
}
