/**
 * Helpers de elegibilidade para reverter / excluir movimentações do Caixa Operacional.
 * Validação espelhada client-side (UX) e server-side (RPCs reverter_movimentacao_caixa / excluir_movimentacao_caixa).
 *
 * IMPORTANTE: estas regras DEVEM espelhar exatamente a lógica das RPCs em
 * supabase/migrations/*reverter_movimentacao_caixa* — qualquer divergência
 * gerará UX inconsistente (botão habilitado mas RPC rejeita).
 */

export type Eligibility = { allowed: boolean; reason?: string };

// Tipos que não podem ser revertidos automaticamente — exigem fluxo dedicado
const TIPOS_BLOQUEADOS_REVERSAO = new Set([
  "APORTE",
  "APORTE_FINANCEIRO",
  "APORTE_DIRETO",
  "LIQUIDACAO",
  "DEPOSITO_VIRTUAL",
  "SAQUE_VIRTUAL",
  "SWAP_IN",
  "SWAP_OUT",
  "GANHO_CAMBIAL",
  "PERDA_CAMBIAL",
]);

const TIPOS_BLOQUEADOS_EXCLUSAO = new Set([
  "APORTE",
  "APORTE_FINANCEIRO",
  "APORTE_DIRETO",
  "LIQUIDACAO",
  "DEPOSITO_VIRTUAL",
  "SAQUE_VIRTUAL",
]);

const REVERT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const DELETE_WINDOW_MS = 30 * 60 * 1000; // 30min

function isOwnerOrAdmin(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

function ageMs(createdAt: string | Date | null | undefined): number {
  if (!createdAt) return Infinity;
  const t = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  return Date.now() - t;
}

export function canRevert(tx: any, role: string | null | undefined): Eligibility {
  if (!isOwnerOrAdmin(role)) {
    return { allowed: false, reason: "Apenas owners/admins podem reverter" };
  }
  if (tx?.reversed_at) {
    return { allowed: false, reason: "Esta movimentação já foi revertida" };
  }
  if (tx?.descricao && typeof tx.descricao === "string" && tx.descricao.startsWith("ESTORNO:")) {
    return { allowed: false, reason: "Esta transação já é um estorno" };
  }
  if (tx?.reconciled_at) {
    return { allowed: false, reason: "Transação reconciliada — não pode ser revertida" };
  }
  if (TIPOS_BLOQUEADOS_REVERSAO.has(tx?.tipo_transacao)) {
    return {
      allowed: false,
      reason: `${tx.tipo_transacao} não suporta reversão automática — use o fluxo dedicado`,
    };
  }
  if (ageMs(tx?.created_at) > REVERT_WINDOW_MS) {
    return { allowed: false, reason: "Janela de 24h para reversão expirada" };
  }
  return { allowed: true };
}

export function canDelete(tx: any, role: string | null | undefined): Eligibility {
  if (!isOwnerOrAdmin(role)) {
    return { allowed: false, reason: "Apenas owners/admins podem excluir" };
  }
  if (tx?.reversed_at) {
    return { allowed: false, reason: "Movimentação já revertida não pode ser excluída" };
  }
  if (tx?.reconciled_at) {
    return { allowed: false, reason: "Transação reconciliada — não pode ser excluída" };
  }
  if (TIPOS_BLOQUEADOS_EXCLUSAO.has(tx?.tipo_transacao)) {
    return { allowed: false, reason: `${tx.tipo_transacao} não pode ser excluído diretamente` };
  }
  if (tx?.financial_events_generated) {
    return { allowed: false, reason: "Já gerou eventos financeiros — use Reverter" };
  }
  if (ageMs(tx?.created_at) > DELETE_WINDOW_MS) {
    return { allowed: false, reason: "Janela de 30 min para exclusão expirada — use Reverter" };
  }
  return { allowed: true };
}
