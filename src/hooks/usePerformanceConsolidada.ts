import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProjetoPerformance } from './useProjetoPerformance';
import { PerformanceConsolidada, PeriodoAnalise } from '@/types/performance';
import { useWorkspace } from './useWorkspace';

interface UsePerformanceConsolidadaReturn {
  consolidada: PerformanceConsolidada | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePerformanceConsolidada(periodo: PeriodoAnalise): UsePerformanceConsolidadaReturn {
  const { workspaceId } = useWorkspace();
  
  // Reutiliza o hook de projeto sem projetoId = busca todos
  const { metrics, loading: loadingMetrics, error, refresh } = useProjetoPerformance({
    projetoId: undefined,
    periodo,
  });

  const [consolidada, setConsolidada] = useState<PerformanceConsolidada | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(true);

  const fetchExtraMetrics = useCallback(async () => {
    // CRITICAL: Não fazer query sem workspaceId
    if (!workspaceId) {
      return {
        totalProjetos: 0,
        projetosAtivos: 0,
        totalBookmakers: 0,
        totalOperadores: 0,
      };
    }

    const [projetos, bookmakers, operadores] = await Promise.all([
      supabase.from('projetos').select('id, status').eq('workspace_id', workspaceId),
      supabase.from('bookmakers').select('id').eq('workspace_id', workspaceId),
      supabase.from('operador_projetos').select('id').eq('status', 'ATIVO'),
    ]);

    return {
      totalProjetos: projetos.data?.length || 0,
      projetosAtivos: projetos.data?.filter(p => p.status === 'EM_ANDAMENTO').length || 0,
      totalBookmakers: bookmakers.data?.length || 0,
      totalOperadores: operadores.data?.length || 0,
    };
  }, [workspaceId]);

  useEffect(() => {
    // Aguardar workspace estar disponível
    if (!workspaceId) {
      setConsolidada(null);
      setLoadingExtra(false);
      return;
    }

    if (!metrics) return;

    setLoadingExtra(true);
    fetchExtraMetrics().then(extra => {
      setConsolidada({
        ...metrics,
        ...extra,
      });
      setLoadingExtra(false);
    });
  }, [metrics, fetchExtraMetrics, workspaceId]);

  return {
    consolidada,
    loading: loadingMetrics || loadingExtra,
    error,
    refresh,
  };
}
