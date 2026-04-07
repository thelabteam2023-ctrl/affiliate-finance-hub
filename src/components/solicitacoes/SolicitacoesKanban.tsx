import { useState, useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, getFirstLastName } from '@/lib/utils';
import { useSolicitacoes, useAtualizarStatusSolicitacao, useAtualizarPrioridadeSolicitacao, useExcluirSolicitacao } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  SOLICITACAO_TIPO_LABELS,
  SOLICITACAO_STATUS_LABELS,
  SOLICITACAO_PRIORIDADE_CONFIG,
  KANBAN_COLUMNS,
  resolverPrioridade,
  calcularSlaRestante,
  formatarSla,
  calcularExpiracao,
  formatarExpiracao,
} from '@/types/solicitacoes';
import type { Solicitacao, SolicitacaoStatus, SolicitacaoTipo, SolicitacaoPrioridade } from '@/types/solicitacoes';
import {
  MoreHorizontal,
  User,
  Clock,
  DollarSign,
  GripVertical,
  ArrowRight,
  Flag,
  AlertTriangle,
  Trash2,
  Timer,
} from 'lucide-react';
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
import { EditarSolicitacaoDialog } from './EditarSolicitacaoDialog';

interface Props {
  tipoFilter?: SolicitacaoTipo | null;
  responsavelFilter?: string | null;
}

// ---- Inline Priority Picker ----
function PriorityFlag({
  prioridade,
  solicitacaoId,
  compact,
}: {
  prioridade: SolicitacaoPrioridade;
  solicitacaoId: string;
  compact?: boolean;
}) {
  const { mutate: atualizarPrioridade } = useAtualizarPrioridadeSolicitacao();
  const config = SOLICITACAO_PRIORIDADE_CONFIG[prioridade];
  const priorities: SolicitacaoPrioridade[] = ['baixa', 'media', 'alta'];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer hover:opacity-80',
            config.bgColor,
            config.textColor,
            `border-current/30`,
          )}
          title={`Prioridade: ${config.label} (SLA ${config.slaLabel})`}
        >
          <span>{config.icon}</span>
          {!compact && <span>{config.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {priorities.map((p) => {
          const c = SOLICITACAO_PRIORIDADE_CONFIG[p];
          return (
            <DropdownMenuItem
              key={p}
              onClick={() => atualizarPrioridade({ id: solicitacaoId, prioridade: p })}
              className={cn(p === prioridade && 'font-semibold')}
            >
              <span className="mr-2">{c.icon}</span>
              {c.label}
              <span className="ml-auto text-[10px] text-muted-foreground">SLA {c.slaLabel}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- SLA Badge ----
function SlaBadge({ createdAt, prioridade, status }: { createdAt: string; prioridade: SolicitacaoPrioridade; status: SolicitacaoStatus }) {
  if (status === 'concluida' || status === 'recusada') return null;
  const restante = calcularSlaRestante(createdAt, prioridade);
  const vencido = restante < 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[9px] font-medium',
        vencido ? 'text-red-400 animate-pulse' : 'text-muted-foreground',
      )}
      title={vencido ? 'SLA vencido' : `SLA restante: ${formatarSla(restante)}`}
    >
      {vencido && <AlertTriangle className="h-2.5 w-2.5" />}
      <Clock className="h-2.5 w-2.5" />
      {formatarSla(restante)}
    </span>
  );
}

// ---- Expiration Badge (for completed items) ----
function ExpirationBadge({ createdAt, concluidaAt, status }: { createdAt: string; concluidaAt?: string | null; status: SolicitacaoStatus }) {
  if (status !== 'concluida' || !concluidaAt) return null;
  const restante = calcularExpiracao(createdAt, concluidaAt);
  const label = formatarExpiracao(restante);
  const urgente = restante < 60 * 60 * 1000; // <1h
  const medio = restante < 3 * 60 * 60 * 1000; // <3h

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[9px] font-medium',
        urgente ? 'text-red-400' : medio ? 'text-yellow-400' : 'text-emerald-400',
      )}
      title={label}
    >
      <Timer className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}


function KanbanCard({
  solicitacao,
  onDragStart,
  isMobile,
}: {
  solicitacao: Solicitacao;
  onDragStart: (e: React.DragEvent, id: string) => void;
  isMobile: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const { user } = useAuth();
  const { mutate: atualizarStatus } = useAtualizarStatusSolicitacao();
  const { mutate: excluir, isPending: excluindo } = useExcluirSolicitacao();

  const prio = resolverPrioridade(solicitacao.prioridade);
  const prioConfig = SOLICITACAO_PRIORIDADE_CONFIG[prio];

  const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;

  // Extract bookmaker names from metadata (unified format for all sources)
  const bookmakerNomes: string[] = (() => {
    if (!meta) return [];
    const nomes = meta['bookmaker_nomes'];
    if (typeof nomes === 'string' && nomes.trim()) {
      return nomes.split(',').map((n) => n.trim()).filter(Boolean);
    }
    return [];
  })();

  // Extract bookmaker logos from metadata
  const bookmakerLogos = (meta?.['bookmaker_logos'] as Record<string, string> | undefined) ?? {};

  // Executor names
  const executorNomes: string[] = (() => {
    if (meta) {
      const nomes = meta['executor_nomes'];
      if (Array.isArray(nomes) && nomes.length > 0)
        return (nomes as string[]).map((n) => getFirstLastName(n));
    }
    return solicitacao.executor?.full_name ? [getFirstLastName(solicitacao.executor.full_name)] : ['—'];
  })();

  const valor = solicitacao.valor;

  // Next possible statuses for mobile move action
  const statusFlow: Record<SolicitacaoStatus, SolicitacaoStatus[]> = {
    pendente: ['em_execucao', 'concluida', 'recusada'],
    em_execucao: ['concluida', 'recusada'],
    concluida: [],
    recusada: [],
  };
  const nextStatuses = statusFlow[solicitacao.status];

  // Determine if there's any bookmaker info to show (unified: metadata OR joined relation)
  const hasBookmakers = bookmakerNomes.length > 0;
  // Fallback: legacy single bookmaker from DB join (no metadata)
  const legacyBookmaker = !hasBookmakers && solicitacao.bookmaker ? solicitacao.bookmaker : null;

  return (
    <>
      <Card
        draggable={!isMobile}
        onDragStart={!isMobile ? (e) => onDragStart(e, solicitacao.id) : undefined}
        className={cn(
          'p-3 border-border/50 hover:border-border transition-all hover:shadow-md group border-l-[3px]',
          prioConfig.borderColor,
          !isMobile && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <div className="space-y-2">
          {/* Header: tipo + prioridade flag + SLA + menu */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <Badge variant="secondary" className="text-[10px] font-medium shrink-0">
                {SOLICITACAO_TIPO_LABELS[solicitacao.tipo]}
              </Badge>
              <PriorityFlag prioridade={prio} solicitacaoId={solicitacao.id} compact />
              <SlaBadge createdAt={solicitacao.created_at} prioridade={prio} status={solicitacao.status} />
              <ExpirationBadge createdAt={solicitacao.created_at} concluidaAt={solicitacao.concluida_at} status={solicitacao.status} />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {!isMobile && (
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 min-w-[28px]">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    Editar
                  </DropdownMenuItem>
                  {isMobile && nextStatuses.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {nextStatuses.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => atualizarStatus({ id: solicitacao.id, status: s })}
                          className={s === 'recusada' ? 'text-destructive focus:text-destructive' : ''}
                        >
                          <ArrowRight className="h-3.5 w-3.5 mr-2" />
                          {SOLICITACAO_STATUS_LABELS[s]}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {solicitacao.status === 'pendente' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setConfirmExcluir(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Bookmakers (multi) */}
          {hasBookmakers && (
            <div className="flex flex-wrap gap-1">
              {bookmakerNomes.slice(0, 4).map((nome) => (
                <span
                  key={nome}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                >
                  {bookmakerLogos[nome] && (
                    <img
                      src={bookmakerLogos[nome]}
                      alt={nome}
                      className="h-3 w-3 rounded object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  {nome}
                </span>
              ))}
              {bookmakerNomes.length > 4 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-muted-foreground/30 text-muted-foreground">
                  +{bookmakerNomes.length - 4}
                </span>
              )}
            </div>
          )}

          {/* KYC bookmaker + parceiro */}
          {hasKycInfo && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-emerald-400">{kycBookmakerNome}</span>
              {kycParceiroNome && (
                <>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-foreground">{kycParceiroNome}</span>
                </>
              )}
            </div>
          )}

          {/* Joined bookmaker (legacy / single bookmaker_id) */}
          {!hasBookmakers && !hasKycInfo && solicitacao.bookmaker && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-emerald-400">{solicitacao.bookmaker.nome}</span>
            </div>
          )}

          {/* Destinatário */}
          {solicitacao.destinatario_nome && (
            <div className="flex items-center gap-1 text-xs">
              <User className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="text-muted-foreground">→</span>
              <span className="font-medium text-foreground">{solicitacao.destinatario_nome}</span>
            </div>
          )}

          {/* Valor */}
          {valor != null && valor > 0 && (
            <div className="flex items-center gap-1 text-xs text-primary font-medium">
              <DollarSign className="h-3 w-3" />
              {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          )}

          {/* Descrição preview */}
          {solicitacao.descricao && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              {solicitacao.descricao}
            </p>
          )}

          {/* Footer: executor + tempo */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            <div className="flex items-center gap-1 min-w-0">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{executorNomes.join(', ')}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(solicitacao.created_at), {
                addSuffix: false,
                locale: ptBR,
              })}
            </div>
          </div>
        </div>
      </Card>

      <EditarSolicitacaoDialog
        solicitacao={solicitacao}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={confirmExcluir} onOpenChange={setConfirmExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir solicitação</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Deseja continuar?
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
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---- Kanban Column ----
function KanbanColumn({
  status,
  label,
  color,
  icon,
  items,
  onDragStart,
  onDrop,
  dragOverStatus,
  onDragOver,
  onDragLeave,
  isMobile,
}: {
  status: SolicitacaoStatus;
  label: string;
  color: string;
  icon: string;
  items: Solicitacao[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, status: SolicitacaoStatus) => void;
  dragOverStatus: SolicitacaoStatus | null;
  onDragOver: (e: React.DragEvent, status: SolicitacaoStatus) => void;
  onDragLeave: () => void;
  isMobile: boolean;
}) {
  const isDragOver = dragOverStatus === status;

  if (isMobile) {
    return (
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground/60">
            Nenhuma solicitação
          </div>
        ) : (
          items.map((s) => (
            <KanbanCard key={s.id} solicitacao={s} onDragStart={onDragStart} isMobile={isMobile} />
          ))
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border/50 bg-muted/20 min-w-[280px] flex-1 transition-colors',
        isDragOver && 'border-primary/50 bg-primary/5',
      )}
      onDragOver={(e) => onDragOver(e, status)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, status)}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className={cn('text-sm font-semibold', color)}>{label}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] h-5 min-w-5 justify-center">
          {items.length}
        </Badge>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 max-h-[calc(100vh-320px)]">
        <div className="p-2 space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground/60">
              Nenhuma solicitação
            </div>
          ) : (
            items.map((s) => (
              <KanbanCard key={s.id} solicitacao={s} onDragStart={onDragStart} isMobile={isMobile} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---- Main Kanban ----
export function SolicitacoesKanban({ tipoFilter, responsavelFilter }: Props) {
  const { data: solicitacoes = [] } = useSolicitacoes();
  const { mutate: atualizarStatus } = useAtualizarStatusSolicitacao();
  const [dragOverStatus, setDragOverStatus] = useState<SolicitacaoStatus | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<SolicitacaoStatus>('pendente');

  // Filter
  let filtered = solicitacoes;
  if (tipoFilter) filtered = filtered.filter((s) => s.tipo === tipoFilter);
  if (responsavelFilter) {
    filtered = filtered.filter((s) => {
      const meta = s.contexto_metadata as Record<string, unknown> | null;
      const executorIds = meta?.['executor_ids'];
      if (Array.isArray(executorIds)) return executorIds.includes(responsavelFilter);
      return s.executor_id === responsavelFilter;
    });
  }

  // Group by status
  const grouped: Record<SolicitacaoStatus, Solicitacao[]> = {
    pendente: [],
    em_execucao: [],
    concluida: [],
    recusada: [],
  };
  filtered.forEach((s) => {
    if (grouped[s.status]) grouped[s.status].push(s);
  });

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: SolicitacaoStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, newStatus: SolicitacaoStatus) => {
      e.preventDefault();
      setDragOverStatus(null);
      const id = dragIdRef.current;
      if (!id) return;

      const item = solicitacoes.find((s) => s.id === id);
      if (!item || item.status === newStatus) return;

      atualizarStatus({ id, status: newStatus });
      dragIdRef.current = null;
    },
    [solicitacoes, atualizarStatus],
  );

  // Mobile: tab-based single column
  if (isMobile) {
    const mobileCols = KANBAN_COLUMNS.filter((c) => c.status !== 'recusada');

    return (
      <div className="space-y-3">
        {/* Tabs */}
        <div className="flex items-center border-b border-border overflow-x-auto no-scrollbar">
          {mobileCols.map((col) => (
            <button
              key={col.status}
              onClick={() => setMobileTab(col.status)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap active:scale-95',
                mobileTab === col.status
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground',
              )}
            >
              <span>{col.icon}</span>
              <span>{col.label}</span>
              <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1 justify-center ml-0.5">
                {grouped[col.status].length}
              </Badge>
            </button>
          ))}
        </div>

        {/* Active column content */}
        <KanbanColumn
          status={mobileTab}
          label=""
          color=""
          icon=""
          items={grouped[mobileTab]}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          dragOverStatus={dragOverStatus}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          isMobile
        />
      </div>
    );
  }

  // Desktop: full kanban
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map((col) => (
        <KanbanColumn
          key={col.status}
          status={col.status}
          label={col.label}
          color={col.color}
          icon={col.icon}
          items={grouped[col.status]}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          dragOverStatus={dragOverStatus}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          isMobile={false}
        />
      ))}
    </div>
  );
}
