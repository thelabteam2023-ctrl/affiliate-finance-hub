import { toZonedTime } from 'date-fns-tz';

// Timezone operacional do sistema (Brasil)
export const TIMEZONE_OPERACIONAL = 'America/Sao_Paulo';

/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC)
 * This prevents timezone issues where dates shift by one day
 * 
 * Para timestamps completos (com hora), use parseLocalDateTime de @/utils/dateUtils
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();

  // Datas financeiras/administrativas são datas civis (sem fuso).
  // Se é apenas YYYY-MM-DD, criar Date local diretamente
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[T ]|$)/.exec(dateString);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    
    // Se é apenas data (sem hora), criar local date
    if (dateString.length === 10) {
      return new Date(year, month - 1, day);
    }
    
    // Se tem hora e timezone, converter para timezone operacional
    if (dateString.includes('+') || dateString.includes('Z')) {
      let normalized = dateString;
      if (/\+00$/.test(normalized)) {
        normalized = normalized.replace(/\+00$/, '+00:00');
      }
      if (normalized.includes(' ') && !normalized.includes('T')) {
        normalized = normalized.replace(' ', 'T');
      }
      const utcDate = new Date(normalized);
      if (!isNaN(utcDate.getTime())) {
        return toZonedTime(utcDate, TIMEZONE_OPERACIONAL);
      }
    }
    
    // Sem timezone, assumir local
    return new Date(year, month - 1, day);
  }

  // Fallback para formatos inesperados
  return new Date(dateString);
}
