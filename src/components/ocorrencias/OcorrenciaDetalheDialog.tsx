import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useOcorrencia,
  useOcorrenciaEventos,
  useAtualizarStatusOcorrencia,
  useAdicionarComentario,
  useResolverOcorrenciaComFinanceiro,
} from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { PrioridadeBadge, StatusBadge, TipoBadge, SlaBadge } from './OcorrenciaBadges';
import { ResolucaoFinanceiraDialog } from './ResolucaoFinanceiraDialog';
import type { OcorrenciaStatus, OcorrenciaEvento } from '@/types/ocorrencias';
import { STATUS_LABELS, EVENTO_TIPO_LABELS, SUB_MOTIVO_LABELS } from '@/types/ocorrencias';
import {
  Clock,
  User,
  Send,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Tag,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  ocorrenciaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_TRANSICOES: Record<OcorrenciaStatus, OcorrenciaStatus[]> = {
  aberto: ['em_andamento', 'cancelado'],
  em_andamento: ['aguardando_terceiro', 'resolvido', 'cancelado'],
  aguardando_terceiro: ['em_andamento', 'resolvido', 'cancelado'],
  resolvido: [],
  cancelado: [],
};

export function OcorrenciaDetalheDialog({ ocorrenciaId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { data: ocorrencia, isLoading } = useOcorrencia(ocorrenciaId);
  const { data: eventos = [], isLoading: loadingEventos } = useOcorrenciaEventos(ocorrenciaId);
  const { data: members = [] } = useWorkspaceMembers();
  const { mutate: atualizarStatus, isPending: updatingStatus } = useAtualizarStatusOcorrencia();
  const { mutateAsync: resolverComFinanceiro } = useResolverOcorrenciaComFinanceiro();
  const { mutate: adicionarComentario, isPending: addingComment } = useAdicionarComentario();
  const [comentario, setComentario] = useState('');
  const [resolucaoOpen, setResolucaoOpen] = useState(false);

  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  const getMemberName = (userId: string) => {
    const m = memberMap.get(userId);
    return m?.full_name || m?.email || 'Usuário';
  };

  const handleEnviarComentario = () => {
    if (!comentario.trim()) return;
    adicionarComentario(
      { ocorrenciaId, conteudo: comentario },
      { onSuccess: () => setComentario('') }
    );
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <Skeleton className="h-96" />
        </DialogContent>
      </Dialog>
    );
  }

  if (!ocorrencia) return null;

  const transicoes = STATUS_TRANSICOES[ocorrencia.status];
  const subMotivoLabel = ocorrencia.sub_motivo
    ? SUB_MOTIVO_LABELS[ocorrencia.sub_motivo] || ocorrencia.sub_motivo
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
            <span className="truncate">{ocorrencia.titulo}</span>
          </DialogTitle>
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <PrioridadeBadge prioridade={ocorrencia.prioridade} />
            <StatusBadge status={ocorrencia.status} />
            <TipoBadge tipo={ocorrencia.tipo} />
            <SlaBadge violado={ocorrencia.sla_violado} alertaEm={ocorrencia.sla_alerta_em} />
            {subMotivoLabel && (
              <span className="flex items-center gap-1 text-xs text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
                <Tag className="h-3 w-3" />
                {subMotivoLabel}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex gap-4 overflow-hidden flex-1 min-h-0">
          {/* Timeline */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-2">
            {/* Metainfo */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 mb-4 text-sm space-y-1.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>Requerente: <span className="text-foreground">{getMemberName(ocorrencia.requerente_id)}</span></span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>Executor: <span className="text-foreground">{getMemberName(ocorrencia.executor_id)}</span></span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Aberta: <span className="text-foreground">{format(parseLocalDateTime(ocorrencia.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span></span>
              </div>
              {ocorrencia.descricao && (
                <div className="flex items-start gap-2 text-muted-foreground pt-1 border-t border-border/30">
                  <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p className="text-foreground text-xs leading-relaxed whitespace-pre-wrap">{ocorrencia.descricao}</p>
                </div>
              )}
            </div>

            {/* Timeline Events */}
            {loadingEventos ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {eventos.map((evento) => (
                  <EventoItem
                    key={evento.id}
                    evento={evento}
                    authorName={getMemberName(evento.autor_id)}
                    isCurrentUser={evento.autor_id === user?.id}
                  />
                ))}
              </div>
            )}

            {/* Comment input */}
            {!['resolvido', 'cancelado'].includes(ocorrencia.status) && (
              <div className="mt-4 space-y-2">
                <Textarea
                  placeholder="Adicione um comentário ou atualização..."
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleEnviarComentario}
                    disabled={!comentario.trim() || addingComment}
                  >
                    {addingComment ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Comentar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Side panel */}
          {transicoes.length > 0 && (
            <div className="w-48 shrink-0 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Alterar Status
              </p>
              {transicoes.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                  disabled={updatingStatus}
                  onClick={() => {
                    if (s === 'resolvido') {
                      setResolucaoOpen(true);
                    } else {
                      atualizarStatus({
                        id: ocorrencia.id,
                        novoStatus: s,
                        statusAnterior: ocorrencia.status,
                      });
                    }
                  }}
                >
                  <ArrowRight className="h-3 w-3 mr-1.5" />
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Financial resolution dialog */}
        {ocorrencia && (
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
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventoItem({
  evento,
  authorName,
  isCurrentUser,
}: {
  evento: OcorrenciaEvento;
  authorName: string;
  isCurrentUser: boolean;
}) {
  const isSystemEvent = !['comentario', 'anexo'].includes(evento.tipo);

  if (isSystemEvent) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span className="shrink-0">
          <span className="font-medium text-foreground">{authorName}</span>{' '}
          {EVENTO_TIPO_LABELS[evento.tipo]}
          {evento.valor_anterior && evento.valor_novo && (
            <span>
              {': '}
              <span className="line-through opacity-60">{STATUS_LABELS[evento.valor_anterior as OcorrenciaStatus] || evento.valor_anterior}</span>
              {' → '}
              <span className="text-foreground">{STATUS_LABELS[evento.valor_novo as OcorrenciaStatus] || evento.valor_novo}</span>
            </span>
          )}
        </span>
        <div className="h-px flex-1 bg-border" />
        <span className="shrink-0 opacity-60">
          {formatDistanceToNow(new Date(evento.created_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2', isCurrentUser && 'flex-row-reverse')}>
      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
        {authorName.charAt(0).toUpperCase()}
      </div>
      <div
        className={cn(
          'rounded-lg px-3 py-2 text-sm max-w-[85%]',
          isCurrentUser
            ? 'bg-primary/10 border border-primary/20'
            : 'bg-muted/40 border border-border/50'
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{authorName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(evento.created_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{evento.conteudo}</p>
        {/* Attachments */}
        {evento.anexos && Array.isArray(evento.anexos) && evento.anexos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
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
