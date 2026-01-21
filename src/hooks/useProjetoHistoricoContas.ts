/**
 * Hook para obter histórico de contas de um projeto
 * 
 * REGRA CRÍTICA: Este contador NUNCA diminui.
 * Representa o passado operacional do projeto, não o estado atual.
 * 
 * Dados vêm de:
 * - projeto_bookmaker_historico (vínculos históricos)
 * - status_final para identificar limitações passadas
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface HistoricoContasResult {
  // Estado atual (bookmakers atualmente vinculados)
  contasAtuais: number;
  contasAtivas: number;
  contasLimitadas: number;
  
  // Histórico consolidado (NUNCA diminui)
  historicoTotalContas: number;       // Total de contas já usadas
  historicoContasLimitadas: number;   // Total de contas que já foram limitadas
  
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useProjetoHistoricoContas(projetoId: string): HistoricoContasResult {
  // Query para estado atual (bookmakers vinculados ao projeto)
  const { data: estadoAtual, isLoading: loadingAtual, refetch: refetchAtual } = useQuery({
    queryKey: ["projeto-contas-atuais", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, status")
        .eq("projeto_id", projetoId);
      
      if (error) throw error;
      
      const total = data?.length || 0;
      const ativas = data?.filter(b => 
        b.status?.toUpperCase() === "ATIVO"
      ).length || 0;
      const limitadas = data?.filter(b => 
        b.status?.toUpperCase() === "LIMITADA"
      ).length || 0;
      
      return { total, ativas, limitadas };
    },
    enabled: !!projetoId,
    staleTime: 30000,
  });

  // Query para histórico consolidado (projeto_bookmaker_historico)
  const { data: historico, isLoading: loadingHistorico, isError, refetch: refetchHistorico } = useQuery({
    queryKey: ["projeto-historico-contas", projetoId],
    queryFn: async () => {
      // Buscar todos os registros históricos do projeto
      const { data: historicoData, error: historicoError } = await supabase
        .from("projeto_bookmaker_historico")
        .select("id, bookmaker_id, status_final")
        .eq("projeto_id", projetoId);
      
      if (historicoError) throw historicoError;
      
      // Buscar bookmakers atualmente vinculados (para garantir contagem completa)
      const { data: vinculadosAtuais, error: vinculadosError } = await supabase
        .from("bookmakers")
        .select("id, status")
        .eq("projeto_id", projetoId);
      
      if (vinculadosError) throw vinculadosError;
      
      // Combinar IDs únicos de histórico + atuais
      const idsHistorico = new Set(historicoData?.map(h => h.bookmaker_id) || []);
      const idsAtuais = new Set(vinculadosAtuais?.map(b => b.id) || []);
      
      // Total histórico = união de todos os bookmakers já vinculados
      const todosIds = new Set([...idsHistorico, ...idsAtuais]);
      const historicoTotalContas = todosIds.size;
      
      // Contar limitações: histórico (status_final = 'limitada') + atuais limitadas
      const limitadasHistorico = new Set(
        historicoData?.filter(h => 
          h.status_final?.toLowerCase() === "limitada"
        ).map(h => h.bookmaker_id) || []
      );
      
      const limitadasAtuais = new Set(
        vinculadosAtuais?.filter(b => 
          b.status?.toLowerCase() === "limitada"
        ).map(b => b.id) || []
      );
      
      // União de limitações (mesmo bookmaker pode aparecer nos dois)
      const todasLimitadas = new Set([...limitadasHistorico, ...limitadasAtuais]);
      const historicoContasLimitadas = todasLimitadas.size;
      
      return {
        historicoTotalContas,
        historicoContasLimitadas,
      };
    },
    enabled: !!projetoId,
    staleTime: 60000, // Histórico muda menos frequentemente
  });

  const refetch = () => {
    refetchAtual();
    refetchHistorico();
  };

  return {
    // Estado atual
    contasAtuais: estadoAtual?.total || 0,
    contasAtivas: estadoAtual?.ativas || 0,
    contasLimitadas: estadoAtual?.limitadas || 0,
    
    // Histórico consolidado
    historicoTotalContas: historico?.historicoTotalContas || 0,
    historicoContasLimitadas: historico?.historicoContasLimitadas || 0,
    
    isLoading: loadingAtual || loadingHistorico,
    isError,
    refetch,
  };
}
