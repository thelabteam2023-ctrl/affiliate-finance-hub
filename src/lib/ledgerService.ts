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
 * - fonte_saldo da perna + stake_freebet > 0 é a verdade financeira (usar_freebet deprecated)
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
import { getTodayCivilDate } from "@/utils/dateUtils";

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
  | 'FREEBET_CONVERTIDA'
  // Tipos Virtuais (contábeis - NÃO movimentam saldo real, apenas isolam P&L entre projetos)
  | 'SAQUE_VIRTUAL'
  | 'DEPOSITO_VIRTUAL';

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
  /** Snapshot do projeto para isolamento financeiro (herda do lançamento pai) */
  projetoIdSnapshot?: string;
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
    const dataTransacao = input.dataTransacao || getTodayCivilDate();
    
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
      // Isolamento financeiro: herdar projeto do lançamento pai (ex: FX de saque pós-desvínculo)
      projeto_id_snapshot: input.projetoIdSnapshot || null,
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
  projetoIdSnapshot?: string;
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
    impactaCaixaOperacional: false,
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'CASHBACK_ESTORNO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Estorno de cashback',
    impactaCaixaOperacional: false,
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
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
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
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
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
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
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'BONUS_CREDITADO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    destinoBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Crédito de bônus (saldo normal)',
    dataTransacao: params.dataCredito,
    impactaCaixaOperacional: false,
    projetoIdSnapshot: params.projetoIdSnapshot,
    auditoriaMetadata: {
      bonus_id: params.bonusId,
      origem: 'BONUS',
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
  projetoIdSnapshot?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'BONUS_ESTORNO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Estorno de bônus',
    impactaCaixaOperacional: false,
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
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
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
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
    projetoIdSnapshot: params.projetoIdSnapshot,
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
  projetoIdSnapshot?: string;
}): Promise<LedgerEntryResult> {
  return insertLedgerEntry({
    tipoTransacao: 'GIRO_GRATIS_ESTORNO',
    valor: params.valor,
    moeda: params.moeda,
    workspaceId: params.workspaceId,
    userId: params.userId,
    origemBookmakerId: params.bookmakerId,
    descricao: params.descricao || 'Estorno de giro grátis',
    impactaCaixaOperacional: false,
    projetoIdSnapshot: params.projetoIdSnapshot,
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

/**
 * Registra SAQUE_VIRTUAL ao desvincular bookmaker de um projeto.
 * 
 * ARQUITETURA DE ISOLAMENTO DE PROJETOS:
 * - Contábil apenas — NÃO movimenta saldo real da bookmaker
 * - Fecha o P&L do projeto com o saldo residual
 * - Garante que o resultado financeiro do projeto reflita o lucro real
 * - O trigger NÃO gera financial_events para este tipo
 * 
 * IMPORTANTE: projeto_id_snapshot DEVE ser definido explicitamente
 * porque a bookmaker já terá projeto_id = NULL quando isso for inserido.
 */
export async function registrarSaqueVirtualViaLedger(params: {
  bookmakerId: string;
  saldoAtual: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  projetoId: string;
  descricao?: string;
}): Promise<LedgerEntryResult> {
  if (params.saldoAtual <= 0) {
    console.log('[registrarSaqueVirtualViaLedger] Saldo zero ou negativo, ignorando');
    return { success: true };
  }

  try {
    const insertPayload = {
      tipo_transacao: 'SAQUE_VIRTUAL',
      valor: params.saldoAtual,
      moeda: params.moeda,
      workspace_id: params.workspaceId,
      user_id: params.userId,
      origem_bookmaker_id: params.bookmakerId,
      valor_origem: params.saldoAtual,
      descricao: params.descricao || `Saque virtual – desvinculação do projeto`,
      data_transacao: getTodayCivilDate(),
      impacta_caixa_operacional: false,
      tipo_moeda: 'FIAT' as const,
      status: 'CONFIRMADO',
      // CRÍTICO: Definir explicitamente porque bookmaker.projeto_id já será NULL
      projeto_id_snapshot: params.projetoId,
      auditoria_metadata: {
        tipo: 'saque_virtual_desvinculacao',
        projeto_id: params.projetoId,
        saldo_snapshot: params.saldoAtual,
      },
    };

    const { data, error } = await supabase
      .from('cash_ledger')
      .insert(insertPayload as any)
      .select('id')
      .single();

    if (error) {
      console.error('[registrarSaqueVirtualViaLedger] Erro:', error);
      return { success: false, error: error.message };
    }

    console.log(`[registrarSaqueVirtualViaLedger] ✅ SAQUE_VIRTUAL criado: ${data.id} (R$${params.saldoAtual})`);
    return { success: true, entryId: data.id };
  } catch (err: any) {
    console.error('[registrarSaqueVirtualViaLedger] Exceção:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Registra DEPOSITO_VIRTUAL ao vincular bookmaker a um projeto.
 * 
 * ARQUITETURA DE ISOLAMENTO DE PROJETOS:
 * - Contábil apenas — NÃO movimenta saldo real da bookmaker
 * - Estabelece baseline de capital para o novo projeto
 * - Saldo atual da bookmaker no momento da vinculação é o valor do depósito virtual
 * - O trigger NÃO gera financial_events para este tipo
 */
export async function registrarDepositoVirtualViaLedger(params: {
  bookmakerId: string;
  saldoAtual: number;
  moeda: string;
  workspaceId: string;
  userId: string;
  projetoId: string;
  descricao?: string;
}): Promise<LedgerEntryResult> {
  if (params.saldoAtual <= 0) {
    console.log('[registrarDepositoVirtualViaLedger] Saldo zero ou negativo, ignorando');
    return { success: true };
  }

  try {
    const insertPayload = {
      tipo_transacao: 'DEPOSITO_VIRTUAL',
      valor: params.saldoAtual,
      moeda: params.moeda,
      workspace_id: params.workspaceId,
      user_id: params.userId,
      destino_bookmaker_id: params.bookmakerId,
      valor_destino: params.saldoAtual,
      descricao: params.descricao || `Depósito virtual – vinculação ao projeto`,
      data_transacao: getTodayCivilDate(),
      impacta_caixa_operacional: false,
      tipo_moeda: 'FIAT' as const,
      status: 'CONFIRMADO',
      // Será preenchido pelo trigger fn_cash_ledger_projeto_snapshot, mas definimos para segurança
      projeto_id_snapshot: params.projetoId,
      auditoria_metadata: {
        tipo: 'deposito_virtual_vinculacao',
        projeto_id: params.projetoId,
        saldo_snapshot: params.saldoAtual,
      },
    };

    const { data, error } = await supabase
      .from('cash_ledger')
      .insert(insertPayload as any)
      .select('id')
      .single();

    if (error) {
      console.error('[registrarDepositoVirtualViaLedger] Erro:', error);
      return { success: false, error: error.message };
    }

    console.log(`[registrarDepositoVirtualViaLedger] ✅ DEPOSITO_VIRTUAL criado: ${data.id} (R$${params.saldoAtual})`);
    return { success: true, entryId: data.id };
  } catch (err: any) {
    console.error('[registrarDepositoVirtualViaLedger] Exceção:', err);
    return { success: false, error: err.message };
  }
}
