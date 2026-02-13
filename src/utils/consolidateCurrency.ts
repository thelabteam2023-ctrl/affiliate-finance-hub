/**
 * UTILITÁRIO CENTRAL DE CONSOLIDAÇÃO DE MOEDAS
 * 
 * Toda consolidação de volume/lucro multi-moeda DEVE usar estas funções.
 * Nenhum módulo deve calcular consolidação manualmente.
 */

import { CURRENCY_SYMBOLS, type SupportedCurrency } from "@/types/currency";

export interface CurrencyBreakdownEntry {
  moeda: string;
  valor: number;
}

export interface ConsolidationRates {
  /** Mapa de moeda -> taxa para moeda de consolidação (ex: { USD: 5.16, EUR: 5.48 }) */
  [currency: string]: number;
}

export interface ConsolidationResult {
  /** Valor total consolidado na moeda do projeto */
  total: number;
  /** Breakdown por moeda original */
  breakdown: CurrencyBreakdownEntry[];
  /** Moeda de consolidação */
  currency: string;
  /** Taxas utilizadas (apenas moedas diferentes da consolidação) */
  rates: ConsolidationRates;
}

/**
 * Consolida volumes de múltiplas moedas para a moeda do projeto.
 * 
 * REGRA: Nunca assumir câmbio 1:1.
 * Cada moeda é convertida usando a taxa fornecida pelo `getRate`.
 * 
 * @param volumeByCurrency - Mapa de moeda -> valor original
 * @param consolidationCurrency - Moeda de consolidação do projeto
 * @param getRate - Função que retorna a taxa BRL para uma moeda (ex: USD -> 5.16)
 */
export function consolidateVolume(
  volumeByCurrency: Record<string, number>,
  consolidationCurrency: string,
  getRate: (moeda: string) => number,
): ConsolidationResult {
  const breakdown: CurrencyBreakdownEntry[] = [];
  const rates: ConsolidationRates = {};
  let total = 0;

  // Taxa BRL da moeda de consolidação (pivot)
  const rateConsolidacao = consolidationCurrency === "BRL" ? 1 : getRate(consolidationCurrency);

  for (const [moeda, valor] of Object.entries(volumeByCurrency)) {
    if (Math.abs(valor) < 0.01) continue;
    
    breakdown.push({ moeda, valor });

    if (moeda === consolidationCurrency) {
      // Mesma moeda, sem conversão
      total += valor;
    } else {
      // Fórmula pivot: valor * taxaBRL_origem / taxaBRL_consolidacao
      const rateBRL = moeda === "BRL" ? 1 : getRate(moeda);
      const converted = (valor * rateBRL) / rateConsolidacao;
      total += converted;

      // Armazena taxa efetiva usada (taxa direta da moeda para consolidação)
      rates[moeda] = rateBRL / rateConsolidacao;
    }
  }

  // Ordenar breakdown: moeda de consolidação primeiro, depois alfabético
  breakdown.sort((a, b) => {
    if (a.moeda === consolidationCurrency) return -1;
    if (b.moeda === consolidationCurrency) return 1;
    return a.moeda.localeCompare(b.moeda);
  });

  return { total, breakdown, currency: consolidationCurrency, rates };
}

/**
 * Formata um valor com símbolo de moeda (para uso em tooltips)
 */
export function formatCurrencyForDisplay(valor: number, moeda: string): string {
  const symbol = CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda + " ";
  const formatted = valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatted}`;
}
