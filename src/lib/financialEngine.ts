/**
 * Financial Engine v6 - Motor Financeiro Baseado em Eventos
 * 
 * ÚNICA FONTE DE VERDADE: financial_events
 * 
 * Este serviço é o ponto central para todas as operações financeiras.
 * Ele NÃO atualiza saldos diretamente - apenas emite eventos que são
 * processados pelo trigger tr_financial_event_sync no banco de dados.
 * 
 * FLUXO:
 * 1. Frontend chama FinancialEngine.process()
 * 2. RPC process_financial_event insere em financial_events
 * 3. Trigger tr_financial_event_sync recalcula saldo e marca processed_at
 * 4. Saldo atualizado em bookmakers.saldo_atual / saldo_freebet
 * 
 * REGRAS:
 * - Idempotência garantida por idempotency_key
 * - Valor positivo = crédito, negativo = débito
 * - tipo_uso: NORMAL (saldo_atual) ou FREEBET (saldo_freebet)
 */

import { supabase } from "@/integrations/supabase/client";

export type FinancialEventType = 
  | 'STAKE_DEBIT'      // Débito de stake ao criar aposta
  | 'PAYOUT_GREEN'     // Retorno de aposta ganha (stake + lucro)
  | 'PAYOUT_VOID'      // Retorno de aposta void (apenas stake)
  | 'PAYOUT_MEIO_GREEN' // Retorno parcial (meio green)
  | 'PAYOUT_MEIO_RED'  // Retorno parcial (meio red)
  | 'REVERSAL'         // Reversão de evento anterior
  | 'FREEBET_DEBIT'    // Consumo de freebet
  | 'FREEBET_PAYOUT'   // Lucro de freebet (sem retorno de stake)
  | 'FREEBET_CREDIT'   // Crédito de freebet
  | 'FREEBET_EXPIRE'   // Expiração de freebet
  | 'CASHBACK'         // Cashback creditado
  | 'BONUS_CREDIT'     // Bônus creditado
  | 'DEPOSITO'         // Depósito
  | 'SAQUE'            // Saque
  | 'AJUSTE_MANUAL'    // Ajuste manual
  | 'PERDA_OPERACIONAL'; // Perda (limitação, bloqueio)

export type BalancePoolType = 'NORMAL' | 'FREEBET';

export type EventOrigin = 
  | 'DEPOSITO' 
  | 'BONUS' 
  | 'LUCRO' 
  | 'CASHBACK' 
  | 'PROMO' 
  | 'FREEBET' 
  | 'AJUSTE'
  | null;

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
}

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

    const result = data?.[0];
    if (!result) {
      return { success: false, errorMessage: 'Resposta vazia do RPC' };
    }

    if (!result.success) {
      console.warn('[FinancialEngine] Evento rejeitado:', result.error_message);
      return { 
        success: false, 
        errorMessage: result.error_message,
        newBalance: result.new_balance 
      };
    }

    console.log('[FinancialEngine] ✅ Evento processado:', {
      eventId: result.event_id,
      newBalance: result.new_balance,
    });

    return {
      success: true,
      eventId: result.event_id,
      newBalance: result.new_balance,
    };
  } catch (err: any) {
    console.error('[FinancialEngine] Exceção:', err);
    return { success: false, errorMessage: err.message };
  }
}

/**
 * Liquida uma aposta usando o motor de eventos.
 */
export async function liquidarAposta(
  apostaId: string,
  resultado: 'GREEN' | 'RED' | 'VOID' | 'MEIO_GREEN' | 'MEIO_RED',
  lucroPrejuizo?: number
): Promise<{ success: boolean; message?: string; eventsCreated?: number }> {
  try {
    console.log('[FinancialEngine] Liquidando aposta:', { apostaId, resultado });

    const { data, error } = await supabase.rpc('liquidar_aposta_v3', {
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
 * Reverte a liquidação de uma aposta.
 */
export async function reverterLiquidacao(
  apostaId: string
): Promise<{ success: boolean; message?: string; reversalsCreated?: number }> {
  try {
    console.log('[FinancialEngine] Revertendo liquidação:', apostaId);

    const { data, error } = await supabase.rpc('reverter_liquidacao_v3', {
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
 * Cria uma aposta com débito atômico via eventos.
 */
export async function criarApostaComDebito(
  apostaData: {
    workspaceId: string;
    userId: string;
    projetoId: string;
    dataAposta?: string;
    estrategia?: string;
    evento?: string;
    mercado?: string;
    esporte?: string;
    observacoes?: string;
    contextoOperacional?: string;
  },
  pernas: Array<{
    bookmakerId: string;
    stake: number;
    odd: number;
    selecao: string;
    moeda?: string;
    fonteSaldo?: string;
    ordem?: number;
  }>
): Promise<{ success: boolean; apostaId?: string; message?: string }> {
  try {
    console.log('[FinancialEngine] Criando aposta com débito:', {
      pernas: pernas.length,
      totalStake: pernas.reduce((sum, p) => sum + p.stake, 0),
    });

    const { data, error } = await supabase.rpc('criar_aposta_com_debito_v3', {
      p_aposta_data: {
        workspace_id: apostaData.workspaceId,
        user_id: apostaData.userId,
        projeto_id: apostaData.projetoId,
        data_aposta: apostaData.dataAposta,
        estrategia: apostaData.estrategia,
        evento: apostaData.evento,
        mercado: apostaData.mercado,
        esporte: apostaData.esporte,
        observacoes: apostaData.observacoes,
        contexto_operacional: apostaData.contextoOperacional,
      },
      p_pernas: pernas.map((p, i) => ({
        bookmaker_id: p.bookmakerId,
        stake: p.stake,
        odd: p.odd,
        selecao: p.selecao,
        moeda: p.moeda || 'BRL',
        fonte_saldo: p.fonteSaldo || 'REAL',
        ordem: p.ordem ?? i + 1,
      })),
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
      message: result.message,
    };
  } catch (err: any) {
    console.error('[FinancialEngine] Exceção ao criar aposta:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Consulta auditoria financeira.
 */
export async function getFinancialAudit(workspaceId?: string): Promise<{
  success: boolean;
  data?: Array<{
    bookmaker_id: string;
    bookmaker_nome: string;
    saldo_registrado: number;
    freebet_registrado: number;
    soma_eventos_normal: number;
    soma_eventos_freebet: number;
    diferenca_normal: number;
    diferenca_freebet: number;
    status_auditoria: string;
  }>;
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

// Helpers para operações comuns

/**
 * Registra depósito via evento.
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
    valor: params.valor, // Positivo = crédito
    moeda: params.moeda,
    descricao: params.descricao || 'Depósito',
    idempotencyKey: `dep_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra saque via evento.
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
    valor: -Math.abs(params.valor), // Negativo = débito
    moeda: params.moeda,
    descricao: params.descricao || 'Saque',
    idempotencyKey: `saq_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra cashback via evento.
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
    valor: params.valor, // Positivo = crédito
    moeda: params.moeda,
    descricao: params.descricao || 'Cashback',
    idempotencyKey: `cb_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra bônus via evento.
 */
export async function registrarBonus(params: {
  bookmakerId: string;
  valor: number;
  moeda?: string;
  descricao?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'BONUS_CREDIT',
    tipoUso: 'NORMAL',
    origem: 'BONUS',
    valor: params.valor, // Positivo = crédito
    moeda: params.moeda,
    descricao: params.descricao || 'Crédito de bônus',
    idempotencyKey: `bon_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Credita freebet via evento.
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
    valor: params.valor, // Positivo = crédito
    moeda: params.moeda,
    descricao: params.descricao || 'Crédito de freebet',
    idempotencyKey: `fb_${params.bookmakerId}_${Date.now()}`,
  });
}

/**
 * Registra ajuste manual via evento.
 */
export async function registrarAjusteManual(params: {
  bookmakerId: string;
  valor: number; // Positivo ou negativo
  moeda?: string;
  descricao?: string;
  motivo?: string;
}): Promise<FinancialEventResult> {
  return processFinancialEvent({
    bookmakerId: params.bookmakerId,
    tipoEvento: 'AJUSTE_MANUAL',
    tipoUso: 'NORMAL',
    origem: 'AJUSTE',
    valor: params.valor,
    moeda: params.moeda,
    descricao: params.descricao || params.motivo || 'Ajuste manual',
    idempotencyKey: `adj_${params.bookmakerId}_${Date.now()}`,
    metadata: { motivo: params.motivo },
  });
}
