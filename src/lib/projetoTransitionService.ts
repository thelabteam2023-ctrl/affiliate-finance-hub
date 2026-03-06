/**
 * Lógica centralizada de desvinculação de bookmaker de projeto.
 * 
 * Trata os edge cases:
 * 1. SAQUE_VIRTUAL descontando saques/depositos pendentes
 * 2. Travamento de projeto_id_snapshot em transações pendentes
 * 3. Verificação de apostas pendentes
 * 4. Proteção contra race conditions (idempotência via FOR UPDATE no DB)
 * 5. Detecção de re-vinculação ao mesmo projeto
 * 6. Tracking de saldo freebet
 * 7. ATOMICIDADE: RPC garante SAQUE_VIRTUAL + unlink na mesma transação DB
 * 8. Validação de retorno de operações de ledger
 */

import { supabase } from "@/integrations/supabase/client";
import { registrarDepositoVirtualViaLedger } from "@/lib/ledgerService";

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

interface UnlinkResult {
  success: boolean;
  error?: string;
  code?: string;
  saque_virtual_id?: string;
}

/**
 * Executa a desvinculação via RPC ATÔMICA no banco de dados.
 * 
 * GARANTIAS:
 * - SAQUE_VIRTUAL + unlink + histórico na MESMA transação PostgreSQL
 * - FOR UPDATE lock previne concorrência entre abas/operadores
 * - Se qualquer etapa falhar, TUDO é revertido automaticamente
 * - Proteção contra duplicatas (10s window no DB)
 */
export async function executeUnlink(params: {
  bookmakerId: string;
  projetoId: string;
  workspaceId: string;
  userId: string;
  statusFinal: string;
  saldoVirtualEfetivo: number;
  moeda: string;
  marcarParaSaque?: boolean;
}): Promise<void> {
  const { bookmakerId, projetoId, workspaceId, userId, statusFinal, saldoVirtualEfetivo, moeda, marcarParaSaque = false } = params;

  const { data, error } = await supabase.rpc('desvincular_bookmaker_atomico', {
    p_bookmaker_id: bookmakerId,
    p_projeto_id: projetoId,
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_status_final: statusFinal,
    p_saldo_virtual_efetivo: saldoVirtualEfetivo,
    p_moeda: moeda,
    p_marcar_para_saque: marcarParaSaque,
  });

  if (error) {
    throw new Error(`Erro na desvinculação atômica: ${error.message}`);
  }

  const result = data as unknown as UnlinkResult;

  if (!result.success) {
    throw new Error(result.error || 'Erro desconhecido na desvinculação');
  }

  console.log(`[executeUnlink] ✅ Bookmaker ${bookmakerId} desvinculada atomicamente. SV: ${result.saque_virtual_id || 'N/A'}`);
}

/**
 * Executa a vinculação.
 * 
 * O DEPOSITO_VIRTUAL é criado automaticamente pelo trigger de banco de dados
 * (tr_ensure_deposito_virtual_on_link) quando projeto_id muda de NULL para um valor.
 * 
 * Esta função NÃO cria DEPOSITO_VIRTUAL para evitar duplicatas.
 * O trigger é a única fonte de verdade para baselines de vinculação.
 */
export async function executeLink(_params: {
  bookmakerId: string;
  projetoId: string;
  workspaceId: string;
  userId: string;
  saldoAtual: number;
  moeda: string;
}): Promise<void> {
  // DEPOSITO_VIRTUAL é agora responsabilidade exclusiva do trigger
  // tr_ensure_deposito_virtual_on_link no banco de dados.
  // Esta função mantém a assinatura para compatibilidade de API.
  console.log(`[executeLink] Vinculação de ${_params.bookmakerId} ao projeto ${_params.projetoId}. DV será criado pelo trigger do DB.`);
}
