import { useState, useMemo, useEffect } from 'react';
import { useOcorrencias } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { OcorrenciaItem } from './OcorrenciaItem';
import { OcorrenciaDrawer } from './OcorrenciaDrawer';
import type { OcorrenciaStatus, OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { Inbox, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
      const { data, error } = await supabase
        .from('bookmakers')
        .select('id, nome, parceiro_id, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url), parceiros!bookmakers_parceiro_id_fkey (nome)')
        .in('id', ids);
      
      if (error) {
        console.error('[OcorrenciasList] Error fetching bookmaker info:', error);
        return {};
      }

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
      const { data, error } = await supabase
        .from('projetos')
        .select('id, nome')
        .in('id', ids);

      if (error) {
        console.error('[OcorrenciasList] Error fetching project names:', error);
        return {};
      }

      const map: Record<string, string> = {};
      data?.forEach((p) => { map[p.id] = p.nome; });
      return map;
    },
    enabled: ids.length > 0,
  });
}

export function OcorrenciasList({ statusFilter, modoMinhas, tipoFilter, emptyMessage }: Props) {
  const { user, workspaceId } = useAuth();
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const filters = useMemo(() => ({
    status: statusFilter,
    workspaceId
  }), [statusFilter, workspaceId]);

  const { 
    data: ocorrencias = [], 
    isLoading, 
    isError, 
    error, 
    refetch,
    isRefetching
  } = useOcorrencias(statusFilter ? { status: statusFilter } : undefined);

  // Observability: Log data flow issues
  useEffect(() => {
    if (isError) {
      console.error('[OcorrenciasList] failed to load:', error);
    }
  }, [isError, error]);

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

  if (isLoading || (isRefetching && !ocorrencias.length)) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-destructive/5 rounded-xl border border-dashed border-destructive/30 px-6">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <h3 className="text-lg font-semibold text-destructive mb-2">Erro no carregamento</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Não foi possível conectar ao servidor para buscar as ocorrências. 
          Verifique sua conexão ou tente novamente.
        </p>
        <Button 
          onClick={() => refetch()}
          className="gap-2"
        >
          Tentar novamente
        </Button>
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
          <div className="flex items-center gap-3 px-1 py-1">
             <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
                {prioridade} — {groupedByPrioridade[prioridade].length}
             </span>
             <div className="h-px flex-1 bg-border/30" />
          </div>

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
          if (!open) {
            setDetalheId(null);
          }
        }}
      />

    </div>
  );
}
