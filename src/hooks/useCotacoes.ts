import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ExchangeRates {
  USDBRL: number;
  EURBRL: number;
  GBPBRL: number;
}

interface CotacoesState {
  cotacaoUSD: number;
  cotacaoEUR: number;
  cotacaoGBP: number;
  cryptoPrices: Record<string, number>;
  loading: boolean;
  lastUpdate: Date | null;
  source: {
    usd: string;
    eur: string;
    gbp: string;
    crypto: string;
  };
}

const REFRESH_INTERVAL = 60000; // 60 segundos

// Fallbacks de referência
const FALLBACK_RATES: ExchangeRates = {
  USDBRL: 5.31,
  EURBRL: 6.10,
  GBPBRL: 7.10
};

export function useCotacoes(cryptoSymbols: string[] = []) {
  const [state, setState] = useState<CotacoesState>({
    cotacaoUSD: FALLBACK_RATES.USDBRL,
    cotacaoEUR: FALLBACK_RATES.EURBRL,
    cotacaoGBP: FALLBACK_RATES.GBPBRL,
    cryptoPrices: {},
    loading: true,
    lastUpdate: null,
    source: {
      usd: "fallback",
      eur: "fallback",
      gbp: "fallback",
      crypto: "fallback"
    }
  });

  const fetchExchangeRate = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-exchange-rates");
      if (error) throw error;
      
      const newState: Partial<CotacoesState> = {};
      const newSource = { ...state.source };
      
      if (data?.USDBRL) {
        newState.cotacaoUSD = data.USDBRL;
        newSource.usd = data.source || "BCB";
      }
      if (data?.EURBRL) {
        newState.cotacaoEUR = data.EURBRL;
        newSource.eur = data.partial && !data.EURBRL ? "fallback" : (data.source || "BCB");
      }
      if (data?.GBPBRL) {
        newState.cotacaoGBP = data.GBPBRL;
        newSource.gbp = data.partial && !data.GBPBRL ? "fallback" : (data.source || "BCB");
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
      default: return valor; // Moeda desconhecida, retorna sem conversão
    }
  }, [state.cotacaoUSD, state.cotacaoEUR, state.cotacaoGBP]);

  const getRate = useCallback((moeda: string): number => {
    const moedaUpper = moeda.toUpperCase();
    switch (moedaUpper) {
      case "USD": return state.cotacaoUSD;
      case "EUR": return state.cotacaoEUR;
      case "GBP": return state.cotacaoGBP;
      case "BRL": return 1;
      default: return 1;
    }
  }, [state.cotacaoUSD, state.cotacaoEUR, state.cotacaoGBP]);

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
    GBPBRL: state.cotacaoGBP
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
