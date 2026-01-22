/**
 * =============================================================================
 * HOOK: useMultiCurrencyConversion
 * =============================================================================
 * 
 * Hook centralizado para conversão multi-moeda no fluxo de transações.
 * Implementa a arquitetura de 3 camadas:
 * 
 * 1. CAMADA ORIGEM (Transporte): Moeda enviada (ex: USDT, BRL, BTC)
 * 2. CAMADA EXECUÇÃO (Casa): Moeda nativa da bookmaker (ex: MXN, EUR, USD)
 * 3. CAMADA REFERÊNCIA (KPI): Valor consolidado em USD para relatórios globais
 * 
 * REGRAS FUNDAMENTAIS:
 * - A moeda de saldo é SEMPRE a moeda da CASA (não da origem)
 * - Valores de referência são SNAPSHOTS imutáveis (nunca recalculados)
 * - Cripto é veículo de transporte, não moeda de saldo
 * =============================================================================
 */

import { useCallback, useMemo } from "react";
import { useCotacoes } from "@/hooks/useCotacoes";
import type { SupportedCurrency } from "@/types/currency";

// Cotações USD para moedas suportadas (via FastForex/PTAX)
// Formato: 1 MOEDA = X USD
interface ExchangeRateToUSD {
  BRL: number;  // ex: 0.189 (1 BRL = 0.189 USD)
  USD: number;  // sempre 1.0
  EUR: number;  // ex: 1.08 (1 EUR = 1.08 USD)
  GBP: number;  // ex: 1.27 (1 GBP = 1.27 USD)
  MXN: number;  // ex: 0.0577 (1 MXN = 0.0577 USD)
  MYR: number;  // ex: 0.21 (1 MYR = 0.21 USD)
  ARS: number;  // ex: 0.001 (1 ARS = 0.001 USD)
  COP: number;  // ex: 0.00024 (1 COP = 0.00024 USD)
}

export interface ConversionSnapshot {
  // Camada Origem (o que foi enviado)
  moeda_origem: string;
  valor_origem: number;
  cotacao_origem_usd: number;  // 1 MOEDA_ORIGEM = X USD
  
  // Camada Execução (o que entrou na casa)
  moeda_destino: string;
  valor_destino: number;
  cotacao_destino_usd: number;  // 1 MOEDA_DESTINO = X USD
  
  // Camada Referência (para KPIs)
  valor_usd_referencia: number;
  cotacao_snapshot_at: string;
  
  // Metadata
  precisaConversao: boolean;
  taxaConversaoImplicita: number | null;  // valor_destino / valor_origem
}

export interface ConversionEstimate {
  valorEstimado: number;
  moedaDestino: string;
  taxaUsada: number;
  fonteConversao: string;
}

export function useMultiCurrencyConversion(cryptoSymbols: string[] = []) {
  const { 
    cotacaoUSD, 
    cotacaoEUR, 
    cotacaoGBP,
    cotacaoMXN,
    cotacaoMYR,
    cotacaoARS,
    cotacaoCOP,
    cryptoPrices,
    loading,
    lastUpdate,
    source,
    sources,
    dataSource,
    isUsingFallback,
    refreshAll 
  } = useCotacoes(cryptoSymbols);

  /**
   * Obtém a taxa de conversão de uma moeda para USD
   * Retorna: 1 MOEDA = X USD
   * 
   * Todas as cotações vêm do useCotacoes que busca do FastForex (primário) 
   * ou PTAX/fallback (secundário). Não há mais valores hardcoded.
   */
  const getRateToUSD = useCallback((moeda: string): number => {
    const upper = moeda.toUpperCase();
    
    // Moedas FIAT principais (cotação via FastForex/PTAX)
    // cotacaoXXX = X BRL, então XXX→USD = cotacaoXXX / cotacaoUSD
    if (upper === "BRL") return 1 / cotacaoUSD;
    if (upper === "USD") return 1;
    if (upper === "EUR") return cotacaoEUR / cotacaoUSD;
    if (upper === "GBP") return cotacaoGBP / cotacaoUSD;
    
    // Moedas FIAT secundárias (cotação via FastForex com fallback)
    if (upper === "MXN") return cotacaoMXN / cotacaoUSD;
    if (upper === "MYR") return cotacaoMYR / cotacaoUSD;
    if (upper === "ARS") return cotacaoARS / cotacaoUSD;
    if (upper === "COP") return cotacaoCOP / cotacaoUSD;
    
    // Stablecoins (preço via Binance)
    if (upper === "USDT" || upper === "USDC") return cryptoPrices[upper] || 1;
    
    // Outras Crypto (preço via Binance, já em USD)
    if (cryptoPrices[upper]) return cryptoPrices[upper];
    
    // Fallback: moeda não reconhecida
    console.warn(`[useMultiCurrencyConversion] Moeda não reconhecida: ${moeda}, usando 1.0`);
    return 1;
  }, [cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMXN, cotacaoMYR, cotacaoARS, cotacaoCOP, cryptoPrices]);

  /**
   * Converte um valor de uma moeda para outra
   */
  const convert = useCallback((
    valor: number,
    moedaOrigem: string,
    moedaDestino: string
  ): number => {
    if (moedaOrigem.toUpperCase() === moedaDestino.toUpperCase()) {
      return valor;
    }
    
    // Converter para USD primeiro, depois para destino
    const rateOrigemToUSD = getRateToUSD(moedaOrigem);
    const rateDestinoToUSD = getRateToUSD(moedaDestino);
    
    const valorUSD = valor * rateOrigemToUSD;
    const valorDestino = valorUSD / rateDestinoToUSD;
    
    return valorDestino;
  }, [getRateToUSD]);

  /**
   * Estima o valor que será creditado na casa (para preview no formulário)
   */
  const estimateConversion = useCallback((
    valorOrigem: number,
    moedaOrigem: string,
    moedaDestino: string
  ): ConversionEstimate => {
    const valorEstimado = convert(valorOrigem, moedaOrigem, moedaDestino);
    const taxaUsada = getRateToUSD(moedaOrigem) / getRateToUSD(moedaDestino);
    
    return {
      valorEstimado,
      moedaDestino,
      taxaUsada,
      fonteConversao: source?.usd || "API",
    };
  }, [convert, getRateToUSD, source]);

  /**
   * Cria um snapshot completo da conversão para persistência no banco
   * Este é o método principal que deve ser chamado ao salvar uma transação
   */
  const createConversionSnapshot = useCallback((
    valorOrigem: number,
    moedaOrigem: string,
    moedaDestino: string,
    valorDestinoConfirmado?: number  // Valor real confirmado (pode diferir do estimado)
  ): ConversionSnapshot => {
    const now = new Date().toISOString();
    const cotacaoOrigemUSD = getRateToUSD(moedaOrigem);
    const cotacaoDestinoUSD = getRateToUSD(moedaDestino);
    
    // Se não foi passado valor confirmado, calcular estimativa
    const valorDestino = valorDestinoConfirmado ?? convert(valorOrigem, moedaOrigem, moedaDestino);
    
    // Valor USD de referência (baseado na origem)
    const valorUsdReferencia = valorOrigem * cotacaoOrigemUSD;
    
    // Taxa implícita (quanto de destino por unidade de origem)
    const taxaConversaoImplicita = valorOrigem > 0 ? valorDestino / valorOrigem : null;
    
    return {
      // Camada Origem
      moeda_origem: moedaOrigem.toUpperCase(),
      valor_origem: valorOrigem,
      cotacao_origem_usd: cotacaoOrigemUSD,
      
      // Camada Execução
      moeda_destino: moedaDestino.toUpperCase(),
      valor_destino: valorDestino,
      cotacao_destino_usd: cotacaoDestinoUSD,
      
      // Camada Referência
      valor_usd_referencia: valorUsdReferencia,
      cotacao_snapshot_at: now,
      
      // Metadata
      precisaConversao: moedaOrigem.toUpperCase() !== moedaDestino.toUpperCase(),
      taxaConversaoImplicita,
    };
  }, [getRateToUSD, convert]);

  /**
   * Formata um valor com símbolo de moeda
   */
  const formatCurrency = useCallback((
    valor: number,
    moeda: string,
    options?: { decimals?: number; compact?: boolean }
  ): string => {
    const { decimals = 2, compact = false } = options || {};
    
    const symbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      GBP: "£",
      MXN: "MX$",
      MYR: "RM",
      ARS: "AR$",
      COP: "CO$",
      USDT: "₮",
      USDC: "USDC",
      BTC: "₿",
      ETH: "Ξ",
    };
    
    const symbol = symbols[moeda.toUpperCase()] || moeda;
    
    if (compact && Math.abs(valor) >= 1000) {
      const formatted = (valor / 1000).toFixed(1);
      return `${symbol} ${formatted}k`;
    }
    
    return `${symbol} ${valor.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }, []);

  /**
   * Informação de cotação para exibição
   */
  const getCotacaoInfo = useCallback((moedaOrigem: string, moedaDestino: string): string => {
    const taxa = getRateToUSD(moedaOrigem) / getRateToUSD(moedaDestino);
    return `1 ${moedaOrigem.toUpperCase()} ≈ ${taxa.toFixed(4)} ${moedaDestino.toUpperCase()}`;
  }, [getRateToUSD]);

  return {
    // Estado
    loading,
    lastUpdate,
    cotacaoUSD,
    source,
    sources, // Exposição das fontes de cada moeda para UI
    
    // Status de dados (NOVO - para determinar se é fallback real)
    dataSource,        // 'database' | 'edge_function' | 'localstorage' | 'fallback'
    isUsingFallback,   // TRUE apenas se usando fallback hardcoded
    
    // Cotações individuais (para debug/exibição)
    cotacoes: {
      USD: cotacaoUSD,
      EUR: cotacaoEUR,
      GBP: cotacaoGBP,
      MXN: cotacaoMXN,
      MYR: cotacaoMYR,
      ARS: cotacaoARS,
      COP: cotacaoCOP,
    },
    
    // Conversão
    convert,
    getRateToUSD,
    estimateConversion,
    createConversionSnapshot,
    
    // Formatação
    formatCurrency,
    getCotacaoInfo,
    
    // Refresh
    refreshAll,
  };
}

export type { ExchangeRateToUSD };
