/**
 * Hook centralizado para obter cotação de conversão multi-moeda
 * 
 * REGRA OBRIGATÓRIA DE CÂMBIO:
 * 
 * Prioridade 1: Cotação Oficial (FastForex API / PTAX BCB) - SEMPRE PRIMÁRIA
 * Prioridade 2: Cotação de Trabalho do projeto (FALLBACK se oficial falhar)
 * 
 * ⚠️ NUNCA usar valores hardcoded no código.
 * Se nenhuma fonte estiver disponível, informar claramente.
 */

import { useMemo } from "react";
import { useCotacoes } from "@/hooks/useCotacoes";

export interface CotacaoInfo {
  /** Taxa de conversão MOEDA -> BRL */
  taxa: number;
  /** Fonte da cotação: 'TRABALHO', 'OFICIAL', ou 'INDISPONIVEL' */
  fonte: "TRABALHO" | "OFICIAL" | "PTAX" | "INDISPONIVEL";
  /** Se a cotação está carregando */
  loading: boolean;
  /** Descrição amigável da fonte */
  descricao: string;
  /** Indica se a cotação está disponível e pode ser usada */
  disponivel: boolean;
}

export interface CotacoesMultiMoeda {
  USD: CotacaoInfo;
  EUR: CotacaoInfo;
  GBP: CotacaoInfo;
  MYR: CotacaoInfo;
  MXN: CotacaoInfo;
  ARS: CotacaoInfo;
  COP: CotacaoInfo;
}

/**
 * Hook para obter cotação centralizada respeitando prioridades
 * 
 * @param cotacaoTrabalho - Cotação de trabalho USD/BRL do projeto (fallback se oficial falhar)
 * @param fonteCotacao - Ignorado - Cotação Oficial é sempre primária, trabalho é fallback
 */
export function useCotacaoConsolidacao(
  cotacaoTrabalho?: number | null,
  fonteCotacao?: "TRABALHO" | "PTAX" | null
): CotacaoInfo {
  const { cotacaoUSD, loading, sources } = useCotacoes();

  return useMemo(() => {
    // Prioridade 1: Cotação Oficial (FastForex/PTAX) - SEMPRE primária
    if (cotacaoUSD && cotacaoUSD > 0) {
      // Determinar label da fonte baseado no source real
      const sourceLabel = sources?.usd?.label || "Oficial";
      return {
        taxa: cotacaoUSD,
        fonte: "OFICIAL",
        loading,
        descricao: `Cotação ${sourceLabel}: R$ ${cotacaoUSD.toFixed(4)}`,
        disponivel: true,
      };
    }

    // Prioridade 2: Cotação de trabalho como FALLBACK (se PTAX falhar)
    if (cotacaoTrabalho && cotacaoTrabalho > 0) {
      return {
        taxa: cotacaoTrabalho,
        fonte: "TRABALHO",
        loading: false,
        descricao: `Cotação de Trabalho (fallback): R$ ${cotacaoTrabalho.toFixed(4)}`,
        disponivel: true,
      };
    }

    // Fallback final: Nenhuma cotação disponível
    return {
      taxa: 0,
      fonte: "INDISPONIVEL",
      loading,
      descricao: "Cotação indisponível - verifique configurações",
      disponivel: false,
    };
  }, [cotacaoTrabalho, cotacaoUSD, loading, sources]);
}

/**
 * Hook para obter cotações de todas as moedas com prioridade Oficial > Trabalho
 * 
 * @param cotacaoTrabalhoUSD - Cotação de trabalho USD/BRL
 * @param cotacaoTrabalhoEUR - Cotação de trabalho EUR/BRL
 * @param cotacaoTrabalhoGBP - Cotação de trabalho GBP/BRL
 * @param cotacaoTrabalhoMYR - Cotação de trabalho MYR/BRL
 * @param cotacaoTrabalhoMXN - Cotação de trabalho MXN/BRL
 * @param cotacaoTrabalhoARS - Cotação de trabalho ARS/BRL
 * @param cotacaoTrabalhoCOP - Cotação de trabalho COP/BRL
 */
export function useCotacoesMultiMoeda(
  cotacaoTrabalhoUSD?: number | null,
  cotacaoTrabalhoEUR?: number | null,
  cotacaoTrabalhoGBP?: number | null,
  cotacaoTrabalhoMYR?: number | null,
  cotacaoTrabalhoMXN?: number | null,
  cotacaoTrabalhoARS?: number | null,
  cotacaoTrabalhoCOP?: number | null
): CotacoesMultiMoeda & { loading: boolean } {
  const { 
    cotacaoUSD, cotacaoEUR, cotacaoGBP, 
    cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP,
    loading,
    sources
  } = useCotacoes();

  return useMemo(() => {
    const buildCotacaoInfo = (
      oficial: number,
      trabalho: number | null | undefined,
      symbol: string,
      sourceLabel?: string
    ): CotacaoInfo => {
      // Prioridade 1: Cotação Oficial (FastForex/PTAX)
      if (oficial && oficial > 0) {
        const label = sourceLabel || "Oficial";
        return {
          taxa: oficial,
          fonte: "OFICIAL",
          loading,
          descricao: `Cotação ${label}: R$ ${oficial.toFixed(4)}`,
          disponivel: true,
        };
      }

      // Prioridade 2: Cotação de trabalho (fallback)
      if (trabalho && trabalho > 0) {
        return {
          taxa: trabalho,
          fonte: "TRABALHO",
          loading: false,
          descricao: `Cotação de Trabalho (${symbol}): R$ ${trabalho.toFixed(4)}`,
          disponivel: true,
        };
      }

      // Indisponível
      return {
        taxa: 0,
        fonte: "INDISPONIVEL",
        loading,
        descricao: `Cotação ${symbol} indisponível`,
        disponivel: false,
      };
    };

    return {
      USD: buildCotacaoInfo(cotacaoUSD, cotacaoTrabalhoUSD, "USD", sources?.usd?.label),
      EUR: buildCotacaoInfo(cotacaoEUR, cotacaoTrabalhoEUR, "EUR", sources?.eur?.label),
      GBP: buildCotacaoInfo(cotacaoGBP, cotacaoTrabalhoGBP, "GBP", sources?.gbp?.label),
      MYR: buildCotacaoInfo(cotacaoMYR, cotacaoTrabalhoMYR, "MYR", sources?.myr?.label),
      MXN: buildCotacaoInfo(cotacaoMXN, cotacaoTrabalhoMXN, "MXN", sources?.mxn?.label),
      ARS: buildCotacaoInfo(cotacaoARS, cotacaoTrabalhoARS, "ARS", sources?.ars?.label),
      COP: buildCotacaoInfo(cotacaoCOP, cotacaoTrabalhoCOP, "COP", sources?.cop?.label),
      loading,
    };
  }, [
    cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP,
    cotacaoTrabalhoUSD, cotacaoTrabalhoEUR, cotacaoTrabalhoGBP, 
    cotacaoTrabalhoMYR, cotacaoTrabalhoMXN, cotacaoTrabalhoARS, cotacaoTrabalhoCOP,
    loading, sources
  ]);
}

/**
 * Função pura para converter valor usando cotação
 * 
 * @param valor - Valor a converter
 * @param moedaOrigem - Moeda de origem (USD, BRL, EUR, GBP, MYR, MXN, ARS, COP, etc)
 * @param moedaDestino - Moeda de destino (BRL, USD, etc)
 * @param taxa - Taxa de conversão MOEDA/BRL
 * @returns Valor convertido
 */
export function converterValor(
  valor: number,
  moedaOrigem: string,
  moedaDestino: string,
  taxa: number
): number {
  if (!valor || valor === 0) return 0;
  if (moedaOrigem === moedaDestino) return valor;
  if (taxa <= 0) return valor; // Não converter se taxa inválida
  
  // Moedas tratadas como USD
  const isUSD = (m: string) => ["USD", "USDT", "USDC"].includes(m);
  
  // USD-like -> BRL
  if (isUSD(moedaOrigem) && moedaDestino === "BRL") {
    return valor * taxa;
  }
  
  // BRL -> USD-like
  if (moedaOrigem === "BRL" && isUSD(moedaDestino)) {
    return valor / taxa;
  }
  
  // USD-like -> USD-like (sem conversão)
  if (isUSD(moedaOrigem) && isUSD(moedaDestino)) {
    return valor;
  }
  
  // Moedas FIAT -> BRL (EUR, GBP, MYR, MXN, ARS, COP)
  const fiatCurrencies = ["EUR", "GBP", "MYR", "MXN", "ARS", "COP"];
  if (fiatCurrencies.includes(moedaOrigem) && moedaDestino === "BRL") {
    return valor * taxa;
  }
  
  // BRL -> Moedas FIAT
  if (moedaOrigem === "BRL" && fiatCurrencies.includes(moedaDestino)) {
    return valor / taxa;
  }
  
  return valor;
}

/**
 * Formata valor monetário com símbolo
 */
export function formatarMoeda(valor: number, moeda: string = "BRL"): string {
  const isUSD = ["USD", "USDT", "USDC"].includes(moeda);
  
  const symbolMap: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    MYR: "RM",
    MXN: "MX$",
    ARS: "AR$",
    COP: "CO$",
    BRL: "R$"
  };
  
  const symbol = isUSD ? "$" : (symbolMap[moeda] || "R$");
  
  return `${symbol} ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
