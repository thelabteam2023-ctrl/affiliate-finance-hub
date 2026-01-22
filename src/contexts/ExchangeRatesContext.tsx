/**
 * Context global de cotações de câmbio
 * 
 * REGRA: Uma única requisição à Edge Function por sessão.
 * Todas as cotações são cacheadas aqui e compartilhadas via Context.
 * 
 * A Edge Function já usa cache do banco (TTL 144min), então não há
 * necessidade de múltiplas chamadas do frontend.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

// ============= Types =============

export type CotacaoSource = 
  | 'FASTFOREX' 
  | 'FASTFOREX_CACHE' 
  | 'PTAX_FALLBACK' 
  | 'PTAX_FALLBACK_CACHE' 
  | 'FALLBACK' 
  | 'INDISPONIVEL';

export interface CotacaoSourceInfo {
  source: CotacaoSource;
  label: string;
  isOfficial: boolean;
  isFallback: boolean;
  isPtaxFallback: boolean;
}

export interface ExchangeRates {
  USDBRL: number;
  EURBRL: number;
  GBPBRL: number;
  MYRBRL: number;
  MXNBRL: number;
  ARSBRL: number;
  COPBRL: number;
}

export interface CryptoPrices {
  [symbol: string]: number;
}

export interface ExchangeRatesContextValue {
  // Cotações FIAT
  cotacaoUSD: number;
  cotacaoEUR: number;
  cotacaoGBP: number;
  cotacaoMYR: number;
  cotacaoMXN: number;
  cotacaoARS: number;
  cotacaoCOP: number;
  
  // Crypto
  cryptoPrices: CryptoPrices;
  
  // Estado
  loading: boolean;
  lastUpdate: Date | null;
  
  // Sources detalhadas
  sources: {
    usd: CotacaoSourceInfo;
    eur: CotacaoSourceInfo;
    gbp: CotacaoSourceInfo;
    myr: CotacaoSourceInfo;
    mxn: CotacaoSourceInfo;
    ars: CotacaoSourceInfo;
    cop: CotacaoSourceInfo;
    crypto: string;
  };
  
  // Labels de compatibilidade
  source: {
    usd: string;
    eur: string;
    gbp: string;
    myr: string;
    mxn: string;
    ars: string;
    cop: string;
    crypto: string;
  };
  
  // Helpers
  getRate: (moeda: string) => number;
  convertToBRL: (valor: number, moeda: string) => number;
  convertUSDtoBRL: (usd: number) => number;
  convertBRLtoUSD: (brl: number) => number;
  getCryptoPrice: (symbol: string) => number | null;
  getCryptoUSDValue: (coin: string, quantity: number, fallbackUSD?: number) => number;
  
  // Refresh manual (raro)
  refreshRates: () => Promise<void>;
  refreshCrypto: (symbols: string[]) => Promise<void>;
}

// ============= Constants =============

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

// Intervalo de refresh: 5 minutos (a edge function usa cache de 144min)
const REFRESH_INTERVAL = 5 * 60 * 1000;

// ============= Helpers =============

function parseSource(rawSource: string): CotacaoSourceInfo {
  const source = rawSource?.toUpperCase() || '';
  
  if (source === 'FASTFOREX' || source === 'FASTFOREX_CACHE') {
    return {
      source: source.includes('CACHE') ? 'FASTFOREX_CACHE' : 'FASTFOREX',
      label: 'FastForex',
      isOfficial: true,
      isFallback: false,
      isPtaxFallback: false,
    };
  }
  
  if (source === 'PTAX' || source === 'PTAX_CACHE' || source === 'PTAX_FALLBACK' || source === 'PTAX_FALLBACK_CACHE') {
    const isFallbackSource = source.includes('FALLBACK');
    return {
      source: source.includes('CACHE') ? 'PTAX_FALLBACK_CACHE' : 'PTAX_FALLBACK',
      label: isFallbackSource ? 'PTAX (fallback)' : 'PTAX BCB',
      isOfficial: true,
      isFallback: false,
      isPtaxFallback: true,
    };
  }
  
  if (source === 'FALLBACK' || source === 'FALLBACK_ERRO') {
    return {
      source: 'FALLBACK',
      label: 'Fallback',
      isOfficial: false,
      isFallback: true,
      isPtaxFallback: false,
    };
  }
  
  return {
    source: 'INDISPONIVEL',
    label: 'Indisponível',
    isOfficial: false,
    isFallback: true,
    isPtaxFallback: false,
  };
}

// ============= Context =============

const ExchangeRatesContext = createContext<ExchangeRatesContextValue | null>(null);

interface ExchangeRatesProviderProps {
  children: ReactNode;
}

export function ExchangeRatesProvider({ children }: ExchangeRatesProviderProps) {
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrices>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sources, setSources] = useState({
    usd: defaultSourceInfo,
    eur: defaultSourceInfo,
    gbp: defaultSourceInfo,
    myr: defaultSourceInfo,
    mxn: defaultSourceInfo,
    ars: defaultSourceInfo,
    cop: defaultSourceInfo,
    crypto: "fallback",
  });

  // Fetch FIAT rates (única chamada)
  const fetchRates = useCallback(async () => {
    try {
      console.log("[ExchangeRatesContext] Buscando cotações...");
      const { data, error } = await supabase.functions.invoke("get-exchange-rates");
      
      if (error) throw error;

      const newRates: Partial<ExchangeRates> = {};
      if (data?.USDBRL) newRates.USDBRL = data.USDBRL;
      if (data?.EURBRL) newRates.EURBRL = data.EURBRL;
      if (data?.GBPBRL) newRates.GBPBRL = data.GBPBRL;
      if (data?.MYRBRL) newRates.MYRBRL = data.MYRBRL;
      if (data?.MXNBRL) newRates.MXNBRL = data.MXNBRL;
      if (data?.ARSBRL) newRates.ARSBRL = data.ARSBRL;
      if (data?.COPBRL) newRates.COPBRL = data.COPBRL;

      setRates(prev => ({ ...prev, ...newRates }));

      const rawSources = data?.sources || {};
      setSources({
        usd: parseSource(rawSources.USD),
        eur: parseSource(rawSources.EUR),
        gbp: parseSource(rawSources.GBP),
        myr: parseSource(rawSources.MYR),
        mxn: parseSource(rawSources.MXN),
        ars: parseSource(rawSources.ARS),
        cop: parseSource(rawSources.COP),
        crypto: "fallback",
      });

      setLastUpdate(new Date());
      console.log("[ExchangeRatesContext] Cotações atualizadas:", {
        fromCache: data?.fromCache,
        source: data?.source,
      });
    } catch (error) {
      console.error("[ExchangeRatesContext] Erro ao buscar cotações:", error);
    }
  }, []);

  // Fetch crypto prices
  const fetchCrypto = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("get-crypto-prices", {
        body: { symbols },
      });
      
      if (error) throw error;
      
      if (data?.prices) {
        setCryptoPrices(prev => ({ ...prev, ...data.prices }));
        setSources(prev => ({ ...prev, crypto: "Binance" }));
      }
    } catch (error) {
      console.error("[ExchangeRatesContext] Erro ao buscar crypto:", error);
    }
  }, []);

  // Inicialização única
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchRates();
      setLoading(false);
    };
    init();

    // Refresh automático a cada 5 minutos
    const interval = setInterval(fetchRates, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchRates]);

  // Helpers memoizados
  const getRate = useCallback((moeda: string): number => {
    const m = moeda.toUpperCase();
    if (m === "BRL") return 1;
    if (m === "USD" || m === "USDT" || m === "USDC") return rates.USDBRL;
    if (m === "EUR") return rates.EURBRL;
    if (m === "GBP") return rates.GBPBRL;
    if (m === "MYR") return rates.MYRBRL;
    if (m === "MXN") return rates.MXNBRL;
    if (m === "ARS") return rates.ARSBRL;
    if (m === "COP") return rates.COPBRL;
    
    // Crypto: usar preço em USD * cotação USD
    const cryptoPrice = cryptoPrices[m];
    if (cryptoPrice) return cryptoPrice * rates.USDBRL;
    
    return 1;
  }, [rates, cryptoPrices]);

  const convertToBRL = useCallback((valor: number, moeda: string): number => {
    if (!valor) return 0;
    return valor * getRate(moeda);
  }, [getRate]);

  const convertUSDtoBRL = useCallback((usd: number): number => {
    return usd * rates.USDBRL;
  }, [rates.USDBRL]);

  const convertBRLtoUSD = useCallback((brl: number): number => {
    return rates.USDBRL > 0 ? brl / rates.USDBRL : 0;
  }, [rates.USDBRL]);

  const getCryptoPrice = useCallback((symbol: string): number | null => {
    return cryptoPrices[symbol.toUpperCase()] ?? null;
  }, [cryptoPrices]);

  const getCryptoUSDValue = useCallback((coin: string, quantity: number, fallbackUSD?: number): number => {
    const price = cryptoPrices[coin.toUpperCase()];
    if (price) return quantity * price;
    if (fallbackUSD) return quantity * fallbackUSD;
    // Stablecoins
    if (["USDT", "USDC"].includes(coin.toUpperCase())) return quantity;
    return 0;
  }, [cryptoPrices]);

  // Labels de compatibilidade
  const source = useMemo(() => ({
    usd: sources.usd.label,
    eur: sources.eur.label,
    gbp: sources.gbp.label,
    myr: sources.myr.label,
    mxn: sources.mxn.label,
    ars: sources.ars.label,
    cop: sources.cop.label,
    crypto: sources.crypto,
  }), [sources]);

  const value: ExchangeRatesContextValue = useMemo(() => ({
    cotacaoUSD: rates.USDBRL,
    cotacaoEUR: rates.EURBRL,
    cotacaoGBP: rates.GBPBRL,
    cotacaoMYR: rates.MYRBRL,
    cotacaoMXN: rates.MXNBRL,
    cotacaoARS: rates.ARSBRL,
    cotacaoCOP: rates.COPBRL,
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
    refreshRates: fetchRates,
    refreshCrypto: fetchCrypto,
  }), [rates, cryptoPrices, loading, lastUpdate, sources, source, getRate, convertToBRL, convertUSDtoBRL, convertBRLtoUSD, getCryptoPrice, getCryptoUSDValue, fetchRates, fetchCrypto]);

  return (
    <ExchangeRatesContext.Provider value={value}>
      {children}
    </ExchangeRatesContext.Provider>
  );
}

/**
 * Hook para consumir cotações do contexto global
 * 
 * IMPORTANTE: Este hook deve ser usado no lugar de useCotacoes
 * para evitar múltiplas requisições à Edge Function.
 */
export function useExchangeRates(): ExchangeRatesContextValue {
  const context = useContext(ExchangeRatesContext);
  if (!context) {
    throw new Error("useExchangeRates deve ser usado dentro de ExchangeRatesProvider");
  }
  return context;
}

/**
 * Hook seguro que retorna null se estiver fora do provider
 */
export function useExchangeRatesSafe(): ExchangeRatesContextValue | null {
  return useContext(ExchangeRatesContext);
}
