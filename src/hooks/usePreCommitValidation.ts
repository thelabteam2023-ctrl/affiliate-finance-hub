/**
 * Hook para validação pré-commit de apostas
 * 
 * Garante integridade de dados através de:
 * 1. Validação server-side via RPC antes do commit
 * 2. Controle otimista de versão para prevenir race conditions
 * 3. Verificação de vínculos projeto-bookmaker em tempo real
 * 4. Verificação de saldos atualizados
 * 5. Lock pessimista para prevenir débitos simultâneos
 * 
 * @module usePreCommitValidation
 */

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BookmakerStakeInput {
  bookmaker_id: string;
  bookmaker_nome?: string;
  stake: number;
  expected_version?: number;
}

export interface ValidationResult {
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
    saldo_restante: number;
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

export interface DebitInput {
  bookmaker_id: string;
  stake: number;
  expected_version?: number;
  referencia_id?: string;
  referencia_tipo?: string;
}

export interface DebitResult {
  success: boolean;
  error?: string;
  message?: string;
  saldo_disponivel?: number;
  stake_solicitado?: number;
  debits?: Array<{
    bookmaker_id: string;
    bookmaker_nome: string;
    saldo_anterior: number;
    saldo_novo: number;
    stake_debitado: number;
    new_version: number;
  }>;
  timestamp?: string;
}

export function usePreCommitValidation() {
  const [validating, setValidating] = useState(false);
  const [debiting, setDebiting] = useState(false);

  /**
   * Valida todas as condições necessárias antes de registrar uma aposta
   * Usa FOR UPDATE NOWAIT para lock imediato - previne race conditions
   */
  const validateAndReserve = useCallback(async (
    projetoId: string,
    bookmakerStakes: BookmakerStakeInput[]
  ): Promise<ValidationResult> => {
    setValidating(true);
    
    try {
      // Converter para formato JSONB esperado pela RPC
      const stakesJsonb = bookmakerStakes.map(b => ({
        bookmaker_id: b.bookmaker_id,
        stake: b.stake,
        expected_version: b.expected_version || 0,
      }));

      const { data, error } = await supabase.rpc('validate_and_reserve_stakes', {
        p_projeto_id: projetoId,
        p_bookmaker_stakes: stakesJsonb,
      });

      if (error) {
        console.error('[usePreCommitValidation] Erro RPC validate_and_reserve_stakes:', error);
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

      const result = data as unknown as ValidationResult;
      
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
   * Débito atômico de múltiplas bookmakers em uma única transação
   * Garante que TODAS as operações são bem-sucedidas ou NENHUMA é aplicada
   * 
   * CRÍTICO: Previne saldo negativo mesmo com operações simultâneas
   */
  const debitMultiple = useCallback(async (
    debits: DebitInput[],
    origem: string = 'aposta'
  ): Promise<DebitResult> => {
    setDebiting(true);
    
    try {
      // Converter para formato JSONB esperado pela RPC
      const debitsJsonb = debits.map(d => ({
        bookmaker_id: d.bookmaker_id,
        stake: d.stake,
        expected_version: d.expected_version || 0,
        referencia_id: d.referencia_id || null,
        referencia_tipo: d.referencia_tipo || null,
      }));

      const { data, error } = await supabase.rpc('debit_multiple_bookmakers', {
        p_debits: debitsJsonb,
        p_origem: origem,
      });

      if (error) {
        console.error('[usePreCommitValidation] Erro RPC debit_multiple_bookmakers:', error);
        return {
          success: false,
          error: 'RPC_ERROR',
          message: error.message,
        };
      }

      return data as unknown as DebitResult;
    } catch (err: any) {
      console.error('[usePreCommitValidation] Exceção débito:', err);
      return {
        success: false,
        error: 'EXCEPTION',
        message: err.message || 'Erro desconhecido no débito',
      };
    } finally {
      setDebiting(false);
    }
  }, []);

  /**
   * Fluxo completo de validação + débito atômico
   * Use esta função para garantir integridade total
   */
  const validateAndDebit = useCallback(async (
    projetoId: string,
    bookmakerStakes: BookmakerStakeInput[],
    origem: string = 'aposta',
    referenciaId?: string,
    referenciaTipo?: string
  ): Promise<{ validation: ValidationResult; debit?: DebitResult }> => {
    // 1. Validar primeiro
    const validation = await validateAndReserve(projetoId, bookmakerStakes);
    
    if (!validation.valid) {
      return { validation };
    }

    // 2. Se validou, debitar com as versões retornadas
    const debits: DebitInput[] = validation.validations.map(v => ({
      bookmaker_id: v.bookmaker_id,
      stake: v.stake_necessario,
      expected_version: v.version,
      referencia_id: referenciaId,
      referencia_tipo: referenciaTipo,
    }));

    const debit = await debitMultiple(debits, origem);

    return { validation, debit };
  }, [validateAndReserve, debitMultiple]);

  /**
   * Exibir erros de validação ao usuário com mensagens amigáveis
   */
  const showValidationErrors = useCallback((errors: ValidationResult['errors']) => {
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
        case 'BOOKMAKER_NAO_ENCONTRADA':
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
        case 'OPERACAO_EM_ANDAMENTO':
          toast.error(error.message, {
            description: 'Aguarde a operação anterior finalizar.',
            duration: 8000,
          });
          break;
        default:
          toast.error(error.message);
      }
    });
  }, []);

  /**
   * Exibir erros de débito ao usuário
   */
  const showDebitError = useCallback((result: DebitResult) => {
    if (result.success) return;

    switch (result.error) {
      case 'INSUFFICIENT_BALANCE':
        toast.error(result.message || 'Saldo insuficiente', {
          description: `Disponível: ${result.saldo_disponivel?.toFixed(2)}, Necessário: ${result.stake_solicitado?.toFixed(2)}`,
          duration: 8000,
        });
        break;
      case 'VERSION_MISMATCH':
        toast.error(result.message || 'Dados desatualizados', {
          description: 'Outro usuário alterou o saldo. Atualize e tente novamente.',
          duration: 8000,
        });
        break;
      case 'BOOKMAKER_NAO_ENCONTRADA':
        toast.error(result.message || 'Bookmaker não encontrada', {
          duration: 8000,
        });
        break;
      default:
        toast.error(result.message || 'Erro ao processar operação');
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

  return {
    validating,
    debiting,
    validateAndReserve,
    debitMultiple,
    validateAndDebit,
    quickValidateBookmaker,
    showValidationErrors,
    showDebitError,
  };
}
