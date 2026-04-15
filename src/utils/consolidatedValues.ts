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
 *    ⚠️ SÓ se consolidation_currency === moedaConsolidacao do projeto!
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
  consolidation_currency?: string | null;
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
 * 
 * CRÍTICO: stake_consolidado só é usado se consolidation_currency === moedaConsolidacao.
 * Caso contrário, o valor pré-calculado está em outra moeda e seria interpretado incorretamente.
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

  // 1. Campo pré-calculado no banco — APENAS se a moeda de consolidação bate
  if (
    typeof aposta.stake_consolidado === "number" && 
    aposta.stake_consolidado !== 0 &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency === moedaConsolidacao
  ) {
    return aposta.stake_consolidado;
  }

  // 1b. stake_consolidado existe mas em OUTRA moeda → converter stake_consolidado (não raw stake!)
  // CRÍTICO para ARBITRAGEM: raw stake é nominal de UMA perna,
  // enquanto stake_consolidado já considera TODAS as pernas corretamente.
  if (
    typeof aposta.stake_consolidado === "number" &&
    aposta.stake_consolidado !== 0 &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency !== moedaConsolidacao &&
    convertToConsolidation
  ) {
    return convertToConsolidation(aposta.stake_consolidado, aposta.consolidation_currency);
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
 * 
 * CRÍTICO: pl_consolidado só é usado se consolidation_currency === moedaConsolidacao.
 */
export function getConsolidatedLucro(
  aposta: ApostaConsolidavel,
  convertToConsolidation?: ConvertFn,
  moedaConsolidacao?: string,
): number {
  const rawLucro = aposta.lucro_prejuizo ?? 0;

  // 1. Campo pré-calculado — APENAS se a moeda de consolidação bate
  if (
    typeof aposta.pl_consolidado === "number" &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency === moedaConsolidacao
  ) {
    return aposta.pl_consolidado;
  }

  // 1b. pl_consolidado existe mas em OUTRA moeda → converter pl_consolidado (não lucro_prejuizo!)
  // CRÍTICO para ARBITRAGEM: lucro_prejuizo é P&L nominal de UMA perna,
  // enquanto pl_consolidado já considera TODAS as pernas corretamente.
  if (
    typeof aposta.pl_consolidado === "number" &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency !== moedaConsolidacao &&
    convertToConsolidation
  ) {
    return convertToConsolidation(aposta.pl_consolidado, aposta.consolidation_currency);
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
 * Tipo para pernas individuais usadas na conversão direta multicurrency.
 */
export interface PernaConsolidavel {
  moeda?: string;
  lucro_prejuizo?: number | null;
  resultado?: string | null;
  stake?: number | null;
  stake_brl_referencia?: number | null;
}

/**
 * Retorna o lucro/prejuízo na moeda de consolidação do projeto,
 * usando conversão DIRETA por perna para apostas multicurrency.
 * 
 * MOTIVAÇÃO: pl_consolidado é salvo com consolidation_currency BRL.
 * Para projetos USD, converter BRL→USD introduz erro de cross-rate
 * em apostas multicurrency (ex: EUR→BRL→USD vs EUR→USD direto).
 * Esta função elimina o pivot intermediário quando pernas estão disponíveis.
 * 
 * @param pernas - Array de pernas da aposta (de apostas_pernas ou JSON inline).
 *                 Se undefined/vazio, faz fallback para getConsolidatedLucro padrão.
 */
export function getConsolidatedLucroDirect(
  aposta: ApostaConsolidavel & { is_multicurrency?: boolean | null },
  pernas: PernaConsolidavel[] | undefined | null,
  convertToConsolidation?: ConvertFn,
  moedaConsolidacao?: string,
): number {
  // PRIORIDADE 1: pl_consolidado pré-calculado na moeda correta (via RPC com snapshot rates)
  // Isso garante valor estável e reprodutível para operações multicurrency
  if (
    typeof aposta.pl_consolidado === "number" &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency === moedaConsolidacao
  ) {
    return aposta.pl_consolidado;
  }

  // PRIORIDADE 1b: pl_consolidado em outra moeda → converter
  if (
    typeof aposta.pl_consolidado === "number" &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency !== moedaConsolidacao &&
    convertToConsolidation
  ) {
    return convertToConsolidation(aposta.pl_consolidado, aposta.consolidation_currency);
  }

  // PRIORIDADE 2: Multicurrency com pernas disponíveis mas sem pl_consolidado
  if (aposta.is_multicurrency && pernas && pernas.length > 0 && convertToConsolidation) {
    return pernas.reduce((acc, p) => {
      if (p.resultado && p.resultado === 'PENDENTE') return acc;
      const moeda = p.moeda || 'BRL';
      return acc + convertToConsolidation(p.lucro_prejuizo ?? 0, moeda);
    }, 0);
  }

  // Pernas inline com moedas mistas (detecta multicurrency mesmo sem flag)
  if (pernas && pernas.length >= 2 && convertToConsolidation) {
    const moedas = new Set(pernas.map(p => (p.moeda || 'BRL').toUpperCase()));
    if (moedas.size > 1) {
      return pernas.reduce((acc, p) => {
        if (p.resultado && p.resultado === 'PENDENTE') return acc;
        const moeda = p.moeda || 'BRL';
        return acc + convertToConsolidation(p.lucro_prejuizo ?? 0, moeda);
      }, 0);
    }
  }

  // Fallback: lógica padrão
  return getConsolidatedLucro(aposta, convertToConsolidation, moedaConsolidacao);
}

/**
 * Retorna o stake na moeda de consolidação do projeto,
 * usando conversão DIRETA por perna para apostas multicurrency.
 */
export function getConsolidatedStakeDirect(
  aposta: ApostaConsolidavel & { is_multicurrency?: boolean | null },
  pernas: PernaConsolidavel[] | undefined | null,
  convertToConsolidation?: ConvertFn,
  moedaConsolidacao?: string,
): number {
  // PRIORIDADE 1: stake_consolidado pré-calculado na moeda correta
  if (
    typeof aposta.stake_consolidado === "number" &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency === moedaConsolidacao
  ) {
    return aposta.stake_consolidado;
  }

  // PRIORIDADE 1b: stake_consolidado em outra moeda → converter
  if (
    typeof aposta.stake_consolidado === "number" &&
    aposta.consolidation_currency &&
    moedaConsolidacao &&
    aposta.consolidation_currency !== moedaConsolidacao &&
    convertToConsolidation
  ) {
    return convertToConsolidation(aposta.stake_consolidado, aposta.consolidation_currency);
  }

  // PRIORIDADE 2: Multicurrency com pernas disponíveis mas sem stake_consolidado
  if (aposta.is_multicurrency && pernas && pernas.length > 0 && convertToConsolidation) {
    return pernas.reduce((acc, p) => {
      const moeda = p.moeda || 'BRL';
      return acc + convertToConsolidation(Math.abs(p.stake ?? 0), moeda);
    }, 0);
  }

  // Pernas inline com moedas mistas
  if (pernas && pernas.length >= 2 && convertToConsolidation) {
    const moedas = new Set(pernas.map(p => (p.moeda || 'BRL').toUpperCase()));
    if (moedas.size > 1) {
      return pernas.reduce((acc, p) => {
        const moeda = p.moeda || 'BRL';
        return acc + convertToConsolidation(Math.abs(p.stake ?? 0), moeda);
      }, 0);
    }
  }

  // Fallback: lógica padrão
  return getConsolidatedStake(aposta, convertToConsolidation, moedaConsolidacao);
}

/**
 * Campos SELECT obrigatórios para queries que alimentam KPIs.
 * Adicione estes campos a toda query de apostas_unificada que calcula volume/lucro.
 */
export const CONSOLIDATION_SELECT_FIELDS = 
  "moeda_operacao, stake_consolidado, pl_consolidado, consolidation_currency, valor_brl_referencia, lucro_prejuizo_brl_referencia";
