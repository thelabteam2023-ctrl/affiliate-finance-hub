import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OcorrenciaPrioridade, OcorrenciaStatus, OcorrenciaTipo } from '@/types/ocorrencias';
import {
  PRIORIDADE_LABELS,
  STATUS_LABELS,
  TIPO_LABELS,
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
import { TIPO_COLORS } from './ocorrencia-tokens';

export function PrioridadeBadge({ prioridade }: { prioridade: OcorrenciaPrioridade }) {
  const icons: Record<OcorrenciaPrioridade, React.ReactNode> = {
    baixa: <Circle className="h-3 w-3" />,
    media: <Activity className="h-3 w-3" />,
    alta: <TrendingUp className="h-3 w-3" />,
    urgente: <Zap className="h-3 w-3" />,
  };

  const colors: Record<OcorrenciaPrioridade, string> = {
    baixa: 'text-slate-500 bg-slate-500/10 border-slate-500/20',
    media: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    alta: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    urgente: 'text-red-500 bg-red-500/10 border-red-500/20',
  };

  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 text-[10px] uppercase font-bold tracking-tight px-2 py-0.5 border-none', colors[prioridade])}
    >
      <div className={cn("h-1.5 w-1.5 rounded-full bg-current")} />
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
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {icons[status]}
      <span className="capitalize">{STATUS_LABELS[status].toLowerCase()}</span>
    </div>
  );
}

export function TipoBadge({ tipo }: { tipo: OcorrenciaTipo }) {
  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "text-[10px] uppercase font-black tracking-widest border-none px-2 py-0.5 h-5",
        TIPO_COLORS[tipo] || "bg-muted/50 text-muted-foreground"
      )}
    >
      {TIPO_LABELS[tipo]}
    </Badge>
  );
}


export function SlaBadge({ violado, alertaEm }: { violado: boolean; alertaEm?: string | null }) {
  return null;
}


