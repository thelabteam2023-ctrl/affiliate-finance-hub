/**
 * Helper centralizado para atualização de saldos de bookmakers
 * 
 * REGRA CRÍTICA MULTI-MOEDA:
 * - Bookmakers com moeda USD/USDT: usar saldo_usd
 * - Bookmakers com outras moedas (BRL): usar saldo_atual
 * 
 * REGRA CRÍTICA BÔNUS ATIVO:
 * - Quando há bônus ativo (status=credited, saldo_atual > 0), o delta é aplicado
 *   no bonus.saldo_atual em vez do bookmaker.saldo_atual/saldo_usd
 * - Isso unifica os saldos durante o período de bônus
 * 
 * REGRA CRÍTICA CONCORRÊNCIA (v2.0):
 * - Coluna `version` para controle otimista
 * - RPC `debit_bookmaker_with_lock` com lock pessimista + verificação de versão
 * - RPC `validate_aposta_pre_commit` para validação server-side antes do commit
 * 
 * A RPC get_bookmaker_saldos lê saldo_usd para USD/USDT e saldo_atual para outras.
 * Este helper garante consistência ao gravar.
 */

import { supabase } from "@/integrations/supabase/client";

export interface BookmakerBalanceUpdate {
  bookmakerId: string;
  delta: number; // Valor a somar (positivo = crédito, negativo = débito)
  projetoId?: string; // Necessário para verificar bônus ativo
  expectedVersion?: number; // Para controle otimista
}

export interface ActiveBonusInfo {
  id: string;
  saldo_atual: number;
  project_id: string;
}

export interface PreCommitValidationError {
  code: string;
  message: string;
  bookmaker_id?: string;
  saldo_atual?: number;
  stake_necessario?: number;
}

export interface PreCommitValidationResult {
  valid: boolean;
  errors: PreCommitValidationError[];
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

export interface DebitWithLockResult {
  success: boolean;
  error_code?: string;
  message?: string;
  saldo_anterior?: number;
  saldo_novo?: number;
  new_version?: number;
}

/**
 * Busca a moeda de um bookmaker
 */
export async function getBookmakerMoeda(bookmakerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("bookmakers")
    .select("moeda")
    .eq("id", bookmakerId)
    .maybeSingle();
  
  return data?.moeda || null;
}

/**
 * Verifica se uma moeda usa o campo saldo_usd
 */
export function isUsdCurrency(moeda: string): boolean {
  return moeda === "USD" || moeda === "USDT";
}

/**
 * Busca o bônus ativo de uma bookmaker em um projeto
 * Bônus ativo = status 'credited' e saldo_atual > 0
 */
export async function getActiveBonus(
  bookmakerId: string,
  projetoId?: string
): Promise<ActiveBonusInfo | null> {
  if (!projetoId) return null;
  
  const { data, error } = await supabase
    .from("project_bookmaker_link_bonuses")
    .select("id, saldo_atual, project_id")
    .eq("bookmaker_id", bookmakerId)
    .eq("project_id", projetoId)
    .eq("status", "credited")
    .gt("saldo_atual", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error || !data) return null;
  
  return {
    id: data.id,
    saldo_atual: data.saldo_atual,
    project_id: data.project_id,
  };
}

/**
 * Atualiza o saldo do bônus ativo
 */
export async function updateBonusBalance(
  bonusId: string,
  delta: number
): Promise<boolean> {
  try {
    const { data: bonus, error: fetchError } = await supabase
      .from("project_bookmaker_link_bonuses")
      .select("saldo_atual")
      .eq("id", bonusId)
      .single();
    
    if (fetchError || !bonus) {
      console.error("[updateBonusBalance] Erro ao buscar bônus:", fetchError);
      return false;
    }
    
    const novoSaldo = Math.max(0, (bonus.saldo_atual || 0) + delta);
    
    const { error: updateError } = await supabase
      .from("project_bookmaker_link_bonuses")
      .update({ saldo_atual: novoSaldo, updated_at: new Date().toISOString() })
      .eq("id", bonusId);
    
    if (updateError) {
      console.error("[updateBonusBalance] Erro ao atualizar:", updateError);
      return false;
    }
    
    console.log(`[updateBonusBalance] Bônus ${bonusId}: saldo ${bonus.saldo_atual} → ${novoSaldo} (delta: ${delta})`);
    return true;
  } catch (error) {
    console.error("[updateBonusBalance] Exceção:", error);
    return false;
  }
}

/**
 * Atualiza o saldo de um bookmaker aplicando o delta correto
 * baseado na moeda do bookmaker
 * 
 * ARQUITETURA CANÔNICA:
 * - Se a aposta usou stake_bonus > 0 e tem bonus_id, o consumo de bônus é tratado
 *   EXCLUSIVAMENTE por processarLiquidacaoBonus (useBonusBalanceManager).
 * - Esta função NÃO deve verificar/atualizar bônus quando skipBonusCheck=true.
 * - Quando skipBonusCheck=false (padrão), verifica bônus ativo para operações
 *   sem stake de bônus explícito (ex: depósitos, cashback, etc).
 * 
 * @param bookmakerId - ID do bookmaker
 * @param delta - Valor a somar (positivo = crédito, negativo = débito)
 * @param projetoId - ID do projeto (necessário para verificar bônus ativo)
 * @param auditInfo - Informações de auditoria opcionais
 * @param skipBonusCheck - Se true, pula verificação de bônus ativo (usar quando bônus é tratado externamente)
 * @returns Promise<boolean> - true se sucesso
 */
export async function updateBookmakerBalance(
  bookmakerId: string,
  delta: number,
  projetoId?: string,
  auditInfo?: {
    origem: string;
    referenciaId?: string;
    referenciaTipo?: string;
    observacoes?: string;
  },
  skipBonusCheck: boolean = false
): Promise<boolean> {
  if (delta === 0) return true;
  
  try {
    // Verificar se há bônus ativo para esta bookmaker/projeto
    // SKIP se o chamador já tratou o bônus externamente (ex: processarLiquidacaoBonus)
    if (!skipBonusCheck) {
      const activeBonus = await getActiveBonus(bookmakerId, projetoId);
      
      if (activeBonus) {
        // Bônus ativo: aplicar delta no saldo do bônus
        console.log(`[updateBookmakerBalance] Bônus ativo detectado para bookmaker ${bookmakerId}, aplicando delta no bônus ${activeBonus.id}`);
        return await updateBonusBalance(activeBonus.id, delta);
      }
    } else {
      console.log(`[updateBookmakerBalance] skipBonusCheck=true, bônus será tratado externamente`);
    }
    
    // Usar função RPC com auditoria se disponível
    if (auditInfo) {
      const { error: rpcError } = await supabase.rpc('adjust_bookmaker_balance_with_audit', {
        p_bookmaker_id: bookmakerId,
        p_delta: delta,
        p_origem: auditInfo.origem,
        p_referencia_id: auditInfo.referenciaId || null,
        p_referencia_tipo: auditInfo.referenciaTipo || null,
        p_observacoes: auditInfo.observacoes || null,
      });
      
      if (!rpcError) {
        console.log(`[updateBookmakerBalance] Bookmaker ${bookmakerId}: delta ${delta} aplicado com auditoria (${auditInfo.origem})`);
        return true;
      }
      
      // Se RPC falhar, logar erro mas não fazer fallback direto
      console.error("[updateBookmakerBalance] RPC falhou:", rpcError);
      // NOTA: Removido fallback direto para garantir que toda alteração de saldo 
      // passe por auditoria. Se o RPC não existe, é um erro de configuração.
    }
    
    // DEPRECADO: Não fazer mais updates diretos sem auditoria
    // A arquitetura canônica é usar ledgerService ou RPCs com auditoria.
    console.warn(`[updateBookmakerBalance] Chamada sem auditoria para bookmaker ${bookmakerId}. Considere usar ledgerService.`);
    
    // Para manter compatibilidade temporária, usamos RPC padrão
    const { error: rpcError2 } = await supabase.rpc('adjust_bookmaker_balance_with_audit', {
      p_bookmaker_id: bookmakerId,
      p_delta: delta,
      p_origem: 'LEGACY_NO_AUDIT',
      p_referencia_id: null,
      p_referencia_tipo: null,
      p_observacoes: 'Chamada via updateBookmakerBalance sem auditInfo - migrar para ledgerService',
    });
    
    if (rpcError2) {
      console.error("[updateBookmakerBalance] RPC fallback falhou:", rpcError2);
      return false;
    }
    
    console.log(`[updateBookmakerBalance] Bookmaker ${bookmakerId}: delta ${delta} aplicado (legacy mode)`);
    return true;
  } catch (error) {
    console.error("[updateBookmakerBalance] Exceção:", error);
    return false;
  }
}

/**
 * Atualiza múltiplos bookmakers de uma vez (batch)
 * Útil para operações com múltiplas pernas (Surebet)
 * 
 * @param updates - Array de atualizações
 * @returns Promise<boolean> - true se todos os updates tiveram sucesso
 */
export async function updateMultipleBookmakerBalances(
  updates: BookmakerBalanceUpdate[]
): Promise<boolean> {
  const results = await Promise.all(
    updates.map(u => updateBookmakerBalance(u.bookmakerId, u.delta, u.projetoId))
  );
  return results.every(r => r === true);
}

/**
 * Calcula o ajuste de saldo para transição entre resultados
 * 
 * @param stake - Valor da stake
 * @param odd - Odd da aposta
 * @param resultadoAnterior - Resultado anterior (null se era PENDENTE)
 * @param resultadoNovo - Novo resultado
 * @returns Delta a aplicar no saldo
 */
export function calcularDeltaSaldo(
  stake: number,
  odd: number,
  resultadoAnterior: string | null,
  resultadoNovo: string
): number {
  let delta = 0;
  
  // Reverter resultado anterior (se havia)
  if (resultadoAnterior && resultadoAnterior !== "PENDENTE") {
    delta -= calcularImpactoResultado(stake, odd, resultadoAnterior);
  }
  
  // Aplicar novo resultado
  delta += calcularImpactoResultado(stake, odd, resultadoNovo);
  
  return delta;
}

/**
 * Calcula o impacto de um resultado no saldo
 * 
 * @param stake - Valor da stake
 * @param odd - Odd da aposta
 * @param resultado - Resultado da aposta
 * @returns Impacto no saldo (positivo = lucro, negativo = prejuízo)
 */
export function calcularImpactoResultado(
  stake: number,
  odd: number,
  resultado: string
): number {
  switch (resultado) {
    case "GREEN":
      return stake * (odd - 1);
    case "MEIO_GREEN":
      return (stake * (odd - 1)) / 2;
    case "RED":
      return -stake;
    case "MEIO_RED":
      return -stake / 2;
    case "VOID":
    case "PENDENTE":
    default:
      return 0;
  }
}

// ============================================================
// FUNÇÕES DE VALIDAÇÃO E DÉBITO COM CONTROLE DE CONCORRÊNCIA
// ============================================================

/**
 * Validação server-side obrigatória antes de registrar apostas
 * Verifica: projeto ativo, vínculos bookmaker-projeto, saldos, versões
 * 
 * @param projetoId - ID do projeto
 * @param bookmakers - Array de bookmakers com stakes e versões esperadas
 * @returns Resultado detalhado da validação
 */
export async function validatePreCommit(
  projetoId: string,
  bookmakers: Array<{ id: string; stake: number; expectedVersion?: number }>
): Promise<PreCommitValidationResult> {
  try {
    const bookmakerIds = bookmakers.map(b => b.id);
    const stakes = bookmakers.map(b => b.stake);
    const versions = bookmakers.some(b => b.expectedVersion !== undefined)
      ? bookmakers.map(b => b.expectedVersion || 1)
      : null;

    const { data, error } = await supabase.rpc('validate_aposta_pre_commit', {
      p_projeto_id: projetoId,
      p_bookmaker_ids: bookmakerIds,
      p_stakes: stakes,
      p_expected_versions: versions,
    });

    if (error) {
      console.error('[validatePreCommit] Erro RPC:', error);
      return {
        valid: false,
        errors: [{ code: 'RPC_ERROR', message: error.message }],
        validations: [],
        projeto: null,
        timestamp: new Date().toISOString(),
      };
    }

    return data as unknown as PreCommitValidationResult;
  } catch (err: any) {
    console.error('[validatePreCommit] Exceção:', err);
    return {
      valid: false,
      errors: [{ code: 'EXCEPTION', message: err.message }],
      validations: [],
      projeto: null,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Débito atômico com lock pessimista e controle otimista de versão
 * Previne race conditions em cenários de múltiplos usuários
 * 
 * @param bookmakerId - ID do bookmaker
 * @param stake - Valor a debitar
 * @param expectedVersion - Versão esperada (controle otimista)
 * @param origem - Origem da operação (para auditoria)
 * @param referenciaId - ID de referência opcional
 * @param referenciaTipo - Tipo de referência opcional
 * @returns Resultado do débito
 */
export async function debitWithLock(
  bookmakerId: string,
  stake: number,
  expectedVersion: number,
  origem: string,
  referenciaId?: string,
  referenciaTipo?: string
): Promise<DebitWithLockResult> {
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
      console.error('[debitWithLock] Erro RPC:', error);
      return {
        success: false,
        error_code: 'RPC_ERROR',
        message: error.message,
      };
    }

    return data as unknown as DebitWithLockResult;
  } catch (err: any) {
    console.error('[debitWithLock] Exceção:', err);
    return {
      success: false,
      error_code: 'EXCEPTION',
      message: err.message,
    };
  }
}

/**
 * Busca a versão atual de um bookmaker
 * Útil para obter a versão antes de operações que precisam de controle otimista
 */
export async function getBookmakerVersion(bookmakerId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('bookmakers')
      .select('version')
      .eq('id', bookmakerId)
      .maybeSingle();
    
    if (error || !data) return null;
    return (data as any).version || 1;
  } catch {
    return null;
  }
}

/**
 * Busca versões atuais de múltiplos bookmakers
 */
export async function getBookmakerVersions(
  bookmakerIds: string[]
): Promise<Map<string, number>> {
  const versions = new Map<string, number>();
  
  try {
    const { data, error } = await supabase
      .from('bookmakers')
      .select('id, version')
      .in('id', bookmakerIds);
    
    if (error || !data) return versions;
    
    data.forEach((bk: any) => {
      versions.set(bk.id, bk.version || 1);
    });
  } catch {
    // Retorna mapa vazio em caso de erro
  }
  
  return versions;
}
