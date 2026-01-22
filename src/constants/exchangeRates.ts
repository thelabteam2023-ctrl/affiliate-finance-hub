/**
 * =============================================================================
 * CONSTANTES DE COTAÇÕES - FONTE ÚNICA DE VERDADE
 * =============================================================================
 * 
 * Este arquivo centraliza TODOS os valores de fallback de cotações.
 * NUNCA defina fallback rates em outros arquivos!
 * 
 * IMPORTANTE: Estes valores são ÚLTIMO RECURSO ABSOLUTO.
 * O sistema deve priorizar:
 * 1. Cache recente do banco (< 30 min)
 * 2. Cache expirado do banco (< 24h) - com warning
 * 3. API ao vivo (FastForex/PTAX)
 * 4. Cotação de trabalho do projeto
 * 5. FALLBACK_RATES (este arquivo) - com bloqueio de operações críticas
 * =============================================================================
 */

export interface ExchangeRates {
  USDBRL: number;
  EURBRL: number;
  GBPBRL: number;
  MYRBRL: number;
  MXNBRL: number;
  ARSBRL: number;
  COPBRL: number;
}

/**
 * Valores de fallback HARDCODED - ÚLTIMO RECURSO
 * 
 * ⚠️ ATENÇÃO: Se o sistema estiver usando estes valores, algo está errado!
 * Estes valores são atualizados manualmente e podem estar desatualizados.
 * 
 * Última atualização: 2026-01-22
 * Fonte: FastForex API
 */
export const FALLBACK_RATES: ExchangeRates = {
  USDBRL: 5.32,
  EURBRL: 6.21,
  GBPBRL: 7.14,
  MYRBRL: 1.32,
  MXNBRL: 0.304,  // Atualizado de 0.26 para valor real
  ARSBRL: 0.0037,
  COPBRL: 0.00145,
};

/**
 * TTL do cache em minutos - após esse tempo, cotação é considerada "stale"
 */
export const CACHE_TTL_MINUTES = 30;

/**
 * Limite máximo em horas - após esse tempo, cotação é considerada "expired"
 * e deve exibir warning crítico
 */
export const CACHE_MAX_AGE_HOURS = 24;

/**
 * Intervalo de refresh automático no frontend (em ms)
 */
export const FRONTEND_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Tipos de fonte de cotação
 */
export type CotacaoSource = 
  | 'FASTFOREX' 
  | 'FASTFOREX_CACHE' 
  | 'PTAX_FALLBACK' 
  | 'PTAX_FALLBACK_CACHE' 
  | 'FALLBACK' 
  | 'INDISPONIVEL';

/**
 * Informações detalhadas sobre a fonte de uma cotação
 */
export interface CotacaoSourceInfo {
  source: CotacaoSource;
  label: string;
  isOfficial: boolean;
  isFallback: boolean;
  isPtaxFallback: boolean;
}

/**
 * Informação de fonte padrão (fallback)
 */
export const DEFAULT_SOURCE_INFO: CotacaoSourceInfo = {
  source: 'FALLBACK',
  label: 'Fallback',
  isOfficial: false,
  isFallback: true,
  isPtaxFallback: false,
};

/**
 * Valida se uma cotação é recente (não stale)
 */
export function isRateFresh(fetchedAt: Date | string | null): boolean {
  if (!fetchedAt) return false;
  const fetched = typeof fetchedAt === 'string' ? new Date(fetchedAt) : fetchedAt;
  const ageMs = Date.now() - fetched.getTime();
  return ageMs < CACHE_TTL_MINUTES * 60 * 1000;
}

/**
 * Valida se uma cotação ainda é usável (não expired)
 */
export function isRateUsable(fetchedAt: Date | string | null): boolean {
  if (!fetchedAt) return false;
  const fetched = typeof fetchedAt === 'string' ? new Date(fetchedAt) : fetchedAt;
  const ageMs = Date.now() - fetched.getTime();
  return ageMs < CACHE_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * Retorna a idade de uma cotação em minutos
 */
export function getRateAgeMinutes(fetchedAt: Date | string | null): number | null {
  if (!fetchedAt) return null;
  const fetched = typeof fetchedAt === 'string' ? new Date(fetchedAt) : fetchedAt;
  return Math.floor((Date.now() - fetched.getTime()) / (60 * 1000));
}

/**
 * Parse de string de source para objeto CotacaoSourceInfo
 */
export function parseSource(rawSource: string): CotacaoSourceInfo {
  const source = rawSource?.toUpperCase() || '';
  
  if (source === 'FASTFOREX' || source === 'FASTFOREX_CACHE') {
    return {
      source: source.includes('CACHE') ? 'FASTFOREX_CACHE' : 'FASTFOREX',
      label: 'FastForex',
      isOfficial: true,
      isFallback: false,
      isPtaxFallback: false,
    };
  }
  
  if (source === 'PTAX' || source === 'PTAX_CACHE' || source === 'PTAX_FALLBACK' || source === 'PTAX_FALLBACK_CACHE') {
    const isFallbackSource = source.includes('FALLBACK');
    return {
      source: source.includes('CACHE') ? 'PTAX_FALLBACK_CACHE' : 'PTAX_FALLBACK',
      label: isFallbackSource ? 'PTAX (fallback)' : 'PTAX BCB',
      isOfficial: true,
      isFallback: false,
      isPtaxFallback: true,
    };
  }
  
  if (source === 'FALLBACK' || source === 'FALLBACK_ERRO') {
    return {
      source: 'FALLBACK',
      label: 'Fallback ⚠️',
      isOfficial: false,
      isFallback: true,
      isPtaxFallback: false,
    };
  }
  
  return {
    source: 'INDISPONIVEL',
    label: 'Indisponível',
    isOfficial: false,
    isFallback: true,
    isPtaxFallback: false,
  };
}
