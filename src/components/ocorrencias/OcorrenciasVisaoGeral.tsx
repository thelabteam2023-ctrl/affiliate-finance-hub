import { useOcorrenciasKpis } from '@/hooks/useOcorrencias';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Clock,
  Inbox,
  Zap,
  Users,
  TrendingUp,
} from 'lucide-react';

interface Props {
  onFiltrarFila?: (filtro: string) => void;
}

export function OcorrenciasVisaoGeral({ onFiltrarFila }: Props) {
  const { data: kpis, isLoading } = useOcorrenciasKpis();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  const cards = [
    {
      title: 'Abertas Hoje',
      value: kpis?.abertas_hoje ?? 0,
      icon: <Inbox className="h-5 w-5 text-blue-400" />,
      desc: 'Novas ocorrências no dia',
      color: 'text-blue-400',
      filtro: 'aberto',
    },
    {
      title: 'Urgentes',
      value: kpis?.urgentes ?? 0,
      icon: <Zap className="h-5 w-5 text-red-400" />,
      desc: 'Prioridade máxima',
      color: 'text-red-400',
      filtro: 'urgente',
    },
    {
      title: 'Aguardando Terceiros',
      value: kpis?.aguardando_terceiro ?? 0,
      icon: <Users className="h-5 w-5 text-purple-400" />,
      desc: 'Dependem de ação externa',
      color: 'text-purple-400',
      filtro: 'aguardando_terceiro',
    },
    {
      title: 'Atrasadas (SLA)',
      value: kpis?.atrasadas_sla ?? 0,
      icon: <AlertTriangle className="h-5 w-5 text-orange-400" />,
      desc: 'SLA vencido sem resolução',
      color: 'text-orange-400',
      filtro: 'sla_violado',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card
            key={card.title}
            className={`cursor-pointer hover:border-primary/30 transition-colors ${
              card.value > 0 ? 'border-border' : 'opacity-70'
            }`}
            onClick={() => card.value > 0 && onFiltrarFila?.(card.filtro)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">{card.title}</p>
                {card.icon}
              </div>
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Resumo total */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Total em Aberto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <p className="text-4xl font-bold">{kpis?.abertas_total ?? 0}</p>
            <p className="text-sm text-muted-foreground">
              ocorrências aguardando resolução no workspace
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
