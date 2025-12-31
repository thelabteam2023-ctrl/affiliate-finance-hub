/**
 * Helper centralizado para atualização de saldos de bookmakers
 * 
 * REGRA CRÍTICA MULTI-MOEDA:
 * - Bookmakers com moeda USD/USDT: usar saldo_usd
 * - Bookmakers com outras moedas (BRL): usar saldo_atual
 * 
 * A RPC get_bookmaker_saldos lê saldo_usd para USD/USDT e saldo_atual para outras.
 * Este helper garante consistência ao gravar.
 */

import { supabase } from "@/integrations/supabase/client";

export interface BookmakerBalanceUpdate {
  bookmakerId: string;
  delta: number; // Valor a somar (positivo = crédito, negativo = débito)
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
 * Atualiza o saldo de um bookmaker aplicando o delta correto
 * baseado na moeda do bookmaker
 * 
 * @param bookmakerId - ID do bookmaker
 * @param delta - Valor a somar (positivo = crédito, negativo = débito)
 * @returns Promise<boolean> - true se sucesso
 */
export async function updateBookmakerBalance(
  bookmakerId: string,
  delta: number
): Promise<boolean> {
  if (delta === 0) return true;
  
  try {
    // Buscar moeda e saldo atual
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
    updates.map(u => updateBookmakerBalance(u.bookmakerId, u.delta))
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
