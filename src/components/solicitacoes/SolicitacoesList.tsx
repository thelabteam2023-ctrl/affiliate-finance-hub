import { formatDistanceToNow, format, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useSolicitacoes, useAtualizarStatusSolicitacao } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import {
  SOLICITACAO_TIPO_LABELS,
  SOLICITACAO_STATUS_LABELS,
  SOLICITACAO_STATUS_COLORS,
  SOLICITACAO_STATUS_FLOW,
} from '@/types/solicitacoes';
import type { Solicitacao, SolicitacaoStatus } from '@/types/solicitacoes';
import {
  ClipboardList,
  MoreHorizontal,
  Circle,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  CalendarClock,
} from 'lucide-react';

// ---- Prazo badge ----
function PrazoBadge({ prazo }: { prazo?: string | null }) {
  if (!prazo) return null;
  const date = new Date(prazo);
  const vencido = isPast(date);
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 text-xs',
        vencido
          ? 'text-red-400 border-red-400/50'
          : 'text-muted-foreground border-muted-foreground/50',
      )}
    >
      <CalendarClock className="h-3 w-3" />
      {vencido ? 'Vencido · ' : 'Prazo · '}
      {format(date, 'dd/MM/yyyy', { locale: ptBR })}
    </Badge>
  );
}

function StatusBadge({ status }: { status: SolicitacaoStatus }) {
  const icons: Record<SolicitacaoStatus, React.ReactNode> = {
    pendente: <Circle className="h-3 w-3" />,
    em_execucao: <PlayCircle className="h-3 w-3" />,
    concluida: <CheckCircle2 className="h-3 w-3" />,
    recusada: <XCircle className="h-3 w-3" />,
  };
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', SOLICITACAO_STATUS_COLORS[status])}>
      {icons[status]}
      {SOLICITACAO_STATUS_LABELS[status]}
    </Badge>
  );
}

// ---- Row ----
function SolicitacaoRow({
  solicitacao,
  currentUserId,
}: {
  solicitacao: Solicitacao;
  currentUserId: string;
}) {
  const { mutate: atualizar } = useAtualizarStatusSolicitacao();
  const proximosStatus = SOLICITACAO_STATUS_FLOW[solicitacao.status];
  const isExecutor = solicitacao.executor_id === currentUserId;
  const isRequerente = solicitacao.requerente_id === currentUserId;
  const podeAtualizar = isExecutor || isRequerente;

  // prazo: may come as unknown field since types.ts may not reflect new column yet
  const prazo = (solicitacao as unknown as { prazo?: string | null }).prazo;

  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-medium text-sm truncate">{solicitacao.titulo}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <Badge variant="secondary" className="text-xs">
                {SOLICITACAO_TIPO_LABELS[solicitacao.tipo]}
              </Badge>
              <PrazoBadge prazo={prazo} />
              <StatusBadge status={solicitacao.status} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Por: {solicitacao.requerente?.full_name ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Para: {solicitacao.executor?.full_name ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(solicitacao.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            </div>
            {solicitacao.descricao && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                {solicitacao.descricao}
              </p>
            )}
          </div>

          {podeAtualizar && proximosStatus.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSeparator />
                {proximosStatus.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => atualizar({ id: solicitacao.id, status: s })}
                    className={
                      s === 'recusada' ? 'text-destructive focus:text-destructive' : ''
                    }
                  >
                    {SOLICITACAO_STATUS_LABELS[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Main component ----
interface Props {
  filtros?: {
    status?: SolicitacaoStatus[];
    tipo?: string[];
    executor_id?: string;
    requerente_id?: string;
  };
  emptyMessage?: string;
}

export function SolicitacoesList({ filtros, emptyMessage }: Props) {
  const { user } = useAuth();
  const { data: solicitacoes = [], isLoading } = useSolicitacoes(filtros);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!solicitacoes.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground text-sm">
          {emptyMessage ?? 'Nenhuma solicitação encontrada.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {solicitacoes.map((s) => (
        <SolicitacaoRow key={s.id} solicitacao={s} currentUserId={user?.id ?? ''} />
      ))}
    </div>
  );
}
