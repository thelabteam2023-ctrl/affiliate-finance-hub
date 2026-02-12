/**
 * UTILITÁRIO CENTRAL DE VALORES CONSOLIDADOS
 * 
 * Toda exibição de KPIs (Volume, Lucro, ROI) DEVE usar estas funções.
 * 
 * REGRA: Nunca somar stake/lucro brutos de moedas diferentes.
 * Sempre usar o valor consolidado na moeda do projeto.
 * 
 * Prioridade de resolução:
 * 1. Campo consolidado pré-calculado (stake_consolidado / pl_consolidado)
 * 2. Campo de referência BRL (valor_brl_referencia / lucro_prejuizo_brl_referencia)
 * 3. Conversão runtime via convertToConsolidation (se moeda != consolidação)
 * 4. Valor bruto (fallback - somente se mesma moeda)
 */

export interface ApostaConsolidavel {
  stake?: number | null;
  stake_total?: number | null;
  lucro_prejuizo?: number | null;
  moeda_operacao?: string | null;
  // Campos consolidados
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  valor_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  // Tipo de registro
  forma_registro?: string | null;
}

type ConvertFn = (valor: number, moedaOrigem: string) => number;

/**
 * Retorna o stake efetivo (para volume) na moeda de consolidação do projeto.
 * 
 * Para ARBITRAGEM, usa stake_total em vez de stake.
 */
export function getConsolidatedStake(
  aposta: ApostaConsolidavel,
  convertToConsolidation?: ConvertFn,
  moedaConsolidacao?: string,
): number {
  // Stake base (ARBITRAGEM usa stake_total)
  const rawStake = typeof aposta.stake_total === "number" 
    ? aposta.stake_total 
    : (aposta.stake ?? 0);

  // 1. Campo pré-calculado no banco
  if (typeof aposta.stake_consolidado === "number" && aposta.stake_consolidado !== 0) {
    return aposta.stake_consolidado;
  }

  // 2. Se moeda é a mesma da consolidação, usar bruto
  const moedaOp = aposta.moeda_operacao || "BRL";
  if (moedaConsolidacao && moedaOp === moedaConsolidacao) {
    return rawStake;
  }

  // 3. Se consolidação é BRL e temos valor_brl_referencia
  if (moedaConsolidacao === "BRL" && typeof aposta.valor_brl_referencia === "number") {
    return aposta.valor_brl_referencia;
  }

  // 4. Conversão runtime
  if (convertToConsolidation && moedaOp !== (moedaConsolidacao || "BRL")) {
    return convertToConsolidation(rawStake, moedaOp);
  }

  // 5. Fallback: valor bruto
  return rawStake;
}

/**
 * Retorna o lucro/prejuízo na moeda de consolidação do projeto.
 */
export function getConsolidatedLucro(
  aposta: ApostaConsolidavel,
  convertToConsolidation?: ConvertFn,
  moedaConsolidacao?: string,
): number {
  const rawLucro = aposta.lucro_prejuizo ?? 0;

  // 1. Campo pré-calculado
  if (typeof aposta.pl_consolidado === "number") {
    return aposta.pl_consolidado;
  }

  // 2. Mesma moeda
  const moedaOp = aposta.moeda_operacao || "BRL";
  if (moedaConsolidacao && moedaOp === moedaConsolidacao) {
    return rawLucro;
  }

  // 3. Se consolidação é BRL e temos lucro_brl_referencia
  if (moedaConsolidacao === "BRL" && typeof aposta.lucro_prejuizo_brl_referencia === "number") {
    return aposta.lucro_prejuizo_brl_referencia;
  }

  // 4. Conversão runtime
  if (convertToConsolidation && moedaOp !== (moedaConsolidacao || "BRL")) {
    return convertToConsolidation(rawLucro, moedaOp);
  }

  // 5. Fallback
  return rawLucro;
}

/**
 * Campos SELECT obrigatórios para queries que alimentam KPIs.
 * Adicione estes campos a toda query de apostas_unificada que calcula volume/lucro.
 */
export const CONSOLIDATION_SELECT_FIELDS = 
  "moeda_operacao, stake_consolidado, pl_consolidado, valor_brl_referencia, lucro_prejuizo_brl_referencia";
