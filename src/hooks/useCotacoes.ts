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
    source: {
      usd: "fallback",
      eur: "fallback",
      gbp: "fallback",
      myr: "fallback",
      mxn: "fallback",
      ars: "fallback",
      cop: "fallback",
      crypto: "fallback"
    }
  });

  const fetchExchangeRate = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-exchange-rates");
      if (error) throw error;
      
      const newState: Partial<CotacoesState> = {};
      const newSource = { ...state.source };
      const sourceInfo = data?.source || "BCB";
      const failedCurrencies = data?.failedCurrencies || [];
      
      if (data?.USDBRL) {
        newState.cotacaoUSD = data.USDBRL;
        newSource.usd = failedCurrencies.includes('USD') ? 'fallback' : sourceInfo;
      }
      if (data?.EURBRL) {
        newState.cotacaoEUR = data.EURBRL;
        newSource.eur = failedCurrencies.includes('EUR') ? 'fallback' : sourceInfo;
      }
      if (data?.GBPBRL) {
        newState.cotacaoGBP = data.GBPBRL;
        newSource.gbp = failedCurrencies.includes('GBP') ? 'fallback' : sourceInfo;
      }
      if (data?.MYRBRL) {
        newState.cotacaoMYR = data.MYRBRL;
        newSource.myr = failedCurrencies.includes('MYR') ? 'fallback' : sourceInfo;
      }
      if (data?.MXNBRL) {
        newState.cotacaoMXN = data.MXNBRL;
        newSource.mxn = failedCurrencies.includes('MXN') ? 'fallback' : sourceInfo;
      }
      if (data?.ARSBRL) {
        newState.cotacaoARS = data.ARSBRL;
        newSource.ars = failedCurrencies.includes('ARS') ? 'fallback' : sourceInfo;
      }
      if (data?.COPBRL) {
        newState.cotacaoCOP = data.COPBRL;
        newSource.cop = failedCurrencies.includes('COP') ? 'fallback' : sourceInfo;
      }
      
      setState(prev => ({
        ...prev,
        ...newState,
        source: newSource
      }));
      
      console.log("Cotações atualizadas:", {
        USD: data?.USDBRL,
        EUR: data?.EURBRL,
        GBP: data?.GBPBRL,
        MYR: data?.MYRBRL,
        MXN: data?.MXNBRL,
        ARS: data?.ARSBRL,
        COP: data?.COPBRL,
        source: data?.source
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
          source: { ...prev.source, crypto: "Binance" }
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
      default: return valor; // Moeda desconhecida, retorna sem conversão
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

  return {
    ...state,
    rates,
    refreshAll,
    convertUSDtoBRL,
    convertBRLtoUSD,
    convertToBRL,
    getRate,
    getCryptoUSDValue,
    getCryptoPrice
  };
}
