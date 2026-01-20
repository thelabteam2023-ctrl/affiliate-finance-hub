/**
 * Serviço de Ledger Financeiro
 * 
 * ESTE É O PONTO CENTRAL PARA TODAS AS MOVIMENTAÇÕES FINANCEIRAS.
 * 
 * Em vez de atualizar saldo_atual diretamente, insere registros em cash_ledger.
 * O trigger atualizar_saldo_bookmaker_v2 processa automaticamente os impactos.
 * 
 * FLUXO:
 * 1. Frontend chama insertLedgerEntry()
 * 2. Insere em cash_ledger com tipo_transacao apropriado
 * 3. Trigger atualizar_saldo_bookmaker_v2 detecta e atualiza bookmakers.saldo_atual
 * 4. Trigger registra auditoria em bookmaker_balance_audit
 * 
 * TIPOS DE TRANSAÇÃO SUPORTADOS:
 * - CASHBACK_MANUAL: Cashback creditado manualmente
 * - CASHBACK_ESTORNO: Reversão de cashback
 * - PERDA_OPERACIONAL: Perda confirmada (limitação, bloqueio, etc)
 * - PERDA_REVERSAO: Reversão de perda operacional
 * - AJUSTE_POSITIVO: Ajuste manual de saldo (crédito)
 * - AJUSTE_NEGATIVO: Ajuste manual de saldo (débito)
 * - EVENTO_PROMOCIONAL: Crédito promocional
 * - APOSTA_GREEN/RED/VOID/MEIO_GREEN/MEIO_RED: Resultados de apostas
 */

import { supabase } from "@/integrations/supabase/client";

export type LedgerTransactionType = 
  | 'CASHBACK_MANUAL'
  | 'CASHBACK_ESTORNO'
  | 'PERDA_OPERACIONAL'
  | 'PERDA_REVERSAO'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'EVENTO_PROMOCIONAL'
  | 'APOSTA_GREEN'
  | 'APOSTA_RED'
  | 'APOSTA_VOID'
  | 'APOSTA_MEIO_GREEN'
  | 'APOSTA_MEIO_RED'
  | 'APOSTA_REVERSAO'
  | 'DEPOSITO'
  | 'SAQUE'
  | 'TRANSFERENCIA'
  | 'BONUS_CREDITADO'
  | 'BONUS_ESTORNO'
  | 'GANHO_CAMBIAL'
  | 'PERDA_CAMBIAL';

export interface LedgerEntryInput {
  /** Tipo da transação - determina como o trigger processa */
  tipoTransacao: LedgerTransactionType;
  /** Valor absoluto (sempre positivo) */
  valor: number;
  /** Moeda da operação (BRL, USD, USDT) */
  moeda: string;
  /** ID do workspace */
  workspaceId: string;
  /** ID do usuário que executou */
  userId: string;
  /** ID da bookmaker de destino (para créditos) */
  destinoBookmakerId?: string;
  /** ID da bookmaker de origem (para débitos) */
  origemBookmakerId?: string;
  /** ID do projeto (se aplicável) */
  projetoId?: string;
  /** Descrição da operação */
  descricao?: string;
  /** Data da transação (default: hoje) */
  dataTransacao?: string;
  /** Se impacta caixa operacional */
  impactaCaixaOperacional?: boolean;
  /** Tipo de moeda: fiat ou crypto */
  tipoMoeda?: 'FIAT' | 'CRYPTO';
  /** Cotação snapshot (para conversão) */
  cotacao?: number;
  /** Referência a outra transação */
  referenciaTransacaoId?: string;
  /** Metadados de auditoria */
  auditoriaMetadata?: Record<string, unknown>;
}

export interface LedgerEntryResult {
  success: boolean;
  entryId?: string;
  error?: string;
}

/**
 * Insere uma entrada no ledger financeiro.
 * O trigger atualizar_saldo_bookmaker_v2 processa automaticamente.
 */
export async function insertLedgerEntry(
  input: LedgerEntryInput
): Promise<LedgerEntryResult> {
  try {
    const dataTransacao = input.dataTransacao || new Date().toISOString().split('T')[0];
    
    // Build insert payload - using type assertion since trigger handles custom tipos
    const insertPayload = {
      tipo_transacao: input.tipoTransacao,
      valor: input.valor,
      moeda: input.moeda,
      workspace_id: input.workspaceId,
      user_id: input.userId,
      destino_bookmaker_id: input.destinoBookmakerId || null,
      origem_bookmaker_id: input.origemBookmakerId || null,
      descricao: input.descricao || null,
      data_transacao: dataTransacao,
      impacta_caixa_operacional: input.impactaCaixaOperacional ?? true,
      tipo_moeda: input.tipoMoeda || 'FIAT',
      cotacao: input.cotacao || null,
      referencia_transacao_id: input.referenciaTransacaoId || null,
      auditoria_metadata: input.auditoriaMetadata || null,
      status: 'CONFIRMADO',
    };
    
    const { data, error } = await supabase
      .from('cash_ledger')
      .insert(insertPayload as any)
      .select('id')
      .single();

    if (error) {
      console.error('[insertLedgerEntry] Erro ao inserir:', error);
      return { success: false, error: error.message };
    }

    console.log(`[insertLedgerEntry] Entrada criada: ${data.id} (${input.tipoTransacao})`);
    return { success: true, entryId: data.id };
  } catch (err: any) {
    console.error('[insertLedgerEntry] Exceção:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Registra cashback manual via ledger.
 * Crédito na bookmaker especificada.
 */
export async function registrarCashbackViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  dataCredito?: string;
  cotacao?: number;
  referenciaId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'CASHBACK_MANUAL',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Cashback manual',
    dataTransacao: params.dataCredito,
    cotacao: params.cotacao,
    impactaCaixaOperacional: true,
    auditoriaMetadata: params.referenciaId ? { cashback_id: params.referenciaId } : undefined,
  });
}

/**
 * Estorna cashback via ledger.
 * Débito na bookmaker especificada.
 */
export async function estornarCashbackViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  referenciaId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'CASHBACK_ESTORNO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Estorno de cashback',
    impactaCaixaOperacional: true,
    auditoriaMetadata: params.referenciaId ? { cashback_id: params.referenciaId } : undefined,
  });
}

/**
 * Registra perda operacional confirmada via ledger.
 * Débito na bookmaker especificada.
 */
export async function registrarPerdaOperacionalViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  perdaId?: string;
  categoria?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'PERDA_OPERACIONAL',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Perda operacional',
    impactaCaixaOperacional: true,
    auditoriaMetadata: {
      perda_id: params.perdaId,
      categoria: params.categoria,
    },
  });
}

/**
 * Reverte perda operacional via ledger.
 * Crédito na bookmaker especificada.
 */
export async function reverterPerdaOperacionalViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  perdaId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'PERDA_REVERSAO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Reversão de perda operacional',
    impactaCaixaOperacional: true,
    auditoriaMetadata: params.perdaId ? { perda_id: params.perdaId } : undefined,
  });
}

/**
 * Registra ajuste manual de saldo via ledger.
 */
export async function registrarAjusteViaLedger(params: {
  bookmakerId: string;
  delta: number; // positivo = crédito, negativo = débito
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  motivo?: string;
}): Promise<LedgerEntryResult> {
  const isCredito = params.delta > 0;
  
  return insertLedgerEntry({
    tipoTransacao: isCredito ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
    valor: Math.abs(params.delta),
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: isCredito ? params.bookmakerId : undefined,
    origemBookmakerId: isCredito ? undefined : params.bookmakerId,
    descricao: params.descricao || `Ajuste manual: ${params.motivo || 'Sem motivo'}`,
    impactaCaixaOperacional: true,
    auditoriaMetadata: { ajuste_direcao: isCredito ? 'credito' : 'debito', ajuste_motivo: params.motivo },
  });
}

/**
 * Registra crédito de bônus via ledger.
 */
export async function registrarBonusCreditadoViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  bonusId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'BONUS_CREDITADO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Crédito de bônus',
    impactaCaixaOperacional: true,
    auditoriaMetadata: params.bonusId ? { bonus_id: params.bonusId } : undefined,
  });
}

/**
 * Registra estorno de bônus via ledger.
 */
export async function estornarBonusViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  bonusId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'BONUS_ESTORNO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Estorno de bônus',
    impactaCaixaOperacional: true,
    auditoriaMetadata: params.bonusId ? { bonus_id: params.bonusId } : undefined,
  });
}

/**
 * Registra ganho cambial via ledger (diferença positiva em conciliação).
 */
export async function registrarGanhoCambialViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  transacaoOrigemId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'GANHO_CAMBIAL',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Ganho cambial em conciliação',
    impactaCaixaOperacional: true,
    referenciaTransacaoId: params.transacaoOrigemId,
    auditoriaMetadata: { tipo: 'ganho_cambial' },
  });
}

/**
 * Registra perda cambial via ledger (diferença negativa em conciliação).
 */
export async function registrarPerdaCambialViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  transacaoOrigemId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'PERDA_CAMBIAL',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Perda cambial em conciliação',
    impactaCaixaOperacional: true,
    referenciaTransacaoId: params.transacaoOrigemId,
    auditoriaMetadata: { tipo: 'perda_cambial' },
  });
}

/**
 * Helper para obter moeda de uma bookmaker
 */
export async function getBookmakerMoeda(bookmakerId: string): Promise<string> {
  const { data } = await supabase
    .from('bookmakers')
    .select('moeda')
    .eq('id', bookmakerId)
    .maybeSingle();
  
  return data?.moeda || 'BRL';
}
