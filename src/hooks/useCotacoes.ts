import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CotacoesState {
  cotacaoUSD: number;
  cryptoPrices: Record<string, number>;
  loading: boolean;
  lastUpdate: Date | null;
  source: {
    usd: string;
    crypto: string;
  };
}

const REFRESH_INTERVAL = 60000; // 60 segundos

export function useCotacoes(cryptoSymbols: string[] = []) {
  const [state, setState] = useState<CotacoesState>({
    cotacaoUSD: 5.31, // Fallback
    cryptoPrices: {},
    loading: true,
    lastUpdate: null,
    source: {
      usd: "fallback",
      crypto: "fallback"
    }
  });

  const fetchExchangeRate = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-exchange-rates");
      if (error) throw error;
      if (data?.USDBRL) {
        setState(prev => ({
          ...prev,
          cotacaoUSD: data.USDBRL,
          source: { ...prev.source, usd: data.source || "BCB" }
        }));
        console.log("Cotação USD/BRL atualizada:", data.USDBRL, "- Fonte:", data.source);
      }
    } catch (error) {
      console.error("Erro ao buscar cotação USD/BRL:", error);
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

  const getCryptoUSDValue = useCallback((coin: string, quantity: number, fallbackUSD?: number) => {
    const price = state.cryptoPrices[coin];
    if (price) return quantity * price;
    return fallbackUSD ?? 0;
  }, [state.cryptoPrices]);

  const getCryptoPrice = useCallback((coin: string) => {
    return state.cryptoPrices[coin] ?? null;
  }, [state.cryptoPrices]);

  return {
    ...state,
    refreshAll,
    convertUSDtoBRL,
    convertBRLtoUSD,
    getCryptoUSDValue,
    getCryptoPrice
  };
}
