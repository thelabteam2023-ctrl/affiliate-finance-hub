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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, getFirstLastName } from '@/lib/utils';
import { useSolicitacoes, useAtualizarStatusSolicitacao } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import {
  SOLICITACAO_TIPO_LABELS,
  SOLICITACAO_PRIORIDADE_LABELS,
  SOLICITACAO_PRIORIDADE_COLORS,
  SOLICITACAO_STATUS_LABELS,
  KANBAN_COLUMNS,
} from '@/types/solicitacoes';
import type { Solicitacao, SolicitacaoStatus, SolicitacaoTipo } from '@/types/solicitacoes';
import {
  MoreHorizontal,
  User,
  Clock,
  DollarSign,
  GripVertical,
} from 'lucide-react';
import { EditarSolicitacaoDialog } from './EditarSolicitacaoDialog';

interface Props {
  tipoFilter?: SolicitacaoTipo | null;
  responsavelFilter?: string | null;
}

// ---- Kanban Card ----
function KanbanCard({
  solicitacao,
  onDragStart,
}: {
  solicitacao: Solicitacao;
  onDragStart: (e: React.DragEvent, id: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const { user } = useAuth();

  const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;
  const bookmakerNomes: string[] = (() => {
    if (!meta) return [];
    const nomes = meta['bookmaker_nomes'];
    if (typeof nomes === 'string' && nomes.trim()) {
      return nomes.split(',').map((n) => n.trim()).filter(Boolean);
    }
    return [];
  })();

  const executorNomes: string[] = (() => {
    if (meta) {
      const nomes = meta['executor_nomes'];
      if (Array.isArray(nomes) && nomes.length > 0)
        return (nomes as string[]).map((n) => getFirstLastName(n));
    }
    return solicitacao.executor?.full_name ? [getFirstLastName(solicitacao.executor.full_name)] : ['—'];
  })();

  const valor = (solicitacao as Record<string, unknown>).valor as number | null;

  return (
    <>
      <Card
        draggable
        onDragStart={(e) => onDragStart(e, solicitacao.id)}
        className="p-3 cursor-grab active:cursor-grabbing border-border/50 hover:border-border transition-all hover:shadow-md group"
      >
        <div className="space-y-2">
          {/* Header: tipo + prioridade */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <Badge variant="secondary" className="text-[10px] font-medium shrink-0">
                {SOLICITACAO_TIPO_LABELS[solicitacao.tipo]}
              </Badge>
              <Badge
                variant="outline"
                className={cn('text-[10px]', SOLICITACAO_PRIORIDADE_COLORS[solicitacao.prioridade])}
              >
                {SOLICITACAO_PRIORIDADE_LABELS[solicitacao.prioridade]}
              </Badge>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    Editar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Bookmakers */}
          {bookmakerNomes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {bookmakerNomes.slice(0, 3).map((nome) => (
                <span
                  key={nome}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                >
                  {nome}
                </span>
              ))}
              {bookmakerNomes.length > 3 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-muted-foreground/30 text-muted-foreground">
                  +{bookmakerNomes.length - 3}
                </span>
              )}
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
}) {
  const isDragOver = dragOverStatus === status;

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
              <KanbanCard key={s.id} solicitacao={s} onDragStart={onDragStart} />
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
        />
      ))}
    </div>
  );
}
