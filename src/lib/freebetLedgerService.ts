/**
 * Serviço de Ledger para Freebets
 * 
 * ESTE SERVIÇO ENCAPSULA AS RPCs DE FREEBET DO BANCO DE DADOS.
 * 
 * Todas as operações de freebet passam pelo cash_ledger via RPCs atômicas,
 * garantindo auditoria completa e reconstrução de saldo via recalcular_saldo_bookmaker_v2.
 * 
 * TIPOS DE TRANSAÇÃO:
 * - FREEBET_CREDITADA: Freebet recebida/liberada → incrementa saldo_freebet
 * - FREEBET_CONSUMIDA: Freebet usada em aposta → decrementa saldo_freebet
 * - FREEBET_ESTORNO: Reversão de consumo → devolve saldo_freebet
 * - FREEBET_EXPIRADA: Freebet expirou sem uso → decrementa saldo_freebet
 * - FREEBET_CONVERTIDA: Extração bem-sucedida → debita freebet E credita real
 */

import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// TIPOS
// ============================================================================

export type FreebetLedgerType = 
  | 'FREEBET_CREDITADA'
  | 'FREEBET_CONSUMIDA'
  | 'FREEBET_ESTORNO'
  | 'FREEBET_EXPIRADA'
  | 'FREEBET_CONVERTIDA';

export interface FreebetOperationResult {
  success: boolean;
  ledgerId?: string;
  error?: string;
}

// ============================================================================
// RPCs ATÔMICAS
// ============================================================================

/**
 * Credita freebet via ledger.
 * Usar quando:
 * - Freebet é liberada (status PENDENTE → LIBERADA)
 * - Freebet manual é criada
 * - Qualquer crédito de freebet
 */
export async function creditarFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  origem: string = 'MANUAL',
  options?: {
    projetoId?: string;
    userId?: string;
    workspaceId?: string;
    descricao?: string;
    freebetId?: string;
  }
): Promise<FreebetOperationResult> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser maior que zero' };
    }

    const { data, error } = await supabase.rpc('creditar_freebet', {
      p_bookmaker_id: bookmakerId,
      p_valor: valor,
      p_origem: origem,
      p_projeto_id: options?.projetoId || null,
      p_user_id: options?.userId || null,
      p_workspace_id: options?.workspaceId || null,
      p_descricao: options?.descricao || null,
      p_freebet_id: options?.freebetId || null,
    });

    if (error) {
      console.error('[FreebetLedger] Erro ao creditar freebet:', error);
      return { success: false, error: error.message };
    }

    console.log(`[FreebetLedger] Freebet creditada: ${valor} para bookmaker ${bookmakerId}`);
    return { success: true, ledgerId: data };
  } catch (err: any) {
    console.error('[FreebetLedger] Exceção ao creditar freebet:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

/**
 * Consome freebet via ledger.
 * Usar quando:
 * - Aposta é registrada usando saldo de freebet
 * - Débito de freebet por uso
 */
export async function consumirFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  options?: {
    apostaId?: string;
    userId?: string;
    workspaceId?: string;
    descricao?: string;
  }
): Promise<FreebetOperationResult> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser maior que zero' };
    }

    const { data, error } = await supabase.rpc('consumir_freebet', {
      p_bookmaker_id: bookmakerId,
      p_valor: valor,
      p_aposta_id: options?.apostaId || null,
      p_user_id: options?.userId || null,
      p_workspace_id: options?.workspaceId || null,
      p_descricao: options?.descricao || null,
    });

    if (error) {
      console.error('[FreebetLedger] Erro ao consumir freebet:', error);
      return { success: false, error: error.message };
    }

    console.log(`[FreebetLedger] Freebet consumida: ${valor} de bookmaker ${bookmakerId}`);
    return { success: true, ledgerId: data };
  } catch (err: any) {
    console.error('[FreebetLedger] Exceção ao consumir freebet:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

/**
 * Estorna freebet via ledger.
 * Usar quando:
 * - Aposta que usou freebet é editada/deletada
 * - Reversão de consumo de freebet
 */
export async function estornarFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  motivo: string = 'Reversão de aposta',
  options?: {
    userId?: string;
    workspaceId?: string;
  }
): Promise<FreebetOperationResult> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser maior que zero' };
    }

    const { data, error } = await supabase.rpc('estornar_freebet', {
      p_bookmaker_id: bookmakerId,
      p_valor: valor,
      p_motivo: motivo,
      p_user_id: options?.userId || null,
      p_workspace_id: options?.workspaceId || null,
    });

    if (error) {
      console.error('[FreebetLedger] Erro ao estornar freebet:', error);
      return { success: false, error: error.message };
    }

    console.log(`[FreebetLedger] Freebet estornada: ${valor} para bookmaker ${bookmakerId}`);
    return { success: true, ledgerId: data };
  } catch (err: any) {
    console.error('[FreebetLedger] Exceção ao estornar freebet:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

/**
 * Expira freebet via ledger.
 * Usar quando:
 * - Freebet passa do prazo de validade
 * - Expiração manual/automática
 */
export async function expirarFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  motivo: string = 'Expiração por prazo',
  options?: {
    userId?: string;
    workspaceId?: string;
  }
): Promise<FreebetOperationResult> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser maior que zero' };
    }

    const { data, error } = await supabase.rpc('expirar_freebet', {
      p_bookmaker_id: bookmakerId,
      p_valor: valor,
      p_motivo: motivo,
      p_user_id: options?.userId || null,
      p_workspace_id: options?.workspaceId || null,
    });

    if (error) {
      console.error('[FreebetLedger] Erro ao expirar freebet:', error);
      return { success: false, error: error.message };
    }

    console.log(`[FreebetLedger] Freebet expirada: ${valor} de bookmaker ${bookmakerId}`);
    return { success: true, ledgerId: data };
  } catch (err: any) {
    console.error('[FreebetLedger] Exceção ao expirar freebet:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

/**
 * Converte freebet em saldo real via ledger.
 * Usar quando:
 * - Extração de freebet é bem-sucedida
 * - Freebet vira saldo operável
 * 
 * NOTA: Esta operação debita saldo_freebet E credita saldo_atual atomicamente.
 */
export async function converterFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  options?: {
    apostaId?: string;
    descricao?: string;
    userId?: string;
    workspaceId?: string;
  }
): Promise<FreebetOperationResult> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser maior que zero' };
    }

    const { data, error } = await supabase.rpc('converter_freebet', {
      p_bookmaker_id: bookmakerId,
      p_valor: valor,
      p_aposta_id: options?.apostaId || null,
      p_descricao: options?.descricao || 'Extração de freebet',
      p_user_id: options?.userId || null,
      p_workspace_id: options?.workspaceId || null,
    });

    if (error) {
      console.error('[FreebetLedger] Erro ao converter freebet:', error);
      return { success: false, error: error.message };
    }

    console.log(`[FreebetLedger] Freebet convertida: ${valor} para bookmaker ${bookmakerId}`);
    return { success: true, ledgerId: data };
  } catch (err: any) {
    console.error('[FreebetLedger] Exceção ao converter freebet:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Recalcula saldo_atual E saldo_freebet de uma bookmaker baseado no ledger.
 * Útil para correção de inconsistências.
 */
export async function recalcularSaldoBookmakerV2(
  bookmakerId: string
): Promise<{ success: boolean; saldoReal?: number; saldoFreebet?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('recalcular_saldo_bookmaker_v2', {
      p_bookmaker_id: bookmakerId,
    });

    if (error) {
      console.error('[FreebetLedger] Erro ao recalcular saldo:', error);
      return { success: false, error: error.message };
    }

    if (data && data.length > 0) {
      const result = data[0];
      console.log(`[FreebetLedger] Saldo recalculado: real=${result.saldo_real_calculado}, freebet=${result.saldo_freebet_calculado}`);
      return {
        success: true,
        saldoReal: result.saldo_real_calculado,
        saldoFreebet: result.saldo_freebet_calculado,
      };
    }

    return { success: false, error: 'Nenhum resultado retornado' };
  } catch (err: any) {
    console.error('[FreebetLedger] Exceção ao recalcular saldo:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

/**
 * Exporta um objeto com todas as funções para uso via destructuring.
 */
export const freebetLedgerService = {
  creditar: creditarFreebetViaLedger,
  consumir: consumirFreebetViaLedger,
  estornar: estornarFreebetViaLedger,
  expirar: expirarFreebetViaLedger,
  converter: converterFreebetViaLedger,
  recalcular: recalcularSaldoBookmakerV2,
};

export default freebetLedgerService;
