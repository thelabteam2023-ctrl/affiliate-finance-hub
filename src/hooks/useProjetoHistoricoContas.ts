/**
 * Hook para obter histórico e indicadores operacionais de contas de um projeto
 * 
 * REGRA CRÍTICA: Contadores históricos NUNCA diminuem.
 * Representam o passado operacional do projeto, não o estado atual.
 * 
 * Dados vêm de:
 * - bookmakers (vínculos atuais)
 * - projeto_bookmaker_historico (vínculos históricos)
 * - project_bookmaker_link_bonuses (bônus ativos)
 * - parceiros (parceiros únicos)
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface HistoricoContasResult {
  // BLOCO A — Estado Atual
  contasAtuais: number;
  contasAtivas: number;
  contasLimitadas: number;
  parceirosAtivos: number;
  
  // BLOCO B — Histórico Consolidado (NUNCA diminui)
  historicoTotalContas: number;       // Total de contas já usadas
  historicoContasLimitadas: number;   // Total de contas que já foram limitadas
  historicoParceirosUnicos: number;   // Total de parceiros únicos que já passaram pelo projeto
  
  // BLOCO C — Indicadores Operacionais
  casasComBonus: number;              // Casas (bookmaker_catalogo) com bônus ativo
  contasComBonus: number;             // Contas (bookmakers) com bônus ativo
  parceirosComContasVinculadas: number; // Parceiros que têm contas atualmente vinculadas
  
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useProjetoHistoricoContas(projetoId: string): HistoricoContasResult {
  // Query principal unificada
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto-painel-contas", projetoId],
    queryFn: async () => {
      // 1. Buscar bookmakers atualmente vinculados
      const { data: bookmarkersAtuais, error: bookmarkersError } = await supabase
        .from("bookmakers")
        .select("id, status, parceiro_id, bookmaker_catalogo_id")
        .eq("projeto_id", projetoId);
      
      if (bookmarkersError) throw bookmarkersError;

      // 2. Buscar histórico de vínculos
      const { data: historicoData, error: historicoError } = await supabase
        .from("projeto_bookmaker_historico")
        .select("id, bookmaker_id, parceiro_id, status_final")
        .eq("projeto_id", projetoId);
      
      if (historicoError) throw historicoError;

      // 3. Buscar bônus ativos (creditados)
      const { data: bonusData, error: bonusError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("id, bookmaker_id, status")
        .eq("project_id", projetoId)
        .eq("status", "credited");
      
      if (bonusError) throw bonusError;

      // ============ BLOCO A — Estado Atual ============
      const contasAtuais = bookmarkersAtuais?.length || 0;
      const contasAtivas = bookmarkersAtuais?.filter(b => 
        b.status?.toUpperCase() === "ATIVO"
      ).length || 0;
      const contasLimitadas = bookmarkersAtuais?.filter(b => 
        b.status?.toUpperCase() === "LIMITADA"
      ).length || 0;
      
      // Parceiros ativos = parceiros únicos com contas atualmente vinculadas
      const parceirosIdsAtuais = new Set(
        bookmarkersAtuais?.map(b => b.parceiro_id).filter(Boolean) || []
      );
      const parceirosAtivos = parceirosIdsAtuais.size;

      // ============ BLOCO B — Histórico Consolidado ============
      // Combinar IDs únicos de histórico + atuais
      const idsHistorico = new Set(historicoData?.map(h => h.bookmaker_id) || []);
      const idsAtuais = new Set(bookmarkersAtuais?.map(b => b.id) || []);
      
      // Total histórico = união de todos os bookmakers já vinculados
      const todosBookmakerIds = new Set([...idsHistorico, ...idsAtuais]);
      const historicoTotalContas = todosBookmakerIds.size;
      
      // Limitações: histórico (status_final = 'limitada') + atuais limitadas
      const limitadasHistorico = new Set(
        historicoData?.filter(h => 
          h.status_final?.toLowerCase() === "limitada"
        ).map(h => h.bookmaker_id) || []
      );
      const limitadasAtuais = new Set(
        bookmarkersAtuais?.filter(b => 
          b.status?.toLowerCase() === "limitada"
        ).map(b => b.id) || []
      );
      const todasLimitadas = new Set([...limitadasHistorico, ...limitadasAtuais]);
      const historicoContasLimitadas = todasLimitadas.size;
      
      // Parceiros únicos histórico = união de parceiros do histórico + atuais
      const parceirosHistorico = new Set(
        historicoData?.map(h => h.parceiro_id).filter(Boolean) || []
      );
      const todosParceirosIds = new Set([...parceirosHistorico, ...parceirosIdsAtuais]);
      const historicoParceirosUnicos = todosParceirosIds.size;

      // ============ BLOCO C — Indicadores Operacionais ============
      // Bookmakers com bônus ativo
      const bookmakersComBonus = new Set(
        bonusData?.map(b => b.bookmaker_id) || []
      );
      const contasComBonus = bookmakersComBonus.size;
      
      // Casas (bookmaker_catalogo) com bônus = extrair catalogo_ids únicos das contas com bônus
      const catalogosComBonus = new Set(
        bookmarkersAtuais
          ?.filter(b => bookmakersComBonus.has(b.id) && b.bookmaker_catalogo_id)
          .map(b => b.bookmaker_catalogo_id) || []
      );
      const casasComBonus = catalogosComBonus.size;
      
      // Parceiros com contas vinculadas (atualmente)
      const parceirosComContasVinculadas = parceirosAtivos;

      return {
        // BLOCO A
        contasAtuais,
        contasAtivas,
        contasLimitadas,
        parceirosAtivos,
        // BLOCO B
        historicoTotalContas,
        historicoContasLimitadas,
        historicoParceirosUnicos,
        // BLOCO C
        casasComBonus,
        contasComBonus,
        parceirosComContasVinculadas,
      };
    },
    enabled: !!projetoId,
    staleTime: 30000,
  });

  return {
    // BLOCO A — Estado Atual
    contasAtuais: data?.contasAtuais || 0,
    contasAtivas: data?.contasAtivas || 0,
    contasLimitadas: data?.contasLimitadas || 0,
    parceirosAtivos: data?.parceirosAtivos || 0,
    
    // BLOCO B — Histórico Consolidado
    historicoTotalContas: data?.historicoTotalContas || 0,
    historicoContasLimitadas: data?.historicoContasLimitadas || 0,
    historicoParceirosUnicos: data?.historicoParceirosUnicos || 0,
    
    // BLOCO C — Indicadores Operacionais
    casasComBonus: data?.casasComBonus || 0,
    contasComBonus: data?.contasComBonus || 0,
    parceirosComContasVinculadas: data?.parceirosComContasVinculadas || 0,
    
    isLoading,
    isError,
    refetch,
  };
}
