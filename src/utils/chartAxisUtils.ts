import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Calcula o intervalo ideal de ticks para o eixo X com base na quantidade de pontos.
 * Garante que nunca haja sobreposição de labels.
 */
export function getSmartTickInterval(dataLength: number): number {
  if (dataLength <= 14) return 0; // show all
  if (dataLength <= 30) return 2; // every 3rd
  if (dataLength <= 60) return 4; // every 5th
  if (dataLength <= 90) return 6; // every 7th (weekly feel)
  if (dataLength <= 180) return 13; // ~biweekly
  if (dataLength <= 365) return 29; // ~monthly
  return Math.floor(dataLength / 12) - 1; // ~12 labels max
}

/**
 * Formata label do eixo X de forma inteligente baseado no intervalo de dados.
 * - Até 45 dias: dd/MM
 * - 46-365 dias: dd/MM or MMM
 * - Acima de 365: MMM/yy
 */
export function getSmartDateFormatter(dataLength: number): (dateStr: string) => string {
  if (dataLength <= 45) {
    return (dateStr: string) => {
      try {
        const date = parseISO(dateStr);
        return format(date, "dd/MM");
      } catch {
        return dateStr;
      }
    };
  }
  if (dataLength <= 180) {
    return (dateStr: string) => {
      try {
        const date = parseISO(dateStr);
        return format(date, "dd/MM");
      } catch {
        return dateStr;
      }
    };
  }
  return (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, "MMM/yy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };
}

/**
 * Formata label já processado (dd/MM format) com base no total de pontos.
 * Para gráficos que já têm labels pré-formatados.
 */
export function getSmartLabelInterval(dataLength: number): number {
  return getSmartTickInterval(dataLength);
}
