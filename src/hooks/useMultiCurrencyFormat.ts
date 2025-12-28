import { useCallback } from "react";
import { SupportedCurrency, CURRENCY_SYMBOLS } from "@/types/currency";

/**
 * Hook utilitário para formatação de valores multi-moeda
 * Usa o tipo de moeda correto baseado em tipo_moeda e moeda do registro
 */

export interface CurrencyFormatOptions {
  showSymbol?: boolean;
  decimals?: number;
  compact?: boolean;
}

export interface TransacaoMoeda {
  tipo_moeda?: string;
  moeda?: string;
  valor: number;
  valor_usd?: number | null;
}

/**
 * Retorna o valor correto baseado no tipo de moeda
 * CRYPTO usa valor_usd (dolarizado), FIAT usa valor direto
 */
export function getValorEfetivo(transacao: TransacaoMoeda): number {
  if (transacao.tipo_moeda === "CRYPTO") {
    return transacao.valor_usd ?? transacao.valor;
  }
  return transacao.valor;
}

/**
 * Retorna a moeda efetiva da transação
 * CRYPTO = USD, FIAT = moeda original (geralmente BRL)
 */
export function getMoedaEfetiva(transacao: TransacaoMoeda): string {
  if (transacao.tipo_moeda === "CRYPTO") {
    return "USD";
  }
  return transacao.moeda || "BRL";
}

/**
 * Formata um valor com a moeda correta
 */
export function formatCurrencyDynamic(
  valor: number,
  moeda: string = "BRL",
  options?: CurrencyFormatOptions
): string {
  const { showSymbol = true, decimals = 2, compact = false } = options || {};
  
  const symbol = CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
  
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
  
  return showSymbol ? `${symbol} ${formatted}` : formatted;
}

/**
 * Interface para saldos separados por tipo de moeda
 */
export interface SaldosSeparados {
  brl: number;
  usd: number; // Inclui CRYPTO convertido para USD
  total_brl_estimado: number; // BRL + USD convertido (para exibição)
}

/**
 * Agrupa transações por tipo de moeda e calcula saldos separados
 */
export function calcularSaldosSeparados(
  transacoes: TransacaoMoeda[],
  cotacaoUSD: number = 5.0
): SaldosSeparados {
  let totalBRL = 0;
  let totalUSD = 0;

  transacoes.forEach((t) => {
    if (t.tipo_moeda === "CRYPTO") {
      // CRYPTO é contabilizado em USD
      totalUSD += t.valor_usd ?? 0;
    } else {
      // FIAT é contabilizado na moeda original
      if (t.moeda === "USD") {
        totalUSD += t.valor;
      } else {
        // BRL ou outras moedas FIAT
        totalBRL += t.valor;
      }
    }
  });

  return {
    brl: totalBRL,
    usd: totalUSD,
    total_brl_estimado: totalBRL + (totalUSD * cotacaoUSD),
  };
}

/**
 * Hook para usar formatação multi-moeda em componentes
 */
export function useMultiCurrencyFormat() {
  const formatValue = useCallback(
    (valor: number, moeda: string = "BRL", options?: CurrencyFormatOptions) => {
      return formatCurrencyDynamic(valor, moeda, options);
    },
    []
  );

  const formatTransacao = useCallback(
    (transacao: TransacaoMoeda, options?: CurrencyFormatOptions) => {
      const valor = getValorEfetivo(transacao);
      const moeda = getMoedaEfetiva(transacao);
      return formatCurrencyDynamic(valor, moeda, options);
    },
    []
  );

  const getTransacaoInfo = useCallback((transacao: TransacaoMoeda) => {
    return {
      valor: getValorEfetivo(transacao),
      moeda: getMoedaEfetiva(transacao),
      isCrypto: transacao.tipo_moeda === "CRYPTO",
    };
  }, []);

  return {
    formatValue,
    formatTransacao,
    getTransacaoInfo,
    calcularSaldosSeparados,
  };
}
