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
 * A RPC get_bookmaker_saldos lê saldo_usd para USD/USDT e saldo_atual para outras.
 * Este helper garante consistência ao gravar.
 */

import { supabase } from "@/integrations/supabase/client";

export interface BookmakerBalanceUpdate {
  bookmakerId: string;
  delta: number; // Valor a somar (positivo = crédito, negativo = débito)
  projetoId?: string; // Necessário para verificar bônus ativo
}

export interface ActiveBonusInfo {
  id: string;
  saldo_atual: number;
  project_id: string;
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
 * IMPORTANTE: Se houver bônus ativo, o delta é aplicado no bônus, não no bookmaker
 * 
 * @param bookmakerId - ID do bookmaker
 * @param delta - Valor a somar (positivo = crédito, negativo = débito)
 * @param projetoId - ID do projeto (necessário para verificar bônus ativo)
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
  }
): Promise<boolean> {
  if (delta === 0) return true;
  
  try {
    // Verificar se há bônus ativo para esta bookmaker/projeto
    const activeBonus = await getActiveBonus(bookmakerId, projetoId);
    
    if (activeBonus) {
      // Bônus ativo: aplicar delta no saldo do bônus
      console.log(`[updateBookmakerBalance] Bônus ativo detectado para bookmaker ${bookmakerId}, aplicando delta no bônus ${activeBonus.id}`);
      return await updateBonusBalance(activeBonus.id, delta);
    }
    
    // Sem bônus ativo: usar função RPC com auditoria se disponível
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
      
      // Se RPC falhar, continuar com método fallback
      console.warn("[updateBookmakerBalance] RPC falhou, usando fallback:", rpcError);
    }
    
    // Fallback: atualização direta sem auditoria
    const { data: bookmaker, error: fetchError } = await supabase
      .from("bookmakers")
      .select("moeda, saldo_atual, saldo_usd")
      .eq("id", bookmakerId)
      .maybeSingle();
    
    if (fetchError || !bookmaker) {
      console.error("[updateBookmakerBalance] Erro ao buscar bookmaker:", fetchError);
      return false;
    }
    
    const moeda = bookmaker.moeda || "BRL";
    const usaUsd = isUsdCurrency(moeda);
    
    // Calcular novo saldo
    const saldoAtual = usaUsd 
      ? (bookmaker.saldo_usd || 0) 
      : (bookmaker.saldo_atual || 0);
    const novoSaldo = Math.max(0, saldoAtual + delta);
    
    // Atualizar campo correto
    const updateData = usaUsd 
      ? { saldo_usd: novoSaldo }
      : { saldo_atual: novoSaldo };
    
    const { error: updateError } = await supabase
      .from("bookmakers")
      .update(updateData)
      .eq("id", bookmakerId);
    
    if (updateError) {
      console.error("[updateBookmakerBalance] Erro ao atualizar:", updateError);
      return false;
    }
    
    console.log(`[updateBookmakerBalance] Bookmaker ${bookmakerId}: ${usaUsd ? 'saldo_usd' : 'saldo_atual'} ${saldoAtual} → ${novoSaldo} (delta: ${delta})`);
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
