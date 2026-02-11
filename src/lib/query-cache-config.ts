/**
 * Configuração de cache padrão para queries filtradas por período.
 * 
 * ARQUITETURA:
 * - staleTime: 5 minutos — dados considerados frescos, sem refetch desnecessário
 * - gcTime: 30 minutos — mantém cache na memória mesmo após desmount da aba
 * 
 * Aplicar em TODAS as queries que consomem dados filtrados por período:
 * - Dashboard / Visão Geral
 * - Cashback
 * - Bônus
 * - KPI Breakdowns
 * - Surebet / Apostas / ValueBet / DuploGreen (via useTabFilters)
 */

/** 5 minutos — dados filtrados por período são considerados frescos */
export const PERIOD_STALE_TIME = 5 * 60 * 1000;

/** 30 minutos — manter no cache após desmount para reuso ao voltar à aba */
export const PERIOD_GC_TIME = 30 * 60 * 1000;
