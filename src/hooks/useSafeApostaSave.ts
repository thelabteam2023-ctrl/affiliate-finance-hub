/**
 * Hook para salvar apostas com validação pré-commit e débito atômico
 * 
 * Este hook encapsula toda a lógica de:
 * 1. Validação server-side antes do commit
 * 2. Prevenção de race conditions via locks
 * 3. Garantia de saldo não-negativo
 * 4. Débito atômico de múltiplas bookmakers
 * 
 * @module useSafeApostaSave
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePreCommitValidation, type BookmakerStakeInput, type ValidationResult } from "./usePreCommitValidation";
import { useInvalidateBookmakerSaldos } from "./useBookmakerSaldosQuery";

export interface SaveApostaParams {
  projetoId: string;
  apostaData: Record<string, any>;
  bookmakersToDebit: Array<{
    bookmaker_id: string;
    stake: number;
    is_freebet?: boolean; // Freebets não debitam saldo real
  }>;
  isEditing: boolean;
  existingApostaId?: string;
}

export interface SaveApostaResult {
  success: boolean;
  apostaId?: string;
  error?: string;
  validationErrors?: ValidationResult['errors'];
}

export function useSafeApostaSave() {
  const { validateAndReserve, debitMultiple, showValidationErrors, showDebitError, validating, debiting } = usePreCommitValidation();
  const invalidateSaldos = useInvalidateBookmakerSaldos();

  /**
   * Salva uma aposta com validação completa e débito atômico
   * 
   * Fluxo:
   * 1. Valida projeto ativo + bookmakers vinculadas + saldo suficiente (com lock)
   * 2. Se validação OK, insere/atualiza a aposta
   * 3. Debita saldo das bookmakers atomicamente
   * 4. Se qualquer passo falhar, retorna erro sem alterar dados
   */
  const saveAposta = useCallback(async (params: SaveApostaParams): Promise<SaveApostaResult> => {
    const { projetoId, apostaData, bookmakersToDebit, isEditing, existingApostaId } = params;

    // Filtrar apenas bookmakers que precisam de débito (excluir freebets)
    const debitableBookmakers = bookmakersToDebit.filter(b => !b.is_freebet && b.stake > 0);

    // Se não há débitos a fazer (edição ou freebet), pular validação de saldo
    if (debitableBookmakers.length === 0) {
      try {
        if (isEditing && existingApostaId) {
          const { error } = await supabase
            .from("apostas_unificada")
            .update(apostaData as any)
            .eq("id", existingApostaId);
          
          if (error) throw error;
          
          invalidateSaldos(projetoId);
          return { success: true, apostaId: existingApostaId };
        } else {
          const { data, error } = await supabase
            .from("apostas_unificada")
            .insert(apostaData as any)
            .select("id")
            .single();
          
          if (error) throw error;
          
          invalidateSaldos(projetoId);
          return { success: true, apostaId: data.id };
        }
      } catch (err: any) {
        console.error('[useSafeApostaSave] Erro ao salvar:', err);
        return { success: false, error: err.message };
      }
    }

    // 1. VALIDAÇÃO PRÉ-COMMIT (com lock)
    const stakesToValidate: BookmakerStakeInput[] = debitableBookmakers.map(b => ({
      bookmaker_id: b.bookmaker_id,
      stake: b.stake,
    }));

    const validation = await validateAndReserve(projetoId, stakesToValidate);

    if (!validation.valid) {
      showValidationErrors(validation.errors);
      return { 
        success: false, 
        error: 'VALIDATION_FAILED',
        validationErrors: validation.errors,
      };
    }

    // 2. INSERIR/ATUALIZAR APOSTA
    let apostaId: string;
    try {
      if (isEditing && existingApostaId) {
        const { error } = await supabase
          .from("apostas_unificada")
          .update(apostaData as any)
          .eq("id", existingApostaId);
        
        if (error) throw error;
        apostaId = existingApostaId;
      } else {
        const { data, error } = await supabase
          .from("apostas_unificada")
          .insert(apostaData as any)
          .select("id")
          .single();
        
        if (error) throw error;
        apostaId = data.id;
      }
    } catch (err: any) {
      console.error('[useSafeApostaSave] Erro ao inserir aposta:', err);
      toast.error("Erro ao registrar aposta", {
        description: err.message,
      });
      return { success: false, error: err.message };
    }

    // 3. DÉBITO ATÔMICO (usa versões retornadas pela validação)
    const debitsToProcess = validation.validations.map(v => ({
      bookmaker_id: v.bookmaker_id,
      stake: v.stake_necessario,
      expected_version: v.version,
      referencia_id: apostaId,
      referencia_tipo: 'aposta',
    }));

    const debitResult = await debitMultiple(debitsToProcess, 'aposta_simples');

    if (!debitResult.success) {
      // Débito falhou - reverter a aposta inserida
      console.error('[useSafeApostaSave] Débito falhou, revertendo aposta:', debitResult);
      
      if (!isEditing) {
        // Deletar aposta que foi inserida
        await supabase
          .from("apostas_unificada")
          .delete()
          .eq("id", apostaId);
      }
      
      showDebitError(debitResult);
      return { 
        success: false, 
        error: debitResult.error || 'DEBIT_FAILED',
      };
    }

    // 4. SUCESSO COMPLETO
    invalidateSaldos(projetoId);
    
    return { success: true, apostaId };
  }, [validateAndReserve, debitMultiple, showValidationErrors, showDebitError, invalidateSaldos]);

  /**
   * Validação rápida sem débito (para preview/verificação)
   */
  const validateOnly = useCallback(async (
    projetoId: string,
    bookmakerStakes: BookmakerStakeInput[]
  ): Promise<ValidationResult> => {
    return validateAndReserve(projetoId, bookmakerStakes);
  }, [validateAndReserve]);

  return {
    saveAposta,
    validateOnly,
    validating,
    debiting,
    isProcessing: validating || debiting,
  };
}
