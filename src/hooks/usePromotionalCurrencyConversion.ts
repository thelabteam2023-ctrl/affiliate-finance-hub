/**
 * Hook centralizado para conversão de moeda em módulos promocionais
 * 
 * REGRA DE OURO:
 * - Registro: Sempre na moeda da casa (sem conversão)
 * - Exibição analítica: Sempre na moeda de consolidação do projeto
 * 
 * Este hook garante que Cashback, Giros Grátis e Freebet
 * respeitem a configuração de moeda do projeto, delegando 100%
 * para useProjetoCurrency (fonte canônica — Cotação de Trabalho prioritária).
 */

import { useMemo, useCallback } from "react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

export type MoedaConsolidacao = "BRL" | "USD";
export type FonteCotacao = "TRABALHO" | "PTAX";

export interface ProjectCurrencyConfig {
  moedaConsolidacao: MoedaConsolidacao;
  fonteCotacao: FonteCotacao;
  cotacaoTrabalho: number | null;
  cotacaoAtual: number;
  loading: boolean;
  disponivel: boolean;
  fonte: "TRABALHO" | "OFICIAL" | "INDISPONIVEL";
}

export interface ConversionResult {
  valorOriginal: number;
  moedaOriginal: string;
  valorConvertido: number;
  moedaConsolidacao: MoedaConsolidacao;
  taxaUsada: number;
  fonte: string;
}

/**
 * Hook para obter configuração de moeda do projeto e funções de conversão.
 * Delegação total para useProjetoCurrency — fonte canônica.
 */
export function usePromotionalCurrencyConversion(projetoId: string) {
  const projectCurrency = useProjetoCurrency(projetoId);

  // Configuração processada (compatível com a interface antiga)
  const config: ProjectCurrencyConfig = useMemo(() => {
    const moedaConsolidacao = (projectCurrency.moedaConsolidacao as MoedaConsolidacao) || "BRL";
    const cotacaoAtual = projectCurrency.cotacaoAtual || 0;
    const disponivel = cotacaoAtual > 0;

    // Fonte: se a cotação ativa é diferente da oficial, é Trabalho.
    let fonte: "TRABALHO" | "OFICIAL" | "INDISPONIVEL" = "INDISPONIVEL";
    if (disponivel) {
      fonte = cotacaoAtual !== projectCurrency.cotacaoOficialUSD ? "TRABALHO" : "OFICIAL";
    }

    return {
      moedaConsolidacao,
      fonteCotacao: "TRABALHO",
      cotacaoTrabalho: cotacaoAtual,
      cotacaoAtual,
      loading: projectCurrency.isLoading,
      disponivel,
      fonte,
    };
  }, [projectCurrency.moedaConsolidacao, projectCurrency.cotacaoAtual, projectCurrency.cotacaoOficialUSD, projectCurrency.isLoading]);

  /**
   * Converte um valor para a moeda de consolidação do projeto.
   * Delegação para a fonte canônica (Cotação de Trabalho prioritária).
   */
  const converterParaConsolidacao = useCallback((
    valor: number,
    moedaOrigem: string
  ): number => {
    if (!valor || valor === 0) return 0;
    return projectCurrency.convertToConsolidation(valor, moedaOrigem);
  }, [projectCurrency]);

  /**
   * Converte um valor com resultado detalhado
   */
  const converterComDetalhes = useCallback((
    valor: number,
    moedaOrigem: string
  ): ConversionResult => {
    const valorConvertido = converterParaConsolidacao(valor, moedaOrigem);
    
    return {
      valorOriginal: valor,
      moedaOriginal: moedaOrigem,
      valorConvertido,
      moedaConsolidacao: config.moedaConsolidacao,
      taxaUsada: config.cotacaoAtual,
      fonte: config.fonte,
    };
  }, [converterParaConsolidacao, config]);

  /**
   * Formata valor na moeda de consolidação do projeto
   */
  const formatarNaConsolidacao = useCallback((valor: number): string => {
    return projectCurrency.formatCurrency(valor);
  }, [projectCurrency]);

  /**
   * Verifica se um conjunto de moedas é multi-moeda
   */
  const isMultiMoeda = useCallback((moedas: string[]): boolean => {
    const moedasUnicas = new Set(
      moedas.map(m => ["USD", "USDT", "USDC"].includes(m) ? "USD" : m)
    );
    return moedasUnicas.size > 1;
  }, []);

  /**
   * Retorna informações sobre a conversão para exibição na UI
   */
  const getConversionInfo = useCallback((): {
    isConverting: boolean;
    message: string | null;
  } => {
    const { moedaConsolidacao, fonte, cotacaoAtual, disponivel } = config;

    if (!disponivel) {
      return {
        isConverting: false,
        message: "Cotação indisponível - valores exibidos na moeda original",
      };
    }

    return {
      isConverting: true,
      message: `Valores consolidados em ${moedaConsolidacao === "USD" ? "Dólar" : "Real"} (${fonte}: ${cotacaoAtual.toFixed(4)})`,
    };
  }, [config]);

  return {
    config,
    loading: config.loading,
    converterParaConsolidacao,
    converterComDetalhes,
    formatarNaConsolidacao,
    isMultiMoeda,
    getConversionInfo,
  };
}
