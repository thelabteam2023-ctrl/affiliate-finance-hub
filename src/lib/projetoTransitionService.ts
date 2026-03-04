/**
 * Lógica centralizada de desvinculação de bookmaker de projeto.
 * 
 * Trata os edge cases:
 * 1. SAQUE_VIRTUAL descontando saques/depositos pendentes
 * 2. Travamento de projeto_id_snapshot em transações pendentes
 * 3. Verificação de apostas pendentes
 */

import { supabase } from "@/integrations/supabase/client";
import { registrarSaqueVirtualViaLedger, registrarDepositoVirtualViaLedger } from "@/lib/ledgerService";

export interface UnlinkPreCheck {
  canUnlink: boolean;
  pendingBetsCount: number;
  pendingSaquesTotal: number;
  pendingDepositosTotal: number;
  saldoAtual: number;
  saldoVirtualEfetivo: number;
  moeda: string;
  projetoId: string | null;
  workspaceId: string;
  warnings: string[];
}

/**
 * Verifica condições antes de desvincular.
 * Retorna informações sobre operações pendentes.
 */
export async function preCheckUnlink(bookmakerId: string): Promise<UnlinkPreCheck> {
  // 1. Dados da bookmaker
  const { data: bm } = await supabase
    .from("bookmakers")
    .select("saldo_atual, moeda, projeto_id, workspace_id")
    .eq("id", bookmakerId)
    .single();

  if (!bm) throw new Error("Bookmaker não encontrada");

  const warnings: string[] = [];

  // 2. Apostas pendentes
  const { count: pendingBetsCount } = await supabase
    .from("apostas_unificada")
    .select("id", { count: "exact", head: true })
    .eq("bookmaker_id", bookmakerId)
    .eq("status", "PENDENTE");

  // 3. Pernas pendentes (apostas múltiplas)
  const { count: pendingPernasCount } = await supabase
    .from("apostas_pernas")
    .select("id", { count: "exact", head: true })
    .eq("bookmaker_id", bookmakerId)
    .is("resultado", null);

  const totalPendingBets = (pendingBetsCount || 0) + (pendingPernasCount || 0);

  // 4. Saques pendentes
  const { data: saquesPendentes } = await supabase
    .from("cash_ledger")
    .select("valor")
    .eq("origem_bookmaker_id", bookmakerId)
    .eq("tipo_transacao", "SAQUE")
    .eq("status", "PENDENTE");

  const pendingSaquesTotal = (saquesPendentes || []).reduce((acc, s) => acc + (s.valor || 0), 0);

  // 5. Depósitos pendentes
  const { data: depositosPendentes } = await supabase
    .from("cash_ledger")
    .select("valor")
    .eq("destino_bookmaker_id", bookmakerId)
    .eq("tipo_transacao", "DEPOSITO")
    .eq("status", "PENDENTE");

  const pendingDepositosTotal = (depositosPendentes || []).reduce((acc, d) => acc + (d.valor || 0), 0);

  // 6. Calcular saldo virtual efetivo
  // SAQUE_VIRTUAL = saldo_atual - saques_pendentes (já contabilizados no projeto)
  // Depósitos pendentes não afetam saldo_atual (só creditam na confirmação)
  const saldoVirtualEfetivo = Math.max(0, bm.saldo_atual - pendingSaquesTotal);

  // 7. Warnings
  if (totalPendingBets > 0) {
    warnings.push(`${totalPendingBets} aposta(s) pendente(s) — resultado será atribuído sem projeto`);
  }
  if (pendingSaquesTotal > 0) {
    warnings.push(`Saques pendentes: ${pendingSaquesTotal.toFixed(2)} ${bm.moeda} (excluídos do saque virtual)`);
  }
  if (pendingDepositosTotal > 0) {
    warnings.push(`Depósitos pendentes: ${pendingDepositosTotal.toFixed(2)} ${bm.moeda} (serão travados ao projeto)`);
  }

  return {
    canUnlink: true, // Permitir sempre, mas com warnings
    pendingBetsCount: totalPendingBets,
    pendingSaquesTotal,
    pendingDepositosTotal,
    saldoAtual: bm.saldo_atual,
    saldoVirtualEfetivo,
    moeda: bm.moeda,
    projetoId: bm.projeto_id,
    workspaceId: bm.workspace_id,
    warnings,
  };
}

/**
 * Executa a desvinculação com todas as proteções:
 * 1. Trava projeto_id_snapshot em transações PENDENTES
 * 2. Gera SAQUE_VIRTUAL com saldo efetivo (descontando pendentes)
 * 3. Desvincula a bookmaker
 */
export async function executeUnlink(params: {
  bookmakerId: string;
  projetoId: string;
  workspaceId: string;
  userId: string;
  statusFinal: string;
  saldoVirtualEfetivo: number;
  moeda: string;
}): Promise<void> {
  const { bookmakerId, projetoId, workspaceId, userId, statusFinal, saldoVirtualEfetivo, moeda } = params;

  // 1. TRAVAR projeto_id_snapshot em transações PENDENTES antes de desvincular
  // Isso garante que confirmações futuras mantenham a atribuição ao projeto correto
  await supabase
    .from("cash_ledger")
    .update({ projeto_id_snapshot: projetoId })
    .or(`origem_bookmaker_id.eq.${bookmakerId},destino_bookmaker_id.eq.${bookmakerId}`)
    .eq("status", "PENDENTE")
    .is("projeto_id_snapshot", null);

  // Também travar transações com status intermediários
  await supabase
    .from("cash_ledger")
    .update({ projeto_id_snapshot: projetoId })
    .or(`origem_bookmaker_id.eq.${bookmakerId},destino_bookmaker_id.eq.${bookmakerId}`)
    .eq("status", "LIQUIDADO")
    .is("projeto_id_snapshot", null);

  // 2. Desvincular bookmaker do projeto
  const { error: updateError } = await supabase
    .from("bookmakers")
    .update({ projeto_id: null, status: statusFinal })
    .eq("id", bookmakerId);

  if (updateError) throw updateError;

  // 3. SAQUE_VIRTUAL com saldo efetivo (já descontou saques pendentes)
  if (saldoVirtualEfetivo > 0) {
    await registrarSaqueVirtualViaLedger({
      bookmakerId,
      saldoAtual: saldoVirtualEfetivo,
      moeda,
      workspaceId,
      userId,
      projetoId,
    });
  }

  // 4. Atualizar histórico
  await supabase
    .from("projeto_bookmaker_historico")
    .update({
      data_desvinculacao: new Date().toISOString(),
      status_final: statusFinal,
    })
    .eq("projeto_id", projetoId)
    .eq("bookmaker_id", bookmakerId)
    .is("data_desvinculacao", null);
}

/**
 * Executa a vinculação com DEPOSITO_VIRTUAL.
 * Também trava transações órfãs ao novo projeto.
 */
export async function executeLink(params: {
  bookmakerId: string;
  projetoId: string;
  workspaceId: string;
  userId: string;
  saldoAtual: number;
  moeda: string;
}): Promise<void> {
  const { bookmakerId, projetoId, workspaceId, userId, saldoAtual, moeda } = params;

  // 1. Atribuir transações órfãs ao projeto
  await supabase
    .from("cash_ledger")
    .update({ projeto_id_snapshot: projetoId })
    .eq("destino_bookmaker_id", bookmakerId)
    .is("projeto_id_snapshot", null);

  await supabase
    .from("cash_ledger")
    .update({ projeto_id_snapshot: projetoId })
    .eq("origem_bookmaker_id", bookmakerId)
    .is("projeto_id_snapshot", null);

  // 2. DEPOSITO_VIRTUAL com saldo atual (baseline para o novo projeto)
  if (saldoAtual > 0) {
    await registrarDepositoVirtualViaLedger({
      bookmakerId,
      saldoAtual,
      moeda,
      workspaceId,
      userId,
      projetoId,
    });
  }
}
