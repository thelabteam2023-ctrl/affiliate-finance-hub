/**
 * Helpers de derivação financeira para pernas back/lay.
 *
 * Fonte única de verdade para a camada de UI quando precisar calcular
 * exposição, lucro e ROI por perna individual. NÃO duplica a matemática
 * já consolidada nas RPCs de liquidação — apenas a espelha para exibição.
 *
 * Regras (alinhadas com surebetCurrencyEngine.ts e liquidar_perna_surebet_v1):
 *  - back: exposição = stake; lucro GREEN = stake*(odd-1); lucro RED = -stake.
 *  - lay : exposição = stake*(odd-1) (liability);
 *           lucro GREEN = stake*(1-comissao) (lay ganha → seleção perdeu);
 *           lucro RED   = -liability        (lay perde → seleção venceu).
 *  - Comissão só incide sobre o lucro do GREEN; nunca sobre liability/RED/VOID.
 *  - Toda perna sem `tipo` é tratada como 'back'; sem `comissao` é 0.
 */

export interface PernaLayInput {
  odd: number;
  stake: number;
  tipo?: "back" | "lay" | null;
  comissao?: number | null;
}

export function isLay(perna: PernaLayInput): boolean {
  return perna?.tipo === "lay";
}

export function getComissao(perna: PernaLayInput): number {
  const c = Number(perna?.comissao ?? 0);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/** Exposição real da perna na moeda original: stake (back) ou liability (lay). */
export function exposureOf(perna: PernaLayInput): number {
  const stake = Number(perna?.stake || 0);
  const odd = Number(perna?.odd || 0);
  if (!isLay(perna)) return stake;
  return Math.max(0, stake * Math.max(0, odd - 1));
}

/** Rótulo curto para o campo de exposição exibido no card. */
export function labelExposicao(perna: PernaLayInput): "Stake" | "Resp" {
  return isLay(perna) ? "Resp" : "Stake";
}

/** Rótulo extenso (para tooltips). */
export function labelExposicaoLongo(perna: PernaLayInput): "Stake" | "Responsabilidade" {
  return isLay(perna) ? "Responsabilidade" : "Stake";
}

/** Lucro nominal se a perna for a GREEN (vencedora financeira). */
export function lucroSeGanhar(perna: PernaLayInput): number {
  const stake = Number(perna?.stake || 0);
  const odd = Number(perna?.odd || 0);
  if (isLay(perna)) return stake * (1 - getComissao(perna));
  return stake * Math.max(0, odd - 1);
}

/** Lucro nominal se a perna for a RED (perdedora financeira). */
export function lucroSePerder(perna: PernaLayInput): number {
  const stake = Number(perna?.stake || 0);
  const odd = Number(perna?.odd || 0);
  if (isLay(perna)) return -(stake * Math.max(0, odd - 1));
  return -stake;
}

/** Base para cálculo de ROI/% por perna — sempre a exposição real. */
export function roiBase(perna: PernaLayInput): number {
  return exposureOf(perna);
}
