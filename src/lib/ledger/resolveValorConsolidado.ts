/**
 * Resolução canônica de um valor do ledger para a moeda de consolidação.
 *
 * REGRA DE OURO (multimoeda):
 *   Um valor já expresso na moeda de consolidação NUNCA pode ser convertido
 *   para outra moeda apenas para ser convertido de volta (BRL → USD → BRL).
 *   Essa ida e volta usa duas cotações diferentes (a histórica do snapshot e a
 *   Cotação de Trabalho atual) e distorce o valor econômico do evento.
 *
 * HIERARQUIA:
 *   1º  moeda da transação === moeda de consolidação  → valor nativo, sem conversão
 *   2º  snapshot `valor_usd_referencia` (congelado no dia) → convertido USD → consolidação
 *   3º  conversão direta pela Cotação de Trabalho do projeto
 */

export interface ResolveValorConsolidadoInput {
  /** Valor na moeda original da transação */
  valor: number;
  /** Moeda original da transação (BRL, USD, USDT, ...) */
  moeda: string;
  /** `valor_usd_referencia` gravado no ledger (snapshot em USD), quando existir */
  snapshotUsd?: number | null;
  /** Moeda de consolidação do projeto */
  moedaConsolidacao: string;
  /** Conversor do projeto (Cotação de Trabalho) */
  convertToConsolidation: (valor: number, moedaOrigem: string) => number;
}

/** Moedas tratadas com paridade 1:1 com o dólar. */
const USD_PEGGED = ["USD", "USDT", "USDC"];

export function resolveValorConsolidado({
  valor,
  moeda,
  snapshotUsd,
  moedaConsolidacao,
  convertToConsolidation,
}: ResolveValorConsolidadoInput): number {
  const v = Number(valor) || 0;
  if (!v) return 0;

  const moedaOrigem = (moeda || "BRL").toUpperCase();
  const dest = (moedaConsolidacao || "BRL").toUpperCase();

  // 1º — já está na moeda de consolidação: nenhuma conversão.
  if (moedaOrigem === dest) return v;

  // 2º — snapshot em USD congelado no dia da transação.
  const snap = Number(snapshotUsd ?? 0);
  if (snap > 0) {
    const snapAssinado = v < 0 ? -Math.abs(snap) : Math.abs(snap);
    if (USD_PEGGED.includes(dest)) return snapAssinado;
    return convertToConsolidation(snapAssinado, "USD");
  }

  // 3º — conversão direta pela Cotação de Trabalho.
  return convertToConsolidation(v, moedaOrigem);
}
