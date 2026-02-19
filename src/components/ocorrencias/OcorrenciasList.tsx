import { useState } from 'react';
import { useOcorrencias, useAtualizarStatusOcorrencia } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
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
import { PrioridadeBadge, StatusBadge, TipoBadge, SlaBadge } from './OcorrenciaBadges';
import { OcorrenciaDetalheDialog } from './OcorrenciaDetalheDialog';
import type { Ocorrencia, OcorrenciaStatus } from '@/types/ocorrencias';
import { STATUS_LABELS } from '@/types/ocorrencias';
import {
  ChevronDown,
  Clock,
  User,
  Eye,
  Inbox,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  statusFilter?: OcorrenciaStatus[];
  modoMinhas?: boolean;
  emptyMessage?: string;
}

const STATUS_TRANSICOES: Record<OcorrenciaStatus, OcorrenciaStatus[]> = {
  aberto: ['em_andamento', 'cancelado'],
  em_andamento: ['aguardando_terceiro', 'resolvido', 'cancelado'],
  aguardando_terceiro: ['em_andamento', 'resolvido', 'cancelado'],
  resolvido: [],
  cancelado: [],
};

export function OcorrenciasList({ statusFilter, modoMinhas, emptyMessage }: Props) {
  const { user } = useAuth();
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const { mutate: atualizarStatus } = useAtualizarStatusOcorrencia();

  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: ocorrencias = [], isLoading } = useOcorrencias(filters);

  // Filtro "Minhas"
  const lista = modoMinhas
    ? ocorrencias.filter(
        (o) => o.executor_id === user?.id || o.requerente_id === user?.id
      )
    : ocorrencias;

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
  onVerDetalhe,
  onAtualizarStatus,
}: {
  ocorrencia: Ocorrencia;
  currentUserId?: string;
  onVerDetalhe: () => void;
  onAtualizarStatus: (status: OcorrenciaStatus) => void;
}) {
  const isExecutor = ocorrencia.executor_id === currentUserId;
  const transicoes = STATUS_TRANSICOES[ocorrencia.status];

  return (
    <Card
      className="hover:border-primary/30 transition-colors cursor-pointer group"
      onClick={onVerDetalhe}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Conteúdo principal */}
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
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(ocorrencia.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
              {isExecutor && (
                <Badge variant="outline" className="text-xs py-0 px-1.5 text-primary border-primary/40">
                  Sua responsabilidade
                </Badge>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onVerDetalhe}
            >
              <Eye className="h-4 w-4" />
            </Button>

            {transicoes.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Status
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
