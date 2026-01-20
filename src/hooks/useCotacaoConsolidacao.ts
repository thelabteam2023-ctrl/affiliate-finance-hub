/**
 * Hook centralizado para obter cotação de conversão USD/BRL
 * 
 * REGRA OBRIGATÓRIA DE CÂMBIO:
 * 
 * Prioridade 1: Cotação de Trabalho do projeto (se definida)
 * Prioridade 2: PTAX (cotação oficial do Banco Central)
 * 
 * ⚠️ NUNCA usar valores hardcoded no código.
 * Se nenhuma fonte estiver disponível, informar claramente.
 */

import { useMemo } from "react";
import { useCotacoes } from "@/hooks/useCotacoes";

export interface CotacaoInfo {
  /** Taxa de conversão USD -> BRL */
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

/**
 * Hook para obter cotação centralizada respeitando prioridades
 * 
 * @param cotacaoTrabalho - Cotação de trabalho do projeto (opcional)
 * @param fonteCotacao - Fonte preferida: 'TRABALHO' ou 'PTAX'
 */
export function useCotacaoConsolidacao(
  cotacaoTrabalho?: number | null,
  fonteCotacao?: "TRABALHO" | "PTAX" | null
): CotacaoInfo {
  const { cotacaoUSD, loading } = useCotacoes();

  return useMemo(() => {
    // Prioridade 1: Cotação de trabalho (se fonte = TRABALHO e valor definido)
    if (fonteCotacao === "TRABALHO" && cotacaoTrabalho && cotacaoTrabalho > 0) {
      return {
        taxa: cotacaoTrabalho,
        fonte: "TRABALHO",
        loading: false,
        descricao: `Cotação de Trabalho: R$ ${cotacaoTrabalho.toFixed(4)}`,
        disponivel: true,
      };
    }

    // Prioridade 2: PTAX (cotação oficial do BCB)
    if (cotacaoUSD && cotacaoUSD > 0) {
      return {
        taxa: cotacaoUSD,
        fonte: "PTAX",
        loading,
        descricao: `PTAX BCB: R$ ${cotacaoUSD.toFixed(4)}`,
        disponivel: true,
      };
    }

    // Fallback: Nenhuma cotação disponível
    return {
      taxa: 0,
      fonte: "INDISPONIVEL",
      loading,
      descricao: "Cotação indisponível - verifique configurações",
      disponivel: false,
    };
  }, [cotacaoTrabalho, fonteCotacao, cotacaoUSD, loading]);
}

/**
 * Função pura para converter valor usando cotação
 * 
 * @param valor - Valor a converter
 * @param moedaOrigem - Moeda de origem (USD, BRL, etc)
 * @param moedaDestino - Moeda de destino (BRL, USD, etc)
 * @param taxa - Taxa de conversão USD/BRL
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
  
  return valor;
}

/**
 * Formata valor monetário com símbolo
 */
export function formatarMoeda(valor: number, moeda: string = "BRL"): string {
  const isUSD = ["USD", "USDT", "USDC"].includes(moeda);
  const symbol = isUSD ? "$" : "R$";
  
  return `${symbol} ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
