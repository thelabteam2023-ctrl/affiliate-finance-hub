import { isPast, differenceInSeconds, formatDistanceToNow } from 'date-fns';
import { getFirstLastName } from '@/lib/utils';
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
  Timer,
  Trash2,
  FileText,
  Pencil,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEffect, useState } from 'react';
import { EditarSolicitacaoDialog } from './EditarSolicitacaoDialog';


// ---- Helpers ----
function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Vencido';
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return '< 1h';
}

// ---- Prazo badge ----
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
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [prazo]); // eslint-disable-line react-hooks/exhaustive-deps

  const isUrgent = !vencido && secondsLeft < 86400;
  const countdown = vencido ? 'Vencido' : formatCountdown(secondsLeft);

  const dataFormatada = date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const tooltipText = vencido
    ? `Prazo vencido em ${dataFormatada}`
    : isUrgent
    ? `Atenção! Resta ${countdown} para finalizar esta demanda. Prazo: ${dataFormatada}`
    : `Resta ${countdown} para finalizar esta demanda. Prazo: ${dataFormatada}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-mono font-semibold transition-colors cursor-default',
            vencido
              ? 'text-destructive border-destructive/50'
              : isUrgent
              ? 'text-orange-400 border-orange-400/50'
              : 'text-emerald-400 border-emerald-400/50',
          )}
        >
          <Timer className="h-3 w-3" />
          {countdown}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-center text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  numero,
}: {
  solicitacao: Solicitacao;
  currentUserId: string;
  isAdmin: boolean;
  numero: number;
}) {
  const { mutate: atualizar } = useAtualizarStatusSolicitacao();
  const { mutate: excluir, isPending: excluindo } = useExcluirSolicitacao();
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);

  const proximosStatus = SOLICITACAO_STATUS_FLOW[solicitacao.status];
  const isRequerente = solicitacao.requerente_id === currentUserId;

  // Suporte a múltiplos executores via metadata
  const executorIds: string[] = (() => {
    const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;
    if (meta) {
      const ids = meta['executor_ids'];
      if (Array.isArray(ids) && ids.length > 0) return ids as string[];
    }
    return solicitacao.executor_id ? [solicitacao.executor_id] : [];
  })();
  const executorNomes: string[] = (() => {
    const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;
    if (meta) {
      const nomes = meta['executor_nomes'];
      if (Array.isArray(nomes) && nomes.length > 0)
        return (nomes as string[]).map((n) => getFirstLastName(n));
    }
    return solicitacao.executor?.full_name ? [getFirstLastName(solicitacao.executor.full_name)] : ['—'];
  })();

  const isExecutor = executorIds.includes(currentUserId);
  const podeAtualizar = isExecutor || isRequerente;
  const temAcoes = (podeAtualizar && proximosStatus.length > 0) || isRequerente || isAdmin;

  const prazo = (solicitacao as unknown as { prazo?: string | null }).prazo;
  const foiEditada = !!(solicitacao as unknown as { descricao_editada_at?: string | null }).descricao_editada_at;

  const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;

  // Nomes de todas as casas
  const bookmakerNomes: string[] = (() => {
    if (!meta) return [];
    const nomes = meta['bookmaker_nomes'];
    if (typeof nomes === 'string' && nomes.trim()) {
      return nomes.split(',').map((n) => n.trim()).filter(Boolean);
    }
    return [];
  })();

  // IDs das casas novas adicionadas na última edição
  const bookmakerIdsNovos: string[] = (() => {
    if (!meta) return [];
    const novos = meta['bookmaker_ids_novos'];
    if (Array.isArray(novos)) return novos as string[];
    return [];
  })();

  // IDs de todas as casas (para cruzar com nomes)
  const bookmakerIds: string[] = (() => {
    if (!meta) return [];
    const ids = meta['bookmaker_ids'];
    if (Array.isArray(ids)) return ids as string[];
    return [];
  })();

  // Lista plana com flag isNova
  const bookmakerFlatList: { nome: string; isNova: boolean }[] = bookmakerNomes.map((nome, i) => ({
    nome,
    isNova: bookmakerIdsNovos.length > 0 && bookmakerIds[i] != null
      ? bookmakerIdsNovos.includes(bookmakerIds[i])
      : false,
  }));

  // Largura dinâmica da tooltip baseada no nome mais longo do overflow
  const overflowNomes = bookmakerFlatList.slice(2);
  const maxNomeLen = overflowNomes.reduce((max, { nome }) => Math.max(max, nome.length), 0);
  // ~7.5px por char (font-bold text-[11px]) + px-2 (16px) + NEW badge (28px) + gap + border
  const badgeMinWidth = Math.max(80, maxNomeLen * 7.5 + 44);
  // 2 colunas + gap(4px) + padding lateral(16px)
  const tooltipWidth = Math.round(badgeMinWidth * 2 + 4 + 16);

  return (
    <>
      <Card className="border-border/50 hover:border-border transition-colors">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {/* Número da fila */}
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center mt-0.5">
              <span className="text-xs font-bold text-muted-foreground">{numero}</span>
            </div>

            {/* Conteúdo principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs font-medium">
                  {SOLICITACAO_TIPO_LABELS[solicitacao.tipo]}
                </Badge>
                {prazo && <PrazoBadge prazo={prazo} />}
                <StatusBadge status={solicitacao.status} />
              </div>

              {/* Casas — 2 visíveis + tooltip com restantes */}
              {bookmakerFlatList.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <ClipboardList className="h-3 w-3 shrink-0" />
                    Casas:
                  </span>
                  {bookmakerFlatList.slice(0, 2).map(({ nome, isNova }) => (
                    <span
                      key={nome}
                      title={nome}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-sm border tracking-wide border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                    >
                      {isNova && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      {nome}
                    </span>
                  ))}
                  {overflowNomes.length > 0 && (
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-sm border cursor-pointer border-muted-foreground/30 text-muted-foreground bg-muted/40 hover:border-accent-foreground/40 hover:text-accent-foreground transition-colors tracking-wide select-none"
                          >
                            +{overflowNomes.length} mais
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="p-2"
                          style={{ width: `${tooltipWidth}px` }}
                        >
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1.5">
                            Casas restantes
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {overflowNomes.map(({ nome, isNova }) => (
                              <span
                                key={nome}
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-sm border tracking-wide w-full border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                style={{ minWidth: `${badgeMinWidth}px` }}
                              >
                                {isNova && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                )}
                                <span className="flex-1 text-left">{nome}</span>
                              </span>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-0.5 mt-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="w-7 shrink-0">Por</span>
                  <span>: {solicitacao.requerente?.full_name ?? '—'}</span>
                </div>
                <div className={cn('flex items-start gap-1', isExecutor && 'text-primary font-medium')}>
                  <User className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="w-7 shrink-0">Para</span>
                  <span className="flex-1">
                    {': '}
                    {executorNomes.length === 1
                      ? executorNomes[0]
                      : executorNomes.map((nome, i) => (
                          <span key={i} className={cn(
                            'inline-block',
                            executorIds[i] === currentUserId && 'text-primary font-medium',
                          )}>
                            {nome}{i < executorNomes.length - 1 ? ', ' : ''}
                          </span>
                        ))
                    }
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(solicitacao.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </div>
              </div>
            </div>

            {/* Painel de descrição lateral */}
            {solicitacao.descricao && (
              <div className="mx-auto w-full max-w-2xl">
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium uppercase tracking-wide">
                      <FileText className="h-3 w-3" />
                      Descrição
                    </span>
                    {foiEditada && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground border-muted-foreground/40 font-normal">
                        editada
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-foreground leading-relaxed line-clamp-8 flex-1">
                    {solicitacao.descricao}
                  </p>
                </div>
              </div>
            )}

            {/* Ações */}
            {temAcoes && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isRequerente && (
                    <DropdownMenuItem onClick={() => setEditarOpen(true)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Editar solicitação
                    </DropdownMenuItem>
                  )}
                  {podeAtualizar && proximosStatus.length > 0 && (
                    <>
                      {isRequerente && <DropdownMenuSeparator />}
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
                      {(isRequerente || (podeAtualizar && proximosStatus.length > 0)) && <DropdownMenuSeparator />}
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
          </div>
        </CardContent>
      </Card>

      {/* Dialog editar solicitação completa */}
      <EditarSolicitacaoDialog
        solicitacao={solicitacao}
        open={editarOpen}
        onOpenChange={setEditarOpen}
      />

      {/* Dialog confirmar exclusão */}
      <AlertDialog open={confirmExcluir} onOpenChange={setConfirmExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
            <AlertDialogDescription>
              A solicitação <strong>"{SOLICITACAO_TIPO_LABELS[solicitacao.tipo]}"</strong> será excluída permanentemente.
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

  // Ordenar por prazo crescente (mais urgente primeiro)
  const ordenadas = [...solicitacoes].sort((a, b) => {
    const prazoA = (a as unknown as { prazo?: string | null }).prazo;
    const prazoB = (b as unknown as { prazo?: string | null }).prazo;
    if (!prazoA && !prazoB) return 0;
    if (!prazoA) return 1;
    if (!prazoB) return -1;
    return new Date(prazoA).getTime() - new Date(prazoB).getTime();
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-3">
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

  if (!ordenadas.length) {
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
    <div className="grid grid-cols-1 gap-3">
      {ordenadas.map((s, idx) => (
        <SolicitacaoRow
          key={s.id}
          solicitacao={s}
          currentUserId={user?.id ?? ''}
          isAdmin={isOwnerOrAdmin}
          numero={idx + 1}
        />
      ))}
    </div>
  );
}
