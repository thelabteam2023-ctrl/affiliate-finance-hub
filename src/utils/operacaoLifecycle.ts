/**
 * Ciclo de vida de uma operação (aposta simples, múltipla ou surebet).
 *
 * REGRA CANÔNICA: uma operação só é considerada CONCLUÍDA quando 100% das suas
 * pernas estão resolvidas. Enquanto houver qualquer perna pendente, o pai
 * permanece ABERTO.
 *
 * O banco (liquidar_perna_surebet_v1) grava `status = 'PENDENTE'` + `resultado = NULL`
 * nesse caso. O estado legado 'PARCIAL' é tratado aqui como rede de proteção para
 * dados antigos ou para qualquer caminho que ainda o produza.
 */

export interface OperacaoLifecycleInput {
  status?: string | null;
  resultado?: string | null;
}

const STATUS_ABERTO = new Set(["PENDENTE", "PARCIAL"]);

/** Operação ainda em aberto (qualquer perna sem resultado). */
export function isOperacaoAberta(op: OperacaoLifecycleInput | null | undefined): boolean {
  if (!op) return false;
  const status = (op.status || "").toUpperCase();
  const resultado = (op.resultado || "").toUpperCase();
  if (STATUS_ABERTO.has(status)) return true;
  if (!resultado || resultado === "PENDENTE") return true;
  return false;
}

/** Operação concluída — todas as pernas resolvidas e resultado final definido. */
export function isOperacaoConcluida(op: OperacaoLifecycleInput | null | undefined): boolean {
  if (!op) return false;
  return !isOperacaoAberta(op);
}

/**
 * Progresso de liquidação por perna. Usado para exibir o selo "Parcial (1/2)"
 * em operações abertas que já têm parte das pernas conferida.
 */
export function getProgressoPernas(
  pernas: Array<{ resultado?: string | null }> | null | undefined
): { resolvidas: number; total: number; isParcial: boolean } {
  const total = pernas?.length ?? 0;
  const resolvidas = (pernas || []).filter(
    (p) => p.resultado && p.resultado.toUpperCase() !== "PENDENTE"
  ).length;
  return { resolvidas, total, isParcial: total > 0 && resolvidas > 0 && resolvidas < total };
}
