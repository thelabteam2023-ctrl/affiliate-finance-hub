/**
 * Hook Centralizado de Multi-Moeda
 * 
 * PRINCÍPIO FUNDAMENTAL:
 * - Moeda de execução: sempre a moeda da CASA (bookmaker.moeda)
 * - Moeda de controle: sempre BRL
 * - Conversão é apenas para REFERÊNCIA, nunca para execução
 * - Snapshots nunca são recalculados após registro
 */

import { useCallback, useMemo } from "react";
import { useCotacoes } from "./useCotacoes";

// Tipos suportados de moeda
export type SupportedCurrency = "BRL" | "USD" | "USDT" | "EUR" | "GBP";

// Moedas que requerem conversão (não-BRL)
export const FOREIGN_CURRENCIES: SupportedCurrency[] = ["USD", "USDT", "EUR", "GBP"];

// Interface para snapshot de conversão
export interface CurrencySnapshot {
  moeda_origem: SupportedCurrency;
  moeda_referencia: "BRL";
  cotacao: number;
  cotacao_at: string; // ISO timestamp
  valor_original: number;
  valor_brl_referencia: number;
}

// Interface para exibição de valor multi-moeda
export interface MultiCurrencyDisplay {
  valorOriginal: number;
  moedaOriginal: SupportedCurrency;
  valorBRLReferencia: number | null;
  cotacao: number | null;
  cotacaoAt: string | null;
  isForeignCurrency: boolean;
}

// Props do hook
interface UseCurrencySnapshotProps {
  cryptoSymbols?: string[];
}

export function useCurrencySnapshot(props?: UseCurrencySnapshotProps) {
  const { cryptoSymbols = [] } = props || {};
  
  const { 
    cotacaoUSD, 
    cryptoPrices, 
    loading, 
    lastUpdate, 
    source,
    refreshAll 
  } = useCotacoes(cryptoSymbols);

  /**
   * Verifica se uma moeda requer conversão para BRL
   */
  const isForeignCurrency = useCallback((moeda: string): boolean => {
    return moeda !== "BRL";
  }, []);

  /**
   * Obtém a cotação atual para uma moeda específica
   * Retorna a taxa de conversão: 1 [moeda] = X BRL
   */
  const getCurrentRate = useCallback((moeda: SupportedCurrency): number => {
    switch (moeda) {
      case "BRL":
        return 1;
      case "USD":
      case "USDT":
        return cotacaoUSD;
      case "EUR":
        // EUR aproximado (EUR ~= 1.08 * USD)
        return cotacaoUSD * 1.08;
      case "GBP":
        // GBP aproximado (GBP ~= 1.27 * USD)
        return cotacaoUSD * 1.27;
      default:
        return cotacaoUSD; // Fallback para USD
    }
  }, [cotacaoUSD]);

  /**
   * Cria um snapshot de conversão imutável
   * IMPORTANTE: Este snapshot NUNCA deve ser recalculado após criação
   */
  const createSnapshot = useCallback((
    valor: number,
    moeda: SupportedCurrency
  ): CurrencySnapshot => {
    const cotacao = getCurrentRate(moeda);
    const now = new Date().toISOString();
    
    return {
      moeda_origem: moeda,
      moeda_referencia: "BRL",
      cotacao,
      cotacao_at: now,
      valor_original: valor,
      valor_brl_referencia: moeda === "BRL" ? valor : valor * cotacao,
    };
  }, [getCurrentRate]);

  /**
   * Converte um valor para BRL usando a cotação ATUAL
   * ATENÇÃO: Usar apenas para exibição momentânea, não para registro!
   */
  const convertToBRL = useCallback((
    valor: number,
    moeda: SupportedCurrency
  ): number => {
    if (moeda === "BRL") return valor;
    return valor * getCurrentRate(moeda);
  }, [getCurrentRate]);

  /**
   * Converte um valor de BRL para outra moeda
   */
  const convertFromBRL = useCallback((
    valorBRL: number,
    moedaDestino: SupportedCurrency
  ): number => {
    if (moedaDestino === "BRL") return valorBRL;
    const rate = getCurrentRate(moedaDestino);
    return rate > 0 ? valorBRL / rate : 0;
  }, [getCurrentRate]);

  /**
   * Prepara dados para exibição multi-moeda
   * Aceita valores originais com ou sem snapshot prévio
   */
  const prepareDisplay = useCallback((
    valorOriginal: number,
    moedaOriginal: SupportedCurrency,
    snapshotExistente?: {
      cotacao?: number | null;
      cotacao_at?: string | null;
      valor_brl_referencia?: number | null;
    }
  ): MultiCurrencyDisplay => {
    const isForeign = isForeignCurrency(moedaOriginal);
    
    // Se já tem snapshot, usa ele (IMUTÁVEL)
    if (snapshotExistente?.cotacao && snapshotExistente?.valor_brl_referencia) {
      return {
        valorOriginal,
        moedaOriginal,
        valorBRLReferencia: snapshotExistente.valor_brl_referencia,
        cotacao: snapshotExistente.cotacao,
        cotacaoAt: snapshotExistente.cotacao_at || null,
        isForeignCurrency: isForeign,
      };
    }
    
    // Se não tem snapshot e é moeda estrangeira, calcula com cotação atual
    // (isso deve ser usado apenas para exibição, não para registro)
    if (isForeign) {
      return {
        valorOriginal,
        moedaOriginal,
        valorBRLReferencia: convertToBRL(valorOriginal, moedaOriginal),
        cotacao: getCurrentRate(moedaOriginal),
        cotacaoAt: null, // Indica que é cotação atual, não snapshot
        isForeignCurrency: true,
      };
    }
    
    // BRL não precisa de conversão
    return {
      valorOriginal,
      moedaOriginal,
      valorBRLReferencia: valorOriginal,
      cotacao: 1,
      cotacaoAt: null,
      isForeignCurrency: false,
    };
  }, [isForeignCurrency, convertToBRL, getCurrentRate]);

  /**
   * Retorna os campos de snapshot para inserção no banco
   */
  const getSnapshotFields = useCallback((
    valor: number,
    moeda: SupportedCurrency
  ): {
    moeda_operacao: SupportedCurrency;
    cotacao_snapshot: number | null;
    cotacao_snapshot_at: string | null;
    valor_brl_referencia: number | null;
  } => {
    if (moeda === "BRL") {
      return {
        moeda_operacao: "BRL",
        cotacao_snapshot: null,
        cotacao_snapshot_at: null,
        valor_brl_referencia: valor,
      };
    }
    
    const snapshot = createSnapshot(valor, moeda);
    return {
      moeda_operacao: moeda,
      cotacao_snapshot: snapshot.cotacao,
      cotacao_snapshot_at: snapshot.cotacao_at,
      valor_brl_referencia: snapshot.valor_brl_referencia,
    };
  }, [createSnapshot]);

  /**
   * Formata um valor com símbolo de moeda
   */
  const formatCurrency = useCallback((
    valor: number,
    moeda: SupportedCurrency,
    options?: {
      showSymbol?: boolean;
      decimals?: number;
    }
  ): string => {
    const { showSymbol = true, decimals = 2 } = options || {};
    
    const symbols: Record<SupportedCurrency, string> = {
      BRL: "R$",
      USD: "$",
      USDT: "USDT",
      EUR: "€",
      GBP: "£",
    };
    
    const formatted = valor.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    
    return showSymbol ? `${symbols[moeda]} ${formatted}` : formatted;
  }, []);

  /**
   * Formata exibição completa com moeda original + referência BRL
   */
  const formatWithReference = useCallback((
    display: MultiCurrencyDisplay
  ): {
    primary: string;
    reference: string | null;
    cotacaoInfo: string | null;
  } => {
    const primary = formatCurrency(display.valorOriginal, display.moedaOriginal);
    
    if (!display.isForeignCurrency || display.valorBRLReferencia === null) {
      return { primary, reference: null, cotacaoInfo: null };
    }
    
    const reference = formatCurrency(display.valorBRLReferencia, "BRL");
    
    let cotacaoInfo: string | null = null;
    if (display.cotacao) {
      const cotacaoFormatted = display.cotacao.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
      
      if (display.cotacaoAt) {
        const date = new Date(display.cotacaoAt);
        const dateFormatted = date.toLocaleDateString("pt-BR");
        cotacaoInfo = `Cotação (${dateFormatted}): ${cotacaoFormatted}`;
      } else {
        cotacaoInfo = `Cotação atual: ${cotacaoFormatted}`;
      }
    }
    
    return { primary, reference, cotacaoInfo };
  }, [formatCurrency]);

  /**
   * Consolida valores de múltiplas moedas em BRL
   * Usa snapshots quando disponíveis, cotação atual caso contrário
   */
  const consolidateToBRL = useCallback((
    items: Array<{
      valor: number;
      moeda: SupportedCurrency;
      snapshotBRL?: number | null;
    }>
  ): number => {
    return items.reduce((total, item) => {
      // Prioriza snapshot se disponível
      if (item.snapshotBRL !== undefined && item.snapshotBRL !== null) {
        return total + item.snapshotBRL;
      }
      // Fallback para conversão atual
      return total + convertToBRL(item.valor, item.moeda);
    }, 0);
  }, [convertToBRL]);

  // Memoized currency info
  const currencyInfo = useMemo(() => ({
    currentUSDRate: cotacaoUSD,
    lastUpdate,
    source,
    loading,
  }), [cotacaoUSD, lastUpdate, source, loading]);

  return {
    // Estado
    loading,
    currencyInfo,
    
    // Funções de verificação
    isForeignCurrency,
    
    // Funções de cotação
    getCurrentRate,
    refreshRates: refreshAll,
    
    // Funções de snapshot (para registro)
    createSnapshot,
    getSnapshotFields,
    
    // Funções de conversão (apenas para exibição momentânea)
    convertToBRL,
    convertFromBRL,
    
    // Funções de exibição
    prepareDisplay,
    formatCurrency,
    formatWithReference,
    
    // Funções de consolidação
    consolidateToBRL,
  };
}
