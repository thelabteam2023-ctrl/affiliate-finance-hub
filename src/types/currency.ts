/**
 * Tipos centralizados para suporte multi-moeda
 * 
 * REGRAS FUNDAMENTAIS (Anti-gambiarra):
 * 1. A moeda de execução é SEMPRE a moeda da CASA
 * 2. A moeda de controle é SEMPRE BRL
 * 3. Conversão existe apenas para referência/controle
 * 4. Valores históricos NUNCA são recalculados
 */

// Moedas suportadas pelo sistema
export type SupportedCurrency = "BRL" | "USD" | "USDT" | "EUR" | "GBP";

// Tipo para moeda com discriminador
export type CurrencyType = "FIAT" | "CRYPTO";

// Mapeamento de moeda para tipo
export const CURRENCY_TYPES: Record<SupportedCurrency, CurrencyType> = {
  BRL: "FIAT",
  USD: "FIAT",
  EUR: "FIAT",
  GBP: "FIAT",
  USDT: "CRYPTO",
};

// Símbolos de moeda
export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
  USDT: "USDT",
};

// Nomes completos
export const CURRENCY_NAMES: Record<SupportedCurrency, string> = {
  BRL: "Real Brasileiro",
  USD: "Dólar Americano",
  EUR: "Euro",
  GBP: "Libra Esterlina",
  USDT: "Tether (USDT)",
};

// Interface base para snapshot de conversão
export interface CurrencyConversionSnapshot {
  moeda_origem: SupportedCurrency;
  moeda_referencia: "BRL";
  cotacao: number;
  cotacao_at: string; // ISO 8601 timestamp
  valor_original: number;
  valor_brl_referencia: number;
}

// Campos de snapshot para inserção no banco
export interface SnapshotDBFields {
  moeda_operacao: SupportedCurrency;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  valor_brl_referencia: number | null;
}

// Campos de snapshot para liquidação
export interface SettlementSnapshotFields extends SnapshotDBFields {
  lucro_prejuizo_brl_referencia: number | null;
}

// Interface para operação multi-moeda (perna)
export interface MultiCurrencyLeg {
  bookmaker_id: string;
  bookmaker_moeda: SupportedCurrency;
  stake: number;
  stake_brl_referencia?: number;
  cotacao_snapshot?: number;
  cotacao_snapshot_at?: string;
}

// Interface para operação consolidada
export interface ConsolidatedOperation {
  // Valores por moeda
  total_brl: number;
  total_usd: number;
  total_other: Record<SupportedCurrency, number>;
  
  // Valores de referência (consolidado em BRL)
  total_brl_referencia: number;
  
  // Breakdown das pernas
  legs: MultiCurrencyLeg[];
}

// Interface para resumo de saldos multi-moeda
export interface MultiCurrencyBalance {
  // Saldos por moeda (valores operacionais reais)
  brl: {
    saldo_real: number;
    saldo_bonus: number;
    saldo_freebet: number;
    saldo_jogavel: number;
  };
  usd: {
    saldo_real: number;
    saldo_bonus: number;
    saldo_freebet: number;
    saldo_jogavel: number;
  };
  
  // Consolidação em BRL (apenas referência)
  consolidado_brl: {
    total: number;
    cotacao_usd_usada: number;
    cotacao_at: string;
  };
}

// Interface para KPIs consolidados
export interface ConsolidatedKPIs {
  // Valores operacionais por moeda
  lucro_brl: number;
  lucro_usd: number;
  
  // Consolidado em BRL (baseado em snapshots históricos)
  lucro_total_brl_referencia: number;
  
  // ROI por moeda
  roi_brl: number;
  roi_usd: number;
  roi_consolidado: number;
  
  // Metadata
  inclui_operacoes_usd: boolean;
  avisos: string[];
}

// Helpers

/**
 * Verifica se uma moeda é estrangeira (não-BRL)
 */
export function isForeignCurrency(moeda: string): moeda is Exclude<SupportedCurrency, "BRL"> {
  return moeda !== "BRL" && moeda in CURRENCY_SYMBOLS;
}

/**
 * Verifica se uma moeda é crypto
 */
export function isCryptoCurrency(moeda: string): boolean {
  return CURRENCY_TYPES[moeda as SupportedCurrency] === "CRYPTO";
}

/**
 * Formata um valor com símbolo de moeda
 */
export function formatCurrencyValue(
  valor: number,
  moeda: SupportedCurrency,
  options?: {
    showSymbol?: boolean;
    decimals?: number;
    compact?: boolean;
  }
): string {
  const { showSymbol = true, decimals = 2, compact = false } = options || {};
  
  let formatted: string;
  
  if (compact && Math.abs(valor) >= 1000) {
    if (Math.abs(valor) >= 1000000) {
      formatted = (valor / 1000000).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "M";
    } else {
      formatted = (valor / 1000).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "K";
    }
  } else {
    formatted = valor.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  
  return showSymbol ? `${CURRENCY_SYMBOLS[moeda]} ${formatted}` : formatted;
}

/**
 * Retorna a descrição do aviso de moeda estrangeira
 */
export function getCurrencyWarning(moeda: SupportedCurrency): string | null {
  if (moeda === "BRL") return null;
  
  return `Valor na moeda da casa (${moeda}). A referência em BRL é apenas para controle.`;
}

/**
 * Valida se uma string é uma moeda suportada
 */
export function isValidCurrency(moeda: string): moeda is SupportedCurrency {
  return moeda in CURRENCY_SYMBOLS;
}

/**
 * Retorna a moeda padrão para novos registros
 */
export function getDefaultCurrency(): SupportedCurrency {
  return "BRL";
}
