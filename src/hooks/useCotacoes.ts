/**
 * Hook de compatibilidade para cotações
 * 
 * IMPORTANTE: Este hook agora consome dados do ExchangeRatesContext global.
 * Não faz requisições próprias - apenas repassa os dados do Context.
 * 
 * Para novos componentes, considere usar useExchangeRates() diretamente.
 */

import { useEffect, useMemo, useCallback } from "react";
import { useExchangeRatesSafe } from "@/contexts/ExchangeRatesContext";
import { 
  FALLBACK_RATES,
  DEFAULT_SOURCE_INFO,
  type CotacaoSource, 
  type CotacaoSourceInfo,
  type ExchangeRates,
} from "@/constants/exchangeRates";

// Re-export types for backwards compatibility
export type { CotacaoSource, CotacaoSourceInfo, ExchangeRates };

const defaultSources = {
  usd: DEFAULT_SOURCE_INFO,
  eur: DEFAULT_SOURCE_INFO,
  gbp: DEFAULT_SOURCE_INFO,
  myr: DEFAULT_SOURCE_INFO,
  mxn: DEFAULT_SOURCE_INFO,
  ars: DEFAULT_SOURCE_INFO,
  cop: DEFAULT_SOURCE_INFO,
  crypto: "fallback",
};

const defaultSourceLabels = {
  usd: "Fallback",
  eur: "Fallback",
  gbp: "Fallback",
  mxn: "Fallback",
  myr: "Fallback",
  ars: "Fallback",
  cop: "Fallback",
  crypto: "fallback",
};

/**
 * Hook de cotações que consome do Context global
 * 
 * @param cryptoSymbols - Símbolos de crypto para buscar preços
 * @returns Objeto com cotações e funções utilitárias
 */
export function useCotacoes(cryptoSymbols: string[] = []) {
  const context = useExchangeRatesSafe();
  
  // Valores do context ou fallback (sempre definidos para evitar problemas de hooks)
  // IMPORTANTE: Usar FALLBACK_RATES centralizado, não valores locais
  const cotacaoUSD = context?.cotacaoUSD ?? FALLBACK_RATES.USDBRL;
  const cotacaoEUR = context?.cotacaoEUR ?? FALLBACK_RATES.EURBRL;
  const cotacaoGBP = context?.cotacaoGBP ?? FALLBACK_RATES.GBPBRL;
  const cotacaoMYR = context?.cotacaoMYR ?? FALLBACK_RATES.MYRBRL;
  const cotacaoMXN = context?.cotacaoMXN ?? FALLBACK_RATES.MXNBRL;
  const cotacaoARS = context?.cotacaoARS ?? FALLBACK_RATES.ARSBRL;
  const cotacaoCOP = context?.cotacaoCOP ?? FALLBACK_RATES.COPBRL;
  const cryptoPrices = context?.cryptoPrices ?? {};
  const loading = context?.loading ?? false;
  const lastUpdate = context?.lastUpdate ?? null;
  const sources = context?.sources ?? defaultSources;
  const source = context?.source ?? defaultSourceLabels;
  
  // Log de debug se estiver usando fallback
  useEffect(() => {
    if (!context) {
      console.warn("[useCotacoes] ⚠️ Context não disponível - usando FALLBACK_RATES centralizados");
    }
  }, [context]);
  
  // Buscar crypto quando symbols mudam
  useEffect(() => {
    if (!context || cryptoSymbols.length === 0) return;
    
    // Verificar quais symbols ainda não temos
    const missing = cryptoSymbols.filter(s => !cryptoPrices[s.toUpperCase()]);
    if (missing.length > 0) {
      context.refreshCrypto(missing);
    }
  }, [cryptoSymbols.join(","), context, cryptoPrices]);

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

  // Funções utilitárias (sempre disponíveis, usam context se disponível ou fallback)
  const getRate = useCallback((moeda: string): number => {
    if (context?.getRate) return context.getRate(moeda);
    
    const m = moeda.toUpperCase();
    if (m === "BRL") return 1;
    if (m === "USD") return cotacaoUSD;
    if (m === "EUR") return cotacaoEUR;
    if (m === "GBP") return cotacaoGBP;
    if (m === "MYR") return cotacaoMYR;
    if (m === "MXN") return cotacaoMXN;
    if (m === "ARS") return cotacaoARS;
    if (m === "COP") return cotacaoCOP;
    return 1;
  }, [context, cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP]);

  const convertToBRL = useCallback((valor: number, moeda: string): number => {
    if (context?.convertToBRL) return context.convertToBRL(valor, moeda);
    if (!valor) return 0;
    return valor * getRate(moeda);
  }, [context, getRate]);

  const convertUSDtoBRL = useCallback((usd: number): number => {
    if (context?.convertUSDtoBRL) return context.convertUSDtoBRL(usd);
    return usd * cotacaoUSD;
  }, [context, cotacaoUSD]);

  const convertBRLtoUSD = useCallback((brl: number): number => {
    if (context?.convertBRLtoUSD) return context.convertBRLtoUSD(brl);
    return cotacaoUSD > 0 ? brl / cotacaoUSD : 0;
  }, [context, cotacaoUSD]);

  const getCryptoPrice = useCallback((symbol: string): number | null => {
    if (context?.getCryptoPrice) return context.getCryptoPrice(symbol);
    return cryptoPrices[symbol.toUpperCase()] ?? null;
  }, [context, cryptoPrices]);

  const getCryptoUSDValue = useCallback((coin: string, quantity: number, fallbackUSD?: number): number => {
    if (context?.getCryptoUSDValue) return context.getCryptoUSDValue(coin, quantity, fallbackUSD);
    const price = cryptoPrices[coin.toUpperCase()];
    if (price) return quantity * price;
    if (fallbackUSD) return quantity * fallbackUSD;
    if (["USDT", "USDC"].includes(coin.toUpperCase())) return quantity;
    return 0;
  }, [context, cryptoPrices]);

  const refreshAll = useCallback(async (): Promise<void> => {
    if (context?.refreshRates) await context.refreshRates();
  }, [context]);

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
    refreshAll,
    convertUSDtoBRL,
    convertBRLtoUSD,
    convertToBRL,
    getRate,
    getCryptoUSDValue,
    getCryptoPrice,
  };
}
