/**
 * Helper canônico para leitura "efetiva" do `cash_ledger`.
 *
 * REGRA CANÔNICA (Auditoria de Reversão Financeira, docs/AUDITORIA_REVERSAO_FINANCEIRA.md):
 * Qualquer KPI, extrato, dashboard, relatório ou consolidação que agregue movimentações
 * financeiras (DEPOSITO, SAQUE, TRANSFERENCIA, BONUS_CREDITADO, AJUSTE_*) DEVE ignorar
 * linhas revertidas — caso contrário, o depósito original continua contando mesmo após
 * o `reverter_movimentacao_caixa` gerar o lançamento-espelho.
 *
 * O espelho é um `AJUSTE_RECONCILIACAO`, então filtrar por `tipo_transacao='DEPOSITO'`
 * já o exclui automaticamente. Aqui basta ocultar o ORIGINAL usando `reversed_at IS NULL`.
 *
 * Uso:
 *   applyEffectiveFilter(supabase.from('cash_ledger').select(...))
 *
 * Ou, quando precisar reaproveitar o mesmo QueryBuilder após outros filtros:
 *   let q = supabase.from('cash_ledger').select(...).eq(...);
 *   q = applyEffectiveFilter(q);
 */

// Supabase JS filter builder é minimamente tipado; usamos `any` para preservar o encadeamento.
// A alternativa (importar PostgrestFilterBuilder) acopla demais este helper ao SDK.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyEffectiveFilter<T extends { is: (col: string, val: null) => any }>(query: T): T {
  return query.is("reversed_at", null) as T;
}

/**
 * Tipos de transação que compõem o núcleo financeiro (fluxo de capital)
 * — todos devem ser lidos SEMPRE em modo efetivo.
 */
export const CORE_FINANCIAL_TIPOS = [
  "DEPOSITO",
  "DEPOSITO_VIRTUAL",
  "SAQUE",
  "SAQUE_VIRTUAL",
  "TRANSFERENCIA",
  "BONUS_CREDITADO",
  "CASHBACK_MANUAL",
  "GIRO_GRATIS",
  "AJUSTE_SALDO",
  "AJUSTE_MANUAL",
  "AJUSTE_RECONCILIACAO",
] as const;

/**
 * Descreve, para observabilidade, se uma linha do `cash_ledger` é original efetiva,
 * espelho de estorno, ou original já revertido.
 */
export type LedgerRowStatus = "ORIGINAL_EFETIVO" | "ESPELHO_ESTORNO" | "ORIGINAL_REVERTIDO";

export function classifyLedgerRow(row: {
  reversed_at?: string | null;
  tipo_transacao?: string | null;
  descricao?: string | null;
}): LedgerRowStatus {
  if (row.reversed_at) return "ORIGINAL_REVERTIDO";
  if (
    row.tipo_transacao === "AJUSTE_RECONCILIACAO" &&
    typeof row.descricao === "string" &&
    row.descricao.startsWith("ESTORNO:")
  ) {
    return "ESPELHO_ESTORNO";
  }
  return "ORIGINAL_EFETIVO";
}