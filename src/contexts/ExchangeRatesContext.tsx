/**
 * Context global de cotações de câmbio
 * 
 * REGRA: Uma única requisição à Edge Function por sessão.
 * Todas as cotações são cacheadas aqui e compartilhadas via Context.
 * 
 * A Edge Function já usa cache do banco (TTL 30min), então não há
 * necessidade de múltiplas chamadas do frontend.
 * 
 * IMPORTANTE: Este é o ÚNICO lugar que deve definir cotações para a aplicação.
 * Hooks e componentes devem consumir deste Context, NUNCA definir fallbacks próprios.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  FALLBACK_RATES, 
  FRONTEND_REFRESH_INTERVAL_MS,
  DEFAULT_SOURCE_INFO,
  RETRY_CONFIG,
  LOCALSTORAGE_RATES_KEY,
  LOCALSTORAGE_BACKUP_TTL_HOURS,
  parseSource,
  isRateFresh,
  getRateAgeMinutes,
  type ExchangeRates,
  type CotacaoSource,
  type CotacaoSourceInfo,
} from "@/constants/exchangeRates";

// Re-export types for backwards compatibility
export type { CotacaoSource, CotacaoSourceInfo, ExchangeRates };

export interface CryptoPrices {
  [symbol: string]: number;
}

/**
 * Status de conexão com a API de cotações
 */
export type ConnectionStatus = 'connected' | 'partial' | 'offline';

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
  
  // Status de saúde das cotações
  isUsingFallback: boolean;  // true se qualquer moeda está usando fallback hardcoded
  isStale: boolean;          // true se cotações têm mais de 30 min
  rateAgeMinutes: number | null;
  connectionStatus: ConnectionStatus; // status de conexão com a API
  isFromLocalBackup: boolean; // true se usando backup do localStorage
  
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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFromLocalBackup, setIsFromLocalBackup] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline');
  const [sources, setSources] = useState({
    usd: DEFAULT_SOURCE_INFO,
    eur: DEFAULT_SOURCE_INFO,
    gbp: DEFAULT_SOURCE_INFO,
    myr: DEFAULT_SOURCE_INFO,
    mxn: DEFAULT_SOURCE_INFO,
    ars: DEFAULT_SOURCE_INFO,
    cop: DEFAULT_SOURCE_INFO,
    crypto: "fallback",
  });

  // Carregar backup do localStorage
  const loadLocalBackup = useCallback(() => {
    try {
      const backup = localStorage.getItem(LOCALSTORAGE_RATES_KEY);
      if (!backup) return false;
      
      const { rates: savedRates, sources: savedSources, timestamp } = JSON.parse(backup);
      const ageHours = (Date.now() - timestamp) / (60 * 60 * 1000);
      
      if (ageHours < LOCALSTORAGE_BACKUP_TTL_HOURS) {
        console.log("[ExchangeRatesContext] 📦 Usando backup local (idade:", Math.round(ageHours * 60), "min)");
        setRates(savedRates);
        setSources(savedSources);
        setLastUpdate(new Date(timestamp));
        setIsFromLocalBackup(true);
        return true;
      }
    } catch (e) {
      console.warn("[ExchangeRatesContext] Erro ao carregar backup local:", e);
    }
    return false;
  }, []);

  // Salvar backup no localStorage
  const saveLocalBackup = useCallback((newRates: ExchangeRates, newSources: typeof sources) => {
    try {
      localStorage.setItem(LOCALSTORAGE_RATES_KEY, JSON.stringify({
        rates: newRates,
        sources: newSources,
        timestamp: Date.now(),
      }));
    } catch (e) {
      console.warn("[ExchangeRatesContext] Erro ao salvar backup local:", e);
    }
  }, []);

  // Fetch com retry e exponential backoff
  const fetchRatesWithRetry = useCallback(async (): Promise<any> => {
    const { maxRetries, baseDelayMs, maxDelayMs } = RETRY_CONFIG;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ExchangeRatesContext] Tentativa ${attempt}/${maxRetries}...`);
        const { data, error } = await supabase.functions.invoke("get-exchange-rates");
        
        if (error) throw error;
        if (!data || typeof data !== 'object') throw new Error("Dados inválidos da API");
        
        return data;
      } catch (err) {
        console.warn(`[ExchangeRatesContext] Tentativa ${attempt}/${maxRetries} falhou:`, err);
        
        if (attempt === maxRetries) throw err;
        
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }, []);

  // Fetch FIAT rates
  const fetchRates = useCallback(async () => {
    try {
      console.log("[ExchangeRatesContext] Buscando cotações...");
      const data = await fetchRatesWithRetry();

      // Log detalhado para debugging
      console.log("[ExchangeRatesContext] Dados recebidos:", {
        MXNBRL: data.MXNBRL,
        sources: data.sources,
        fromCache: data.fromCache,
      });

      const newRates: ExchangeRates = { ...FALLBACK_RATES };
      
      // Só atualizar se o valor for válido (número > 0)
      if (typeof data.USDBRL === 'number' && data.USDBRL > 0) newRates.USDBRL = data.USDBRL;
      if (typeof data.EURBRL === 'number' && data.EURBRL > 0) newRates.EURBRL = data.EURBRL;
      if (typeof data.GBPBRL === 'number' && data.GBPBRL > 0) newRates.GBPBRL = data.GBPBRL;
      if (typeof data.MYRBRL === 'number' && data.MYRBRL > 0) newRates.MYRBRL = data.MYRBRL;
      if (typeof data.MXNBRL === 'number' && data.MXNBRL > 0) newRates.MXNBRL = data.MXNBRL;
      if (typeof data.ARSBRL === 'number' && data.ARSBRL > 0) newRates.ARSBRL = data.ARSBRL;
      if (typeof data.COPBRL === 'number' && data.COPBRL > 0) newRates.COPBRL = data.COPBRL;

      // Parse sources
      const rawSources = data.sources || {};
      const newSources = {
        usd: parseSource(rawSources.USD || ''),
        eur: parseSource(rawSources.EUR || ''),
        gbp: parseSource(rawSources.GBP || ''),
        myr: parseSource(rawSources.MYR || ''),
        mxn: parseSource(rawSources.MXN || ''),
        ars: parseSource(rawSources.ARS || ''),
        cop: parseSource(rawSources.COP || ''),
        crypto: "fallback",
      };

      // Atualizar state
      setRates(newRates);
      setSources(newSources);
      setLastUpdate(new Date());
      setFetchError(null);
      setIsFromLocalBackup(false);

      // Determinar status de conexão
      const fallbackCount = Object.values(newSources).filter(s => 
        typeof s === 'object' && s.isFallback
      ).length;
      
      if (fallbackCount === 0) {
        setConnectionStatus('connected');
      } else if (fallbackCount < 7) {
        setConnectionStatus('partial');
      } else {
        setConnectionStatus('offline');
      }

      // Salvar backup local
      saveLocalBackup(newRates, newSources);
      
      console.log("[ExchangeRatesContext] ✅ Cotações atualizadas:", {
        fromCache: data.fromCache,
        source: data.source,
        timestamp: data.timestamp,
      });
    } catch (error) {
      console.error("[ExchangeRatesContext] ❌ Erro ao buscar cotações:", error);
      setFetchError(error instanceof Error ? error.message : "Erro desconhecido");
      setConnectionStatus('offline');
      
      // Tentar carregar backup local se não temos dados atualizados
      if (!lastUpdate) {
        loadLocalBackup();
      }
    }
  }, [fetchRatesWithRetry, loadLocalBackup, saveLocalBackup, lastUpdate]);

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

    // Refresh automático
    const interval = setInterval(fetchRates, FRONTEND_REFRESH_INTERVAL_MS);
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

  // Calcular status de saúde das cotações
  const isUsingFallback = useMemo(() => {
    return Object.values(sources).some(s => 
      typeof s === 'object' && s.isFallback
    );
  }, [sources]);

  const isStale = useMemo(() => {
    return !isRateFresh(lastUpdate);
  }, [lastUpdate]);

  const rateAgeMinutes = useMemo(() => {
    return getRateAgeMinutes(lastUpdate);
  }, [lastUpdate]);

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
    isUsingFallback,
    isStale,
    rateAgeMinutes,
    connectionStatus,
    isFromLocalBackup,
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
  }), [
    rates, cryptoPrices, loading, lastUpdate, isUsingFallback, isStale, rateAgeMinutes,
    connectionStatus, isFromLocalBackup,
    sources, source, getRate, convertToBRL, convertUSDtoBRL, convertBRLtoUSD, 
    getCryptoPrice, getCryptoUSDValue, fetchRates, fetchCrypto
  ]);

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
