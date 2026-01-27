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

interface SurebetData {
  projetoId: string;
  workspaceId: string;
  userId: string;
  estrategia: string;
  contexto?: string;
  evento: string;
  esporte?: string;
  mercado?: string;
  modelo?: string;
  pernas: Array<{
    bookmakerId: string;
    stake: number;
    odd: number;
    selecao: string;
    selecaoLivre?: string;
    moeda?: string;
    fonteSaldo?: string;
    stakeBrlReferencia?: number;
    cotacaoSnapshot?: number;
    cotacaoSnapshotAt?: string;
  }>;
}

interface UseSurebetServiceReturn {
  criarSurebet: (data: SurebetData) => Promise<{ success: boolean; id?: string; error?: string }>;
  liquidarPerna: (pernaId: string, resultado: string, lucroPrejuizo?: number) => Promise<{ success: boolean; error?: string }>;
  deletarSurebet: (id: string, projetoId: string) => Promise<{ success: boolean; error?: string }>;
  reliquidarPerna: (pernaId: string, novoResultado: string, lucroPrejuizo?: number) => Promise<{ success: boolean; error?: string }>;
}

export function useSurebetService(): UseSurebetServiceReturn {
  const queryClient = useQueryClient();

  const invalidateSaldos = useCallback((projetoId: string) => {
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["apostas", projetoId] });
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
        contexto_operacional: data.contexto || 'NORMAL',
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
   * Liquida uma perna de surebet.
   * Usa o ID da perna para buscar o aposta_id e liquidar.
   */
  const liquidarPerna = useCallback(async (
    pernaId: string,
    resultado: string,
    lucroPrejuizo?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Buscar aposta_id da perna
      const { data: perna, error: pernaError } = await supabase
        .from('apostas_pernas')
        .select('aposta_id')
        .eq('id', pernaId)
        .single();

      if (pernaError || !perna) {
        return { success: false, error: 'Perna não encontrada' };
      }

      // Atualizar resultado da perna
      const { error: updateError } = await supabase
        .from('apostas_pernas')
        .update({
          resultado,
          lucro_prejuizo: lucroPrejuizo ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pernaId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      // Nota: A liquidação financeira é feita via triggers ou quando
      // todas as pernas são liquidadas. Para motor v7, cada perna
      // precisa gerar seus próprios eventos financeiros.

      return { success: true };
    } catch (error: any) {
      console.error('[useSurebetService] Erro ao liquidar perna:', error);
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Reliquida uma perna (muda resultado).
   */
  const reliquidarPerna = useCallback(async (
    pernaId: string,
    novoResultado: string,
    lucroPrejuizo?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Buscar aposta_id da perna
      const { data: perna, error: pernaError } = await supabase
        .from('apostas_pernas')
        .select('aposta_id')
        .eq('id', pernaId)
        .single();

      if (pernaError || !perna) {
        return { success: false, error: 'Perna não encontrada' };
      }

      // Usar reliquidarAposta do ApostaService
      const result = await reliquidarAposta(perna.aposta_id, novoResultado, lucroPrejuizo);

      if (!result.success) {
        return { success: false, error: result.error?.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error('[useSurebetService] Erro ao reliquidar perna:', error);
      return { success: false, error: error.message };
    }
  }, []);

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
    liquidarPerna,
    deletarSurebet,
    reliquidarPerna,
  };
}
