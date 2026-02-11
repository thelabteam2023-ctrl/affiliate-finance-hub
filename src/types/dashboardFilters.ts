/**
 * PADRÃO OFICIAL DE FILTROS TEMPORAIS - DASHBOARDS
 * 
 * Modelo unificado para TODOS os dashboards do sistema:
 * - Dashboard de Projetos
 * - Dashboard Financeiro
 * 
 * REGRA-MÃE: Todo dashboard compartilha o mesmo modelo de filtro temporal.
 * Filtros: Mês atual | Anterior | Tudo + Calendário para período customizado
 */

import { startOfMonth, endOfDay, subMonths, startOfYear, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const OPERATIONAL_TIMEZONE = "America/Sao_Paulo";

/**
 * Filtros temporais padrão disponíveis em TODOS os dashboards
 * 
 * - anterior: Mês anterior completo
 * - mes: Mês corrente (01 até hoje)
 * - ano: Ano corrente (01/01 até hoje)
 * - tudo: Todo o histórico disponível
 * - custom: Período personalizado via calendário
 */
export type DashboardPeriodFilter = "anterior" | "mes" | "ano" | "tudo" | "custom";

export interface DashboardDateRange {
  start: Date | null;
  end: Date | null;
}

export interface DashboardPeriodOption {
  value: DashboardPeriodFilter;
  label: string;
}

/**
 * Opções de filtro para exibição na UI (botões rápidos)
 * O "custom" não aparece como botão, mas como calendário
 */
export const DASHBOARD_PERIOD_OPTIONS: DashboardPeriodOption[] = [
  { value: "mes", label: "Mês atual" },
  { value: "anterior", label: "Mês anterior" },
  { value: "ano", label: "Ano" },
  { value: "tudo", label: "Tudo" },
];

/**
 * Calcula o intervalo de datas para um filtro específico
 * Respeita o timezone operacional (America/Sao_Paulo)
 * 
 * @param filter - Filtro selecionado
 * @returns Intervalo de datas {start, end} ou null para 'tudo'
 */
export function getDashboardDateRange(
  filter: DashboardPeriodFilter,
  customRange?: { start: Date; end: Date }
): DashboardDateRange {
  // Usar timezone operacional
  const nowUTC = new Date();
  const nowLocal = toZonedTime(nowUTC, OPERATIONAL_TIMEZONE);
  
  switch (filter) {
    case "anterior":
      // Mês anterior completo
      const prevMonth = subMonths(nowLocal, 1);
      return {
        start: startOfMonth(prevMonth),
        end: endOfMonth(prevMonth),
      };
    
    case "mes":
      // Mês corrente: 01 até hoje
      return {
        start: startOfMonth(nowLocal),
        end: endOfDay(nowLocal),
      };
    
    case "ano":
      // Ano corrente: 01/01 até hoje
      return {
        start: startOfYear(nowLocal),
        end: endOfDay(nowLocal),
      };
    
    case "custom":
      // Período personalizado
      if (customRange) {
        return {
          start: customRange.start,
          end: endOfDay(customRange.end),
        };
      }
      return { start: null, end: null };
    
    case "tudo":
    default:
      // Todo o histórico - sem filtro de data
      return {
        start: null,
        end: null,
      };
  }
}

/**
 * Converte o intervalo de datas para strings no formato ISO (yyyy-MM-dd)
 * Útil para queries e persistência
 */
export function getDashboardDateRangeAsStrings(
  filter: DashboardPeriodFilter,
  customRange?: { start: Date; end: Date }
): {
  dataInicio: string;
  dataFim: string;
} {
  const range = getDashboardDateRange(filter, customRange);
  
  if (!range.start || !range.end) {
    return { dataInicio: "", dataFim: "" };
  }
  
  // Formatar para ISO date string (yyyy-MM-dd)
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  
  return {
    dataInicio: formatDate(range.start),
    dataFim: formatDate(range.end),
  };
}

/**
 * Label descritivo do período para exibição
 */
export function getDashboardPeriodLabel(filter: DashboardPeriodFilter): string {
  const option = DASHBOARD_PERIOD_OPTIONS.find(o => o.value === filter);
  return option?.label ?? filter;
}
