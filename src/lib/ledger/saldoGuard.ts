/**
 * Regra única de saldo não-negativo — espelha o gatilho
 * `trg_guard_bookmaker_saldo_nao_negativo` no banco.
 *
 * O banco é a fonte da verdade (fail-closed). Este módulo existe para o
 * frontend antecipar a mensagem ao usuário e para os testes de regressão.
 */

export const TOLERANCIA_SALDO = 0.01;

export type TipoSaldo = "REAL" | "FREEBET";

export interface AvaliacaoSaldo {
  permitido: boolean;
  saldoResultante: number;
  motivo?: string;
}

/**
 * Avalia se uma variação de saldo pode ser gravada.
 *
 * - Crédito (delta >= 0) sempre passa, inclusive em casa já negativa.
 * - Débito que deixaria a casa abaixo de zero é recusado.
 * - Casa já negativa: recusa apenas se a operação piorar o quadro.
 */
export function avaliarVariacaoSaldo(
  saldoAtual: number,
  delta: number,
  tipo: TipoSaldo = "REAL",
  nomeCasa = "Casa",
  moeda = "BRL",
): AvaliacaoSaldo {
  const saldo = Number(saldoAtual) || 0;
  const resultante = saldo + (Number(delta) || 0);

  if (delta >= 0) {
    return { permitido: true, saldoResultante: resultante };
  }

  if (resultante < -TOLERANCIA_SALDO && resultante < saldo) {
    const rotulo = tipo === "FREEBET" ? "freebet" : "saldo real";
    return {
      permitido: false,
      saldoResultante: resultante,
      motivo: `SALDO_INSUFICIENTE: ${nomeCasa} — ${rotulo} disponível: ${saldo.toFixed(2)} ${moeda}, necessário: ${Math.abs(delta).toFixed(2)} ${moeda}.`,
    };
  }

  return { permitido: true, saldoResultante: resultante };
}

/** Verdadeiro quando a mensagem de erro do banco é uma recusa por saldo. */
export function isErroSaldoInsuficiente(mensagem?: string | null): boolean {
  return !!mensagem && mensagem.includes("SALDO_INSUFICIENTE");
}
