import { useState, useMemo } from 'react';
import { useOcorrencias } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { OcorrenciaItem } from './OcorrenciaItem';
import { OcorrenciaDrawer } from './OcorrenciaDrawer';
import type { OcorrenciaStatus, OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Props {
  statusFilter?: OcorrenciaStatus[];
  modoMinhas?: boolean;
  tipoFilter?: OcorrenciaTipo | null;
  emptyMessage?: string;
}

function useBookmakerInfo(ids: string[]) {
  return useQuery({
    queryKey: ['bookmaker-info', ids],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const { data } = await supabase
        .from('bookmakers')
        .select('id, nome, parceiro_id, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url), parceiros!bookmakers_parceiro_id_fkey (nome)')
        .in('id', ids);
      const map: Record<string, { nome: string; logo_url: string | null; parceiroNome: string | null }> = {};
      data?.forEach((b: any) => {
        map[b.id] = {
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
          parceiroNome: b.parceiros?.nome || null,
        };
      });
      return map;
    },
    enabled: ids.length > 0,
  });
}

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

export function OcorrenciasList({ statusFilter, modoMinhas, tipoFilter, emptyMessage }: Props) {
  const { user } = useAuth();
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const filters = useMemo(() => statusFilter ? { status: statusFilter } : undefined, [statusFilter]);
  const { data: ocorrencias = [], isLoading, isError, error, refetch } = useOcorrencias(filters);

  // Filter by user and type
  const lista = useMemo(() => {
    let base = modoMinhas
      ? ocorrencias.filter(
          (o) => o.executor_id === user?.id || o.requerente_id === user?.id
        )
      : ocorrencias;

    if (tipoFilter) {
      base = base.filter((o) => o.tipo === tipoFilter);
    }
    return base;
  }, [ocorrencias, modoMinhas, user?.id, tipoFilter]);

  // Collect entity IDs for batch fetching
  const bookmakerIds = useMemo(
    () => [...new Set(lista.filter((o) => o.bookmaker_id).map((o) => o.bookmaker_id!))],
    [lista]
  );
  const projetoIds = useMemo(
    () => [...new Set(lista.filter((o) => o.projeto_id).map((o) => o.projeto_id!))],
    [lista]
  );

  const { data: bookmakerMap = {} } = useBookmakerInfo(bookmakerIds);
  const { data: projetoMap = {} } = useProjetoNames(projetoIds);

  const PRIORIDADE_ORDER: OcorrenciaPrioridade[] = ['urgente', 'alta', 'media', 'baixa'];

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
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-destructive/5 rounded-xl border border-dashed border-destructive/30">
        <Inbox className="h-10 w-10 text-destructive/30 mb-3" />
        <p className="text-sm text-destructive font-medium mb-4">
          Erro ao carregar ocorrências: {(error as Error)?.message || 'Erro desconhecido'}
        </p>
        <button 
          onClick={() => refetch()}
          className="text-xs px-4 py-2 bg-destructive text-white rounded-md hover:bg-destructive/90"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-muted/10 rounded-xl border border-dashed border-border/60">
        <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground font-medium">
          {emptyMessage || 'Nenhuma ocorrência encontrada'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activePrioridades.map((prioridade) => (
        <div key={prioridade} className="space-y-2">
          {/* Priority Separator */}
          <div className="flex items-center gap-3 px-1 py-1">
             <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
                {prioridade} — {groupedByPrioridade[prioridade].length}
             </span>
             <div className="h-px flex-1 bg-border/30" />
          </div>

          {/* List of items */}
          <div className="space-y-1">
            {groupedByPrioridade[prioridade].map((ocorrencia) => (
              <OcorrenciaItem
                key={ocorrencia.id}
                ocorrencia={ocorrencia}
                currentUserId={user?.id}
                onOpen={() => {
                  setDetalheId(ocorrencia.id);
                }}
                bookmakerNome={ocorrencia.bookmaker_id ? bookmakerMap[ocorrencia.bookmaker_id]?.nome : undefined}
                bookmakerLogoUrl={ocorrencia.bookmaker_id ? bookmakerMap[ocorrencia.bookmaker_id]?.logo_url : undefined}
                projetoNome={ocorrencia.projeto_id ? projetoMap[ocorrencia.projeto_id] : undefined}
                parceiroNome={ocorrencia.bookmaker_id ? bookmakerMap[ocorrencia.bookmaker_id]?.parceiroNome ?? undefined : undefined}
              />
            ))}
          </div>
        </div>
      ))}

      <OcorrenciaDrawer
        ocorrenciaId={detalheId || ''}
        open={!!detalheId}
        onOpenChange={(open) => {
          if (!open) setDetalheId(null);
        }}
      />
    </div>
  );
}
