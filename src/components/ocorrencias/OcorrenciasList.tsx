import { useState } from 'react';
import { useOcorrencias, useAtualizarStatusOcorrencia, useExcluirOcorrencia } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { OcorrenciaDetalheDialog } from './OcorrenciaDetalheDialog';
import type { Ocorrencia, OcorrenciaStatus, OcorrenciaTipo } from '@/types/ocorrencias';
import { STATUS_LABELS, SUB_MOTIVO_LABELS } from '@/types/ocorrencias';
import {
  ChevronDown,
  Clock,
  Eye,
  Inbox,
  Trash2,
  Tag,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  statusFilter?: OcorrenciaStatus[];
  modoMinhas?: boolean;
  tipoFilter?: OcorrenciaTipo | null;
  emptyMessage?: string;
}

const STATUS_TRANSICOES: Record<OcorrenciaStatus, OcorrenciaStatus[]> = {
  aberto: ['em_andamento', 'cancelado'],
  em_andamento: ['aguardando_terceiro', 'resolvido', 'cancelado'],
  aguardando_terceiro: ['em_andamento', 'resolvido', 'cancelado'],
  resolvido: [],
  cancelado: [],
};

export function OcorrenciasList({ statusFilter, modoMinhas, tipoFilter, emptyMessage }: Props) {
  const { user } = useAuth();
  const { isOwnerOrAdmin } = useRole();
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const { mutate: atualizarStatus } = useAtualizarStatusOcorrencia();

  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: ocorrencias = [], isLoading } = useOcorrencias(filters);

  // Filter by user and type
  let lista = modoMinhas
    ? ocorrencias.filter(
        (o) => o.executor_id === user?.id || o.requerente_id === user?.id
      )
    : ocorrencias;

  if (tipoFilter) {
    lista = lista.filter((o) => o.tipo === tipoFilter);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">
          {emptyMessage || 'Nenhuma ocorrência encontrada'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {lista.map((ocorrencia) => (
          <OcorrenciaRow
            key={ocorrencia.id}
            ocorrencia={ocorrencia}
            currentUserId={user?.id}
            isAdmin={isOwnerOrAdmin}
            onVerDetalhe={() => setDetalheId(ocorrencia.id)}
            onAtualizarStatus={(novoStatus) =>
              atualizarStatus({
                id: ocorrencia.id,
                novoStatus,
                statusAnterior: ocorrencia.status,
              })
            }
          />
        ))}
      </div>

      {detalheId && (
        <OcorrenciaDetalheDialog
          ocorrenciaId={detalheId}
          open={!!detalheId}
          onOpenChange={(open) => !open && setDetalheId(null)}
        />
      )}
    </>
  );
}

function OcorrenciaRow({
  ocorrencia,
  currentUserId,
  isAdmin,
  onVerDetalhe,
  onAtualizarStatus,
}: {
  ocorrencia: Ocorrencia;
  currentUserId?: string;
  isAdmin: boolean;
  onVerDetalhe: () => void;
  onAtualizarStatus: (status: OcorrenciaStatus) => void;
}) {
  const { mutate: excluir, isPending: excluindo } = useExcluirOcorrencia();
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const isExecutor = ocorrencia.executor_id === currentUserId;
  const transicoes = STATUS_TRANSICOES[ocorrencia.status];
  const temAcoes = transicoes.length > 0 || isAdmin;

  const subMotivoLabel = ocorrencia.sub_motivo
    ? SUB_MOTIVO_LABELS[ocorrencia.sub_motivo] || ocorrencia.sub_motivo
    : null;

  return (
    <>
      <Card
        className="hover:border-primary/30 transition-colors cursor-pointer group"
        onClick={onVerDetalhe}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            {/* Main content */}
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
                {isExecutor && (
                  <Badge variant="outline" className="text-xs py-0 px-1.5 text-primary border-primary/40">
                    Sua responsabilidade
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                        onClick={() => onAtualizarStatus(s)}
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
        </CardContent>
      </Card>

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
    </>
  );
}
