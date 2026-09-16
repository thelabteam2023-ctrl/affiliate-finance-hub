/**
 * Classificação econômica das diferenças de conciliação.
 *
 * O ledger grava `GANHO_CAMBIAL` / `PERDA_CAMBIAL` sempre que o valor confirmado
 * difere do valor nominal — inclusive quando NÃO houve troca de moeda.
 * Quando origem e destino estão na MESMA moeda, a diferença não é câmbio:
 * é a diferença efetivamente recebida/retida no trânsito (crédito extra da casa,
 * taxa de rede, tarifa de processamento).
 *
 * Esta função NÃO altera o ledger. Ela apenas reclassifica para apresentação e
 * para o detalhamento reconciliável do Lucro Realizado.
 */

export type NaturezaDiferenca = "DIFERENCA_RECEBIMENTO" | "RESULTADO_CAMBIAL";

export interface EventoDiferencaInput {
  /** Moeda gravada no próprio evento de diferença */
  moeda?: string | null;
  /** Moeda da contraparte do movimento (casa de destino/origem, carteira) */
  moedaContraparte?: string | null;
}

/** Moedas tratadas com paridade 1:1 com o dólar (não geram câmbio entre si). */
const USD_PEGGED = ["USD", "USDT", "USDC"];

function mesmaMoeda(a: string, b: string): boolean {
  if (a === b) return true;
  return USD_PEGGED.includes(a) && USD_PEGGED.includes(b);
}

export function classificarDiferencaConciliacao(
  evento: EventoDiferencaInput
): NaturezaDiferenca {
  const moeda = (evento.moeda || "").toUpperCase();
  const contraparte = (evento.moedaContraparte || "").toUpperCase();

  // Sem contraparte conhecida, assume-se mesma moeda (não há troca comprovada).
  if (!contraparte || !moeda) return "DIFERENCA_RECEBIMENTO";

  return mesmaMoeda(moeda, contraparte) ? "DIFERENCA_RECEBIMENTO" : "RESULTADO_CAMBIAL";
}

export const LABEL_NATUREZA_DIFERENCA: Record<NaturezaDiferenca, string> = {
  DIFERENCA_RECEBIMENTO: "Diferença de recebimento",
  RESULTADO_CAMBIAL: "Resultado cambial",
};
