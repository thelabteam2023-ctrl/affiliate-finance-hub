import { useState, useMemo } from 'react';
import { useOcorrencias, useAtualizarStatusOcorrencia } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Skeleton } from '@/components/ui/skeleton';
import { OcorrenciaCollapseCard } from './OcorrenciaCollapseCard';
import { OcorrenciaDetalheDialog } from './OcorrenciaDetalheDialog';
import type { OcorrenciaStatus, OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { PRIORIDADE_LABELS, PRIORIDADE_COLORS, PRIORIDADE_BG } from '@/types/ocorrencias';
import { Inbox, Zap, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Props {
  statusFilter?: OcorrenciaStatus[];
  modoMinhas?: boolean;
  tipoFilter?: OcorrenciaTipo | null;
  emptyMessage?: string;
}

/** Fetch bookmaker names for a set of IDs */
function useBookmakerNames(ids: string[]) {
  return useQuery({
    queryKey: ['bookmaker-names', ids],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const { data } = await supabase
        .from('bookmakers')
        .select('id, nome')
        .in('id', ids);
      const map: Record<string, string> = {};
      data?.forEach((b) => { map[b.id] = b.nome; });
      return map;
    },
    enabled: ids.length > 0,
  });
}

/** Fetch projeto names */
function useProjetoNames(ids: string[]) {
  return useQuery({
    queryKey: ['projeto-names', ids],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const { data } = await supabase
        .from('projetos')
        .select('id, nome')
        .in('id', ids);
      const map: Record<string, string> = {};
      data?.forEach((p) => { map[p.id] = p.nome; });
      return map;
    },
    enabled: ids.length > 0,
  });
}

/** Fetch parceiro names */
function useParceiroNames(ids: string[]) {
  return useQuery({
    queryKey: ['parceiro-names', ids],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const { data } = await supabase
        .from('parceiros')
        .select('id, nome')
        .in('id', ids);
      const map: Record<string, string> = {};
      data?.forEach((p) => { map[p.id] = p.nome; });
      return map;
    },
    enabled: ids.length > 0,
  });
}

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

  // Collect entity IDs for batch fetching
  const bookmakerIds = useMemo(
    () => [...new Set(lista.filter((o) => o.bookmaker_id).map((o) => o.bookmaker_id!))],
    [lista]
  );
  const projetoIds = useMemo(
    () => [...new Set(lista.filter((o) => o.projeto_id).map((o) => o.projeto_id!))],
    [lista]
  );
  const parceiroIds = useMemo(
    () => [...new Set(lista.filter((o) => o.parceiro_id).map((o) => o.parceiro_id!))],
    [lista]
  );

  const { data: bookmakerMap = {} } = useBookmakerNames(bookmakerIds);
  const { data: projetoMap = {} } = useProjetoNames(projetoIds);
  const { data: parceiroMap = {} } = useParceiroNames(parceiroIds);

  // Group by priority for kanban columns
  const PRIORIDADE_ORDER: OcorrenciaPrioridade[] = ['urgente', 'alta', 'media', 'baixa'];

  const PRIORIDADE_ICONS: Record<OcorrenciaPrioridade, React.ReactNode> = {
    urgente: <Zap className="h-4 w-4" />,
    alta: <AlertTriangle className="h-4 w-4" />,
    media: <ArrowUp className="h-4 w-4" />,
    baixa: <ArrowDown className="h-4 w-4" />,
  };

  const groupedByPrioridade = useMemo(() => {
    const groups: Record<OcorrenciaPrioridade, typeof lista> = {
      urgente: [],
      alta: [],
      media: [],
      baixa: [],
    };
    lista.forEach((o) => {
      groups[o.prioridade].push(o);
    });
    return groups;
  }, [lista]);

  const activePrioridades = PRIORIDADE_ORDER.filter(
    (p) => groupedByPrioridade[p].length > 0
  );

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

  const renderCard = (ocorrencia: typeof lista[0]) => (
    <OcorrenciaCollapseCard
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
      bookmakerNome={ocorrencia.bookmaker_id ? bookmakerMap[ocorrencia.bookmaker_id] : undefined}
      projetoNome={ocorrencia.projeto_id ? projetoMap[ocorrencia.projeto_id] : undefined}
      parceiroNome={ocorrencia.parceiro_id ? parceiroMap[ocorrencia.parceiro_id] : undefined}
    />
  );

  return (
    <>
      <div
        className={cn(
          'grid gap-4',
          activePrioridades.length === 1 && 'grid-cols-1',
          activePrioridades.length === 2 && 'grid-cols-1 md:grid-cols-2',
          activePrioridades.length === 3 && 'grid-cols-1 md:grid-cols-3',
          activePrioridades.length >= 4 && 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
        )}
      >
        {activePrioridades.map((prioridade) => (
          <div key={prioridade} className="flex flex-col gap-2">
            {/* Column header */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border',
                PRIORIDADE_BG[prioridade],
                PRIORIDADE_COLORS[prioridade]
              )}
            >
              {PRIORIDADE_ICONS[prioridade]}
              <span className="font-semibold text-sm">
                {PRIORIDADE_LABELS[prioridade]}
              </span>
              <span className="ml-auto text-xs opacity-70 font-medium">
                {groupedByPrioridade[prioridade].length}
              </span>
            </div>
            {/* Cards */}
            <div className="space-y-2">
              {groupedByPrioridade[prioridade].map(renderCard)}
            </div>
          </div>
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
