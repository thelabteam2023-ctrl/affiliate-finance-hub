/**
 * Constantes centralizadas para o domínio de Apostas
 * Garante consistência em todo o sistema
 */

/**
 * Status do ciclo de vida de uma aposta
 * - PENDENTE: Aposta ainda não resolvida
 * - LIQUIDADA: Aposta finalizada com resultado definido
 */
export const APOSTA_STATUS = {
  PENDENTE: 'PENDENTE',
  LIQUIDADA: 'LIQUIDADA',
} as const;

export type ApostaStatus = typeof APOSTA_STATUS[keyof typeof APOSTA_STATUS];

/**
 * Resultado esportivo/financeiro da aposta
 * Separado do status - representa a performance
 */
export const APOSTA_RESULTADO = {
  GREEN: 'GREEN',
  RED: 'RED',
  MEIO_GREEN: 'MEIO_GREEN',
  MEIO_RED: 'MEIO_RED',
  VOID: 'VOID',
  PENDENTE: 'PENDENTE',
} as const;

export type ApostaResultado = typeof APOSTA_RESULTADO[keyof typeof APOSTA_RESULTADO];

/**
 * Estratégia de aposta - define a abordagem/metodologia utilizada
 * SEPARADO de Contexto Financeiro (Real/Freebet/Bônus)
 */
export const APOSTA_ESTRATEGIA = {
  PUNTER: 'PUNTER',
  SUREBET: 'SUREBET',
  VALUEBET: 'VALUEBET',
  EXTRACAO_FREEBET: 'EXTRACAO_FREEBET',
  EXTRACAO_BONUS: 'EXTRACAO_BONUS',
} as const;

export type ApostaEstrategia = typeof APOSTA_ESTRATEGIA[keyof typeof APOSTA_ESTRATEGIA];

/**
 * Labels para exibição de estratégias
 */
export const ESTRATEGIA_LABELS: Record<ApostaEstrategia, string> = {
  PUNTER: 'Punter',
  SUREBET: 'Surebet',
  VALUEBET: 'ValueBet',
  EXTRACAO_FREEBET: 'Extração de Freebet',
  EXTRACAO_BONUS: 'Extração de Bônus',
};

/**
 * Lista de estratégias para selects
 */
export const ESTRATEGIAS_LIST = [
  { value: APOSTA_ESTRATEGIA.PUNTER, label: ESTRATEGIA_LABELS.PUNTER },
  { value: APOSTA_ESTRATEGIA.SUREBET, label: ESTRATEGIA_LABELS.SUREBET },
  { value: APOSTA_ESTRATEGIA.VALUEBET, label: ESTRATEGIA_LABELS.VALUEBET },
  { value: APOSTA_ESTRATEGIA.EXTRACAO_FREEBET, label: ESTRATEGIA_LABELS.EXTRACAO_FREEBET },
  { value: APOSTA_ESTRATEGIA.EXTRACAO_BONUS, label: ESTRATEGIA_LABELS.EXTRACAO_BONUS },
] as const;

/**
 * Helper para verificar se uma aposta está finalizada
 */
export const isApostaFinalizada = (status: string | null | undefined): boolean => 
  status === APOSTA_STATUS.LIQUIDADA;

/**
 * Helper para verificar se um resultado é válido (não pendente)
 */
export const isResultadoDefinido = (resultado: string | null | undefined): boolean => 
  resultado !== null && 
  resultado !== undefined && 
  resultado !== APOSTA_RESULTADO.PENDENTE;

/**
 * Lista de resultados válidos para filtros
 */
export const RESULTADOS_VALIDOS = [
  APOSTA_RESULTADO.GREEN,
  APOSTA_RESULTADO.RED,
  APOSTA_RESULTADO.MEIO_GREEN,
  APOSTA_RESULTADO.MEIO_RED,
  APOSTA_RESULTADO.VOID,
] as const;

/**
 * Status de Surebets
 */
export const SUREBET_STATUS = {
  PENDENTE: 'PENDENTE',
  LIQUIDADA: 'LIQUIDADA',
} as const;

/**
 * Status de Matched Betting Rounds
 */
export const MATCHED_BETTING_STATUS = {
  PENDENTE: 'PENDENTE',
  LIQUIDADA: 'LIQUIDADA',
  FINALIZADO: 'FINALIZADO', // Mantido para compatibilidade com dados existentes
} as const;
