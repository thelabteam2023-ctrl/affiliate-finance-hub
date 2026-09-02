/**
 * SSOT — Valor efetivo de um saque no `cash_ledger`.
 *
 * Contexto (Auditoria Forense de Lucro/Prejuízo Realizado):
 * `valor_confirmado` tem DUAS semânticas distintas no ledger:
 *
 *  - FIAT   → valor financeiro realmente recebido após taxas (mesma moeda de `valor`).
 *  - CRYPTO → QUANTIDADE do ativo recebida (ex.: 0.0337 ETH), NÃO o valor financeiro.
 *
 * Usar `valor_confirmado ?? valor` indiscriminadamente destrói o KPI de
 * Lucro/Prejuízo Realizado em saques cripto (ex.: saque de US$ 2.169 vira US$ 0,03).
 *
 * Regra canônica:
 *  - CRYPTO → sempre `valor` (valor financeiro registrado na operação).
 *  - FIAT   → `valor_confirmado` quando existir, senão `valor`.
 */

export interface SaqueValorRow {
  valor?: number | string | null;
  valor_confirmado?: number | string | null;
  tipo_moeda?: string | null;
}

export function isCryptoLedgerRow(row: SaqueValorRow): boolean {
  return String(row?.tipo_moeda ?? "").toUpperCase() === "CRYPTO";
}

/** Valor financeiro efetivo do saque, na moeda nativa da linha. */
export function valorEfetivoSaque(row: SaqueValorRow): number {
  const valor = Number(row?.valor ?? 0) || 0;
  if (row?.valor_confirmado == null) return valor;
  const confirmado = Number(row.valor_confirmado);
  if (!Number.isFinite(confirmado)) return valor;
  // Cripto: `valor_confirmado` é quantidade do ativo, não valor financeiro.
  if (isCryptoLedgerRow(row)) return valor;
  return confirmado;
}

/**
 * Ganho/perda de confirmação (diferença entre o solicitado e o recebido).
 * Sempre 0 em cripto — a diferença ali não é financeira.
 */
export function ganhoConfirmacaoSaque(row: SaqueValorRow): number {
  if (isCryptoLedgerRow(row)) return 0;
  if (row?.valor_confirmado == null) return 0;
  const valor = Number(row?.valor ?? 0) || 0;
  const confirmado = Number(row.valor_confirmado);
  if (!Number.isFinite(confirmado)) return 0;
  const delta = confirmado - valor;
  return Math.abs(delta) >= 0.01 ? delta : 0;
}
