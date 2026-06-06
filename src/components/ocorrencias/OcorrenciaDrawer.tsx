import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useOcorrencia,
  useOcorrenciaEventos,
  useAtualizarStatusOcorrencia,
  useAdicionarComentario,
  useResolverOcorrenciaComFinanceiro,
  useReabrirOcorrencia,
} from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { StatusBadge, TipoBadge, SlaBadge } from './OcorrenciaBadges';
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
  CheckCircle2,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PRIORIDADE_DOTS } from './ocorrencia-tokens';

interface Props {
  ocorrenciaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_TRANSICOES: Record<OcorrenciaStatus, OcorrenciaStatus[]> = {
  aberto: ['em_andamento', 'cancelado'],
  em_andamento: ['aguardando_terceiro', 'resolvido', 'cancelado'],
  aguardando_terceiro: ['em_andamento', 'resolvido', 'cancelado'],
  resolvido: ['em_andamento'], // Reabrir
  cancelado: [],
};

export function OcorrenciaDrawer({ ocorrenciaId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { data: ocorrencia, isLoading } = useOcorrencia(ocorrenciaId);
  const { data: eventos = [], isLoading: loadingEventos } = useOcorrenciaEventos(ocorrenciaId);
  const { data: members = [] } = useWorkspaceMembers();
  const { mutate: atualizarStatus, isPending: updatingStatus } = useAtualizarStatusOcorrencia();
  const { mutateAsync: resolverComFinanceiro } = useResolverOcorrenciaComFinanceiro();
  const { mutate: reabrirOcorrencia, isPending: reabrindo } = useReabrirOcorrencia();
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md md:max-w-xl">
          <Skeleton className="h-full w-full" />
        </SheetContent>
      </Sheet>
    );
  }

  if (!ocorrencia) return null;

  const transicoes = STATUS_TRANSICOES[ocorrencia.status];
  const subMotivoLabel = ocorrencia.sub_motivo
    ? SUB_MOTIVO_LABELS[ocorrencia.sub_motivo] || ocorrencia.sub_motivo
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md md:max-w-xl flex flex-col p-0 bg-background border-l border-border/40">
        <SheetHeader className="p-6 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("h-2.5 w-2.5 rounded-full", PRIORIDADE_DOTS[ocorrencia.prioridade])} />
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              {ocorrencia.prioridade}
            </span>
            {/* SLA Badge removed */}
          </div>
          <SheetTitle className="text-xl font-semibold leading-tight mb-4">
            {ocorrencia.titulo}
          </SheetTitle>
          
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-medium" title={`Requerente: ${getMemberName(ocorrencia.requerente_id)}`}>
                {getMemberName(ocorrencia.requerente_id).charAt(0)}
              </div>
              <div className="h-8 w-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-medium text-primary" title={`Executor: ${getMemberName(ocorrencia.executor_id)}`}>
                {getMemberName(ocorrencia.executor_id).charAt(0)}
              </div>
            </div>
            <div className="h-4 w-px bg-border" />
            <StatusBadge status={ocorrencia.status} />
            <TipoBadge tipo={ocorrencia.tipo} />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Actions Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {transicoes.map((s) => (
              <Button
                key={s}
                variant={s === 'resolvido' ? 'default' : 'outline'}
                size="sm"
                className="h-9 px-4 text-xs font-medium gap-2"
                disabled={updatingStatus || reabrindo}
                onClick={() => {
                  if (s === 'resolvido') {
                    setResolucaoOpen(true);
                  } else if (ocorrencia.status === 'resolvido' && s === 'em_andamento') {
                    reabrirOcorrencia({ id: ocorrencia.id });
                  } else {
                    atualizarStatus({
                      id: ocorrencia.id,
                      novoStatus: s,
                      statusAnterior: ocorrencia.status,
                    });
                  }
                }}
              >
                {s === 'resolvido' ? <CheckCircle2 className="h-3.5 w-3.5" /> : 
                 s === 'em_andamento' && ocorrencia.status === 'resolvido' ? <RotateCcw className="h-3.5 w-3.5" /> :
                 <ArrowRight className="h-3.5 w-3.5" />}
                {ocorrencia.status === 'resolvido' && s === 'em_andamento'
                  ? 'Reabrir'
                  : s === 'resolvido' ? 'Resolver' : 
                    s === 'em_andamento' ? 'Iniciar' :
                    s === 'cancelado' ? 'Cancelar' : STATUS_LABELS[s]}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-medium gap-2">
              <TrendingUp className="h-3.5 w-3.5" />
              Escalar
            </Button>
          </div>

          {/* Details Section */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" />
              Descrição
            </h3>
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {ocorrencia.descricao || "Nenhuma descrição fornecida."}
            </div>
          </section>

          {/* Vinculações */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Tag className="h-3.5 w-3.5" />
              Vinculado a
            </h3>
            <div className="grid grid-cols-1 gap-3">
               <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/40">
                       <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{getMemberName(ocorrencia.requerente_id)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Titular/Requerente</p>
                    </div>
                  </div>
               </div>
               {subMotivoLabel && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                    <Tag className="h-4 w-4 text-primary" />
                    <p className="text-xs font-medium text-foreground">{subMotivoLabel}</p>
                  </div>
               )}
            </div>
          </section>

          {/* Timeline Events */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              Linha do Tempo
            </h3>
            {loadingEventos ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-3.5 before:w-px before:bg-border/60">
                {eventos.map((evento) => (
                  <div key={evento.id} className="relative pl-10">
                    <div className="absolute left-0 top-1 h-7 w-7 rounded-full bg-background border border-border flex items-center justify-center z-10">
                       <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">{getMemberName(evento.autor_id)}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(evento.created_at), { addSuffix: true, locale: ptBR })}</span>
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {EVENTO_TIPO_LABELS[evento.tipo]}
                      {evento.tipo === 'comentario' && (
                        <p className="mt-1 text-foreground bg-muted/30 p-2 rounded-md border border-border/20">{evento.conteudo}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer with comment input */}
        {!['resolvido', 'cancelado'].includes(ocorrencia.status) && (
          <div className="p-4 border-t border-border/40 bg-muted/10 shrink-0">
            <div className="relative">
              <Textarea
                placeholder="Escreva uma atualização..."
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                className="min-h-[100px] pr-12 resize-none bg-background border-border/60 focus-visible:ring-primary/20"
              />
              <Button
                size="icon"
                className="absolute bottom-3 right-3 h-8 w-8"
                onClick={handleEnviarComentario}
                disabled={!comentario.trim() || addingComment}
              >
                {addingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Financial resolution dialog */}
        {ocorrencia && (
          <ResolucaoFinanceiraDialog
            open={resolucaoOpen}
            onOpenChange={setResolucaoOpen}
            valorRisco={Number((ocorrencia as any).valor_risco) || 0}
            moeda={(ocorrencia as any).moeda || 'BRL'}
            bookmaker_id={(ocorrencia as any).bookmaker_id}
            projeto_id={(ocorrencia as any).projeto_id}
            ocorrencia_id={ocorrencia.id}
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
      </SheetContent>
    </Sheet>
  );
}
