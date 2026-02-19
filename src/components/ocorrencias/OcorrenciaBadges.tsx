import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OcorrenciaPrioridade, OcorrenciaStatus, OcorrenciaTipo } from '@/types/ocorrencias';
import {
  PRIORIDADE_LABELS,
  STATUS_LABELS,
  TIPO_LABELS,
  PRIORIDADE_COLORS,
  STATUS_COLORS,
} from '@/types/ocorrencias';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  Circle,
  Zap,
  TrendingUp,
  Activity,
} from 'lucide-react';

export function PrioridadeBadge({ prioridade }: { prioridade: OcorrenciaPrioridade }) {
  const icons: Record<OcorrenciaPrioridade, React.ReactNode> = {
    baixa: <Circle className="h-3 w-3" />,
    media: <Activity className="h-3 w-3" />,
    alta: <TrendingUp className="h-3 w-3" />,
    urgente: <Zap className="h-3 w-3" />,
  };

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 text-xs font-medium', PRIORIDADE_COLORS[prioridade])}
    >
      {icons[prioridade]}
      {PRIORIDADE_LABELS[prioridade]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: OcorrenciaStatus }) {
  const icons: Record<OcorrenciaStatus, React.ReactNode> = {
    aberto: <Circle className="h-3 w-3" />,
    em_andamento: <Clock className="h-3 w-3" />,
    aguardando_terceiro: <Pause className="h-3 w-3" />,
    resolvido: <CheckCircle2 className="h-3 w-3" />,
    cancelado: <XCircle className="h-3 w-3" />,
  };

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 text-xs font-medium', STATUS_COLORS[status])}
    >
      {icons[status]}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function TipoBadge({ tipo }: { tipo: OcorrenciaTipo }) {
  return (
    <Badge variant="secondary" className="text-xs">
      {TIPO_LABELS[tipo]}
    </Badge>
  );
}

export function SlaBadge({ violado, alertaEm }: { violado: boolean; alertaEm?: string | null }) {
  if (!alertaEm) return null;

  const agora = new Date();
  const alerta = new Date(alertaEm);
  const horasRestantes = (alerta.getTime() - agora.getTime()) / (1000 * 60 * 60);

  if (violado || horasRestantes < 0) {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-red-400 border-red-400/50">
        <AlertTriangle className="h-3 w-3" />
        SLA Vencido
      </Badge>
    );
  }

  if (horasRestantes < 4) {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-orange-400 border-orange-400/50">
        <Clock className="h-3 w-3" />
        {Math.ceil(horasRestantes)}h restante
      </Badge>
    );
  }

  return null;
}
