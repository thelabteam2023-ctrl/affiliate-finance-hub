/**
 * Constantes centralizadas para o domínio de Apostas
 * Garante consistência em todo o sistema
 * 
 * PRINCÍPIO FUNDAMENTAL (IMUTÁVEL):
 * - Estratégia, Forma de Registro e Contexto Operacional são SEMPRE independentes
 * - Estratégia é sempre uma decisão humana explícita, NUNCA inferida
 * - Todas as combinações são válidas
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
 * SEPARADO de Contexto Operacional (origem do capital)
 * 
 * REGRA: Estratégia é SEMPRE explícita, NUNCA inferida
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
 * Forma de registro - como a aposta foi estruturada tecnicamente
 * 
 * REGRA: QUALQUER forma de registro pode ser usada com QUALQUER estratégia
 * Todas as combinações são VÁLIDAS
 */
export const FORMA_REGISTRO = {
  SIMPLES: 'SIMPLES',
  MULTIPLA: 'MULTIPLA',
  ARBITRAGEM: 'ARBITRAGEM',
} as const;

export type FormaRegistro = typeof FORMA_REGISTRO[keyof typeof FORMA_REGISTRO];

/**
 * Contexto Operacional - define a ORIGEM do capital utilizado
 * Campo EXPLÍCITO e OBRIGATÓRIO no registro de aposta
 * 
 * REGRAS:
 * - Contexto é escolhido pelo usuário na criação
 * - Contexto NUNCA é inferido
 * - Contexto NUNCA muda depois
 */
export const CONTEXTO_OPERACIONAL = {
  NORMAL: 'NORMAL',   // Saldo real
  FREEBET: 'FREEBET', // Freebet
  BONUS: 'BONUS',     // Bônus
} as const;

export type ContextoOperacional = typeof CONTEXTO_OPERACIONAL[keyof typeof CONTEXTO_OPERACIONAL];

/**
 * Labels para exibição de Contexto Operacional
 */
export const CONTEXTO_LABELS: Record<ContextoOperacional, string> = {
  NORMAL: 'Saldo Real',
  FREEBET: 'Freebet',
  BONUS: 'Bônus',
};

/**
 * Lista de contextos para selects
 */
export const CONTEXTOS_LIST = [
  { value: CONTEXTO_OPERACIONAL.NORMAL, label: CONTEXTO_LABELS.NORMAL },
  { value: CONTEXTO_OPERACIONAL.FREEBET, label: CONTEXTO_LABELS.FREEBET },
  { value: CONTEXTO_OPERACIONAL.BONUS, label: CONTEXTO_LABELS.BONUS },
] as const;

/**
 * Labels para exibição de Forma de Registro
 */
export const FORMA_REGISTRO_LABELS: Record<FormaRegistro, string> = {
  SIMPLES: 'Simples',
  MULTIPLA: 'Múltipla',
  ARBITRAGEM: 'Arbitragem',
};

/**
 * Lista de formas de registro para selects
 */
export const FORMAS_REGISTRO_LIST = [
  { value: FORMA_REGISTRO.SIMPLES, label: FORMA_REGISTRO_LABELS.SIMPLES },
  { value: FORMA_REGISTRO.MULTIPLA, label: FORMA_REGISTRO_LABELS.MULTIPLA },
  { value: FORMA_REGISTRO.ARBITRAGEM, label: FORMA_REGISTRO_LABELS.ARBITRAGEM },
] as const;

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
 * Abas especializadas que definem estratégia fixa (não editável)
 * A aba 'apostas' é a única com estratégia livre (editável)
 */
export const ABAS_ESTRATEGIA_FIXA = [
  'freebets',
  'bonus', 
  'surebet',
  'valuebet',
  'duplogreen',
] as const;

/**
 * Verifica se a aba atual requer estratégia fixa (não editável)
 */
export const isAbaEstrategiaFixa = (activeTab: string): boolean => {
  return ABAS_ESTRATEGIA_FIXA.includes(activeTab as any);
};

/**
 * Mapeia a aba ativa para a estratégia default
 * Retorna null para abas que exigem seleção manual (apostas livres)
 */
export const getEstrategiaFromTab = (activeTab: string): ApostaEstrategia | null => {
  const tabToEstrategia: Record<string, ApostaEstrategia | null> = {
    apostas: null, // Apostas livres: exige seleção manual
    'apostas-livres': null, // Apostas livres: exige seleção manual
    'visao-geral': null, // Visão geral: exige seleção manual
    freebets: 'EXTRACAO_FREEBET',
    bonus: 'EXTRACAO_BONUS',
    surebet: 'SUREBET',
    valuebet: 'VALUEBET',
    duplogreen: 'DUPLO_GREEN',
  };
  return tabToEstrategia[activeTab] ?? null;
};

/**
 * Mapeia a aba ativa para o contexto operacional default
 * Retorna null para abas que não requerem contexto específico (usa NORMAL)
 */
export const getContextoFromTab = (activeTab: string): ContextoOperacional | null => {
  const tabToContexto: Record<string, ContextoOperacional | null> = {
    apostas: null, // Apostas livres: usa NORMAL por padrão
    'apostas-livres': null,
    'visao-geral': null,
    freebets: 'FREEBET',
    bonus: 'BONUS',
    surebet: null, // Surebet pode usar qualquer contexto
    valuebet: null, // ValueBet pode usar qualquer contexto
    duplogreen: null, // Duplo Green pode usar qualquer contexto
  };
  return tabToContexto[activeTab] ?? null;
};

/**
 * Verifica se a aba atual requer contexto operacional fixo (não editável)
 */
export const isAbaContextoFixo = (activeTab: string): boolean => {
  const abasContextoFixo = ['freebets', 'bonus'];
  return abasContextoFixo.includes(activeTab);
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
  
  // is_bonus_bet foi deprecado - usar estrategia="EXTRACAO_BONUS" diretamente
  // Fallback mantido apenas para dados legados muito antigos
  
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
  
  // is_bonus_bet foi deprecado - estrategia="EXTRACAO_BONUS" é suficiente
  
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
