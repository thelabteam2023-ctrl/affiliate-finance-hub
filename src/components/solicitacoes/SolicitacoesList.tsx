import { format, isPast, differenceInSeconds, formatDistanceToNow } from 'date-fns';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useSolicitacoes, useAtualizarStatusSolicitacao, useExcluirSolicitacao } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
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
  Timer,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

// ---- Helpers ----
function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Vencido';
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ---- Prazo badge (componente com hooks no topo) ----
function PrazoBadge({ prazo }: { prazo: string }) {
  const date = new Date(prazo);
  const vencido = isPast(date);

  const [secondsLeft, setSecondsLeft] = useState<number>(
    () => differenceInSeconds(date, new Date()),
  );

  useEffect(() => {
    if (vencido) return;
    const tick = () => setSecondsLeft(differenceInSeconds(date, new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [prazo]); // eslint-disable-line react-hooks/exhaustive-deps

  const isUrgent = !vencido && secondsLeft < 86400; // menos de 1 dia
  const countdown = vencido ? 'Vencido' : formatCountdown(secondsLeft);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge
        variant="outline"
        className={cn(
          'gap-1 text-xs',
          vencido
            ? 'text-red-400 border-red-400/50'
            : isUrgent
            ? 'text-orange-400 border-orange-400/50'
            : 'text-muted-foreground border-muted-foreground/50',
        )}
      >
        <CalendarClock className="h-3 w-3" />
        {format(date, "dd/MM 'às' HH:mm", { locale: ptBR })}
      </Badge>
      <Badge
        variant="outline"
        className={cn(
          'gap-1 text-xs font-mono',
          vencido
            ? 'text-red-400 border-red-400/50'
            : isUrgent
            ? 'text-orange-400 border-orange-400/50'
            : 'text-emerald-400 border-emerald-400/50',
        )}
      >
        <Timer className="h-3 w-3" />
        {countdown}
      </Badge>
    </div>
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
  isAdmin,
}: {
  solicitacao: Solicitacao;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const { mutate: atualizar } = useAtualizarStatusSolicitacao();
  const { mutate: excluir, isPending: excluindo } = useExcluirSolicitacao();
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const proximosStatus = SOLICITACAO_STATUS_FLOW[solicitacao.status];
  const isExecutor = solicitacao.executor_id === currentUserId;
  const isRequerente = solicitacao.requerente_id === currentUserId;
  const podeAtualizar = isExecutor || isRequerente;
  const temAcoes = (podeAtualizar && proximosStatus.length > 0) || isAdmin;

  // prazo: may come as unknown field since types.ts may not reflect new column yet
  const prazo = (solicitacao as unknown as { prazo?: string | null }).prazo;

  // bookmaker names from contexto_metadata
  const bookmakerNomes: string[] = (() => {
    const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;
    if (!meta) return [];
    const nomes = meta['bookmaker_nomes'];
    if (typeof nomes === 'string' && nomes.trim()) {
      return nomes.split(',').map((n) => n.trim()).filter(Boolean);
    }
    return [];
  })();

  return (
    <>
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
                {prazo && <PrazoBadge prazo={prazo} />}
                <StatusBadge status={solicitacao.status} />
              </div>

              {/* Bookmakers listadas */}
              {bookmakerNomes.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <ClipboardList className="h-3 w-3" />
                    Casas:
                  </span>
                  {bookmakerNomes.map((nome) => (
                    <Badge
                      key={nome}
                      variant="outline"
                      className="text-xs px-1.5 py-0 h-5 font-normal border-primary/40 text-primary/80"
                    >
                      {nome}
                    </Badge>
                  ))}
                </div>
              )}

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

            {temAcoes && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {podeAtualizar && proximosStatus.length > 0 && (
                    <>
                      {proximosStatus.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => atualizar({ id: solicitacao.id, status: s })}
                          className={s === 'recusada' ? 'text-destructive focus:text-destructive' : ''}
                        >
                          {SOLICITACAO_STATUS_LABELS[s]}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {isAdmin && (
                    <>
                      {podeAtualizar && proximosStatus.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={() => setConfirmExcluir(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Excluir solicitação
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmExcluir} onOpenChange={setConfirmExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
            <AlertDialogDescription>
              A solicitação <strong>"{solicitacao.titulo}"</strong> será excluída permanentemente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluir(solicitacao.id)}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  const { isOwnerOrAdmin } = useRole();
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
        <SolicitacaoRow
          key={s.id}
          solicitacao={s}
          currentUserId={user?.id ?? ''}
          isAdmin={isOwnerOrAdmin}
        />
      ))}
    </div>
  );
}
