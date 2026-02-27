/**
 * Context global de cotações de câmbio
 * 
 * ARQUITETURA DE LEITURA (Hierarquia de Fontes):
 * 1️⃣ BANCO DE DADOS (exchange_rate_cache via RPC) - FONTE PRIMÁRIA DE VERDADE
 * 2️⃣ Edge Function (apenas para REFRESH do banco, não leitura primária)
 * 3️⃣ LocalStorage (backup da última leitura válida)
 * 4️⃣ Fallback hardcoded (último recurso absoluto)
 * 
 * O banco É a fonte de verdade. A Edge Function apenas ATUALIZA o banco.
 * O ícone ⚠️ só aparece quando realmente usando fallback hardcoded.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { 
  FALLBACK_RATES, 
  FRONTEND_REFRESH_INTERVAL_MS,
  DEFAULT_SOURCE_INFO,
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

/**
 * Fonte real dos dados de cotação
 */
export type DataSource = 'database' | 'edge_function' | 'localstorage' | 'fallback';

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
  isUsingFallback: boolean;  // true APENAS se usando fallback hardcoded (não DB/cache)
  isStale: boolean;          // true se cotações têm mais de 30 min
  rateAgeMinutes: number | null;
  connectionStatus: ConnectionStatus;
  isFromLocalBackup: boolean;
  dataSource: DataSource; // Nova: indica de onde vieram os dados
  
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

// Tipo para resposta do RPC
interface CachedRateRow {
  currency_pair: string;
  rate: number;
  source: string;
  fetched_at: string;
  expires_at: string;
  is_expired: boolean;
  age_minutes: number;
}

// Mapeamento de currency_pair para chave de rates
const CURRENCY_MAP: Record<string, keyof ExchangeRates> = {
  'USDBRL': 'USDBRL',
  'EURBRL': 'EURBRL',
  'GBPBRL': 'GBPBRL',
  'MYRBRL': 'MYRBRL',
  'MXNBRL': 'MXNBRL',
  'ARSBRL': 'ARSBRL',
  'COPBRL': 'COPBRL',
};

// Mapeamento de currency_pair para chave de sources
const SOURCE_MAP: Record<string, 'usd' | 'eur' | 'gbp' | 'myr' | 'mxn' | 'ars' | 'cop'> = {
  'USDBRL': 'usd',
  'EURBRL': 'eur',
  'GBPBRL': 'gbp',
  'MYRBRL': 'myr',
  'MXNBRL': 'mxn',
  'ARSBRL': 'ars',
  'COPBRL': 'cop',
};

export function ExchangeRatesProvider({ children }: ExchangeRatesProviderProps) {
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrices>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isFromLocalBackup, setIsFromLocalBackup] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline');
  const [dataSource, setDataSource] = useState<DataSource>('fallback');
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

  // ============= 1. LEITURA DO BANCO (FONTE PRIMÁRIA) =============
  // CRITICAL FIX: Removed `sources` from dependency array to break the recreate cycle
  // The function now constructs sources internally from DB data, not from current state
  const fetchFromDatabase = useCallback(async (): Promise<{
    rates: ExchangeRates;
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
    hasData: boolean;
    hasExpired: boolean;
    maxAgeMinutes: number;
  }> => {
    console.log("[ExchangeRatesContext] 📊 Lendo cotações do BANCO DE DADOS...");
    
    // Default sources for fallback case - constructed fresh each call
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
    
    try {
      const { data, error } = await supabase.rpc('get_cached_exchange_rates');
      
      if (error) {
        console.error("[ExchangeRatesContext] ❌ Erro RPC:", error);
        return { rates: FALLBACK_RATES, sources: defaultSources, hasData: false, hasExpired: true, maxAgeMinutes: 999 };
      }
      
      if (!data || data.length === 0) {
        console.warn("[ExchangeRatesContext] ⚠️ Banco vazio, nenhuma cotação encontrada");
        return { rates: FALLBACK_RATES, sources: defaultSources, hasData: false, hasExpired: true, maxAgeMinutes: 999 };
      }
      
      const newRates: ExchangeRates = { ...FALLBACK_RATES };
      const newSources = { ...defaultSources };
      let hasExpired = false;
      let maxAgeMinutes = 0;
      
      for (const row of data as CachedRateRow[]) {
        const rateKey = CURRENCY_MAP[row.currency_pair];
        const sourceKey = SOURCE_MAP[row.currency_pair];
        
        if (rateKey && row.rate > 0) {
          newRates[rateKey] = Number(row.rate);
          
          if (sourceKey) {
            // Parse a source do banco (ex: "FASTFOREX", "PTAX_FALLBACK")
            newSources[sourceKey] = parseSource(row.source);
          }
          
          if (row.is_expired) hasExpired = true;
          if (row.age_minutes > maxAgeMinutes) maxAgeMinutes = row.age_minutes;
        }
      }
      
      console.log("[ExchangeRatesContext] ✅ Dados do banco carregados:", {
        currencies: Object.keys(data).length,
        hasExpired,
        maxAgeMinutes,
        sample: { MXNBRL: newRates.MXNBRL, source: newSources.mxn.source }
      });
      
      return { rates: newRates, sources: newSources, hasData: true, hasExpired, maxAgeMinutes };
    } catch (err) {
      console.error("[ExchangeRatesContext] ❌ Exceção ao ler banco:", err);
      return { rates: FALLBACK_RATES, sources: defaultSources, hasData: false, hasExpired: true, maxAgeMinutes: 999 };
    }
  }, []); // Empty dependency array - function is now stable

  // ============= 2. ATUALIZAÇÃO VIA EDGE FUNCTION =============
  const triggerEdgeFunctionRefresh = useCallback(async (): Promise<boolean> => {
    console.log("[ExchangeRatesContext] 🔄 Disparando Edge Function para refresh...");
    
    try {
      const { data, error } = await supabase.functions.invoke("get-exchange-rates");
      
      if (error) {
        console.warn("[ExchangeRatesContext] ⚠️ Edge Function falhou:", error);
        return false;
      }
      
      console.log("[ExchangeRatesContext] ✅ Edge Function executada:", {
        fromCache: data?.fromCache,
        freshFetched: data?.freshFetched,
      });
      
      return true;
    } catch (err) {
      console.warn("[ExchangeRatesContext] ⚠️ Exceção na Edge Function:", err);
      return false;
    }
  }, []);

  // ============= 3. BACKUP LOCALSTORAGE =============
  const loadLocalBackup = useCallback((): { rates: ExchangeRates; sources: typeof sources } | null => {
    try {
      const backup = localStorage.getItem(LOCALSTORAGE_RATES_KEY);
      if (!backup) return null;
      
      const { rates: savedRates, sources: savedSources, timestamp } = JSON.parse(backup);
      const ageHours = (Date.now() - timestamp) / (60 * 60 * 1000);
      
      if (ageHours < LOCALSTORAGE_BACKUP_TTL_HOURS) {
        console.log("[ExchangeRatesContext] 📦 Backup local disponível (idade:", Math.round(ageHours * 60), "min)");
        return { rates: savedRates, sources: savedSources };
      }
      
      console.log("[ExchangeRatesContext] ⏰ Backup local expirado (", Math.round(ageHours), "h)");
      return null;
    } catch (e) {
      console.warn("[ExchangeRatesContext] Erro ao carregar backup local:", e);
      return null;
    }
  }, []);

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

  // ============= PIPELINE PRINCIPAL DE LEITURA =============
  const fetchRates = useCallback(async () => {
    console.log("[ExchangeRatesContext] 🚀 Iniciando pipeline de cotações...");
    
    // ========== PASSO 1: BANCO DE DADOS (Fonte Primária) ==========
    const dbResult = await fetchFromDatabase();
    
    if (dbResult.hasData) {
      setRates(dbResult.rates);
      setSources(dbResult.sources);
      setLastUpdate(new Date());
      setIsFromLocalBackup(false);
      setDataSource('database');
      
      // Determinar status de conexão baseado nas sources do BANCO
      const fallbackCount = Object.values(dbResult.sources).filter(s => 
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
      saveLocalBackup(dbResult.rates, dbResult.sources);
      
      console.log("[ExchangeRatesContext] ✅ Dados do banco aplicados. Fallbacks no banco:", fallbackCount);
      
      // Se dados estão expirados, dispara refresh em background (não bloqueia UI)
      if (dbResult.hasExpired) {
        console.log("[ExchangeRatesContext] ⏰ Dados expirados, disparando refresh em background...");
        triggerEdgeFunctionRefresh().then(success => {
          if (success) {
            // Re-ler do banco após refresh
            setTimeout(() => fetchFromDatabase().then(freshResult => {
              if (freshResult.hasData && !freshResult.hasExpired) {
                setRates(freshResult.rates);
                setSources(freshResult.sources);
                setLastUpdate(new Date());
                saveLocalBackup(freshResult.rates, freshResult.sources);
                console.log("[ExchangeRatesContext] 🔄 Dados atualizados após refresh");
              }
            }), 2000);
          }
        });
      }
      
      return;
    }
    
    // ========== PASSO 2: EDGE FUNCTION (Tentar popular banco) ==========
    console.log("[ExchangeRatesContext] ⚠️ Banco vazio/falhou, tentando Edge Function...");
    const edgeSuccess = await triggerEdgeFunctionRefresh();
    
    if (edgeSuccess) {
      // Re-tentar leitura do banco após Edge Function popular
      await new Promise(r => setTimeout(r, 1000)); // Aguardar propagação
      const retryDb = await fetchFromDatabase();
      
      if (retryDb.hasData) {
        setRates(retryDb.rates);
        setSources(retryDb.sources);
        setLastUpdate(new Date());
        setIsFromLocalBackup(false);
        setDataSource('edge_function'); // Veio via Edge -> DB
        setConnectionStatus('connected');
        saveLocalBackup(retryDb.rates, retryDb.sources);
        console.log("[ExchangeRatesContext] ✅ Dados aplicados via Edge Function → Banco");
        return;
      }
    }
    
    // ========== PASSO 3: LOCALSTORAGE (Backup) ==========
    console.log("[ExchangeRatesContext] ⚠️ Edge Function falhou, tentando localStorage...");
    const localBackup = loadLocalBackup();
    
    if (localBackup) {
      setRates(localBackup.rates);
      setSources(localBackup.sources);
      setLastUpdate(new Date());
      setIsFromLocalBackup(true);
      setDataSource('localstorage');
      setConnectionStatus('partial');
      console.log("[ExchangeRatesContext] 📦 Usando backup local");
      return;
    }
    
    // ========== PASSO 4: FALLBACK HARDCODED (Último Recurso) ==========
    console.log("[ExchangeRatesContext] ❌ TODOS OS MÉTODOS FALHARAM - Usando FALLBACK HARDCODED");
    setRates(FALLBACK_RATES);
    setSources({
      usd: DEFAULT_SOURCE_INFO,
      eur: DEFAULT_SOURCE_INFO,
      gbp: DEFAULT_SOURCE_INFO,
      myr: DEFAULT_SOURCE_INFO,
      mxn: DEFAULT_SOURCE_INFO,
      ars: DEFAULT_SOURCE_INFO,
      cop: DEFAULT_SOURCE_INFO,
      crypto: "fallback",
    });
    setDataSource('fallback');
    setConnectionStatus('offline');
    setIsFromLocalBackup(false);
    
  }, [fetchFromDatabase, triggerEdgeFunctionRefresh, loadLocalBackup, saveLocalBackup]);

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

  // Inicialização + sincronização com autenticação
  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPipeline = async () => {
      if (!mounted) return;
      setLoading(true);
      await fetchRates();
      if (!mounted) return;
      setLoading(false);

      if (!interval) {
        interval = setInterval(() => {
          void fetchRates();
        }, FRONTEND_REFRESH_INTERVAL_MS);
      }
    };

    const stopPipeline = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (mounted) {
        setLoading(false);
      }
    };

    const bootstrap = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await startPipeline();
      } else {
        stopPipeline();
      }
    };

    void bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session: Session | null) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        stopPipeline();
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        await startPipeline();
      }
    });

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      subscription.unsubscribe();
    };
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

  // ============= STATUS DE SAÚDE =============
  
  // isUsingFallback: TRUE APENAS quando usando fallback HARDCODED
  // NÃO é fallback se veio do banco, mesmo que a source no banco seja "FALLBACK"
  const isUsingFallback = useMemo(() => {
    // Só é fallback real se a dataSource for 'fallback'
    return dataSource === 'fallback';
  }, [dataSource]);

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
    dataSource,
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
    connectionStatus, isFromLocalBackup, dataSource,
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
