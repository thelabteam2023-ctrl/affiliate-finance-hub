import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
 * Tipos de fonte para cotações:
 * - FASTFOREX: Cotação da API FastForex (fonte primária para TODAS as moedas)
 * - PTAX_FALLBACK: PTAX como segundo fallback para USD, EUR, GBP
 * - TRABALHO_FALLBACK: Usando cotação de trabalho como fallback (fonte oficial indisponível)
 * - FALLBACK: Usando valor fallback hardcoded (terceira opção)
 */
export type CotacaoSource = 
  | 'FASTFOREX' 
  | 'FASTFOREX_CACHE' 
  | 'PTAX_FALLBACK' 
  | 'PTAX_FALLBACK_CACHE' 
  | 'TRABALHO_FALLBACK' 
  | 'FALLBACK'
  | 'INDISPONIVEL';

export interface CotacaoSourceInfo {
  source: CotacaoSource;
  label: string;
  isOfficial: boolean;
  isFallback: boolean;
  isPtaxFallback: boolean;
}

interface CotacoesState {
  cotacaoUSD: number;
  cotacaoEUR: number;
  cotacaoGBP: number;
  cotacaoMYR: number;
  cotacaoMXN: number;
  cotacaoARS: number;
  cotacaoCOP: number;
  cryptoPrices: Record<string, number>;
  loading: boolean;
  lastUpdate: Date | null;
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
}

const REFRESH_INTERVAL = 60000; // 60 segundos

// Fallbacks de referência
const FALLBACK_RATES: ExchangeRates = {
  USDBRL: 5.31,
  EURBRL: 6.10,
  GBPBRL: 7.10,
  MYRBRL: 1.20,
  MXNBRL: 0.26,
  ARSBRL: 0.005,
  COPBRL: 0.0013
};

/**
 * Mapeia a fonte retornada pela edge function para o tipo CotacaoSourceInfo
 * Nova hierarquia: FastForex (primário) → PTAX (fallback USD/EUR/GBP) → Hardcoded
 */
function parseSource(rawSource: string): CotacaoSourceInfo {
  const source = rawSource?.toUpperCase() || '';
  
  // FastForex (fonte primária para TODAS as moedas)
  if (source === 'FASTFOREX' || source === 'FASTFOREX_CACHE') {
    return {
      source: source.includes('CACHE') ? 'FASTFOREX_CACHE' : 'FASTFOREX',
      label: 'FastForex',
      isOfficial: true,
      isFallback: false,
      isPtaxFallback: false
    };
  }
  
  // PTAX como fallback (apenas USD, EUR, GBP quando FastForex indisponível)
  if (source === 'PTAX_FALLBACK' || source === 'PTAX_FALLBACK_CACHE') {
    return {
      source: source.includes('CACHE') ? 'PTAX_FALLBACK_CACHE' : 'PTAX_FALLBACK',
      label: 'PTAX (fallback)',
      isOfficial: true,
      isFallback: false,
      isPtaxFallback: true
    };
  }
  
  // Fallback hardcoded quando nenhuma fonte disponível
  if (source === 'FALLBACK' || source === 'FALLBACK_ERRO') {
    return {
      source: 'FALLBACK',
      label: 'Fallback',
      isOfficial: false,
      isFallback: true,
      isPtaxFallback: false
    };
  }
  
  // Indisponível
  return {
    source: 'INDISPONIVEL',
    label: 'Indisponível',
    isOfficial: false,
    isFallback: true,
    isPtaxFallback: false
  };
}

const defaultSourceInfo: CotacaoSourceInfo = {
  source: 'FALLBACK',
  label: 'Carregando...',
  isOfficial: false,
  isFallback: true,
  isPtaxFallback: false
};

export function useCotacoes(cryptoSymbols: string[] = []) {
  const [state, setState] = useState<CotacoesState>({
    cotacaoUSD: FALLBACK_RATES.USDBRL,
    cotacaoEUR: FALLBACK_RATES.EURBRL,
    cotacaoGBP: FALLBACK_RATES.GBPBRL,
    cotacaoMYR: FALLBACK_RATES.MYRBRL,
    cotacaoMXN: FALLBACK_RATES.MXNBRL,
    cotacaoARS: FALLBACK_RATES.ARSBRL,
    cotacaoCOP: FALLBACK_RATES.COPBRL,
    cryptoPrices: {},
    loading: true,
    lastUpdate: null,
    sources: {
      usd: defaultSourceInfo,
      eur: defaultSourceInfo,
      gbp: defaultSourceInfo,
      myr: defaultSourceInfo,
      mxn: defaultSourceInfo,
      ars: defaultSourceInfo,
      cop: defaultSourceInfo,
      crypto: "fallback"
    }
  });

  const fetchExchangeRate = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-exchange-rates");
      if (error) throw error;
      
      const newState: Partial<CotacoesState> = {};
      
      // sources contém informação detalhada por moeda vinda da edge function
      const rawSources = data?.sources || {};
      
      // Processar USD, EUR, GBP (fonte primária: PTAX)
      if (data?.USDBRL) {
        newState.cotacaoUSD = data.USDBRL;
      }
      if (data?.EURBRL) {
        newState.cotacaoEUR = data.EURBRL;
      }
      if (data?.GBPBRL) {
        newState.cotacaoGBP = data.GBPBRL;
      }
      
      // Processar MYR, MXN, ARS, COP (fonte primária: FastForex)
      if (data?.MYRBRL !== null && data?.MYRBRL !== undefined) {
        newState.cotacaoMYR = data.MYRBRL;
      }
      if (data?.MXNBRL !== null && data?.MXNBRL !== undefined) {
        newState.cotacaoMXN = data.MXNBRL;
      }
      if (data?.ARSBRL !== null && data?.ARSBRL !== undefined) {
        newState.cotacaoARS = data.ARSBRL;
      }
      if (data?.COPBRL !== null && data?.COPBRL !== undefined) {
        newState.cotacaoCOP = data.COPBRL;
      }
      
      // Parsear sources - agora TODAS usam FastForex como primário
      const newSources = {
        usd: parseSource(rawSources.USD),
        eur: parseSource(rawSources.EUR),
        gbp: parseSource(rawSources.GBP),
        myr: parseSource(rawSources.MYR),
        mxn: parseSource(rawSources.MXN),
        ars: parseSource(rawSources.ARS),
        cop: parseSource(rawSources.COP),
        crypto: state.sources.crypto
      };
      
      setState(prev => ({
        ...prev,
        ...newState,
        sources: newSources
      }));
      
      console.log("Cotações atualizadas:", {
        USD: { value: data?.USDBRL, source: rawSources.USD },
        EUR: { value: data?.EURBRL, source: rawSources.EUR },
        GBP: { value: data?.GBPBRL, source: rawSources.GBP },
        MYR: { value: data?.MYRBRL, source: rawSources.MYR },
        MXN: { value: data?.MXNBRL, source: rawSources.MXN },
        ARS: { value: data?.ARSBRL, source: rawSources.ARS },
        COP: { value: data?.COPBRL, source: rawSources.COP },
      });
    } catch (error) {
      console.error("Erro ao buscar cotações:", error);
    }
  }, []);

  const fetchCryptoPrices = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    try {
      const { data, error } = await supabase.functions.invoke("get-crypto-prices", {
        body: { symbols }
      });
      if (error) throw error;
      if (data?.prices) {
        setState(prev => ({
          ...prev,
          cryptoPrices: data.prices,
          sources: { ...prev.sources, crypto: "Binance" }
        }));
        console.log("Cotações crypto atualizadas:", data.prices);
      }
    } catch (error) {
      console.error("Erro ao buscar cotações crypto:", error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    await Promise.all([
      fetchExchangeRate(),
      cryptoSymbols.length > 0 ? fetchCryptoPrices(cryptoSymbols) : Promise.resolve()
    ]);
    setState(prev => ({ ...prev, loading: false, lastUpdate: new Date() }));
  }, [fetchExchangeRate, fetchCryptoPrices, cryptoSymbols]);

  // Buscar cotações na montagem
  useEffect(() => {
    refreshAll();
  }, []);

  // Atualizar crypto prices quando symbols mudam
  useEffect(() => {
    if (cryptoSymbols.length > 0) {
      fetchCryptoPrices(cryptoSymbols);
    }
  }, [cryptoSymbols.join(",")]);

  // Auto-refresh a cada intervalo
  useEffect(() => {
    const interval = setInterval(refreshAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Funções utilitárias
  const convertUSDtoBRL = useCallback((usd: number) => {
    return usd * state.cotacaoUSD;
  }, [state.cotacaoUSD]);

  const convertBRLtoUSD = useCallback((brl: number) => {
    return brl / state.cotacaoUSD;
  }, [state.cotacaoUSD]);

  const convertToBRL = useCallback((valor: number, moeda: string): number => {
    const moedaUpper = moeda.toUpperCase();
    switch (moedaUpper) {
      case "BRL": return valor;
      case "USD": return valor * state.cotacaoUSD;
      case "EUR": return valor * state.cotacaoEUR;
      case "GBP": return valor * state.cotacaoGBP;
      case "MYR": return valor * state.cotacaoMYR;
      case "MXN": return valor * state.cotacaoMXN;
      case "ARS": return valor * state.cotacaoARS;
      case "COP": return valor * state.cotacaoCOP;
      default: return valor;
    }
  }, [state.cotacaoUSD, state.cotacaoEUR, state.cotacaoGBP, state.cotacaoMYR, state.cotacaoMXN, state.cotacaoARS, state.cotacaoCOP]);

  const getRate = useCallback((moeda: string): number => {
    const moedaUpper = moeda.toUpperCase();
    switch (moedaUpper) {
      case "USD": return state.cotacaoUSD;
      case "EUR": return state.cotacaoEUR;
      case "GBP": return state.cotacaoGBP;
      case "MYR": return state.cotacaoMYR;
      case "MXN": return state.cotacaoMXN;
      case "ARS": return state.cotacaoARS;
      case "COP": return state.cotacaoCOP;
      case "BRL": return 1;
      default: return 1;
    }
  }, [state.cotacaoUSD, state.cotacaoEUR, state.cotacaoGBP, state.cotacaoMYR, state.cotacaoMXN, state.cotacaoARS, state.cotacaoCOP]);

  const getCryptoUSDValue = useCallback((coin: string, quantity: number, fallbackUSD?: number) => {
    const price = state.cryptoPrices[coin];
    if (price) return quantity * price;
    return fallbackUSD ?? 0;
  }, [state.cryptoPrices]);

  const getCryptoPrice = useCallback((coin: string) => {
    return state.cryptoPrices[coin] ?? null;
  }, [state.cryptoPrices]);

  // Objeto com todas as cotações para acesso direto
  const rates: ExchangeRates = {
    USDBRL: state.cotacaoUSD,
    EURBRL: state.cotacaoEUR,
    GBPBRL: state.cotacaoGBP,
    MYRBRL: state.cotacaoMYR,
    MXNBRL: state.cotacaoMXN,
    ARSBRL: state.cotacaoARS,
    COPBRL: state.cotacaoCOP
  };

  // Compatibilidade com código legado - mapear sources para source
  const sources = state.sources;
  const source = {
    usd: sources?.usd?.label ?? 'fallback',
    eur: sources?.eur?.label ?? 'fallback',
    gbp: sources?.gbp?.label ?? 'fallback',
    myr: sources?.myr?.label ?? 'fallback',
    mxn: sources?.mxn?.label ?? 'fallback',
    ars: sources?.ars?.label ?? 'fallback',
    cop: sources?.cop?.label ?? 'fallback',
    crypto: sources?.crypto ?? 'fallback'
  };

  return {
    ...state,
    rates,
    source, // Compatibilidade legado
    sources: state.sources, // Novo formato com mais detalhes
    refreshAll,
    convertUSDtoBRL,
    convertBRLtoUSD,
    convertToBRL,
    getRate,
    getCryptoUSDValue,
    getCryptoPrice
  };
}
