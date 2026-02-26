/**
 * Freebet Ledger Service - Motor Financeiro v7
 * 
 * Serviço para operações de Freebet usando o motor de eventos.
 * Todas as operações geram eventos em financial_events.
 */

import { supabase } from "@/integrations/supabase/client";
import { processFinancialEvent } from "./financialEngine";

// ============================================================================
// CREDITAR FREEBET
// ============================================================================

/**
 * Credita freebet.
 * @param bookmakerId ID da bookmaker
 * @param valor Valor a creditar
 * @param tipoOrigem Tipo de origem (MANUAL, QUALIFICADORA, etc) - LEGADO, ignorado
 * @param options Opções adicionais
 */
export async function creditarFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  tipoOrigemLegado?: string,
  options?: {
    descricao?: string;
    apostaId?: string;
    projetoId?: string;
    userId?: string;
    workspaceId?: string;
  }
): Promise<{ success: boolean; error?: string; eventId?: string }> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser positivo' };
    }

    const result = await processFinancialEvent({
      bookmakerId,
      apostaId: options?.apostaId,
      tipoEvento: 'FREEBET_CREDIT',
      tipoUso: 'FREEBET',
      origem: 'FREEBET',
      valor: valor, // Positivo = crédito
      descricao: options?.descricao || tipoOrigemLegado || 'Crédito de freebet',
      idempotencyKey: `fb_credit_${bookmakerId}_${Date.now()}`,
    });

    if (!result.success) {
      return { success: false, error: result.errorMessage };
    }

    console.log(`[FreebetLedger] Freebet creditada: ${valor} para bookmaker ${bookmakerId}`);
    return { success: true, eventId: result.eventId };
  } catch (err: any) {
    console.error('[FreebetLedger] Erro ao creditar freebet:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// CONSUMIR FREEBET
// ============================================================================

export async function consumirFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  options?: {
    descricao?: string;
    apostaId?: string;
  }
): Promise<{ success: boolean; error?: string; eventId?: string }> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser positivo' };
    }

    // CRÍTICO: Se apostaId fornecido, usar chave 'stake_{apostaId}' para que:
    // - liquidar_aposta_v4 detecte o evento existente (sem auto-heal duplicado)
    // - deletar_aposta_v4 encontre o evento via aposta_id (para reverter)
    const idempotencyKey = options?.apostaId 
      ? `stake_${options.apostaId}` 
      : `fb_stake_${bookmakerId}_${Date.now()}`;

    const result = await processFinancialEvent({
      bookmakerId,
      apostaId: options?.apostaId,
      tipoEvento: 'FREEBET_STAKE',
      tipoUso: 'FREEBET',
      origem: 'FREEBET',
      valor: -valor, // Negativo = débito
      descricao: options?.descricao || 'Consumo de freebet',
      idempotencyKey,
    });

    if (!result.success) {
      return { success: false, error: result.errorMessage };
    }

    console.log(`[FreebetLedger] Freebet consumida: ${valor} de bookmaker ${bookmakerId}`);
    return { success: true, eventId: result.eventId };
  } catch (err: any) {
    console.error('[FreebetLedger] Erro ao consumir freebet:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// ESTORNAR FREEBET
// ============================================================================

/**
 * Estorna freebet.
 * @param bookmakerId ID da bookmaker
 * @param valor Valor a estornar
 * @param descricaoLegada Descrição (suporte legado como string direta)
 * @param options Opções adicionais
 */
export async function estornarFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  descricaoLegada?: string | { descricao?: string; eventoOriginalId?: string },
  options?: {
    userId?: string;
    workspaceId?: string;
  }
): Promise<{ success: boolean; error?: string; eventId?: string }> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser positivo' };
    }

    // Suportar chamadas legadas com string direta ou objeto
    const descricao = typeof descricaoLegada === 'string' 
      ? descricaoLegada 
      : descricaoLegada?.descricao || 'Estorno de freebet';
    const eventoOriginalId = typeof descricaoLegada === 'object' 
      ? descricaoLegada?.eventoOriginalId 
      : undefined;

    const result = await processFinancialEvent({
      bookmakerId,
      tipoEvento: 'REVERSAL',
      tipoUso: 'FREEBET',
      origem: 'FREEBET',
      valor: valor, // Positivo = crédito (estorno)
      descricao,
      reversedEventId: eventoOriginalId,
      idempotencyKey: `fb_estorno_${bookmakerId}_${Date.now()}`,
    });

    if (!result.success) {
      return { success: false, error: result.errorMessage };
    }

    console.log(`[FreebetLedger] Freebet estornada: ${valor} para bookmaker ${bookmakerId}`);
    return { success: true, eventId: result.eventId };
  } catch (err: any) {
    console.error('[FreebetLedger] Erro ao estornar freebet:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// EXPIRAR FREEBET
// ============================================================================

export async function expirarFreebetViaLedger(
  bookmakerId: string,
  valor: number,
  options?: {
    descricao?: string;
  }
): Promise<{ success: boolean; error?: string; eventId?: string }> {
  try {
    if (valor <= 0) {
      return { success: false, error: 'Valor deve ser positivo' };
    }

    const result = await processFinancialEvent({
      bookmakerId,
      tipoEvento: 'FREEBET_EXPIRE',
      tipoUso: 'FREEBET',
      origem: 'FREEBET',
      valor: -valor, // Negativo = expiração
      descricao: options?.descricao || 'Expiração de freebet',
      idempotencyKey: `fb_expire_${bookmakerId}_${Date.now()}`,
    });

    if (!result.success) {
      return { success: false, error: result.errorMessage };
    }

    console.log(`[FreebetLedger] Freebet expirada: ${valor} de bookmaker ${bookmakerId}`);
    return { success: true, eventId: result.eventId };
  } catch (err: any) {
    console.error('[FreebetLedger] Erro ao expirar freebet:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// RECALCULAR SALDO (v7 - leitura da view de auditoria)
// ============================================================================

export async function recalcularSaldoBookmakerV2(
  bookmakerId: string
): Promise<{ success: boolean; saldoReal?: number; saldoFreebet?: number; error?: string }> {
  try {
    // Usar a view de auditoria para obter a soma dos eventos
    const { data, error } = await supabase
      .from('v_financial_audit')
      .select('soma_eventos_normal, soma_eventos_freebet')
      .eq('bookmaker_id', bookmakerId)
      .single();

    if (error) {
      console.error('[FreebetLedger] Erro ao buscar auditoria:', error);
      return { success: false, error: error.message };
    }

    if (data) {
      console.log(`[FreebetLedger] Saldo calculado: real=${data.soma_eventos_normal}, freebet=${data.soma_eventos_freebet}`);
      
      // Atualizar saldo para refletir a soma dos eventos
      const { error: updateError } = await supabase
        .from('bookmakers')
        .update({
          saldo_atual: data.soma_eventos_normal || 0,
          saldo_freebet: data.soma_eventos_freebet || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookmakerId);

      if (updateError) {
        console.error('[FreebetLedger] Erro ao atualizar saldo:', updateError);
        return { success: false, error: updateError.message };
      }

      return {
        success: true,
        saldoReal: data.soma_eventos_normal || 0,
        saldoFreebet: data.soma_eventos_freebet || 0,
      };
    }

    return { success: false, error: 'Nenhum resultado retornado' };
  } catch (err: any) {
    console.error('[FreebetLedger] Exceção ao recalcular saldo:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const freebetLedgerService = {
  creditar: creditarFreebetViaLedger,
  consumir: consumirFreebetViaLedger,
  estornar: estornarFreebetViaLedger,
  expirar: expirarFreebetViaLedger,
  recalcular: recalcularSaldoBookmakerV2,
};
