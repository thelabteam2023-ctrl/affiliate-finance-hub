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
  DUPLO_GREEN: 'DUPLO_GREEN',
} as const;

export type ApostaEstrategia = typeof APOSTA_ESTRATEGIA[keyof typeof APOSTA_ESTRATEGIA];

/**
 * Forma de registro - como a aposta foi registrada (estrutura do formulário)
 */
export const FORMA_REGISTRO = {
  SIMPLES: 'SIMPLES',
  MULTIPLA: 'MULTIPLA',
  ARBITRAGEM: 'ARBITRAGEM',
} as const;

export type FormaRegistro = typeof FORMA_REGISTRO[keyof typeof FORMA_REGISTRO];

/**
 * Labels para exibição de estratégias
 */
export const ESTRATEGIA_LABELS: Record<ApostaEstrategia, string> = {
  PUNTER: 'Punter',
  SUREBET: 'Surebet',
  VALUEBET: 'ValueBet',
  EXTRACAO_FREEBET: 'Extração de Freebet',
  EXTRACAO_BONUS: 'Extração de Bônus',
  DUPLO_GREEN: 'Duplo Green',
};

/**
 * Descrições/tooltips das estratégias
 */
export const ESTRATEGIA_TOOLTIPS: Record<ApostaEstrategia, string> = {
  PUNTER: 'Aposta tradicional baseada em análise própria',
  SUREBET: 'Arbitragem entre casas para lucro garantido',
  VALUEBET: 'Aposta com valor esperado positivo identificado',
  EXTRACAO_FREEBET: 'Conversão de freebet em dinheiro real',
  EXTRACAO_BONUS: 'Conversão de saldo de bônus em dinheiro real',
  DUPLO_GREEN: 'Estratégia coordenada para obter múltiplos greens',
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
  { value: APOSTA_ESTRATEGIA.DUPLO_GREEN, label: ESTRATEGIA_LABELS.DUPLO_GREEN },
] as const;

/**
 * Mapeia a aba ativa para a estratégia default
 */
export const getEstrategiaFromTab = (activeTab: string): ApostaEstrategia => {
  const tabToEstrategia: Record<string, ApostaEstrategia> = {
    apostas: 'PUNTER',
    freebets: 'EXTRACAO_FREEBET',
    bonus: 'EXTRACAO_BONUS',
    surebet: 'SUREBET',
    valuebet: 'VALUEBET',
    duplogreen: 'DUPLO_GREEN',
    // Aliases para garantir compatibilidade
    'apostas-livres': 'PUNTER',
    'visao-geral': 'PUNTER',
  };
  return tabToEstrategia[activeTab] || 'PUNTER';
};

/**
 * Mapeia a estratégia para a aba principal
 */
export const getTabFromEstrategia = (estrategia: ApostaEstrategia | string | null): string => {
  if (!estrategia) return 'apostas';
  
  const estrategiaToTab: Record<string, string> = {
    PUNTER: 'apostas',
    SUREBET: 'surebet',
    VALUEBET: 'valuebet',
    EXTRACAO_FREEBET: 'freebets',
    EXTRACAO_BONUS: 'bonus',
    DUPLO_GREEN: 'duplogreen',
    // Legado
    VALOR: 'apostas',
  };
  return estrategiaToTab[estrategia] || 'apostas';
};

/**
 * Inferência de estratégia para dados legados (fallback)
 * Usado apenas para apostas antigas sem estratégia definida
 */
export const inferEstrategiaLegado = (aposta: {
  estrategia?: string | null;
  surebet_id?: string | null;
  tipo_freebet?: string | null;
  gerou_freebet?: boolean | null;
  is_bonus_bet?: boolean | null;
}): ApostaEstrategia => {
  // Se já tem estratégia válida, retornar
  if (aposta.estrategia && aposta.estrategia !== 'VALOR') {
    if (Object.values(APOSTA_ESTRATEGIA).includes(aposta.estrategia as ApostaEstrategia)) {
      return aposta.estrategia as ApostaEstrategia;
    }
  }
  
  // Fallback heurístico para dados legados
  if (aposta.surebet_id) {
    console.warn(`[LEGADO] Aposta com surebet_id sem estratégia definida`);
    return 'SUREBET';
  }
  
  if (aposta.tipo_freebet || aposta.gerou_freebet) {
    console.warn(`[LEGADO] Aposta com freebet sem estratégia definida`);
    return 'EXTRACAO_FREEBET';
  }
  
  if (aposta.is_bonus_bet) {
    console.warn(`[LEGADO] Aposta com bonus sem estratégia definida`);
    return 'EXTRACAO_BONUS';
  }
  
  return 'PUNTER';
};

/**
 * Valida consistência entre estratégia e dados da aposta
 * Retorna warnings (não bloqueia salvamento)
 */
export const validateApostaConsistencia = (aposta: {
  estrategia: string;
  surebet_id?: string | null;
  tipo_freebet?: string | null;
  gerou_freebet?: boolean | null;
  is_bonus_bet?: boolean | null;
}): { valid: boolean; warnings: string[] } => {
  const warnings: string[] = [];
  
  // Validar SUREBET
  if (aposta.estrategia === 'SUREBET' && !aposta.surebet_id) {
    warnings.push('Estratégia SUREBET mas sem surebet_id vinculado');
  }
  
  // Validar EXTRACAO_FREEBET
  if (aposta.estrategia === 'EXTRACAO_FREEBET' && !aposta.tipo_freebet && !aposta.gerou_freebet) {
    warnings.push('Estratégia EXTRACAO_FREEBET mas sem indicador de freebet');
  }
  
  // Validar EXTRACAO_BONUS
  if (aposta.estrategia === 'EXTRACAO_BONUS' && !aposta.is_bonus_bet) {
    warnings.push('Estratégia EXTRACAO_BONUS mas is_bonus_bet não está marcado');
  }
  
  // Detectar conflitos
  if (aposta.estrategia === 'VALUEBET' && aposta.surebet_id) {
    warnings.push('Conflito: estratégia VALUEBET com surebet_id preenchido');
  }
  
  if (aposta.estrategia === 'DUPLO_GREEN' && aposta.surebet_id) {
    warnings.push('Conflito: estratégia DUPLO_GREEN com surebet_id preenchido');
  }
  
  return {
    valid: warnings.length === 0,
    warnings
  };
};

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
