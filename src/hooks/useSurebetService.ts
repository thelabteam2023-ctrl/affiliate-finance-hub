/**
 * Hook de serviço para Surebets - Motor Financeiro v7
 * 
 * Usa exclusivamente ApostaService para todas as operações.
 * NENHUMA operação direta no banco ou cálculo de saldo.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { criarAposta, deletarAposta, liquidarAposta, reliquidarAposta } from "@/services/aposta";
import type { PernaInput } from "@/services/aposta/types";

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export interface SurebetPerna {
  bookmakerId: string;
  bookmakerNome?: string;
  stake: number;
  odd: number;
  selecao: string;
  selecaoLivre?: string;
  moeda?: string;
  fonteSaldo?: 'REAL' | 'FREEBET';
  stakeBrlReferencia?: number;
  cotacaoSnapshot?: number;
  cotacaoSnapshotAt?: string;
}

export interface SurebetData {
  projetoId: string;
  workspaceId: string;
  userId: string;
  estrategia: string;
  contexto?: string;
  evento: string;
  esporte?: string;
  mercado?: string;
  modelo?: string;
  pernas: SurebetPerna[];
}

export interface UseSurebetServiceReturn {
  criarSurebet: (data: SurebetData) => Promise<{ success: boolean; id?: string; error?: string }>;
  atualizarSurebet: (id: string, data: Partial<SurebetData>) => Promise<{ success: boolean; error?: string }>;
  liquidarPerna: (pernaId: string, resultado: string, lucroPrejuizo?: number) => Promise<{ success: boolean; error?: string }>;
  deletarSurebet: (id: string, projetoId: string) => Promise<{ success: boolean; error?: string }>;
  reliquidarPerna: (pernaId: string, novoResultado: string, lucroPrejuizo?: number) => Promise<{ success: boolean; error?: string }>;
}

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================

export function useSurebetService(): UseSurebetServiceReturn {
  const queryClient = useQueryClient();

  // Invalidar grupo FINANCIAL_STATE completo
  const invalidateSaldos = useCallback((projetoId: string) => {
    // Saldos
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
    queryClient.invalidateQueries({ queryKey: ["saldo-operavel-rpc", projetoId] });
    
    // Apostas
    queryClient.invalidateQueries({ queryKey: ["apostas", projetoId] });
    
    // Vínculos
    queryClient.invalidateQueries({ queryKey: ["projeto-vinculos", projetoId] });
    
    // KPIs
    queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns", projetoId] });
    
    // Exposição
    queryClient.invalidateQueries({ queryKey: ["exposicao-projeto", projetoId] });
    
    // Parceiros
    queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["parceiro-consolidado"] });
    
    // Calendário RPC
    queryClient.invalidateQueries({ queryKey: ["calendar-apostas-rpc", projetoId] });
    
    console.log(`[useSurebetService] Invalidated FINANCIAL_STATE for project ${projetoId}`);
  }, [queryClient]);

  /**
   * Cria uma surebet usando ApostaService.
   * Cada perna é registrada na tabela apostas_pernas.
   */
  const criarSurebet = useCallback(async (data: SurebetData): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
      // Transformar pernas para o formato do ApostaService
      const pernas: PernaInput[] = data.pernas.map((p, index) => ({
        bookmaker_id: p.bookmakerId,
        bookmaker_nome: p.bookmakerNome,
        stake: p.stake,
        odd: p.odd,
        selecao: p.selecao,
        selecao_livre: p.selecaoLivre,
        moeda: p.moeda || 'BRL',
        fonte_saldo: (p.fonteSaldo || 'REAL') as 'REAL' | 'FREEBET',
        stake_brl_referencia: p.stakeBrlReferencia,
        cotacao_snapshot: p.cotacaoSnapshot,
        cotacao_snapshot_at: p.cotacaoSnapshotAt,
        ordem: index + 1,
      }));

      const result = await criarAposta({
        projeto_id: data.projetoId,
        workspace_id: data.workspaceId,
        user_id: data.userId,
        forma_registro: 'ARBITRAGEM',
        estrategia: data.estrategia as any,
        contexto_operacional: (data.contexto || 'NORMAL') as any,
        data_aposta: new Date().toISOString(),
        evento: data.evento,
        esporte: data.esporte,
        mercado: data.mercado,
        modelo: data.modelo,
        pernas,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error?.message || 'Erro ao criar surebet',
        };
      }

      invalidateSaldos(data.projetoId);

      return {
        success: true,
        id: result.data?.id,
      };
    } catch (error: any) {
      console.error('[useSurebetService] Erro ao criar surebet:', error);
      return {
        success: false,
        error: error.message || 'Erro desconhecido',
      };
    }
  }, [invalidateSaldos]);

  /**
   * Atualiza uma surebet existente.
   */
  const atualizarSurebet = useCallback(async (
    id: string,
    data: Partial<SurebetData>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Padronizado com edição de aposta simples: toda persistência passa
      // pela RPC editar_surebet_completa_v3, que sincroniza ledger e
      // recalcula o pai via fn_recalc_pai_surebet.
      // Buscar pernas e entradas atuais para preservar IDs e mapear deltas.
      const { data: aposta, error: apostaErr } = await supabase
        .from('apostas_unificada')
        .select('estrategia, contexto_operacional, data_aposta, modelo')
        .eq('id', id)
        .single();
      if (apostaErr || !aposta) return { success: false, error: apostaErr?.message || 'Aposta não encontrada' };

      const { data: pernasAtuais } = await supabase
        .from('apostas_pernas')
        .select('id, ordem, selecao, selecao_livre, bookmaker_id, stake, odd, moeda, fonte_saldo, resultado')
        .eq('aposta_id', id)
        .order('ordem', { ascending: true });

      // Se não foram passadas pernas novas no payload, mantemos as atuais
      const pernasInput = data.pernas && data.pernas.length > 0
        ? data.pernas.map((p, idx) => ({
            id: pernasAtuais?.[idx]?.id ?? null,
            selecao: p.selecao ?? pernasAtuais?.[idx]?.selecao ?? '',
            selecao_livre: p.selecaoLivre ?? pernasAtuais?.[idx]?.selecao_livre ?? null,
            resultado: pernasAtuais?.[idx]?.resultado ?? null,
            bookmaker_id: p.bookmakerId,
            stake: p.stake,
            odd: p.odd,
            moeda: p.moeda || pernasAtuais?.[idx]?.moeda || 'BRL',
            fonte_saldo: p.fonteSaldo || pernasAtuais?.[idx]?.fonte_saldo || 'REAL',
          }))
        : (pernasAtuais || []).map((p) => ({
            id: p.id,
            selecao: p.selecao,
            selecao_livre: p.selecao_livre,
            resultado: p.resultado,
            bookmaker_id: p.bookmaker_id,
            stake: p.stake,
            odd: p.odd,
            moeda: p.moeda,
            fonte_saldo: p.fonte_saldo || 'REAL',
          }));

      const pernasPaiV3 = pernasInput.map((p) => ({
        id: p.id,
        selecao: p.selecao,
        selecao_livre: p.selecao_livre,
        resultado: p.resultado,
      }));
      const entradasV3 = pernasInput.map((p, idx) => ({
        id: p.id, // legado: entrada usa mesmo UUID quando 1:1
        perna_index: idx,
        bookmaker_id: p.bookmaker_id,
        stake: p.stake,
        odd: p.odd,
        moeda: p.moeda,
        fonte_saldo: p.fonte_saldo,
      }));

      const { data: rpcResult, error } = await supabase.rpc('editar_surebet_completa_v3', {
        p_aposta_id: id,
        p_pernas: pernasPaiV3 as any,
        p_entradas: entradasV3 as any,
        p_evento: data.evento ?? null,
        p_esporte: data.esporte ?? null,
        p_mercado: data.mercado ?? null,
        p_modelo: data.modelo ?? aposta.modelo,
        p_estrategia: data.estrategia ?? aposta.estrategia,
        p_contexto: data.contexto ?? aposta.contexto_operacional,
        p_data_aposta: aposta.data_aposta,
        p_status_manual: null,
      });

      if (error) return { success: false, error: error.message };
      const result = rpcResult as any;
      if (result && !result.success) {
        return { success: false, error: result.error || 'Falha ao atualizar surebet' };
      }

      if (data.projetoId) {
        invalidateSaldos(data.projetoId);
      }

      return { success: true };
    } catch (error: any) {
      console.error('[useSurebetService] Erro ao atualizar surebet:', error);
      return { success: false, error: error.message };
    }
  }, [invalidateSaldos]);

  /**
   * Liquida uma perna de surebet.
   * Usa o ID da perna para buscar o aposta_id e liquidar.
   */
  const liquidarPerna = useCallback(async (
    pernaId: string,
    resultado: string,
    lucroPrejuizo?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Buscar aposta_id + workspace_id da perna (necessário para a RPC)
      const { data: perna, error: pernaError } = await supabase
        .from('apostas_pernas')
        .select('aposta_id, apostas_unificada:aposta_id(workspace_id, projeto_id)')
        .eq('id', pernaId)
        .single();

      if (pernaError || !perna) {
        return { success: false, error: 'Perna não encontrada' };
      }

      const wsId = (perna as any)?.apostas_unificada?.workspace_id;
      const projetoId = (perna as any)?.apostas_unificada?.projeto_id;
      if (!wsId) return { success: false, error: 'Workspace não encontrado para a perna' };

      // Padrão simétrico ao da aposta simples: a RPC sincroniza ledger
      // (PAYOUT / VOID_REFUND / FREEBET_PAYOUT) e recalcula o pai.
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'liquidar_perna_surebet_v1',
        { p_perna_id: pernaId, p_resultado: resultado, p_workspace_id: wsId },
      );
      if (rpcError) return { success: false, error: rpcError.message };
      const result = rpcResult as any;
      if (result && result.success === false) {
        return { success: false, error: result.error || 'Falha ao liquidar perna' };
      }

      if (projetoId) invalidateSaldos(projetoId);
      return { success: true };
    } catch (error: any) {
      console.error('[useSurebetService] Erro ao liquidar perna:', error);
      return { success: false, error: error.message };
    }
  }, [invalidateSaldos]);

  /**
   * Reliquida uma perna (muda resultado).
   */
  const reliquidarPerna = useCallback(async (
    pernaId: string,
    novoResultado: string,
    lucroPrejuizo?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: perna, error: pernaError } = await supabase
        .from('apostas_pernas')
        .select('aposta_id, apostas_unificada:aposta_id(workspace_id, projeto_id)')
        .eq('id', pernaId)
        .single();

      if (pernaError || !perna) {
        return { success: false, error: 'Perna não encontrada' };
      }

      const wsId = (perna as any)?.apostas_unificada?.workspace_id;
      const projetoId = (perna as any)?.apostas_unificada?.projeto_id;
      if (!wsId) return { success: false, error: 'Workspace não encontrado para a perna' };

      // liquidar_perna_surebet_v1 já é idempotente: estorna PAYOUT/REFUND
      // anteriores da perna e re-emite com base no novo resultado.
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'liquidar_perna_surebet_v1',
        { p_perna_id: pernaId, p_resultado: novoResultado, p_workspace_id: wsId },
      );
      if (rpcError) return { success: false, error: rpcError.message };
      const result = rpcResult as any;
      if (result && result.success === false) {
        return { success: false, error: result.error || 'Falha ao reliquidar perna' };
      }

      if (projetoId) invalidateSaldos(projetoId);
      return { success: true };
    } catch (error: any) {
      console.error('[useSurebetService] Erro ao reliquidar perna:', error);
      return { success: false, error: error.message };
    }
  }, [invalidateSaldos]);

  /**
   * Deleta uma surebet usando ApostaService.
   * O serviço cuida da reversão financeira.
   */
  const deletarSurebet = useCallback(async (
    id: string,
    projetoId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await deletarAposta(id);

      if (!result.success) {
        return {
          success: false,
          error: result.error?.message || 'Erro ao deletar surebet',
        };
      }

      invalidateSaldos(projetoId);

      return { success: true };
    } catch (error: any) {
      console.error('[useSurebetService] Erro ao deletar surebet:', error);
      return { success: false, error: error.message };
    }
  }, [invalidateSaldos]);

  return {
    criarSurebet,
    atualizarSurebet,
    liquidarPerna,
    deletarSurebet,
    reliquidarPerna,
  };
}
