/**
 * Hook standalone para formatação de moeda baseada na configuração do projeto
 * 
 * REGRA SUPREMA: A moeda do PROJETO governa TODA a visualização financeira.
 * 
 * Se projeto = USD: tudo em $
 * Se projeto = BRL: tudo em R$
 * 
 * Nenhum componente decide moeda localmente.
 */

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "./useCotacoes";
import { CURRENCY_SYMBOLS, type SupportedCurrency } from "@/types/currency";
import type { MoedaConsolidacao, FonteCotacao } from "@/types/projeto";

interface FormatOptions {
  decimals?: number;
  compact?: boolean;
  showSymbol?: boolean;
}

export interface ProjectCurrencyReturn {
  // Formatação - SEMPRE na moeda do projeto
  formatCurrency: (valor: number, options?: FormatOptions) => string;
  formatCurrencyWithSign: (valor: number, options?: FormatOptions) => string;
  
  // Conversão para moeda de consolidação
  convertToConsolidation: (valor: number, moedaOrigem: string) => number;
  
  // Utilitários
  getSymbol: () => string;
  getMoeda: () => MoedaConsolidacao;
  
  // Estado
  isLoading: boolean;
  moedaConsolidacao: MoedaConsolidacao;
  cotacaoAtual: number;
}

/**
 * Hook principal para formatação baseada no projeto
 */
export function useProjetoCurrency(projetoId: string | undefined): ProjectCurrencyReturn {
  const { cotacaoUSD, loading: loadingCotacao } = useCotacoes();

  // Buscar configuração do projeto
  const { data: projetoConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ["projeto-currency-config", projetoId],
    queryFn: async () => {
      if (!projetoId) return null;
      
      const { data, error } = await supabase
        .from("projetos")
        .select("moeda_consolidacao, cotacao_trabalho, fonte_cotacao")
        .eq("id", projetoId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!projetoId,
    staleTime: 30000,
  });

  const moedaConsolidacao = (projetoConfig?.moeda_consolidacao as MoedaConsolidacao) || "USD";
  const fonteCotacao = (projetoConfig?.fonte_cotacao as FonteCotacao) || "TRABALHO";
  const cotacaoTrabalho = projetoConfig?.cotacao_trabalho || null;
  
  const cotacaoAtual = useMemo(() => {
    if (fonteCotacao === "TRABALHO" && cotacaoTrabalho) {
      return cotacaoTrabalho;
    }
    return cotacaoUSD;
  }, [fonteCotacao, cotacaoTrabalho, cotacaoUSD]);

  // Símbolo da moeda do projeto
  const getSymbol = useCallback((): string => {
    return CURRENCY_SYMBOLS[moedaConsolidacao as SupportedCurrency] || moedaConsolidacao;
  }, [moedaConsolidacao]);

  // Moeda atual do projeto
  const getMoeda = useCallback((): MoedaConsolidacao => moedaConsolidacao, [moedaConsolidacao]);

  // Converter valor de qualquer moeda para a moeda de consolidação
  const convertToConsolidation = useCallback((valor: number, moedaOrigem: string): number => {
    if (!valor || isNaN(valor)) return 0;
    if (moedaOrigem === moedaConsolidacao) {
      return valor;
    }

    // BRL -> USD
    if (moedaOrigem === "BRL" && moedaConsolidacao === "USD") {
      return valor / cotacaoAtual;
    }

    // USD -> BRL
    if (moedaOrigem === "USD" && moedaConsolidacao === "BRL") {
      return valor * cotacaoAtual;
    }

    // EUR -> moeda de consolidação
    if (moedaOrigem === "EUR") {
      const eurToBrl = cotacaoAtual * 1.08; // EUR geralmente ~8% maior que USD
      if (moedaConsolidacao === "BRL") {
        return valor * eurToBrl;
      }
      return valor * 1.08; // EUR para USD
    }

    // GBP -> moeda de consolidação  
    if (moedaOrigem === "GBP") {
      const gbpToBrl = cotacaoAtual * 1.27;
      if (moedaConsolidacao === "BRL") {
        return valor * gbpToBrl;
      }
      return valor * 1.27; // GBP para USD
    }

    // Crypto (USDT, USDC, etc - assumindo paridade 1:1 com USD)
    if (["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL", "MATIC", "ADA"].includes(moedaOrigem)) {
      if (moedaConsolidacao === "USD") {
        return valor; // Crypto já está em USD-equivalent
      }
      return valor * cotacaoAtual; // Crypto -> BRL
    }

    return valor;
  }, [moedaConsolidacao, cotacaoAtual]);

  // Formatar valor NA MOEDA DO PROJETO
  const formatCurrency = useCallback((valor: number, options?: FormatOptions): string => {
    const { decimals = 2, compact = false, showSymbol = true } = options || {};
    const symbol = getSymbol();
    const safeValor = valor || 0;
    
    let formatted: string;
    
    if (compact && Math.abs(safeValor) >= 1000) {
      if (Math.abs(safeValor) >= 1000000) {
        formatted = (safeValor / 1000000).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + "M";
      } else {
        formatted = (safeValor / 1000).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + "K";
      }
    } else {
      formatted = safeValor.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    
    return showSymbol ? `${symbol} ${formatted}` : formatted;
  }, [getSymbol]);

  // Formatar com sinal (+/-)
  const formatCurrencyWithSign = useCallback((valor: number, options?: FormatOptions): string => {
    const { decimals = 2, compact = false, showSymbol = true } = options || {};
    const symbol = getSymbol();
    const safeValor = valor || 0;
    const sign = safeValor >= 0 ? "+" : "-";
    const absValor = Math.abs(safeValor);
    
    let formatted: string;
    
    if (compact && absValor >= 1000) {
      if (absValor >= 1000000) {
        formatted = (absValor / 1000000).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + "M";
      } else {
        formatted = (absValor / 1000).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + "K";
      }
    } else {
      formatted = absValor.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    
    return showSymbol ? `${sign}${symbol} ${formatted}` : `${sign}${formatted}`;
  }, [getSymbol]);

  return {
    formatCurrency,
    formatCurrencyWithSign,
    convertToConsolidation,
    getSymbol,
    getMoeda,
    isLoading: loadingConfig || loadingCotacao,
    moedaConsolidacao,
    cotacaoAtual,
  };
}

/**
 * Versão simplificada para uso rápido em componentes
 */
export function useFormatProjetoCurrency(projetoId: string | undefined) {
  const { formatCurrency, formatCurrencyWithSign, isLoading, moedaConsolidacao, getSymbol } = useProjetoCurrency(projetoId);
  
  return {
    format: formatCurrency,
    formatWithSign: formatCurrencyWithSign,
    isLoading,
    moeda: moedaConsolidacao,
    symbol: getSymbol(),
  };
}
