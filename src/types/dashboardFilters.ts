/**
 * PADRÃO OFICIAL DE FILTROS TEMPORAIS - DASHBOARDS
 * 
 * Modelo unificado para TODOS os dashboards do sistema:
 * - Dashboard de Projetos
 * - Dashboard Financeiro
 * 
 * REGRA-MÃE: Todo dashboard compartilha o mesmo modelo de filtro temporal.
 * NÃO há seleção manual de datas - apenas filtros rápidos padronizados.
 */

import { startOfMonth, endOfDay, subMonths, startOfYear, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const OPERATIONAL_TIMEZONE = "America/Sao_Paulo";

/**
 * Filtros temporais padrão disponíveis em TODOS os dashboards
 * 
 * - mes: Mês corrente (01 até hoje)
 * - 3m: Últimos 3 meses fechados + mês corrente
 * - 6m: Últimos 6 meses fechados + mês corrente
 * - ano: Ano corrente (01/01 até hoje)
 * - tudo: Todo o histórico disponível
 */
export type DashboardPeriodFilter = "mes" | "3m" | "6m" | "ano" | "tudo";

export interface DashboardDateRange {
  start: Date | null;
  end: Date | null;
}

export interface DashboardPeriodOption {
  value: DashboardPeriodFilter;
  label: string;
}

/**
 * Opções de filtro para exibição na UI
 * Ordem: do menor para o maior período
 */
export const DASHBOARD_PERIOD_OPTIONS: DashboardPeriodOption[] = [
  { value: "mes", label: "Mês" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
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
export function getDashboardDateRange(filter: DashboardPeriodFilter): DashboardDateRange {
  // Usar timezone operacional
  const nowUTC = new Date();
  const nowLocal = toZonedTime(nowUTC, OPERATIONAL_TIMEZONE);
  
  switch (filter) {
    case "mes":
      // Mês corrente: 01 até hoje
      return {
        start: startOfMonth(nowLocal),
        end: endOfDay(nowLocal),
      };
    
    case "3m":
      // Últimos 3 meses fechados + mês corrente
      // Exemplo: Se estamos em Fev, inclui Dez, Jan e Fev (do dia 01 de Dez até hoje)
      return {
        start: startOfMonth(subMonths(nowLocal, 2)),
        end: endOfDay(nowLocal),
      };
    
    case "6m":
      // Últimos 6 meses fechados + mês corrente
      return {
        start: startOfMonth(subMonths(nowLocal, 5)),
        end: endOfDay(nowLocal),
      };
    
    case "ano":
      // Ano corrente: 01/01 até hoje
      return {
        start: startOfYear(nowLocal),
        end: endOfDay(nowLocal),
      };
    
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
export function getDashboardDateRangeAsStrings(filter: DashboardPeriodFilter): {
  dataInicio: string;
  dataFim: string;
} {
  const range = getDashboardDateRange(filter);
  
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
