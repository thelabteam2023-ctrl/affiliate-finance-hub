/**
 * Financial Engine v7 - Motor Financeiro Único e Determinístico
 * 
 * ÚNICA FONTE DE VERDADE: financial_events
 * 
 * Este serviço é o ÚNICO ponto de entrada para operações financeiras.
 * Ele processa eventos que são registrados na tabela financial_events
 * e atualiza saldos de forma atômica dentro das RPCs.
 * 
 * REGRAS:
 * - Idempotência garantida por idempotency_key
 * - Valor positivo = crédito, negativo = débito
 * - tipo_uso: NORMAL (saldo_atual) ou FREEBET (saldo_freebet)
 * - NENHUM trigger atualiza saldo - tudo via RPC
 * 
 * TIPOS DE EVENTO:
 * - STAKE: Débito de stake ao criar aposta (NORMAL)
 * - FREEBET_STAKE: Débito de stake usando freebet
 * - PAYOUT: Retorno de aposta ganha (stake + lucro)
 * - FREEBET_PAYOUT: Lucro de freebet (sem retorno de stake)
 * - VOID_REFUND: Devolução de stake em VOID
 * - REVERSAL: Reversão de evento anterior
 * - DEPOSITO/SAQUE/CASHBACK/BONUS/AJUSTE: Operações diretas
 */

import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// TIPOS
// ============================================================================

export type FinancialEventType = 
  | 'STAKE'
  | 'PAYOUT'
  | 'VOID_REFUND'
  | 'REVERSAL'
  | 'FREEBET_STAKE'
  | 'FREEBET_PAYOUT'
  | 'FREEBET_CREDIT'
  | 'FREEBET_EXPIRE'
  | 'DEPOSITO'
  | 'SAQUE'
  | 'CASHBACK'
  | 'BONUS'
  | 'AJUSTE';

export type BalancePoolType = 'NORMAL' | 'FREEBET';

export type EventOrigin = 'DEPOSITO' | 'BONUS' | 'LUCRO' | 'CASHBACK' | 'PROMO' | 'FREEBET' | 'AJUSTE' | null;

export interface FinancialEventInput {
  bookmakerId: string;
  apostaId?: string;
  tipoEvento: FinancialEventType;
  tipoUso?: BalancePoolType;
  origem?: EventOrigin;
  valor: number;
  moeda?: string;
  idempotencyKey?: string;
  reversedEventId?: string;
  descricao?: string;
  metadata?: Record<string, unknown>;
}

export interface FinancialEventResult {
  success: boolean;
  eventId?: string;
  errorMessage?: string;
  newBalance?: number;
  newFreebetBalance?: number;
}

// ============================================================================
// PROCESSO DE EVENTO FINANCEIRO (CORE)
// ============================================================================

/**
 * Processa um evento financeiro.
 * Esta é a ÚNICA forma de movimentar dinheiro no sistema.
 */
export async function processFinancialEvent(
  input: FinancialEventInput
): Promise<FinancialEventResult> {
  try {
    console.log('[FinancialEngine] Processando evento:', {
      tipo: input.tipoEvento,
      valor: input.valor,
      bookmaker: input.bookmakerId,
      tipoUso: input.tipoUso || 'NORMAL',
    });

    const { data, error } = await supabase.rpc('process_financial_event', {
      p_bookmaker_id: input.bookmakerId,
      p_aposta_id: input.apostaId || null,
      p_tipo_evento: input.tipoEvento,
      p_tipo_uso: input.tipoUso || 'NORMAL',
      p_origem: input.origem || null,
      p_valor: input.valor,
      p_moeda: input.moeda || 'BRL',
      p_idempotency_key: input.idempotencyKey || null,
      p_reversed_event_id: input.reversedEventId || null,
      p_descricao: input.descricao || null,
      p_metadata: JSON.stringify(input.metadata || {}),
    });

    if (error) {
      console.error('[FinancialEngine] Erro RPC:', error);
      return { success: false, errorMessage: error.message };
    }

    // RPC retorna jsonb (objeto único), não array
    const raw = Array.isArray(data) ? data?.[0] : data;
    const result = raw as any;
    if (!result) {
      return { success: false, errorMessage: 'Resposta vazia do RPC' };
    }

    if (!result.success) {
      console.warn('[FinancialEngine] Evento rejeitado:', result.error_message || result.error);
      return { 
        success: false, 
        errorMessage: result.error_message || result.error,
        newBalance: result.new_balance ?? result.saldo_atual,
        newFreebetBalance: result.new_freebet_balance ?? result.saldo_freebet,
      };
    }

    console.log('[FinancialEngine] ✅ Evento processado:', {
      eventId: result.event_id,
      newBalance: result.new_balance ?? result.saldo_atual,
    });

    return {
      success: true,
      eventId: result.event_id,
      newBalance: result.new_balance ?? result.saldo_atual,
      newFreebetBalance: result.new_freebet_balance ?? result.saldo_freebet,
    };
  } catch (err: any) {
    console.error('[FinancialEngine] Exceção:', err);
    return { success: false, errorMessage: err.message };
  }
}

// ============================================================================
// OPERAÇÕES DE APOSTA
// ============================================================================

export interface CriarApostaParams {
  workspaceId: string;
  userId: string;
  projetoId: string;
  bookmakerId: string;
  stake: number;
  odd: number;
  selecao: string;
  estrategia?: string;
  formaRegistro?: string;
  fonteSaldo?: 'REAL' | 'FREEBET';
  evento?: string;
  esporte?: string;
  mercado?: string;
  observacoes?: string;
  dataAposta?: string;
}

/**
 * Cria uma aposta com débito atômico de stake.
 */
export async function criarApostaComDebito(
  params: CriarApostaParams
): Promise<{ success: boolean; apostaId?: string; eventId?: string; message?: string }> {
  try {
    console.log('[FinancialEngine] Criando aposta com débito:', {
      bookmaker: params.bookmakerId,
      stake: params.stake,
      fonteSaldo: params.fonteSaldo || 'REAL',
    });

    const { data, error } = await supabase.rpc('criar_aposta_atomica_v3', {
      p_workspace_id: params.workspaceId,
      p_user_id: params.userId,
      p_projeto_id: params.projetoId,
      p_bookmaker_id: params.bookmakerId,
      p_stake: params.stake,
      p_odd: params.odd,
      p_selecao: params.selecao,
      p_estrategia: params.estrategia || 'PUNTER',
      p_forma_registro: params.formaRegistro || 'SIMPLES',
      p_fonte_saldo: params.fonteSaldo || 'REAL',
      p_evento: params.evento || null,
      p_esporte: params.esporte || null,
      p_mercado: params.mercado || null,
      p_observacoes: params.observacoes || null,
      p_data_aposta: params.dataAposta || new Date().toISOString(),
    });

    if (error) {
      console.error('[FinancialEngine] Erro ao criar aposta:', error);
      return { success: false, message: error.message };
    }

    const result = data?.[0];
    if (!result?.success) {
      return { success: false, message: result?.message || 'Erro desconhecido' };
    }

    console.log('[FinancialEngine] ✅ Aposta criada:', result.aposta_id);
    return {
      success: true,
      apostaId: result.aposta_id,
      eventId: result.event_id,
      message: result.message,
    };
  } catch (err: any) {
    console.error('[FinancialEngine] Exceção ao criar aposta:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Liquida uma aposta (GREEN, RED, VOID, MEIO_GREEN, MEIO_RED).
 */
export async function liquidarAposta(
  apostaId: string,
  resultado: 'GREEN' | 'RED' | 'VOID' | 'MEIO_GREEN' | 'MEIO_RED',
  lucroPrejuizo?: number
): Promise<{ success: boolean; message?: string; eventsCreated?: number }> {
  try {
    console.log('[FinancialEngine] Liquidando aposta:', { apostaId, resultado });

    const { data, error } = await supabase.rpc('liquidar_aposta_v4', {
      p_aposta_id: apostaId,
      p_resultado: resultado,
      p_lucro_prejuizo: lucroPrejuizo ?? null,
    });

    if (error) {
      console.error('[FinancialEngine] Erro ao liquidar:', error);
      return { success: false, message: error.message };
    }

    const result = data?.[0];
    if (!result?.success) {
      return { success: false, message: result?.message || 'Erro desconhecido' };
    }

    console.log('[FinancialEngine] ✅ Aposta liquidada:', result);
    return {
      success: true,
      message: result.message,
      eventsCreated: result.events_created,
    };
  } catch (err: any) {
    console.error('[FinancialEngine] Exceção ao liquidar:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Reverte a liquidação de uma aposta (volta para PENDENTE).
 */
export async function reverterLiquidacao(
  apostaId: string
): Promise<{ success: boolean; message?: string; reversalsCreated?: number }> {
  try {
    console.log('[FinancialEngine] Revertendo liquidação:', apostaId);

    const { data, error } = await supabase.rpc('reverter_liquidacao_v4', {
      p_aposta_id: apostaId,
    });

    if (error) {
      console.error('[FinancialEngine] Erro ao reverter:', error);
      return { success: false, message: error.message };
    }

    const result = data?.[0];
    if (!result?.success) {
      return { success: false, message: result?.message || 'Erro desconhecido' };
    }

    console.log('[FinancialEngine] ✅ Liquidação revertida:', result);
    return {
      success: true,
      message: result.message,
      reversalsCreated: result.reversals_created,
    };
  } catch (err: any) {
    console.error('[FinancialEngine] Exceção ao reverter:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Deleta uma aposta com reversão financeira completa.
 */
export async function deletarAposta(
  apostaId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    console.log('[FinancialEngine] Deletando aposta:', apostaId);

    const { data, error } = await supabase.rpc('deletar_aposta_v4', {
      p_aposta_id: apostaId,
    });

    if (error) {
      console.error('[FinancialEngine] Erro ao deletar:', error);
      return { success: false, message: error.message };
    }

    const result = data?.[0];
    if (!result?.success) {
      return { success: false, message: result?.message || 'Erro desconhecido' };
    }

    console.log('[FinancialEngine] ✅ Aposta deletada:', result);
    return { success: true, message: result.message };
  } catch (err: any) {
    console.error('[FinancialEngine] Exceção ao deletar:', err);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// OPERAÇÕES FINANCEIRAS DIRETAS
// ============================================================================

/**
 * Registra depósito.
 */
export async function registrarDeposito(params: {
  bookmakerId: string;
  valor: number;
  moeda?: string;
  descricao?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'DEPOSITO',
    tipoUso: 'NORMAL',
    origem: 'DEPOSITO',
    valor: params.valor,
    moeda: params.moeda,
    descricao: params.descricao || 'Depósito',
    idempotencyKey: `dep_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra saque.
 */
export async function registrarSaque(params: {
  bookmakerId: string;
  valor: number;
  moeda?: string;
  descricao?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'SAQUE',
    tipoUso: 'NORMAL',
    origem: null,
    valor: -Math.abs(params.valor),
    moeda: params.moeda,
    descricao: params.descricao || 'Saque',
    idempotencyKey: `saq_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra cashback.
 */
export async function registrarCashback(params: {
  bookmakerId: string;
  valor: number;
  moeda?: string;
  descricao?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'CASHBACK',
    tipoUso: 'NORMAL',
    origem: 'CASHBACK',
    valor: params.valor,
    moeda: params.moeda,
    descricao: params.descricao || 'Cashback',
    idempotencyKey: `cb_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra bônus.
 */
export async function registrarBonus(params: {
  bookmakerId: string;
  valor: number;
  moeda?: string;
  descricao?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'BONUS',
    tipoUso: 'NORMAL',
    origem: 'BONUS',
    valor: params.valor,
    moeda: params.moeda,
    descricao: params.descricao || 'Crédito de bônus',
    idempotencyKey: `bon_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Credita freebet.
 */
export async function creditarFreebet(params: {
  bookmakerId: string;
  valor: number;
  moeda?: string;
  descricao?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'FREEBET_CREDIT',
    tipoUso: 'FREEBET',
    origem: 'FREEBET',
    valor: params.valor,
    moeda: params.moeda,
    descricao: params.descricao || 'Crédito de freebet',
    idempotencyKey: `fb_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra ajuste manual.
 */
export async function registrarAjusteManual(params: {
  bookmakerId: string;
  valor: number;
  moeda?: string;
  descricao?: string;
  motivo?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'AJUSTE',
    tipoUso: 'NORMAL',
    origem: 'AJUSTE',
    valor: params.valor,
    moeda: params.moeda,
    descricao: params.descricao || params.motivo || 'Ajuste manual',
    idempotencyKey: `adj_${params.bookmakerId}_${Date.now()}`,
    metadata: { motivo: params.motivo },
  });
}

// ============================================================================
// AUDITORIA
// ============================================================================

export interface AuditResult {
  bookmaker_id: string;
  bookmaker_nome: string;
  workspace_id: string;
  moeda: string;
  saldo_registrado: number;
  freebet_registrado: number;
  soma_eventos_normal: number;
  soma_eventos_freebet: number;
  diferenca_normal: number;
  diferenca_freebet: number;
  status_auditoria: string;
  total_eventos: number;
}

/**
 * Consulta auditoria financeira.
 */
export async function getFinancialAudit(workspaceId?: string): Promise<{
  success: boolean;
  data?: AuditResult[];
  error?: string;
}> {
  try {
    let query = supabase.from('v_financial_audit').select('*');
    
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
