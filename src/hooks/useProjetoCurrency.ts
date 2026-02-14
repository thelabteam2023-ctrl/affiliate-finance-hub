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

interface ChartAxisFormatOptions {
  /** Força abreviação (K/M) mesmo para valores pequenos */
  forceCompact?: boolean;
  /** Número de decimais para valores abreviados (default: 0 para valores inteiros, 1 para decimais) */
  decimals?: number;
}

export interface ProjectCurrencyReturn {
  // Formatação - SEMPRE na moeda do projeto
  formatCurrency: (valor: number, options?: FormatOptions) => string;
  formatCurrencyWithSign: (valor: number, options?: FormatOptions) => string;
  
  /**
   * Formatação compacta para eixos de gráficos
   * Garante símbolo + valor SEMPRE juntos, usando abreviações inteligentes
   * Ex: "R$4k", "R$2.5k", "R$1.2M", "$150"
   */
  formatChartAxis: (valor: number, options?: ChartAxisFormatOptions) => string;
  
  /** Conversão usando cotação ativa (Trabalho se configurada, senão Oficial).
   *  Ideal para CALCULADORAS e FORMULÁRIOS. */
  convertToConsolidation: (valor: number, moedaOrigem: string) => number;
  
  /** Conversão usando SEMPRE a cotação oficial (FastForex), ignorando cotação de trabalho.
   *  Ideal para KPIs, Dashboards e Relatórios analíticos. */
  convertToConsolidationOficial: (valor: number, moedaOrigem: string) => number;
  
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
  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, loading: loadingCotacao } = useCotacoes();

  // Buscar configuração do projeto - SINCRONIZADO COM useProjetoConsolidacao
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
      
      console.log("[useProjetoCurrency] Config carregada:", data);
      return data;
    },
    enabled: !!projetoId,
    staleTime: 0, // Sempre buscar dados frescos após invalidação
  });

  // CRÍTICO: Usar valor do banco SEM fallback para USD
  // O banco tem default 'USD', então null significa problema
  const moedaConsolidacao = (projetoConfig?.moeda_consolidacao as MoedaConsolidacao) ?? "BRL";
  const fonteCotacao = (projetoConfig?.fonte_cotacao as FonteCotacao) ?? "TRABALHO";
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

  // Função interna de conversão parametrizada pela cotação USD a usar
  const _convert = useCallback((valor: number, moedaOrigem: string, cotacaoUsdToUse: number): number => {
    if (!valor || isNaN(valor)) return 0;
    if (moedaOrigem === moedaConsolidacao) {
      return valor;
    }

    // BRL -> USD
    if (moedaOrigem === "BRL" && moedaConsolidacao === "USD") {
      return valor / cotacaoUsdToUse;
    }

    // USD -> BRL
    if (moedaOrigem === "USD" && moedaConsolidacao === "BRL") {
      return valor * cotacaoUsdToUse;
    }

    // EUR -> moeda de consolidação
    if (moedaOrigem === "EUR") {
      if (moedaConsolidacao === "BRL") {
        return valor * cotacaoEUR;
      }
      return valor * (cotacaoEUR / cotacaoUsdToUse);
    }

    // GBP -> moeda de consolidação  
    if (moedaOrigem === "GBP") {
      if (moedaConsolidacao === "BRL") {
        return valor * cotacaoGBP;
      }
      return valor * (cotacaoGBP / cotacaoUsdToUse);
    }

    // Crypto (USDT, USDC, etc - assumindo paridade 1:1 com USD)
    if (["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL", "MATIC", "ADA"].includes(moedaOrigem)) {
      if (moedaConsolidacao === "USD") {
        return valor; // Crypto já está em USD-equivalent
      }
      return valor * cotacaoUsdToUse; // Crypto -> BRL
    }

    return valor;
  }, [moedaConsolidacao, cotacaoEUR, cotacaoGBP]);

  // Converter usando cotação ativa (Trabalho se configurada, senão Oficial)
  // Ideal para CALCULADORAS e FORMULÁRIOS
  const convertToConsolidation = useCallback((valor: number, moedaOrigem: string): number => {
    return _convert(valor, moedaOrigem, cotacaoAtual);
  }, [_convert, cotacaoAtual]);

  // Converter usando SEMPRE cotação oficial (FastForex)
  // Ideal para KPIs, Dashboards e Relatórios
  const convertToConsolidationOficial = useCallback((valor: number, moedaOrigem: string): number => {
    return _convert(valor, moedaOrigem, cotacaoUSD);
  }, [_convert, cotacaoUSD]);

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

  /**
   * Formatação compacta para eixos de gráficos
   * REGRA DE OURO: Símbolo NUNCA se separa do número
   * 
   * Formato: R$4k, R$2,5k, R$1,2M, $150, -R$2k
   * - Sem espaço entre símbolo e valor
   * - Abreviação inteligente (k, M)
   * - Sinal negativo antes do símbolo
   */
  const formatChartAxis = useCallback((valor: number, options?: ChartAxisFormatOptions): string => {
    const { forceCompact = false, decimals } = options || {};
    const symbol = getSymbol();
    const safeValor = valor || 0;
    const absValor = Math.abs(safeValor);
    const isNegative = safeValor < 0;
    const prefix = isNegative ? "-" : "";
    
    let formatted: string;
    
    // Valores >= 1M: sempre abreviar com M
    if (absValor >= 1000000) {
      const value = absValor / 1000000;
      const dec = decimals ?? (value % 1 === 0 ? 0 : 1);
      formatted = value.toLocaleString("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }) + "M";
    }
    // Valores >= 1K: abreviar com k
    else if (absValor >= 1000 || forceCompact) {
      const value = absValor / 1000;
      const dec = decimals ?? (value % 1 === 0 ? 0 : 1);
      formatted = value.toLocaleString("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }) + "k";
    }
    // Valores < 1K: sem abreviação, sem decimais para eixos
    else {
      const dec = decimals ?? 0;
      formatted = absValor.toLocaleString("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });
    }
    
    // CRÍTICO: Sem espaço entre símbolo e valor para evitar quebra
    return `${prefix}${symbol}${formatted}`;
  }, [getSymbol]);

  return {
    formatCurrency,
    formatCurrencyWithSign,
    formatChartAxis,
    convertToConsolidation,
    convertToConsolidationOficial,
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
  const { formatCurrency, formatCurrencyWithSign, formatChartAxis, isLoading, moedaConsolidacao, getSymbol } = useProjetoCurrency(projetoId);
  
  return {
    format: formatCurrency,
    formatWithSign: formatCurrencyWithSign,
    formatAxis: formatChartAxis,
    isLoading,
    moeda: moedaConsolidacao,
    symbol: getSymbol(),
  };
}
