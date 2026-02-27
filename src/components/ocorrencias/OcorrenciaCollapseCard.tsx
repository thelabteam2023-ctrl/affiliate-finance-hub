import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { PrioridadeBadge, StatusBadge, TipoBadge, SlaBadge } from './OcorrenciaBadges';
import { ResolucaoFinanceiraDialog } from './ResolucaoFinanceiraDialog';
import { useOcorrenciaEventos, useExcluirOcorrencia, useResolverOcorrenciaComFinanceiro } from '@/hooks/useOcorrencias';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import type { Ocorrencia, OcorrenciaStatus, OcorrenciaEvento } from '@/types/ocorrencias';
import { STATUS_LABELS, SUB_MOTIVO_LABELS, EVENTO_TIPO_LABELS } from '@/types/ocorrencias';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Trash2,
  Tag,
  CalendarDays,
  Building2,
  FolderOpen,
  Users,
  ArrowRight,
  MessageSquare,
  Paperclip,
  CircleDot,
} from 'lucide-react';
import { formatDistanceToNow, differenceInDays, differenceInHours, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  ocorrencia: Ocorrencia;
  currentUserId?: string;
  isAdmin: boolean;
  onVerDetalhe: () => void;
  onAtualizarStatus: (status: OcorrenciaStatus) => void;
  bookmakerNome?: string;
  projetoNome?: string;
  parceiroNome?: string;
}

const STATUS_TRANSICOES: Record<OcorrenciaStatus, OcorrenciaStatus[]> = {
  aberto: ['em_andamento', 'cancelado'],
  em_andamento: ['aguardando_terceiro', 'resolvido', 'cancelado'],
  aguardando_terceiro: ['em_andamento', 'resolvido', 'cancelado'],
  resolvido: [],
  cancelado: [],
};

function calcularDuracao(ocorrencia: Ocorrencia) {
  const inicio = new Date(ocorrencia.created_at);
  const fim = ocorrencia.resolved_at
    ? new Date(ocorrencia.resolved_at)
    : ocorrencia.cancelled_at
    ? new Date(ocorrencia.cancelled_at)
    : new Date();

  const dias = differenceInDays(fim, inicio);
  const horas = differenceInHours(fim, inicio) % 24;

  const finalizado = !!ocorrencia.resolved_at || !!ocorrencia.cancelled_at;

  if (dias === 0) {
    return { texto: `${horas}h`, finalizado };
  }
  return { texto: `${dias}d ${horas}h`, finalizado };
}

function EventoTimeline({
  evento,
  memberMap,
}: {
  evento: OcorrenciaEvento;
  memberMap: Map<string, { full_name?: string; email?: string }>;
}) {
  const autorName =
    memberMap.get(evento.autor_id)?.full_name ||
    memberMap.get(evento.autor_id)?.email ||
    'Usuário';

  const isSystemEvent = !['comentario', 'anexo'].includes(evento.tipo);

  const icon = (() => {
    switch (evento.tipo) {
      case 'status_alterado':
        return <ArrowRight className="h-3 w-3 text-blue-400" />;
      case 'comentario':
        return <MessageSquare className="h-3 w-3 text-emerald-400" />;
      case 'anexo':
        return <Paperclip className="h-3 w-3 text-yellow-400" />;
      default:
        return <CircleDot className="h-3 w-3 text-muted-foreground" />;
    }
  })();

  return (
    <div className="flex gap-3 relative">
      {/* Vertical line */}
      <div className="flex flex-col items-center">
        <div className="mt-1 flex items-center justify-center h-5 w-5 rounded-full bg-muted/60 border border-border/50 shrink-0">
          {icon}
        </div>
        <div className="flex-1 w-px bg-border/40 mt-1" />
      </div>

      {/* Content */}
      <div className="pb-3 flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground">{autorName}</span>
          <span className="text-muted-foreground">
            {EVENTO_TIPO_LABELS[evento.tipo]}
          </span>
          {evento.tipo === 'status_alterado' && evento.valor_anterior && evento.valor_novo && (
            <span className="text-muted-foreground">
              <span className="line-through opacity-60">
                {STATUS_LABELS[evento.valor_anterior as OcorrenciaStatus] || evento.valor_anterior}
              </span>
              {' → '}
              <span className="text-foreground font-medium">
                {STATUS_LABELS[evento.valor_novo as OcorrenciaStatus] || evento.valor_novo}
              </span>
            </span>
          )}
          <span className="text-muted-foreground/60 ml-auto shrink-0">
            {formatDistanceToNow(new Date(evento.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </span>
        </div>

        {!isSystemEvent && evento.conteudo && (
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {evento.conteudo}
          </p>
        )}

        {evento.anexos && Array.isArray(evento.anexos) && evento.anexos.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {(evento.anexos as { nome: string; url: string }[]).map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline border border-primary/30 rounded px-2 py-0.5"
              >
                📎 {a.nome}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OcorrenciaCollapseCard({
  ocorrencia,
  currentUserId,
  isAdmin,
  onVerDetalhe,
  onAtualizarStatus,
  bookmakerNome,
  projetoNome,
  parceiroNome,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { mutate: excluir, isPending: excluindo } = useExcluirOcorrencia();
  const { mutateAsync: resolverComFinanceiro } = useResolverOcorrenciaComFinanceiro();
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const [resolucaoOpen, setResolucaoOpen] = useState(false);
  const { data: eventos = [], isLoading: loadingEventos } = useOcorrenciaEventos(
    isOpen ? ocorrencia.id : ''
  );
  const { data: members = [] } = useWorkspaceMembers();

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  const isExecutor = ocorrencia.executor_id === currentUserId;
  const transicoes = STATUS_TRANSICOES[ocorrencia.status];
  const temAcoes = transicoes.length > 0 || isAdmin;
  const duracao = calcularDuracao(ocorrencia);

  const subMotivoLabel = ocorrencia.sub_motivo
    ? SUB_MOTIVO_LABELS[ocorrencia.sub_motivo] || ocorrencia.sub_motivo
    : null;

  const hasEntities = bookmakerNome || projetoNome || parceiroNome;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="hover:border-primary/30 transition-colors group">
          <CardContent className="p-0">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <CollapsibleTrigger asChild>
                  <button className="mt-0.5 p-0.5 rounded hover:bg-muted/60 transition-colors shrink-0">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <PrioridadeBadge prioridade={ocorrencia.prioridade} />
                    <StatusBadge status={ocorrencia.status} />
                    <TipoBadge tipo={ocorrencia.tipo} />
                    <SlaBadge
                      violado={ocorrencia.sla_violado}
                      alertaEm={ocorrencia.sla_alerta_em}
                    />
                  </div>
                  <h4 className="font-medium text-sm truncate text-foreground">
                    {ocorrencia.titulo}
                  </h4>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(ocorrencia.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                    {subMotivoLabel && (
                      <span className="flex items-center gap-1 text-primary/70">
                        <Tag className="h-3 w-3" />
                        {subMotivoLabel}
                      </span>
                    )}
                    {/* Duration badge */}
                    <span
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                        duracao.finalizado
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      )}
                    >
                      <CalendarDays className="h-3 w-3" />
                      {duracao.finalizado ? 'Resolvido em ' : 'Aberto há '}
                      {duracao.texto}
                    </span>
                    {/* Linked entities */}
                    {bookmakerNome && (
                      <span className="flex items-center gap-1 text-blue-400/80">
                        <Building2 className="h-3 w-3" />
                        {bookmakerNome}
                      </span>
                    )}
                    {projetoNome && (
                      <span className="flex items-center gap-1 text-purple-400/80">
                        <FolderOpen className="h-3 w-3" />
                        {projetoNome}
                      </span>
                    )}
                    {parceiroNome && (
                      <span className="flex items-center gap-1 text-orange-400/80">
                        <Users className="h-3 w-3" />
                        {parceiroNome}
                      </span>
                    )}
                    {isExecutor && (
                      <Badge
                        variant="outline"
                        className="text-xs py-0 px-1.5 text-primary border-primary/40"
                      >
                        Sua responsabilidade
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div
                className="flex items-center gap-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={onVerDetalhe}
                >
                  <Eye className="h-4 w-4" />
                </Button>

                {temAcoes && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Ações
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {transicoes.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => {
                            if (s === 'resolvido') {
                              setResolucaoOpen(true);
                            } else {
                              onAtualizarStatus(s);
                            }
                          }}
                        >
                          → {STATUS_LABELS[s]}
                        </DropdownMenuItem>
                      ))}
                      {isAdmin && (
                        <>
                          {transicoes.length > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuItem
                            onClick={() => setConfirmExcluir(true)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Excluir ocorrência
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Collapsible timeline */}
            <CollapsibleContent>
              <div className="border-t border-border/40 px-4 py-3 ml-7">
                {/* Entity links section */}
                {hasEntities && (
                  <div className="flex items-center gap-4 mb-3 pb-3 border-b border-border/30 text-sm">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Vinculado a:
                    </span>
                    {bookmakerNome && (
                      <span className="flex items-center gap-1.5 text-foreground">
                        <Building2 className="h-3.5 w-3.5 text-blue-400" />
                        {bookmakerNome}
                      </span>
                    )}
                    {projetoNome && (
                      <span className="flex items-center gap-1.5 text-foreground">
                        <FolderOpen className="h-3.5 w-3.5 text-purple-400" />
                        {projetoNome}
                      </span>
                    )}
                    {parceiroNome && (
                      <span className="flex items-center gap-1.5 text-foreground">
                        <Users className="h-3.5 w-3.5 text-orange-400" />
                        {parceiroNome}
                      </span>
                    )}
                  </div>
                )}

                {/* Description */}
                {ocorrencia.descricao && (
                  <div className="mb-3 pb-3 border-b border-border/30">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {ocorrencia.descricao}
                    </p>
                  </div>
                )}

                {/* Timeline */}
                <div className="space-y-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                    Linha do Tempo
                  </p>
                  {loadingEventos ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-10" />
                      ))}
                    </div>
                  ) : eventos.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      Nenhum evento registrado.
                    </p>
                  ) : (
                    eventos.map((evento) => (
                      <EventoTimeline
                        key={evento.id}
                        evento={evento}
                        memberMap={memberMap}
                      />
                    ))
                  )}
                </div>

                {/* Duration summary */}
                <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>
                    {duracao.finalizado
                      ? `Ciclo encerrado em ${duracao.texto}`
                      : `Em aberto há ${duracao.texto}`}
                  </span>
                  {eventos.length > 0 && (
                    <>
                      <span className="text-border">•</span>
                      <span>{eventos.length} evento(s) registrado(s)</span>
                    </>
                  )}
                </div>

                {/* Quick action to open full detail */}
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={onVerDetalhe}>
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Ver detalhes completos
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      <AlertDialog open={confirmExcluir} onOpenChange={setConfirmExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ocorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              A ocorrência <strong>"{ocorrencia.titulo}"</strong> e toda sua timeline de eventos
              serão excluídas permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluir(ocorrencia.id)}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResolucaoFinanceiraDialog
        open={resolucaoOpen}
        onOpenChange={setResolucaoOpen}
        valorRisco={Number((ocorrencia as any).valor_risco) || 0}
        moeda={(ocorrencia as any).moeda || 'BRL'}
        onConfirmar={async (resultado, valorPerda, dataResolucao) => {
          await resolverComFinanceiro({
            id: ocorrencia.id,
            statusAnterior: ocorrencia.status,
            resultadoFinanceiro: resultado,
            valorPerda,
            resolvedAt: dataResolucao.toISOString(),
          });
        }}
      />
    </>
  );
}
