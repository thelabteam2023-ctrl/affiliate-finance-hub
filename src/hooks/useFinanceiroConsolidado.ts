/**
 * Hook centralizado para consolidação financeira multimoeda
 * 
 * PRINCÍPIO: Todas as métricas financeiras são consolidadas em BRL,
 * mas mantemos rastreabilidade completa da origem e taxas usadas.
 */

import { useCallback, useMemo } from "react";
import { useCotacoes } from "./useCotacoes";
import type { SupportedCurrency } from "@/types/currency";
import { CURRENCY_SYMBOLS, isCryptoCurrency, isValidCurrency } from "@/types/currency";

// ============ TIPOS ============

export interface OperacaoMultimoeda {
  valor: number;
  moeda: string;
  tipo_moeda?: "FIAT" | "CRYPTO";
  cotacao_snapshot?: number | null;
  valor_usd?: number | null;
}

export interface SaldoConsolidado {
  valorOriginal: number;
  moedaOriginal: string;
  valorBRL: number;
  cotacaoUsada: number;
  fonteConversao: string;
  isForeign: boolean;
}

export interface ResumoMultimoeda {
  totalBRL: number;
  totalUSD: number;
  totalCrypto: number; // em USD
  totalConsolidadoBRL: number;
  hasMultipleCurrencies: boolean;
  moedas: string[];
  cotacaoUSD: number;
}

export interface ConsolidacaoInfo {
  moedaConsolidacao: "BRL";
  totalConsolidado: number;
  itens: Array<{
    moeda: string;
    valorOriginal: number;
    valorConvertido: number;
    percentual: number;
  }>;
  cotacaoUSD: number;
  ultimaAtualizacao: Date | null;
  fonte: string;
}

// ============ HOOK ============

export function useFinanceiroConsolidado(cryptoSymbols: string[] = []) {
  const { 
    cotacaoUSD,
    cotacaoEUR,
    cotacaoGBP,
    cotacaoMYR,
    cotacaoMXN,
    cotacaoARS,
    cotacaoCOP,
    getCryptoUSDValue, 
    getCryptoPrice,
    loading, 
    lastUpdate, 
    source,
    refreshAll 
  } = useCotacoes(cryptoSymbols);

  /**
   * Converter qualquer valor para BRL
   * Usa snapshot se disponível, senão cotação atual
   */
  const converterParaBRL = useCallback((
    valor: number,
    moeda: string,
    options?: {
      cotacao_snapshot?: number | null;
      valor_usd?: number | null;
      tipo_moeda?: "FIAT" | "CRYPTO";
    }
  ): SaldoConsolidado => {
    // BRL não precisa conversão
    if (moeda === "BRL") {
      return {
        valorOriginal: valor,
        moedaOriginal: "BRL",
        valorBRL: valor,
        cotacaoUsada: 1,
        fonteConversao: "direto",
        isForeign: false,
      };
    }

    // CRYPTO: usar valor_usd se disponível, ou buscar preço atual
    if (options?.tipo_moeda === "CRYPTO" || isCryptoCurrency(moeda)) {
      // Se temos valor_usd salvo, usar ele (snapshot)
      if (options?.valor_usd != null) {
        const valorFinalBRL = options.valor_usd * cotacaoUSD;
        return {
          valorOriginal: valor,
          moedaOriginal: moeda,
          valorBRL: valorFinalBRL,
          cotacaoUsada: cotacaoUSD,
          fonteConversao: "snapshot_usd",
          isForeign: true,
        };
      }
      
      // Buscar preço atual da crypto
      const cryptoPrice = getCryptoPrice(moeda);
      if (cryptoPrice) {
        const valorUSD = valor * cryptoPrice;
        const valorBRL = valorUSD * cotacaoUSD;
        return {
          valorOriginal: valor,
          moedaOriginal: moeda,
          valorBRL,
          cotacaoUsada: cotacaoUSD,
          fonteConversao: "api_crypto",
          isForeign: true,
        };
      }

      // Stablecoins (USDT, USDC) = 1:1 com USD
      if (["USDT", "USDC", "DAI", "BUSD"].includes(moeda)) {
        return {
          valorOriginal: valor,
          moedaOriginal: moeda,
          valorBRL: valor * cotacaoUSD,
          cotacaoUsada: cotacaoUSD,
          fonteConversao: "stablecoin_1_1",
          isForeign: true,
        };
      }

      // Fallback: usar valor como USD
      return {
        valorOriginal: valor,
        moedaOriginal: moeda,
        valorBRL: valor * cotacaoUSD,
        cotacaoUsada: cotacaoUSD,
        fonteConversao: "fallback_usd",
        isForeign: true,
      };
    }

    // USD: usar snapshot se disponível
    if (moeda === "USD") {
      const cotacao = options?.cotacao_snapshot ?? cotacaoUSD;
      const fonte = options?.cotacao_snapshot ? "snapshot" : source.usd;
      return {
        valorOriginal: valor,
        moedaOriginal: "USD",
        valorBRL: valor * cotacao,
        cotacaoUsada: cotacao,
        fonteConversao: fonte,
        isForeign: true,
      };
    }

    // EUR e GBP: usar cotações PTAX reais do BCB
    if (moeda === "EUR") {
      return {
        valorOriginal: valor,
        moedaOriginal: "EUR",
        valorBRL: valor * cotacaoEUR,
        cotacaoUsada: cotacaoEUR,
        fonteConversao: source.eur || "BCB",
        isForeign: true,
      };
    }

    if (moeda === "GBP") {
      return {
        valorOriginal: valor,
        moedaOriginal: "GBP",
        valorBRL: valor * cotacaoGBP,
        cotacaoUsada: cotacaoGBP,
        fonteConversao: source.gbp || "BCB",
        isForeign: true,
      };
    }

    if (moeda === "MYR") {
      return {
        valorOriginal: valor,
        moedaOriginal: "MYR",
        valorBRL: valor * cotacaoMYR,
        cotacaoUsada: cotacaoMYR,
        fonteConversao: source.myr || "BCB",
        isForeign: true,
      };
    }

    if (moeda === "MXN") {
      return {
        valorOriginal: valor,
        moedaOriginal: "MXN",
        valorBRL: valor * cotacaoMXN,
        cotacaoUsada: cotacaoMXN,
        fonteConversao: source.mxn || "BCB",
        isForeign: true,
      };
    }

    if (moeda === "ARS") {
      return {
        valorOriginal: valor,
        moedaOriginal: "ARS",
        valorBRL: valor * cotacaoARS,
        cotacaoUsada: cotacaoARS,
        fonteConversao: source.ars || "BCB",
        isForeign: true,
      };
    }

    if (moeda === "COP") {
      return {
        valorOriginal: valor,
        moedaOriginal: "COP",
        valorBRL: valor * cotacaoCOP,
        cotacaoUsada: cotacaoCOP,
        fonteConversao: source.cop || "BCB",
        isForeign: true,
      };
    }

    // Fallback: tratar como BRL
    return {
      valorOriginal: valor,
      moedaOriginal: moeda,
      valorBRL: valor,
      cotacaoUsada: 1,
      fonteConversao: "fallback_brl",
      isForeign: false,
    };
  }, [cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP, getCryptoPrice, source]);

  /**
   * Consolidar lista de operações para resumo
   */
  const consolidarOperacoes = useCallback((
    operacoes: OperacaoMultimoeda[]
  ): ResumoMultimoeda => {
    let totalBRL = 0;
    let totalUSD = 0;
    let totalCrypto = 0;
    const moedasSet = new Set<string>();

    operacoes.forEach(op => {
      moedasSet.add(op.moeda);
      
      if (op.moeda === "BRL") {
        totalBRL += op.valor;
      } else if (op.moeda === "USD") {
        totalUSD += op.valor;
      } else if (op.tipo_moeda === "CRYPTO" || isCryptoCurrency(op.moeda)) {
        // Crypto: valor em USD (direto ou via valor_usd)
        if (op.valor_usd != null) {
          totalCrypto += op.valor_usd;
        } else {
          totalCrypto += op.valor; // Assume que é em USD
        }
      } else if (op.moeda === "USD") {
        totalUSD += op.valor;
      } else {
        // Outras moedas: converter para BRL
        const convertido = converterParaBRL(op.valor, op.moeda, {
          cotacao_snapshot: op.cotacao_snapshot,
          valor_usd: op.valor_usd,
          tipo_moeda: op.tipo_moeda,
        });
        totalBRL += convertido.valorBRL;
      }
    });

    const totalConsolidadoBRL = totalBRL + (totalUSD * cotacaoUSD) + (totalCrypto * cotacaoUSD);

    return {
      totalBRL,
      totalUSD,
      totalCrypto,
      totalConsolidadoBRL,
      hasMultipleCurrencies: moedasSet.size > 1,
      moedas: Array.from(moedasSet),
      cotacaoUSD,
    };
  }, [cotacaoUSD, converterParaBRL]);

  /**
   * Gerar informações de consolidação para exibição
   */
  const gerarInfoConsolidacao = useCallback((
    itens: Array<{ valor: number; moeda: string }>
  ): ConsolidacaoInfo => {
    const itensConvertidos = itens.map(item => {
      const convertido = converterParaBRL(item.valor, item.moeda);
      return {
        moeda: item.moeda,
        valorOriginal: item.valor,
        valorConvertido: convertido.valorBRL,
        percentual: 0, // Calculado depois
      };
    });

    const totalConsolidado = itensConvertidos.reduce((sum, item) => sum + item.valorConvertido, 0);

    // Calcular percentuais
    itensConvertidos.forEach(item => {
      item.percentual = totalConsolidado > 0 ? (item.valorConvertido / totalConsolidado) * 100 : 0;
    });

    return {
      moedaConsolidacao: "BRL",
      totalConsolidado,
      itens: itensConvertidos,
      cotacaoUSD,
      ultimaAtualizacao: lastUpdate,
      fonte: source.usd,
    };
  }, [converterParaBRL, cotacaoUSD, lastUpdate, source.usd]);

  /**
   * Formatador de moeda com símbolo
   */
  const formatarMoeda = useCallback((
    valor: number,
    moeda: string = "BRL",
    options?: { compact?: boolean; decimals?: number }
  ): string => {
    const symbol = CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
    const decimals = options?.decimals ?? 2;
    
    if (options?.compact && Math.abs(valor) >= 1000) {
      if (Math.abs(valor) >= 1000000) {
        const formatted = (valor / 1000000).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
        return `${symbol} ${formatted}M`;
      }
      const formatted = (valor / 1000).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return `${symbol} ${formatted}K`;
    }

    const formatted = valor.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${symbol} ${formatted}`;
  }, []);

  /**
   * Formatador padrão BRL
   */
  const formatBRL = useCallback((valor: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  }, []);

  /**
   * Verificar se há operações em múltiplas moedas
   */
  const isMultiCurrency = useCallback((moedas: string[]): boolean => {
    const unicas = [...new Set(moedas.filter(Boolean))];
    return unicas.length > 1 || unicas.some(m => m !== "BRL");
  }, []);

  /**
   * Obter label de moeda para badge
   */
  const getMoedaBadge = useCallback((moeda: string): { 
    label: string; 
    isForeign: boolean; 
    symbol: string;
    color: string;
  } => {
    const symbol = CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
    const isForeign = moeda !== "BRL";
    
    let color = "bg-muted text-muted-foreground";
    if (moeda === "USD") color = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (moeda === "EUR") color = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    if (isCryptoCurrency(moeda)) color = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    
    return {
      label: moeda,
      isForeign,
      symbol,
      color,
    };
  }, []);

  return {
    // Estado
    loading,
    cotacaoUSD,
    lastUpdate,
    source,
    
    // Funções de conversão
    converterParaBRL,
    consolidarOperacoes,
    gerarInfoConsolidacao,
    
    // Formatadores
    formatarMoeda,
    formatBRL,
    
    // Utilitários
    isMultiCurrency,
    getMoedaBadge,
    getCryptoUSDValue,
    
    // Refresh
    refreshAll,
  };
}
