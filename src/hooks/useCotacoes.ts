/**
 * Hook de compatibilidade para cotações
 * 
 * IMPORTANTE: Este hook agora consome dados do ExchangeRatesContext global.
 * Não faz requisições próprias - apenas repassa os dados do Context.
 * 
 * Para novos componentes, considere usar useExchangeRates() diretamente.
 */

import { useEffect, useCallback, useMemo } from "react";
import { useExchangeRates, useExchangeRatesSafe } from "@/contexts/ExchangeRatesContext";
import type { CotacaoSource, CotacaoSourceInfo } from "@/contexts/ExchangeRatesContext";

// Re-export types for backwards compatibility
export type { CotacaoSource, CotacaoSourceInfo };

export interface ExchangeRates {
  USDBRL: number;
  EURBRL: number;
  GBPBRL: number;
  MYRBRL: number;
  MXNBRL: number;
  ARSBRL: number;
  COPBRL: number;
}

/**
 * Hook de cotações que consome do Context global
 * 
 * @param cryptoSymbols - Símbolos de crypto para buscar preços
 * @returns Objeto com cotações e funções utilitárias
 */
export function useCotacoes(cryptoSymbols: string[] = []) {
  const context = useExchangeRatesSafe();
  
  // Se não há context (fora do provider), retornar valores fallback
  if (!context) {
    console.warn("[useCotacoes] Usado fora do ExchangeRatesProvider - retornando fallbacks");
    return getFallbackValues();
  }

  const {
    cotacaoUSD,
    cotacaoEUR,
    cotacaoGBP,
    cotacaoMYR,
    cotacaoMXN,
    cotacaoARS,
    cotacaoCOP,
    cryptoPrices,
    loading,
    lastUpdate,
    sources,
    source,
    getRate,
    convertToBRL,
    convertUSDtoBRL,
    convertBRLtoUSD,
    getCryptoPrice,
    getCryptoUSDValue,
    refreshRates,
    refreshCrypto,
  } = context;

  // Buscar crypto quando symbols mudam
  useEffect(() => {
    if (cryptoSymbols.length > 0) {
      // Verificar quais symbols ainda não temos
      const missing = cryptoSymbols.filter(s => !cryptoPrices[s.toUpperCase()]);
      if (missing.length > 0) {
        refreshCrypto(missing);
      }
    }
  }, [cryptoSymbols.join(","), refreshCrypto]);

  // Objeto com todas as cotações para acesso direto
  const rates: ExchangeRates = useMemo(() => ({
    USDBRL: cotacaoUSD,
    EURBRL: cotacaoEUR,
    GBPBRL: cotacaoGBP,
    MYRBRL: cotacaoMYR,
    MXNBRL: cotacaoMXN,
    ARSBRL: cotacaoARS,
    COPBRL: cotacaoCOP,
  }), [cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP]);

  return {
    // Valores individuais
    cotacaoUSD,
    cotacaoEUR,
    cotacaoGBP,
    cotacaoMYR,
    cotacaoMXN,
    cotacaoARS,
    cotacaoCOP,
    cryptoPrices,
    loading,
    lastUpdate,
    
    // Objeto agregado
    rates,
    
    // Sources
    sources,
    source,
    
    // Funções
    refreshAll: refreshRates,
    convertUSDtoBRL,
    convertBRLtoUSD,
    convertToBRL,
    getRate,
    getCryptoUSDValue,
    getCryptoPrice,
  };
}

/**
 * Valores fallback para uso fora do provider
 */
function getFallbackValues() {
  const FALLBACK_RATES: ExchangeRates = {
    USDBRL: 5.31,
    EURBRL: 6.10,
    GBPBRL: 7.10,
    MYRBRL: 1.20,
    MXNBRL: 0.26,
    ARSBRL: 0.005,
    COPBRL: 0.0013,
  };

  const defaultSourceInfo: CotacaoSourceInfo = {
    source: 'FALLBACK',
    label: 'Fallback',
    isOfficial: false,
    isFallback: true,
    isPtaxFallback: false,
  };

  return {
    cotacaoUSD: FALLBACK_RATES.USDBRL,
    cotacaoEUR: FALLBACK_RATES.EURBRL,
    cotacaoGBP: FALLBACK_RATES.GBPBRL,
    cotacaoMYR: FALLBACK_RATES.MYRBRL,
    cotacaoMXN: FALLBACK_RATES.MXNBRL,
    cotacaoARS: FALLBACK_RATES.ARSBRL,
    cotacaoCOP: FALLBACK_RATES.COPBRL,
    cryptoPrices: {},
    loading: false,
    lastUpdate: null,
    rates: FALLBACK_RATES,
    sources: {
      usd: defaultSourceInfo,
      eur: defaultSourceInfo,
      gbp: defaultSourceInfo,
      myr: defaultSourceInfo,
      mxn: defaultSourceInfo,
      ars: defaultSourceInfo,
      cop: defaultSourceInfo,
      crypto: "fallback",
    },
    source: {
      usd: "Fallback",
      eur: "Fallback",
      gbp: "Fallback",
      myr: "Fallback",
      mxn: "Fallback",
      ars: "Fallback",
      cop: "Fallback",
      crypto: "fallback",
    },
    refreshAll: async () => {},
    convertUSDtoBRL: (usd: number) => usd * FALLBACK_RATES.USDBRL,
    convertBRLtoUSD: (brl: number) => brl / FALLBACK_RATES.USDBRL,
    convertToBRL: (valor: number, moeda: string) => {
      const m = moeda.toUpperCase();
      if (m === "BRL") return valor;
      if (m === "USD") return valor * FALLBACK_RATES.USDBRL;
      if (m === "EUR") return valor * FALLBACK_RATES.EURBRL;
      if (m === "GBP") return valor * FALLBACK_RATES.GBPBRL;
      if (m === "MYR") return valor * FALLBACK_RATES.MYRBRL;
      if (m === "MXN") return valor * FALLBACK_RATES.MXNBRL;
      if (m === "ARS") return valor * FALLBACK_RATES.ARSBRL;
      if (m === "COP") return valor * FALLBACK_RATES.COPBRL;
      return valor;
    },
    getRate: (moeda: string) => {
      const m = moeda.toUpperCase();
      if (m === "USD") return FALLBACK_RATES.USDBRL;
      if (m === "EUR") return FALLBACK_RATES.EURBRL;
      if (m === "GBP") return FALLBACK_RATES.GBPBRL;
      if (m === "MYR") return FALLBACK_RATES.MYRBRL;
      if (m === "MXN") return FALLBACK_RATES.MXNBRL;
      if (m === "ARS") return FALLBACK_RATES.ARSBRL;
      if (m === "COP") return FALLBACK_RATES.COPBRL;
      return 1;
    },
    getCryptoUSDValue: (coin: string, quantity: number, fallbackUSD?: number) => fallbackUSD ? quantity * fallbackUSD : 0,
    getCryptoPrice: (coin: string) => null,
  };
}
