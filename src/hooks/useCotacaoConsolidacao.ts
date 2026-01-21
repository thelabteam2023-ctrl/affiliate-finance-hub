/**
 * Hook centralizado para obter cotação de conversão multi-moeda
 * 
 * REGRA OBRIGATÓRIA DE CÂMBIO:
 * 
 * Prioridade 1: PTAX (cotação oficial do Banco Central) - SEMPRE PRIMÁRIA
 * Prioridade 2: Cotação de Trabalho do projeto (FALLBACK se PTAX falhar)
 * 
 * ⚠️ NUNCA usar valores hardcoded no código.
 * Se nenhuma fonte estiver disponível, informar claramente.
 */

import { useMemo } from "react";
import { useCotacoes } from "@/hooks/useCotacoes";

export interface CotacaoInfo {
  /** Taxa de conversão MOEDA -> BRL */
  taxa: number;
  /** Fonte da cotação: 'TRABALHO', 'PTAX', ou 'INDISPONIVEL' */
  fonte: "TRABALHO" | "PTAX" | "INDISPONIVEL";
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
}

/**
 * Hook para obter cotação centralizada respeitando prioridades
 * 
 * @param cotacaoTrabalho - Cotação de trabalho USD/BRL do projeto (fallback se PTAX falhar)
 * @param fonteCotacao - Ignorado - PTAX é sempre primária, trabalho é fallback
 */
export function useCotacaoConsolidacao(
  cotacaoTrabalho?: number | null,
  fonteCotacao?: "TRABALHO" | "PTAX" | null
): CotacaoInfo {
  const { cotacaoUSD, loading } = useCotacoes();

  return useMemo(() => {
    // Prioridade 1: PTAX (cotação oficial do BCB) - SEMPRE primária
    if (cotacaoUSD && cotacaoUSD > 0) {
      return {
        taxa: cotacaoUSD,
        fonte: "PTAX",
        loading,
        descricao: `PTAX BCB: R$ ${cotacaoUSD.toFixed(4)}`,
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
  }, [cotacaoTrabalho, cotacaoUSD, loading]);
}

/**
 * Hook para obter cotações de todas as moedas com prioridade PTAX > Trabalho
 * 
 * @param cotacaoTrabalhoUSD - Cotação de trabalho USD/BRL
 * @param cotacaoTrabalhoEUR - Cotação de trabalho EUR/BRL
 * @param cotacaoTrabalhoGBP - Cotação de trabalho GBP/BRL
 */
export function useCotacoesMultiMoeda(
  cotacaoTrabalhoUSD?: number | null,
  cotacaoTrabalhoEUR?: number | null,
  cotacaoTrabalhoGBP?: number | null
): CotacoesMultiMoeda & { loading: boolean } {
  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, loading } = useCotacoes();

  return useMemo(() => {
    const buildCotacaoInfo = (
      ptax: number,
      trabalho: number | null | undefined,
      symbol: string
    ): CotacaoInfo => {
      // Prioridade 1: PTAX (BCB)
      if (ptax && ptax > 0) {
        return {
          taxa: ptax,
          fonte: "PTAX",
          loading,
          descricao: `PTAX BCB: R$ ${ptax.toFixed(4)}`,
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
      USD: buildCotacaoInfo(cotacaoUSD, cotacaoTrabalhoUSD, "USD"),
      EUR: buildCotacaoInfo(cotacaoEUR, cotacaoTrabalhoEUR, "EUR"),
      GBP: buildCotacaoInfo(cotacaoGBP, cotacaoTrabalhoGBP, "GBP"),
      loading,
    };
  }, [cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoTrabalhoUSD, cotacaoTrabalhoEUR, cotacaoTrabalhoGBP, loading]);
}

/**
 * Função pura para converter valor usando cotação
 * 
 * @param valor - Valor a converter
 * @param moedaOrigem - Moeda de origem (USD, BRL, EUR, GBP, etc)
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
  
  // EUR/GBP -> BRL
  if ((moedaOrigem === "EUR" || moedaOrigem === "GBP") && moedaDestino === "BRL") {
    return valor * taxa;
  }
  
  // BRL -> EUR/GBP
  if (moedaOrigem === "BRL" && (moedaDestino === "EUR" || moedaDestino === "GBP")) {
    return valor / taxa;
  }
  
  return valor;
}

/**
 * Formata valor monetário com símbolo
 */
export function formatarMoeda(valor: number, moeda: string = "BRL"): string {
  const isUSD = ["USD", "USDT", "USDC"].includes(moeda);
  const symbol = isUSD ? "$" : moeda === "EUR" ? "€" : moeda === "GBP" ? "£" : "R$";
  
  return `${symbol} ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
