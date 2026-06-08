import { useState, useMemo, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { EditarOcorrenciaDialog } from './EditarOcorrenciaDialog';
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
  DollarSign,
  Pencil,
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
  const [editarOpen, setEditarOpen] = useState(false);

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
                
                <div className="flex-1" />
                
                {['aberto', 'em_andamento', 'aguardando_terceiro'].includes(ocorrencia.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-muted-foreground hover:text-primary gap-2"
                    onClick={() => setEditarOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Editar</span>
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Financial Risk Card */}
              {ocorrencia.valor_risco > 0 && (
                <div className="relative group overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <DollarSign className="h-16 w-16 text-primary" />
                  </div>
                  
                  <div className="relative space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/20">
                          <DollarSign className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Valor em Disputa</p>
                          <p className="text-sm font-medium text-muted-foreground">Exposição Financeira</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-background/50 border-primary/20 text-primary font-bold text-[10px] py-0 px-2 h-5">
                        DISPUTA ATIVA
                      </Badge>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-medium text-muted-foreground">{ocorrencia.moeda || 'BRL'}</span>
                      <span className="text-4xl font-black tracking-tight text-foreground leading-none">
                        {Number(ocorrencia.valor_risco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {ocorrencia.status !== 'resolvido' && ocorrencia.status !== 'cancelado' && (
                      <div className="pt-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full h-8 text-[11px] font-bold uppercase tracking-wider gap-2 hover:bg-primary/5 hover:text-primary border border-dashed border-primary/20"
                          onClick={() => setResolucaoOpen(true)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolver Disputa
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                {/* Button Escalation removed per review */}
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
                <div className="flex flex-col gap-3">
                   {ocorrencia.bookmaker && (
                     <div className="flex flex-col rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
                        <div className="p-3 bg-muted/30 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/40 shrink-0">
                               {ocorrencia.bookmaker.bookmakers_catalogo?.logo_url ? (
                                 <img src={ocorrencia.bookmaker.bookmakers_catalogo.logo_url} className="h-5 w-5 object-contain" alt="" />
                               ) : (
                                 <Building2 className="h-4 w-4 text-primary" />
                               )}
                            </div>
                            <p className="text-sm font-black text-foreground truncate uppercase tracking-tight">{ocorrencia.bookmaker.nome}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                             <span className="text-[9px] text-muted-foreground uppercase font-bold">Por:</span>
                             <span className="text-[9px] font-black text-foreground uppercase">{getMemberName(ocorrencia.requerente_id)}</span>
                             <Badge variant="outline" className="text-[8px] font-black bg-background/40 py-0 h-3.5 border-border/40 uppercase px-1">Labest</Badge>
                          </div>
                        </div>

                        <div className="p-3 grid grid-cols-2 gap-4 border-t border-border/40">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[9px] text-primary/70 uppercase font-black tracking-widest leading-none mb-0.5">Titular</p>
                              <p className="text-xs font-bold text-foreground truncate">
                                {(ocorrencia.bookmaker as any).parceiros?.nome || "Não informado"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Tag className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[9px] text-primary/70 uppercase font-black tracking-widest leading-none mb-0.5">Projeto</p>
                              <p className="text-xs font-bold text-foreground truncate">
                                {ocorrencia.projeto?.nome || "Operação Geral"}
                              </p>
                            </div>
                          </div>
                        </div>
                     </div>
                   )}
                </div>
                {subMotivoLabel && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <Tag className="h-4 w-4 text-primary" />
                    <p className="text-xs font-bold text-primary">{subMotivoLabel}</p>
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
                  // Mapear resultado para o enum do banco: 'sem_impacto', 'perda_confirmada', 'perda_parcial'
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

            {/* Edit dialog */}
            {ocorrencia && (
              <EditarOcorrenciaDialog
                open={editarOpen}
                onOpenChange={setEditarOpen}
                ocorrencia={ocorrencia}
              />
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
