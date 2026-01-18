/**
 * Hook para salvar apostas usando RPC atômica
 * 
 * FASE 1 - REFATORAÇÃO: Este hook agora usa criar_aposta_atomica
 * que NÃO debita saldo (stake fica em saldo_em_aposta até liquidação)
 * 
 * Fluxo novo:
 * 1. Chama criar_aposta_atomica (valida saldo + insere aposta + insere pernas)
 * 2. RPC garante atomicidade - tudo ou nada
 * 3. Stake reservado em saldo_em_aposta (calculado por get_bookmaker_saldos)
 * 4. Débito real só acontece na LIQUIDAÇÃO via cash_ledger
 * 
 * @module useSafeApostaSave
 */

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInvalidateBookmakerSaldos } from "./useBookmakerSaldosQuery";

export interface SaveApostaParams {
  projetoId: string;
  apostaData: Record<string, any>;
  bookmakersToDebit: Array<{
    bookmaker_id: string;
    stake: number;
    is_freebet?: boolean;
    odd?: number;
    selecao?: string;
    selecao_livre?: string;
    moeda?: string;
    cotacao_snapshot?: number;
    cotacao_snapshot_at?: string;
    stake_brl_referencia?: number;
  }>;
  isEditing: boolean;
  existingApostaId?: string;
}

export interface SaveApostaResult {
  success: boolean;
  apostaId?: string;
  error?: string;
  validationErrors?: Array<{
    bookmaker_id: string;
    error: string;
    message?: string;
    saldo_disponivel?: number;
    stake_necessario?: number;
  }>;
}

export function useSafeApostaSave() {
  const [saving, setSaving] = useState(false);
  const invalidateSaldos = useInvalidateBookmakerSaldos();

  /**
   * Salva uma aposta usando RPC atômica
   * 
   * Fluxo:
   * 1. Valida saldo disponível (sem debitar)
   * 2. Insere aposta + pernas atomicamente
   * 3. Stake fica reservado em saldo_em_aposta
   * 4. Invalidar cache de saldos
   */
  const saveAposta = useCallback(async (params: SaveApostaParams): Promise<SaveApostaResult> => {
    const { projetoId, apostaData, bookmakersToDebit, isEditing, existingApostaId } = params;

    setSaving(true);

    try {
      // ================================================================
      // MODO EDIÇÃO: Usar update direto (não altera saldo)
      // ================================================================
      if (isEditing && existingApostaId) {
        const { error } = await supabase
          .from("apostas_unificada")
          .update(apostaData as any)
          .eq("id", existingApostaId);
        
        if (error) {
          console.error('[useSafeApostaSave] Erro ao atualizar:', error);
          return { success: false, error: error.message };
        }
        
        invalidateSaldos(projetoId);
        return { success: true, apostaId: existingApostaId };
      }

      // ================================================================
      // MODO CRIAÇÃO: Usar RPC atômica
      // ================================================================
      
      // Preparar pernas para a RPC
      const pernas = bookmakersToDebit.map((b, index) => ({
        bookmaker_id: b.bookmaker_id,
        stake: b.stake,
        odd: b.odd || apostaData.odd || 1,
        selecao: b.selecao || apostaData.selecao || '',
        selecao_livre: b.selecao_livre,
        moeda: b.moeda || 'BRL',
        ordem: index + 1,
        is_freebet: b.is_freebet || false,
        cotacao_snapshot: b.cotacao_snapshot,
        cotacao_snapshot_at: b.cotacao_snapshot_at,
        stake_brl_referencia: b.stake_brl_referencia,
      }));

      // Chamar RPC atômica
      const { data, error } = await supabase.rpc('criar_aposta_atomica', {
        p_aposta_data: apostaData,
        p_pernas: pernas.length > 0 ? pernas : null,
      });

      if (error) {
        console.error('[useSafeApostaSave] Erro RPC criar_aposta_atomica:', error);
        toast.error("Erro ao registrar aposta", {
          description: error.message,
        });
        return { success: false, error: error.message };
      }

      const result = data as {
        success: boolean;
        aposta_id?: string;
        error?: string;
        message?: string;
        validation_errors?: Array<{
          bookmaker_id: string;
          error: string;
          message?: string;
          saldo_disponivel?: number;
          stake_necessario?: number;
        }>;
      };

      if (!result.success) {
        console.warn('[useSafeApostaSave] RPC retornou erro:', result);
        
        // Exibir erros de validação amigáveis
        if (result.validation_errors && result.validation_errors.length > 0) {
          result.validation_errors.forEach(ve => {
            switch (ve.error) {
              case 'SALDO_INSUFICIENTE':
                toast.error("Saldo insuficiente", {
                  description: `Disponível: ${ve.saldo_disponivel?.toFixed(2)}, Necessário: ${ve.stake_necessario?.toFixed(2)}`,
                  duration: 8000,
                });
                break;
              case 'BOOKMAKER_NAO_VINCULADA':
                toast.error("Bookmaker não vinculada", {
                  description: ve.message || "A bookmaker não está vinculada ao projeto",
                  duration: 8000,
                });
                break;
              default:
                toast.error(ve.message || ve.error);
            }
          });
        } else if (result.error === 'PROJETO_INATIVO') {
          toast.error("Projeto inativo", {
            description: result.message || "O projeto não está ativo",
            duration: 8000,
          });
        } else {
          toast.error(result.message || result.error || "Erro ao registrar aposta");
        }

        return { 
          success: false, 
          error: result.error || 'CREATION_FAILED',
          validationErrors: result.validation_errors,
        };
      }

      // SUCESSO
      invalidateSaldos(projetoId);
      
      return { success: true, apostaId: result.aposta_id };
      
    } catch (err: any) {
      console.error('[useSafeApostaSave] Exceção:', err);
      toast.error("Erro inesperado", {
        description: err.message,
      });
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [invalidateSaldos]);

  /**
   * Validação rápida sem criar aposta (para preview)
   * @deprecated Use validateOnly apenas para feedback visual - a validação real é feita na RPC
   */
  const validateOnly = useCallback(async (
    projetoId: string,
    bookmakerStakes: Array<{ bookmaker_id: string; stake: number }>
  ): Promise<{ valid: boolean; errors: string[] }> => {
    try {
      // Validação client-side simplificada
      const errors: string[] = [];
      
      // Buscar saldos via RPC canônica
      const { data: saldos, error } = await supabase.rpc('get_bookmaker_saldos', {
        p_projeto_id: projetoId,
      });

      if (error) {
        return { valid: false, errors: ['Erro ao buscar saldos'] };
      }

      const saldosMap = new Map(
        (saldos || []).map((s: any) => [s.bookmaker_id, s])
      );

      for (const bs of bookmakerStakes) {
        const saldo = saldosMap.get(bs.bookmaker_id) as any;
        
        if (!saldo) {
          errors.push(`Bookmaker não vinculada ao projeto`);
          continue;
        }
        
        if (saldo.saldo_operavel < bs.stake) {
          errors.push(`Saldo insuficiente: disponível ${saldo.saldo_operavel?.toFixed(2)}, necessário ${bs.stake?.toFixed(2)}`);
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (err: any) {
      return { valid: false, errors: [err.message] };
    }
  }, []);

  return {
    saveAposta,
    validateOnly,
    saving,
    isProcessing: saving,
    // Deprecated aliases for backwards compatibility
    validating: false,
    debiting: false,
  };
}
