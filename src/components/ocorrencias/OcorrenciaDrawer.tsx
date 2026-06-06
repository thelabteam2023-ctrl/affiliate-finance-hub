import { useState, useMemo, useEffect } from 'react';
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
import { StatusBadge, TipoBadge } from './OcorrenciaBadges';
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
  Building2,
  RefreshCw,
} from 'lucide-react';

import { formatDistanceToNow } from 'date-fns';
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
  const { user, workspaceId } = useAuth();
  
  // Monitoring hook
  const { 
    data: ocorrencia, 
    isLoading, 
    isError, 
    error, 
    refetch, 
    isRefetching,
    failureCount 
  } = useOcorrencia(ocorrenciaId);

  const { data: eventos = [], isLoading: loadingEventos } = useOcorrenciaEventos(ocorrenciaId);
  const { data: members = [] } = useWorkspaceMembers();
  const { mutate: atualizarStatus, isPending: updatingStatus } = useAtualizarStatusOcorrencia();
  const { mutateAsync: resolverComFinanceiro } = useResolverOcorrenciaComFinanceiro();
  const { mutate: reabrirOcorrencia, isPending: reabrindo } = useReabrirOcorrencia();
  const { mutate: adicionarComentario, isPending: addingComment } = useAdicionarComentario();
  const [comentario, setComentario] = useState('');
  const [resolucaoOpen, setResolucaoOpen] = useState(false);

  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  // Auto-correction / Observability: Log when load fails
  useEffect(() => {
    if (isError && open) {
      console.error(`[OcorrenciaDrawer] Failure loading ${ocorrenciaId}. Failure count: ${failureCount}`, error);
    }
  }, [isError, open, ocorrenciaId, failureCount, error]);

  // Ensure state resets when ID changes
  useEffect(() => {
    if (open) {
      setComentario('');
      setResolucaoOpen(false);
    }
  }, [ocorrenciaId, open]);

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

  const showSkeleton = (isLoading || isRefetching) && open && !ocorrencia && !!workspaceId;
  const transicoes = ocorrencia ? STATUS_TRANSICOES[ocorrencia.status] : [];
  const subMotivoLabel = ocorrencia?.sub_motivo
    ? SUB_MOTIVO_LABELS[ocorrencia.sub_motivo] || ocorrencia.sub_motivo
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md md:max-w-xl flex flex-col p-0 bg-background border-l border-border/40">
        {showSkeleton ? (
          <div className="h-full w-full p-6 space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="h-4 w-px bg-border mx-2" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <div className="mt-auto pt-6">
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ) : isError && open ? (
          <div className="h-full w-full p-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">Falha no carregamento</h3>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-[280px]">
                Ocorreu um erro ao carregar os detalhes desta ocorrência. Isso pode ser um problema de permissão ou conexão.
              </p>
              <div className="bg-muted p-2 rounded text-[10px] font-mono text-left overflow-auto max-w-[300px] mt-4">
                Error: {(error as any)?.message || 'Supabase Query Error'}
                <br />
                WS: {workspaceId || 'None'}
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[200px] pt-4">
              <Button size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
                Tentar novamente
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Fechar painel</Button>
            </div>
          </div>
        ) : !ocorrencia && open ? (
          <div className="h-full w-full p-6 flex flex-col items-center justify-center text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm font-medium">Ocorrência não encontrada ou excluída.</p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar painel</Button>
          </div>
        ) : ocorrencia ? (
          <>
            <SheetHeader className="p-6 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("h-2.5 w-2.5 rounded-full", PRIORIDADE_DOTS[ocorrencia.prioridade])} />
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  {ocorrencia.prioridade}
                </span>
                {ocorrencia.bookmaker && (
                  <>
                    <div className="h-1 w-1 rounded-full bg-border" />
                    <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
                      {ocorrencia.bookmaker.nome}
                    </span>
                  </>
                )}
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

              {/* Context and Coordination */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-primary" />
                  Contexto e Coordenação
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   {ocorrencia.bookmaker && (
                     <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/40">
                             {ocorrencia.bookmaker.bookmakers_catalogo?.logo_url ? (
                               <img src={ocorrencia.bookmaker.bookmakers_catalogo.logo_url} className="h-5 w-5 object-contain" alt="" />
                             ) : (
                               <Building2 className="h-4 w-4 text-primary" />
                             )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{ocorrencia.bookmaker.nome}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">Casa / Plataforma</p>
                          </div>
                        </div>
                     </div>
                   )}

                   <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/40">
                           <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{getMemberName(ocorrencia.executor_id)}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">Coordenação / Executor</p>
                        </div>
                      </div>
                   </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-primary/5">
                   <div className="flex items-center gap-3">
                     <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-primary/20">
                        <User className="h-4 w-4 text-primary" />
                     </div>
                     <div className="min-w-0">
                       <p className="text-xs font-bold text-foreground truncate">A Glória de {getMemberName(ocorrencia.requerente_id)}</p>
                       <p className="text-[10px] text-primary uppercase font-bold">Titular da Conta</p>
                     </div>
                   </div>
                </div>

                {subMotivoLabel && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/10 bg-muted/10">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground truncate">{subMotivoLabel}</p>
                  </div>
                )}
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
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
