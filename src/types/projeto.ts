// Tipos centralizados de projeto

// Tipos de moeda de consolidação
export type MoedaConsolidacao = 'BRL' | 'USD';
export type FonteCotacao = 'PTAX' | 'TRABALHO';

export interface Projeto {
  id: string;
  projeto_id?: string;
  nome: string;
  descricao?: string | null;
  status: ProjetoStatus;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  data_fim_real?: string | null;
  orcamento_inicial: number;
  operadores_ativos?: number;
  total_gasto_operadores?: number;
  saldo_bookmakers?: number;
  saldo_irrecuperavel?: number;
  total_depositado?: number;
  total_sacado?: number;
  total_bookmakers?: number;
  perdas_confirmadas?: number;
  lucro_operacional_total?: number;
  conciliado?: boolean;
  tem_investimento_crypto?: boolean;
  // Novos campos de multi-moeda
  moeda_consolidacao?: MoedaConsolidacao;
  cotacao_trabalho?: number | null;
  fonte_cotacao?: FonteCotacao;
}

export type ProjetoStatus = 'PLANEJADO' | 'EM_ANDAMENTO' | 'PAUSADO' | 'FINALIZADO';

export const STATUS_CONFIG: Record<ProjetoStatus, { label: string; color: string }> = {
  PLANEJADO: { 
    label: 'Planejado', 
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
  },
  EM_ANDAMENTO: { 
    label: 'Em Andamento', 
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
  },
  PAUSADO: { 
    label: 'Pausado', 
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' 
  },
  FINALIZADO: { 
    label: 'Finalizado', 
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' 
  },
};

export function getStatusColor(status: string): string {
  return STATUS_CONFIG[status as ProjetoStatus]?.color || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status as ProjetoStatus]?.label || status;
}

// ============================================
// SISTEMA MULTI-MOEDA - TIPOS E INTERFACES
// ============================================

/**
 * Dados de consolidação para uma operação multi-moeda
 * Usado para armazenar snapshots imutáveis de conversão
 */
export interface MultiCurrencyConsolidation {
  is_multicurrency: boolean;
  consolidation_currency: MoedaConsolidacao;
  conversion_rate_used: number | null;
  conversion_source: FonteCotacao;
  stake_consolidado: number | null;
  retorno_consolidado: number | null;
  pl_consolidado: number | null;
}

/**
 * Configuração de moeda de consolidação do projeto
 */
export interface ProjetoConsolidationConfig {
  moeda_consolidacao: MoedaConsolidacao;
  cotacao_trabalho: number | null;
  fonte_cotacao: FonteCotacao;
}

/**
 * Informações de conversão para exibição transparente
 */
export interface ConversionDisplayInfo {
  moedaOrigem: string;
  moedaDestino: MoedaConsolidacao;
  cotacaoUsada: number;
  fonteCotacao: FonteCotacao;
  ptaxAtual: number | null;
  deltaPercentual: number | null;
}

/**
 * Mapeamento de símbolos de moeda
 */
export const MOEDA_SYMBOLS: Record<string, string> = {
  BRL: 'R$',
  USD: '$',
  EUR: '€',
  GBP: '£',
  USDT: '$',
  BTC: '₿',
  ETH: 'Ξ',
};

/**
 * Cores de moeda para badges e textos
 */
export const MOEDA_COLORS: Record<string, { badge: string; text: string; bg: string }> = {
  BRL: {
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  USD: {
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  EUR: {
    badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  USDT: {
    badge: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    text: 'text-teal-400',
    bg: 'bg-teal-500/10',
  },
};

/**
 * Helper para obter cor de texto por moeda
 */
export function getMoedaTextColor(moeda: string): string {
  return MOEDA_COLORS[moeda]?.text || 'text-muted-foreground';
}

/**
 * Helper para obter cor de badge por moeda
 */
export function getMoedaBadgeColor(moeda: string): string {
  return MOEDA_COLORS[moeda]?.badge || 'bg-muted text-muted-foreground';
}

/**
 * Helper para obter símbolo de moeda
 */
export function getMoedaSymbol(moeda: string): string {
  return MOEDA_SYMBOLS[moeda] || moeda;
}

/**
 * Formata valor com símbolo de moeda
 */
export function formatMoedaValue(valor: number, moeda: string, options?: { decimals?: number }): string {
  const decimals = options?.decimals ?? 2;
  const symbol = getMoedaSymbol(moeda);
  return `${symbol} ${valor.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
