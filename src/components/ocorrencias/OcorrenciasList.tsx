import { useState, useMemo } from 'react';
import { useOcorrencias, useAtualizarStatusOcorrencia } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Skeleton } from '@/components/ui/skeleton';
import { OcorrenciaCollapseCard } from './OcorrenciaCollapseCard';
import { OcorrenciaDetalheDialog } from './OcorrenciaDetalheDialog';
import type { OcorrenciaStatus, OcorrenciaTipo } from '@/types/ocorrencias';
import { Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

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
