/**
 * Tipos centralizados para suporte multi-moeda
 * 
 * REGRAS FUNDAMENTAIS (Anti-gambiarra):
 * 1. A moeda de execução é SEMPRE a moeda da CASA
 * 2. A moeda de controle é SEMPRE BRL
 * 3. Conversão existe apenas para referência/controle
 * 4. Valores históricos NUNCA são recalculados
 */

// Moedas FIAT suportadas pelo sistema
export type FiatCurrency = "BRL" | "USD" | "EUR" | "GBP" | "MYR" | "MXN" | "ARS" | "COP";

// Moedas CRYPTO suportadas pelo sistema
export type CryptoCurrency = 
  | "USDT" 
  | "USDC" 
  | "BTC" 
  | "ETH" 
  | "BNB" 
  | "TRX" 
  | "SOL" 
  | "MATIC" 
  | "ADA" 
  | "DOT" 
  | "AVAX" 
  | "LINK" 
  | "UNI" 
  | "LTC" 
  | "XRP";

// Todas as moedas suportadas
export type SupportedCurrency = FiatCurrency | CryptoCurrency;

// Tipo para moeda com discriminador
export type CurrencyType = "FIAT" | "CRYPTO";

// Lista de moedas FIAT disponíveis para bookmakers
export const FIAT_CURRENCIES: Array<{ value: FiatCurrency; label: string; symbol: string }> = [
  { value: "BRL", label: "Real Brasileiro", symbol: "R$" },
  { value: "USD", label: "Dólar Americano", symbol: "$" },
  { value: "EUR", label: "Euro", symbol: "€" },
  { value: "GBP", label: "Libra Esterlina", symbol: "£" },
  { value: "MYR", label: "Ringgit Malaio", symbol: "RM" },
  { value: "MXN", label: "Peso Mexicano", symbol: "MX$" },
  { value: "ARS", label: "Peso Argentino", symbol: "AR$" },
  { value: "COP", label: "Peso Colombiano", symbol: "CO$" },
];

// Lista de moedas CRYPTO disponíveis
export const CRYPTO_CURRENCIES: Array<{ value: CryptoCurrency; label: string; symbol: string; isStablecoin: boolean }> = [
  { value: "USDT", label: "Tether (USDT)", symbol: "₮", isStablecoin: true },
  { value: "USDC", label: "USD Coin (USDC)", symbol: "USDC", isStablecoin: true },
  { value: "BTC", label: "Bitcoin (BTC)", symbol: "₿", isStablecoin: false },
  { value: "ETH", label: "Ethereum (ETH)", symbol: "Ξ", isStablecoin: false },
  { value: "BNB", label: "Binance Coin (BNB)", symbol: "BNB", isStablecoin: false },
  { value: "TRX", label: "Tron (TRX)", symbol: "TRX", isStablecoin: false },
  { value: "SOL", label: "Solana (SOL)", symbol: "SOL", isStablecoin: false },
  { value: "MATIC", label: "Polygon (MATIC)", symbol: "MATIC", isStablecoin: false },
  { value: "ADA", label: "Cardano (ADA)", symbol: "ADA", isStablecoin: false },
  { value: "DOT", label: "Polkadot (DOT)", symbol: "DOT", isStablecoin: false },
  { value: "AVAX", label: "Avalanche (AVAX)", symbol: "AVAX", isStablecoin: false },
  { value: "LINK", label: "Chainlink (LINK)", symbol: "LINK", isStablecoin: false },
  { value: "UNI", label: "Uniswap (UNI)", symbol: "UNI", isStablecoin: false },
  { value: "LTC", label: "Litecoin (LTC)", symbol: "Ł", isStablecoin: false },
  { value: "XRP", label: "Ripple (XRP)", symbol: "XRP", isStablecoin: false },
];

// Mapeamento de moeda para tipo
export const CURRENCY_TYPES: Record<SupportedCurrency, CurrencyType> = {
  // FIAT
  BRL: "FIAT",
  USD: "FIAT",
  EUR: "FIAT",
  GBP: "FIAT",
  MYR: "FIAT",
  MXN: "FIAT",
  ARS: "FIAT",
  COP: "FIAT",
  // CRYPTO
  USDT: "CRYPTO",
  USDC: "CRYPTO",
  BTC: "CRYPTO",
  ETH: "CRYPTO",
  BNB: "CRYPTO",
  TRX: "CRYPTO",
  SOL: "CRYPTO",
  MATIC: "CRYPTO",
  ADA: "CRYPTO",
  DOT: "CRYPTO",
  AVAX: "CRYPTO",
  LINK: "CRYPTO",
  UNI: "CRYPTO",
  LTC: "CRYPTO",
  XRP: "CRYPTO",
};

// Símbolos de moeda
export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  // FIAT
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
  MYR: "RM",
  MXN: "MX$",
  ARS: "AR$",
  COP: "CO$",
  // CRYPTO
  USDT: "₮",
  USDC: "USDC",
  BTC: "₿",
  ETH: "Ξ",
  BNB: "BNB",
  TRX: "TRX",
  SOL: "SOL",
  MATIC: "MATIC",
  ADA: "ADA",
  DOT: "DOT",
  AVAX: "AVAX",
  LINK: "LINK",
  UNI: "UNI",
  LTC: "Ł",
  XRP: "XRP",
};

// Nomes completos
export const CURRENCY_NAMES: Record<SupportedCurrency, string> = {
  // FIAT
  BRL: "Real Brasileiro",
  USD: "Dólar Americano",
  EUR: "Euro",
  GBP: "Libra Esterlina",
  MYR: "Ringgit Malaio",
  MXN: "Peso Mexicano",
  ARS: "Peso Argentino",
  COP: "Peso Colombiano",
  // CRYPTO
  USDT: "Tether (USDT)",
  USDC: "USD Coin (USDC)",
  BTC: "Bitcoin (BTC)",
  ETH: "Ethereum (ETH)",
  BNB: "Binance Coin (BNB)",
  TRX: "Tron (TRX)",
  SOL: "Solana (SOL)",
  MATIC: "Polygon (MATIC)",
  ADA: "Cardano (ADA)",
  DOT: "Polkadot (DOT)",
  AVAX: "Avalanche (AVAX)",
  LINK: "Chainlink (LINK)",
  UNI: "Uniswap (UNI)",
  LTC: "Litecoin (LTC)",
  XRP: "Ripple (XRP)",
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
 * Verifica se uma moeda é stablecoin
 */
export function isStablecoin(moeda: string): boolean {
  const crypto = CRYPTO_CURRENCIES.find(c => c.value === moeda);
  return crypto?.isStablecoin ?? false;
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

/**
 * Retorna se a transação precisa de conversão
 */
export function needsConversion(moedaOrigem: string, moedaDestino: string): boolean {
  if (!moedaOrigem || !moedaDestino) return false;
  return moedaOrigem !== moedaDestino;
}

/**
 * Retorna o símbolo da moeda
 */
export function getCurrencySymbol(moeda: string): string {
  return CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
}
