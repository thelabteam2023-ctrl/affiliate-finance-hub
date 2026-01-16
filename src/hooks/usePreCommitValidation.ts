/**
 * Hook para validação pré-commit de apostas
 * 
 * Garante integridade de dados através de:
 * 1. Validação server-side via RPC antes do commit
 * 2. Controle otimista de versão para prevenir race conditions
 * 3. Verificação de vínculos projeto-bookmaker em tempo real
 * 4. Verificação de saldos atualizados
 * 
 * @module usePreCommitValidation
 */

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BookmakerValidation {
  bookmaker_id: string;
  bookmaker_nome: string;
  stake: number;
  expected_version?: number;
}

export interface PreCommitValidationResult {
  valid: boolean;
  errors: Array<{
    code: string;
    message: string;
    bookmaker_id?: string;
    saldo_atual?: number;
    stake_necessario?: number;
  }>;
  validations: Array<{
    bookmaker_id: string;
    bookmaker_nome: string;
    saldo_atual: number;
    stake_necessario: number;
    version: number;
    valid: boolean;
  }>;
  projeto: {
    id: string;
    nome: string;
    status: string;
  } | null;
  timestamp: string;
}

export interface DebitResult {
  success: boolean;
  error_code?: string;
  message?: string;
  saldo_anterior?: number;
  saldo_novo?: number;
  new_version?: number;
}

export function usePreCommitValidation() {
  const [validating, setValidating] = useState(false);
  const [debiting, setDebiting] = useState(false);

  /**
   * Valida todas as condições necessárias antes de registrar uma aposta
   * Chama RPC server-side para garantir integridade
   */
  const validatePreCommit = useCallback(async (
    projetoId: string,
    bookmakers: BookmakerValidation[]
  ): Promise<PreCommitValidationResult> => {
    setValidating(true);
    
    try {
      const bookmakerIds = bookmakers.map(b => b.bookmaker_id);
      const stakes = bookmakers.map(b => b.stake);
      const versions = bookmakers.some(b => b.expected_version !== undefined)
        ? bookmakers.map(b => b.expected_version || 1)
        : null;

      const { data, error } = await supabase.rpc('validate_aposta_pre_commit', {
        p_projeto_id: projetoId,
        p_bookmaker_ids: bookmakerIds,
        p_stakes: stakes,
        p_expected_versions: versions,
      });

      if (error) {
        console.error('[usePreCommitValidation] Erro RPC:', error);
        return {
          valid: false,
          errors: [{
            code: 'RPC_ERROR',
            message: `Erro de validação: ${error.message}`,
          }],
          validations: [],
          projeto: null,
          timestamp: new Date().toISOString(),
        };
      }

      // Parsear resultado do JSONB
      const result = data as unknown as PreCommitValidationResult;
      
      // Log para auditoria
      if (!result.valid) {
        console.warn('[usePreCommitValidation] Validação falhou:', result.errors);
      }

      return result;
    } catch (err: any) {
      console.error('[usePreCommitValidation] Exceção:', err);
      return {
        valid: false,
        errors: [{
          code: 'EXCEPTION',
          message: err.message || 'Erro desconhecido na validação',
        }],
        validations: [],
        projeto: null,
        timestamp: new Date().toISOString(),
      };
    } finally {
      setValidating(false);
    }
  }, []);

  /**
   * Débito atômico com lock pessimista e controle otimista
   * Garante que não ocorram race conditions
   */
  const debitWithLock = useCallback(async (
    bookmakerId: string,
    stake: number,
    expectedVersion: number,
    origem: string,
    referenciaId?: string,
    referenciaTipo?: string
  ): Promise<DebitResult> => {
    setDebiting(true);
    
    try {
      const { data, error } = await supabase.rpc('debit_bookmaker_with_lock', {
        p_bookmaker_id: bookmakerId,
        p_stake: stake,
        p_expected_version: expectedVersion,
        p_origem: origem,
        p_referencia_id: referenciaId || null,
        p_referencia_tipo: referenciaTipo || null,
      });

      if (error) {
        console.error('[usePreCommitValidation] Erro débito:', error);
        return {
          success: false,
          error_code: 'RPC_ERROR',
          message: error.message,
        };
      }

      return data as unknown as DebitResult;
    } catch (err: any) {
      console.error('[usePreCommitValidation] Exceção débito:', err);
      return {
        success: false,
        error_code: 'EXCEPTION',
        message: err.message || 'Erro desconhecido no débito',
      };
    } finally {
      setDebiting(false);
    }
  }, []);

  /**
   * Validação rápida de vínculo projeto-bookmaker (client-side)
   * Para feedback imediato antes da validação completa
   */
  const quickValidateBookmaker = useCallback(async (
    bookmakerId: string,
    projetoId: string
  ): Promise<{ valid: boolean; message?: string }> => {
    try {
      const { data, error } = await supabase
        .from('bookmakers')
        .select('id, nome, projeto_id, status')
        .eq('id', bookmakerId)
        .maybeSingle();

      if (error || !data) {
        return { valid: false, message: 'Bookmaker não encontrada' };
      }

      if (data.projeto_id !== projetoId) {
        return { valid: false, message: `Bookmaker "${data.nome}" não está vinculada a este projeto` };
      }

      if (data.status !== 'ativo' && data.status !== 'operacional') {
        return { valid: false, message: `Bookmaker "${data.nome}" não está ativa` };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, message: err.message };
    }
  }, []);

  /**
   * Validação rápida de projeto ativo (client-side)
   */
  const quickValidateProjeto = useCallback(async (
    projetoId: string
  ): Promise<{ valid: boolean; message?: string }> => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, nome, status')
        .eq('id', projetoId)
        .maybeSingle();

      if (error || !data) {
        return { valid: false, message: 'Projeto não encontrado' };
      }

      if (data.status !== 'ativo') {
        return { valid: false, message: `Projeto "${data.nome}" não está ativo (status: ${data.status})` };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, message: err.message };
    }
  }, []);

  /**
   * Exibir erros de validação ao usuário
   */
  const showValidationErrors = useCallback((errors: PreCommitValidationResult['errors']) => {
    errors.forEach(error => {
      switch (error.code) {
        case 'PROJETO_INATIVO':
        case 'PROJETO_NAO_ENCONTRADO':
          toast.error(error.message, {
            description: 'O projeto foi alterado. Atualize a página.',
            duration: 8000,
          });
          break;
        case 'BOOKMAKER_NAO_VINCULADA':
          toast.error(error.message, {
            description: 'A bookmaker foi desvinculada por outro usuário.',
            duration: 8000,
          });
          break;
        case 'SALDO_INSUFICIENTE':
          toast.error(error.message, {
            description: 'Verifique o saldo atual e tente novamente.',
            duration: 8000,
          });
          break;
        case 'VERSAO_DESATUALIZADA':
          toast.error(error.message, {
            description: 'Dados foram alterados. Atualize e tente novamente.',
            duration: 8000,
          });
          break;
        default:
          toast.error(error.message);
      }
    });
  }, []);

  return {
    validating,
    debiting,
    validatePreCommit,
    debitWithLock,
    quickValidateBookmaker,
    quickValidateProjeto,
    showValidationErrors,
  };
}
