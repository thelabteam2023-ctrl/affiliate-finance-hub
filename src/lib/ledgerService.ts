/**
 * Serviço de Ledger Financeiro
 * 
 * ESTE É O PONTO CENTRAL PARA TODAS AS MOVIMENTAÇÕES FINANCEIRAS.
 * 
 * Em vez de atualizar saldo_atual diretamente, insere registros em cash_ledger.
 * O trigger atualizar_saldo_bookmaker_v2 processa automaticamente os impactos.
 * 
 * NOVA ARQUITETURA DE SALDO:
 * - saldo_atual = saldo "normal" (inclui bônus convertido)
 * - saldo_freebet = único pool separado (freebets)
 * - saldo_bonus = DEPRECATED (mantido para retrocompatibilidade, mas tratado como saldo_atual)
 * 
 * REGRA DE OURO:
 * - Bônus é dinheiro NORMAL com tag de origem no ledger
 * - Apenas Freebet tem pool separado
 * - usar_freebet toggle é a verdade financeira
 * 
 * FLUXO:
 * 1. Frontend chama insertLedgerEntry()
 * 2. Insere em cash_ledger com tipo_transacao apropriado
 * 3. Trigger atualizar_saldo_bookmaker_v2 detecta e atualiza bookmakers.saldo_atual
 * 4. Trigger registra auditoria em bookmaker_balance_audit
 * 
 * TIPOS DE TRANSAÇÃO SUPORTADOS:
 * - CASHBACK_MANUAL: Cashback creditado manualmente (lucro operacional)
 * - BONUS_CREDITADO: Bônus creditado (vai para saldo_atual, é dinheiro normal)
 * - PERDA_OPERACIONAL: Perda confirmada (limitação, bloqueio, etc)
 * - APOSTA_GREEN/RED/VOID/MEIO_GREEN/MEIO_RED: Resultados de apostas
 * - FREEBET_*: Operações de freebet (único pool separado)
 */

import { supabase } from "@/integrations/supabase/client";

export type LedgerTransactionType = 
  | 'CASHBACK_MANUAL'
  | 'CASHBACK_ESTORNO'
  | 'PERDA_OPERACIONAL'
  | 'PERDA_REVERSAO'
  | 'AJUSTE_SALDO'
  | 'AJUSTE_MANUAL'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'CONCILIACAO'
  | 'ESTORNO'
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
  | 'PERDA_CAMBIAL'
  | 'GIRO_GRATIS'
  | 'GIRO_GRATIS_ESTORNO'
  // Tipos de Freebet (movimentam saldo_freebet via trigger v4)
  | 'FREEBET_CREDITADA'
  | 'FREEBET_CONSUMIDA'
  | 'FREEBET_ESTORNO'
  | 'FREEBET_EXPIRADA'
  | 'FREEBET_CONVERTIDA';

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
  /** Motivo do ajuste (obrigatório para tipos de ajuste) */
  ajusteMotivo?: string;
  /** Direção do ajuste: ENTRADA ou SAIDA */
  ajusteDirecao?: 'ENTRADA' | 'SAIDA';
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
    // CRÍTICO: valor_destino DEVE ser preenchido para créditos (destino_bookmaker_id)
    // Isso garante que triggers e reconstrução de saldo funcionem corretamente
    const isCredit = !!input.destinoBookmakerId;
    const isDebit = !!input.origemBookmakerId;
    
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
      ajuste_motivo: input.ajusteMotivo || null,
      ajuste_direcao: input.ajusteDirecao || null,
      // INTEGRIDADE LEDGER: Preencher valor_destino/valor_origem para reconstrução de saldo
      valor_destino: isCredit ? input.valor : null,
      valor_origem: isDebit ? input.valor : null,
    };
    
    console.log('[insertLedgerEntry] Tentando inserir:', {
      tipo: input.tipoTransacao,
      valor: input.valor,
      workspaceId: input.workspaceId,
      destinoBookmakerId: input.destinoBookmakerId,
      origemBookmakerId: input.origemBookmakerId,
    });
    
    const { data, error } = await supabase
      .from('cash_ledger')
      .insert(insertPayload as any)
      .select('id')
      .single();

    if (error) {
      console.error('[insertLedgerEntry] Erro ao inserir:', {
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        payload: insertPayload,
      });
      return { success: false, error: error.message };
    }

    console.log(`[insertLedgerEntry] ✅ Entrada criada com sucesso: ${data.id} (${input.tipoTransacao})`);
    return { success: true, entryId: data.id };
  } catch (err: any) {
    console.error('[insertLedgerEntry] Exceção não tratada:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Registra cashback manual via ledger.
 * ARQUITETURA: Cashback é lucro operacional interno da bookmaker.
 * NÃO é entrada de dinheiro real no caixa - é ganho promocional.
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
    impactaCaixaOperacional: false, // Lucro operacional - NÃO é entrada de caixa real
    auditoriaMetadata: params.referenciaId ? { cashback_id: params.referenciaId } : undefined,
  });
}

/**
 * Estorna cashback via ledger.
 * ARQUITETURA: Estorno de cashback é evento operacional interno.
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
    impactaCaixaOperacional: false, // Evento operacional - NÃO impacta caixa real
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
 * Usa AJUSTE_SALDO com ajuste_motivo e ajuste_direcao obrigatórios.
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
  const motivoFinal = params.motivo || params.descricao || 'Ajuste de saldo';
  
  return insertLedgerEntry({
    tipoTransacao: 'AJUSTE_SALDO',
    valor: Math.abs(params.delta),
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: isCredito ? params.bookmakerId : undefined,
    origemBookmakerId: isCredito ? undefined : params.bookmakerId,
    descricao: params.descricao || `Ajuste de saldo: ${motivoFinal}`,
    impactaCaixaOperacional: true,
    ajusteMotivo: motivoFinal,
    ajusteDirecao: isCredito ? 'ENTRADA' : 'SAIDA',
    auditoriaMetadata: { 
      delta: params.delta,
      tipo: 'ajuste_saldo',
      motivo: motivoFinal 
    },
  });
}

/**
 * Registra crédito de bônus via ledger.
 * 
 * NOVA ARQUITETURA:
 * - Bônus é DINHEIRO NORMAL com tag de origem 'BONUS_CREDITADO'
 * - Credita em saldo_atual (não em pool separado)
 * - Mantém metadados para auditoria e KPIs de bônus
 * - NÃO impacta caixa operacional (não é entrada de capital externo)
 */
export async function registrarBonusCreditadoViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  bonusId?: string;
  restricaoRollover?: number;
  /** Data do crédito real do bônus (credited_at). Se omitido, usa a data atual. */
  dataCredito?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'BONUS_CREDITADO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: params.bookmakerId,
    // NOVA ARQUITETURA: Bônus credita saldo_atual (normal), não pool separado
    descricao: params.descricao || 'Crédito de bônus (saldo normal)',
    dataTransacao: params.dataCredito,
    impactaCaixaOperacional: false, // Evento promocional - NÃO impacta caixa real
    auditoriaMetadata: {
      bonus_id: params.bonusId,
      origem: 'BONUS', // Tag para filtrar em KPIs
      restricao_rollover: params.restricaoRollover,
    },
  });
}

/**
 * Registra estorno de bônus via ledger.
 * ARQUITETURA: Estorno de bônus é evento promocional interno, NÃO impacta caixa.
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
    impactaCaixaOperacional: false, // Evento promocional - NÃO impacta caixa real
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
    impactaCaixaOperacional: false, // Ajuste contábil, não cash real
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
    impactaCaixaOperacional: false, // Ajuste contábil, não cash real
    referenciaTransacaoId: params.transacaoOrigemId,
    auditoriaMetadata: { tipo: 'perda_cambial' },
  });
}

/**
 * Estorna giro grátis via ledger.
 * Débito na bookmaker especificada (remove o ganho do saldo).
 */
/**
 * Estorna giro grátis via ledger.
 * ARQUITETURA: Evento promocional - NÃO impacta caixa operacional.
 */
export async function estornarGiroGratisViaLedger(params: {
  bookmakerId: string;
  valor: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  descricao?: string;
  giroGratisId?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'GIRO_GRATIS_ESTORNO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Estorno de giro grátis',
    impactaCaixaOperacional: false, // Evento promocional - NÃO impacta caixa real
    auditoriaMetadata: params.giroGratisId ? { giro_gratis_id: params.giroGratisId } : undefined,
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
