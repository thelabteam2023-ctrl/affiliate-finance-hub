/**
 * HELPER DE FORMATAÇÃO DE MOEDA - SINGLE SOURCE OF TRUTH
 * 
 * Este arquivo centraliza TODA a lógica de formatação monetária.
 * Previne erros de RangeError: Invalid currency code em tokens cripto.
 * 
 * Arquitetura:
 * - Moedas FIAT (ISO 4217): Usa Intl.NumberFormat nativo
 * - Tokens Crypto: Usa USD como base e substitui símbolo
 * - Desconhecidos: Fallback seguro para USD
 */

// Lista de tokens cripto suportados (não são códigos ISO 4217)
export const CRYPTO_TOKENS = [
  "USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL", 
  "MATIC", "ADA", "DOT", "AVAX", "LINK", "UNI", "LTC", "XRP"
] as const;

// Moedas FIAT suportadas (códigos ISO 4217)
export const FIAT_CURRENCIES = [
  "BRL", "USD", "EUR", "GBP", "MYR", "MXN", "ARS", "COP"
] as const;

export type CryptoToken = typeof CRYPTO_TOKENS[number];
export type FiatCurrency = typeof FIAT_CURRENCIES[number];

/**
 * Verifica se uma string é um token cripto conhecido
 */
export function isCryptoToken(moeda: string): moeda is CryptoToken {
  return CRYPTO_TOKENS.includes(moeda as CryptoToken);
}

/**
 * Verifica se uma string é uma moeda FIAT válida
 */
export function isFiatCurrency(moeda: string): moeda is FiatCurrency {
  return FIAT_CURRENCIES.includes(moeda as FiatCurrency);
}

/**
 * Retorna o código ISO 4217 seguro para Intl.NumberFormat
 * - Tokens cripto → "USD" (fallback)
 * - FIAT desconhecido → "USD" (fallback)
 * - FIAT conhecido → o próprio código
 */
export function getSafeISOCode(moeda: string): string {
  if (!moeda) return "BRL";
  
  const upper = moeda.toUpperCase();
  
  // FIAT conhecidos
  if (isFiatCurrency(upper)) {
    return upper;
  }
  
  // Crypto e desconhecidos usam USD como base
  return "USD";
}

interface FormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: string;
}

/**
 * Formata um valor monetário de forma segura
 * 
 * @param value - Valor numérico
 * @param moeda - Código da moeda (FIAT ou Crypto)
 * @param options - Opções de formatação
 * @returns String formatada (ex: "R$ 1.234,56" ou "USDT 100,00")
 * 
 * @example
 * formatCurrency(1234.56, "BRL") // "R$ 1.234,56"
 * formatCurrency(100, "USDT")    // "USDT 100,00"
 * formatCurrency(50, "EUR")      // "€ 50,00"
 */
export function formatCurrency(
  value: number, 
  moeda: string = "BRL",
  options: FormatOptions = {}
): string {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    locale = "pt-BR",
  } = options;

  const upper = (moeda || "BRL").toUpperCase();
  const isCrypto = isCryptoToken(upper);
  const safeCode = getSafeISOCode(upper);
  
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: safeCode,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
    
    // Para crypto, substitui o símbolo do USD pelo token
    if (isCrypto) {
      // Remove símbolos de USD comuns
      return formatted
        .replace("US$", `${upper} `)
        .replace("$", `${upper} `)
        .replace("USD", upper);
    }
    
    return formatted;
  } catch (error) {
    // Fallback absoluto: formatação manual
    console.warn(`[formatCurrency] Erro ao formatar ${upper}:`, error);
    return `${upper} ${value.toFixed(minimumFractionDigits)}`;
  }
}

/**
 * Formata com sinal explícito (+/-)
 */
export function formatCurrencyWithSign(
  value: number,
  moeda: string = "BRL",
  options: FormatOptions = {}
): string {
  const formatted = formatCurrency(Math.abs(value), moeda, options);
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

/**
 * Formata de forma compacta para valores grandes
 */
export function formatCurrencyCompact(
  value: number,
  moeda: string = "BRL"
): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  
  if (absValue >= 1_000_000) {
    return `${sign}${formatCurrency(absValue / 1_000_000, moeda, { maximumFractionDigits: 1 })}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${formatCurrency(absValue / 1_000, moeda, { maximumFractionDigits: 1 })}K`;
  }
  
  return formatCurrency(value, moeda);
}

/**
 * Retorna apenas o símbolo da moeda
 */
export function getCurrencySymbol(moeda: string): string {
  const upper = (moeda || "BRL").toUpperCase();
  
  // Símbolos conhecidos
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    MYR: "RM",
    MXN: "$",
    ARS: "$",
    COP: "$",
    // Crypto usa o próprio nome como símbolo
    USDT: "USDT",
    USDC: "USDC",
    BTC: "₿",
    ETH: "Ξ",
    BNB: "BNB",
  };
  
  return symbols[upper] || upper;
}
