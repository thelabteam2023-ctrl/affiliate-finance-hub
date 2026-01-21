import { useMemo, useCallback } from "react";
import { useCotacoes } from "@/hooks/useCotacoes";
import { SupportedCurrency, CURRENCY_SYMBOLS, isForeignCurrency } from "@/types/currency";

/**
 * =============================================================================
 * DOCUMENTAÇÃO: SISTEMA DE CONVERSÃO MULTI-MOEDA
 * =============================================================================
 * 
 * FONTE DE COTAÇÃO (HIERARQUIA PARA KPIs):
 * 1. FastForex (primária) - API comercial para todas as moedas
 * 2. PTAX BCB (fallback) - Banco Central para USD/EUR/GBP se FastForex falhar
 * 3. Cotação de Trabalho (fallback manual) - Definida no projeto
 * 
 * Nota: Cotação de Trabalho é usada em formulários para conversão entre 
 * operações com moedas diferentes (não para exibição de KPIs).
 * 
 * FREQUÊNCIA DE ATUALIZAÇÃO:
 * - Automática via cron job (10x ao dia)
 * - Cache no banco: tabela exchange_rate_cache (TTL ~2h24m)
 * - Fallback local se API indisponível
 * 
 * MOEDAS SUPORTADAS:
 * - BRL (Real Brasileiro) - moeda base
 * - USD, EUR, GBP (FastForex primário, PTAX fallback)
 * - MYR, MXN, ARS, COP (FastForex apenas)
 * - Criptomoedas - API Binance (preço em USD × cotação oficial)
 * 
 * USO NO SISTEMA:
 * - KPIs: Usam cotação oficial em tempo real, cotação de trabalho (fallback)
 * - Formulários: Usarão cotação de trabalho para conversões operacionais
 * - Snapshots: Valores de depósitos/saques mantêm snapshot da cotação no momento
 * - Relatórios: devem usar snapshots para auditoria
 * =============================================================================
 */

interface CurrencyTotal {
  moeda: SupportedCurrency;
  valor: number;
  valorBRL: number;
}

interface ConsolidatedTotals {
  byMoeda: CurrencyTotal[];
  totalBRL: number;
  hasForeignCurrency: boolean;
  primaryMoeda: SupportedCurrency;
}

interface CurrencyItem {
  valor: number;
  moeda: string;
  valorBRLSnapshot?: number | null;
}

export function useProjectCurrencyFormat(cryptoSymbols: string[] = []) {
  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, cryptoPrices, loading, refreshAll, source } = useCotacoes(cryptoSymbols);

  /**
   * Obtém a cotação atual para uma moeda
   * Usa cotações PTAX reais do BCB para USD, EUR e GBP
   */
  const getCurrentRate = useCallback((moeda: string): number => {
    const upperMoeda = moeda.toUpperCase();
    if (upperMoeda === "BRL") return 1;
    if (upperMoeda === "USD" || upperMoeda === "USDT" || upperMoeda === "USDC") return cotacaoUSD;
    if (upperMoeda === "EUR") return cotacaoEUR; // PTAX BCB
    if (upperMoeda === "GBP") return cotacaoGBP; // PTAX BCB
    // Crypto
    if (cryptoPrices[upperMoeda]) return cryptoPrices[upperMoeda] * cotacaoUSD;
    return cotacaoUSD; // Fallback para USD
  }, [cotacaoUSD, cotacaoEUR, cotacaoGBP, cryptoPrices]);

  /**
   * Converte um valor para BRL usando cotação atual
   */
  const convertToBRL = useCallback((valor: number, moeda: string): number => {
    const rate = getCurrentRate(moeda);
    return valor * rate;
  }, [getCurrentRate]);

  /**
   * Formata um valor monetário com símbolo da moeda
   */
  const formatCurrency = useCallback((
    valor: number, 
    moeda: string = "BRL",
    options?: { compact?: boolean; decimals?: number }
  ): string => {
    const { compact = false, decimals = 2 } = options || {};
    const symbol = CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
    
    if (compact && Math.abs(valor) >= 1000) {
      const formatted = (valor / 1000).toFixed(1);
      return `${symbol} ${formatted}k`;
    }
    
    return `${symbol} ${valor.toFixed(decimals)}`;
  }, []);

  /**
   * Formata valor com referência em BRL quando moeda estrangeira
   */
  const formatWithBRLReference = useCallback((
    valor: number,
    moeda: string,
    snapshotBRL?: number | null
  ): { primary: string; reference: string | null } => {
    const primary = formatCurrency(valor, moeda);
    
    if (!isForeignCurrency(moeda)) {
      return { primary, reference: null };
    }
    
    // Usa snapshot se disponível, senão converte em tempo real
    const valorBRL = snapshotBRL ?? convertToBRL(valor, moeda);
    const reference = formatCurrency(valorBRL, "BRL");
    
    return { primary, reference };
  }, [formatCurrency, convertToBRL]);

  /**
   * Consolida uma lista de itens com diferentes moedas
   * Prioriza snapshots BRL existentes, senão usa cotação atual
   */
  const consolidateTotals = useCallback((items: CurrencyItem[]): ConsolidatedTotals => {
    const byMoedaMap: Record<string, { valor: number; valorBRL: number }> = {};
    
    items.forEach(item => {
      const moeda = (item.moeda || "BRL").toUpperCase();
      if (!byMoedaMap[moeda]) {
        byMoedaMap[moeda] = { valor: 0, valorBRL: 0 };
      }
      
      byMoedaMap[moeda].valor += item.valor;
      
      // Prioriza snapshot, senão converte em tempo real
      const valorBRL = item.valorBRLSnapshot ?? convertToBRL(item.valor, moeda);
      byMoedaMap[moeda].valorBRL += valorBRL;
    });
    
    const byMoeda: CurrencyTotal[] = Object.entries(byMoedaMap).map(([moeda, data]) => ({
      moeda: moeda as SupportedCurrency,
      valor: data.valor,
      valorBRL: data.valorBRL,
    }));
    
    const totalBRL = byMoeda.reduce((sum, curr) => sum + curr.valorBRL, 0);
    const hasForeignCurrency = byMoeda.some(c => c.moeda !== "BRL");
    
    // Moeda primária é a com maior valor total em BRL
    const primaryMoeda = byMoeda.length > 0
      ? byMoeda.reduce((max, curr) => curr.valorBRL > max.valorBRL ? curr : max).moeda
      : "BRL" as SupportedCurrency;
    
    return { byMoeda, totalBRL, hasForeignCurrency, primaryMoeda };
  }, [convertToBRL]);

  /**
   * Agrupa saldos por moeda para exibição em KPIs
   */
  const groupBalancesByMoeda = useCallback((
    items: Array<{ saldo: number; moeda: string }>
  ): { moeda: SupportedCurrency; total: number; totalBRL: number; count: number }[] => {
    const grouped: Record<string, { total: number; totalBRL: number; count: number }> = {};
    
    items.forEach(item => {
      const moeda = (item.moeda || "BRL").toUpperCase();
      if (!grouped[moeda]) {
        grouped[moeda] = { total: 0, totalBRL: 0, count: 0 };
      }
      grouped[moeda].total += item.saldo;
      grouped[moeda].totalBRL += convertToBRL(item.saldo, moeda);
      grouped[moeda].count++;
    });
    
    return Object.entries(grouped).map(([moeda, data]) => ({
      moeda: moeda as SupportedCurrency,
      ...data,
    }));
  }, [convertToBRL]);

  /**
   * Verifica se uma operação envolve múltiplas moedas
   */
  const isMultiCurrencyOperation = useCallback((moedas: string[]): boolean => {
    const uniqueMoedas = [...new Set(moedas.map(m => (m || "BRL").toUpperCase()))];
    return uniqueMoedas.length > 1;
  }, []);

  /**
   * Retorna informação da cotação para exibição
   */
  const getCotacaoInfo = useCallback((moeda: string): string | null => {
    if (!isForeignCurrency(moeda)) return null;
    
    const rate = getCurrentRate(moeda);
    return `1 ${moeda} = R$ ${rate.toFixed(2)}`;
  }, [getCurrentRate]);

  /**
   * Badge de moeda para identificação visual
   */
  const getMoedaBadgeInfo = useCallback((moeda: string): {
    label: string;
    isForeign: boolean;
    symbol: string;
  } => {
    const upperMoeda = (moeda || "BRL").toUpperCase();
    return {
      label: upperMoeda,
      isForeign: isForeignCurrency(upperMoeda),
      symbol: CURRENCY_SYMBOLS[upperMoeda as SupportedCurrency] || upperMoeda,
    };
  }, []);

  return {
    // Estado
    loading,
    cotacaoUSD,
    source,
    
    // Funções de conversão
    getCurrentRate,
    convertToBRL,
    
    // Funções de formatação
    formatCurrency,
    formatWithBRLReference,
    
    // Funções de consolidação
    consolidateTotals,
    groupBalancesByMoeda,
    
    // Funções utilitárias
    isMultiCurrencyOperation,
    getCotacaoInfo,
    getMoedaBadgeInfo,
    
    // Atualização manual
    refreshAll,
  };
}

export type { CurrencyTotal, ConsolidatedTotals, CurrencyItem };
