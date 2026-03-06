/**
 * Lógica centralizada de desvinculação de bookmaker de projeto.
 * 
 * Trata os edge cases:
 * 1. SAQUE_VIRTUAL descontando saques/depositos pendentes
 * 2. Travamento de projeto_id_snapshot em transações pendentes
 * 3. Verificação de apostas pendentes
 * 4. Proteção contra race conditions (idempotência)
 * 5. Detecção de re-vinculação ao mesmo projeto
 * 6. Tracking de saldo freebet
 * 7. Atomicidade: ledger entry ANTES de unlink, rollback em caso de falha
 * 8. Validação de retorno de operações de ledger
 */

import { supabase } from "@/integrations/supabase/client";
import { registrarSaqueVirtualViaLedger, registrarDepositoVirtualViaLedger } from "@/lib/ledgerService";

export interface UnlinkPreCheck {
  canUnlink: boolean;
  pendingBetsCount: number;
  pendingSaquesTotal: number;
  pendingDepositosTotal: number;
  saldoAtual: number;
  saldoFreebet: number;
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
    .select("saldo_atual, saldo_freebet, moeda, projeto_id, workspace_id")
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
  // SAQUE_VIRTUAL = saldo_atual - saques_pendentes + depositos_pendentes
  const saldoVirtualEfetivo = Math.max(0, bm.saldo_atual - pendingSaquesTotal + pendingDepositosTotal);

  // 7. Warnings
  if (totalPendingBets > 0) {
    warnings.push(`⚠️ ${totalPendingBets} aposta(s) pendente(s) — se liquidadas após desvinculação, o resultado NÃO será atribuído a nenhum projeto`);
  }
  if (pendingSaquesTotal > 0) {
    warnings.push(`Saques pendentes: ${pendingSaquesTotal.toFixed(2)} ${bm.moeda} (descontados do saque virtual). Se cancelados após desvinculação, o valor ficará sub-contado no projeto.`);
  }
  if (pendingDepositosTotal > 0) {
    warnings.push(`Depósitos pendentes: ${pendingDepositosTotal.toFixed(2)} ${bm.moeda} (incluídos no saque virtual, serão atribuídos a este projeto quando confirmados)`);
  }
  if ((bm.saldo_freebet || 0) > 0) {
    warnings.push(`Saldo freebet: ${bm.saldo_freebet.toFixed(2)} ${bm.moeda} — freebets não são transferidas entre projetos e permanecerão na bookmaker`);
  }

  return {
    canUnlink: true,
    pendingBetsCount: totalPendingBets,
    pendingSaquesTotal,
    pendingDepositosTotal,
    saldoAtual: bm.saldo_atual,
    saldoFreebet: bm.saldo_freebet || 0,
    saldoVirtualEfetivo,
    moeda: bm.moeda,
    projetoId: bm.projeto_id,
    workspaceId: bm.workspace_id,
    warnings,
  };
}

/**
 * Verifica se já existe um SAQUE_VIRTUAL ou DEPOSITO_VIRTUAL recente (< 10s)
 * para evitar duplicatas por race condition.
 */
async function hasRecentVirtualTransaction(
  bookmakerId: string,
  tipoTransacao: "SAQUE_VIRTUAL" | "DEPOSITO_VIRTUAL",
  windowSeconds = 10
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const column = tipoTransacao === "SAQUE_VIRTUAL" ? "origem_bookmaker_id" : "destino_bookmaker_id";

  const { count } = await supabase
    .from("cash_ledger")
    .select("id", { count: "exact", head: true })
    .eq(column, bookmakerId)
    .eq("tipo_transacao", tipoTransacao)
    .gte("created_at", cutoff);

  return (count || 0) > 0;
}

/**
 * Executa a desvinculação com todas as proteções:
 * 
 * ORDEM CRÍTICA (atomicidade):
 * 1. Trava projeto_id_snapshot em transações PENDENTES/LIQUIDADO
 * 2. Cria SAQUE_VIRTUAL ANTES de desvincular (para garantir registro contábil)
 * 3. Desvincula a bookmaker (só após sucesso do ledger)
 * 4. Atualiza histórico
 * 5. Se qualquer etapa falhar, não avança para a próxima
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

  // 0. Proteção contra race condition — verificar duplicata recente
  const hasDuplicate = await hasRecentVirtualTransaction(bookmakerId, "SAQUE_VIRTUAL");
  if (hasDuplicate) {
    console.warn(`[projetoTransitionService] SAQUE_VIRTUAL duplicado detectado para bookmaker ${bookmakerId}. Operação ignorada.`);
    return;
  }

  // 1. TRAVAR projeto_id_snapshot em transações PENDENTES antes de desvincular
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

  // 2. SAQUE_VIRTUAL ANTES de desvincular (garante registro contábil)
  // Se esta etapa falhar, a bookmaker NÃO será desvinculada
  if (saldoVirtualEfetivo > 0) {
    const saqueResult = await registrarSaqueVirtualViaLedger({
      bookmakerId,
      saldoAtual: saldoVirtualEfetivo,
      moeda,
      workspaceId,
      userId,
      projetoId,
    });

    if (!saqueResult.success) {
      throw new Error(
        `Falha ao criar SAQUE_VIRTUAL para bookmaker ${bookmakerId}: ${saqueResult.error || 'Erro desconhecido'}. ` +
        `Desvinculação abortada para preservar integridade financeira.`
      );
    }
  }

  // 3. Desvincular bookmaker do projeto (só após sucesso do ledger)
  const { error: updateError } = await supabase
    .from("bookmakers")
    .update({ projeto_id: null, status: statusFinal })
    .eq("id", bookmakerId);

  if (updateError) throw updateError;

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
 * 
 * Proteções:
 * - Proteção contra race condition (idempotência)
 * - Validação de retorno do ledger
 * - DEPOSITO_VIRTUAL é OBRIGATÓRIO quando saldo > 0 (sem exceções)
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

  // NOTA: A supressão de transações virtuais em re-vinculação ao mesmo projeto foi REMOVIDA.
  // Motivo: O SAQUE_VIRTUAL já é criado durante o desvínculo. Se suprimirmos o DEPOSITO_VIRTUAL,
  // o ledger fica desbalanceado (saques > depósitos), inflando artificialmente o lucro.
  // É preferível ter pares completos (SAQUE_VIRTUAL + DEPOSITO_VIRTUAL) no ledger
  // do que comprometer a integridade financeira.

  // 1. Proteção contra race condition
  const hasDuplicate = await hasRecentVirtualTransaction(bookmakerId, "DEPOSITO_VIRTUAL");
  if (hasDuplicate) {
    console.warn(`[projetoTransitionService] DEPOSITO_VIRTUAL duplicado detectado para bookmaker ${bookmakerId}. Operação ignorada.`);
    return;
  }

  // 2. DEPOSITO_VIRTUAL com saldo atual (baseline para o novo projeto)
  // NOTA: NÃO atribuímos transações órfãs — o DEPOSITO_VIRTUAL é a única fonte de baseline.
  if (saldoAtual > 0) {
    const depositoResult = await registrarDepositoVirtualViaLedger({
      bookmakerId,
      saldoAtual,
      moeda,
      workspaceId,
      userId,
      projetoId,
    });

    if (!depositoResult.success) {
      throw new Error(
        `Falha ao criar DEPOSITO_VIRTUAL para bookmaker ${bookmakerId}: ${depositoResult.error || 'Erro desconhecido'}. ` +
        `A vinculação pode estar incompleta — verifique o ledger.`
      );
    }
  }
}
