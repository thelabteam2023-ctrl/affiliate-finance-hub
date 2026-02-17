/**
 * Hook centralizado para conversão de moeda em módulos promocionais
 * 
 * REGRA DE OURO:
 * - Registro: Sempre na moeda da casa (sem conversão)
 * - Exibição analítica: Sempre na moeda de consolidação do projeto
 * 
 * Este hook garante que Cashback, Giros Grátis e Freebet
 * respeitem a configuração de moeda do projeto.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "@/hooks/useCotacoes";

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
 * Hook para obter configuração de moeda do projeto e funções de conversão
 */
export function usePromotionalCurrencyConversion(projetoId: string) {
  const [projectConfig, setProjectConfig] = useState<{
    moeda_consolidacao: string | null;
    fonte_cotacao: string | null;
    cotacao_trabalho: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, loading: cotacaoLoading } = useCotacoes();

  // Fetch project configuration
  useEffect(() => {
    if (!projetoId) {
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase
          .from("projetos")
          .select("moeda_consolidacao, fonte_cotacao, cotacao_trabalho")
          .eq("id", projetoId)
          .single();

        if (error) throw error;
        setProjectConfig(data);
      } catch (err) {
        console.error("[usePromotionalCurrencyConversion] Erro ao buscar config:", err);
        setProjectConfig(null);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [projetoId]);

  // Configuração processada
  const config: ProjectCurrencyConfig = useMemo(() => {
    // CRÍTICO: Garantir que moedaConsolidacao seja lido corretamente do projeto
    // O banco pode retornar null se o campo não foi definido
    const rawMoeda = projectConfig?.moeda_consolidacao;
    const moedaConsolidacao: MoedaConsolidacao = 
      rawMoeda === "USD" || rawMoeda === "BRL" 
        ? rawMoeda 
        : "BRL"; // Fallback apenas se realmente null/undefined
    
    const fonteCotacao = (projectConfig?.fonte_cotacao as FonteCotacao) || "TRABALHO";
    const cotacaoTrabalho = projectConfig?.cotacao_trabalho || null;

    // DEBUG: Log para diagnóstico (remover em produção)
    if (projectConfig) {
      console.log("[usePromotionalCurrencyConversion] Config carregada:", {
        rawMoeda,
        moedaConsolidacao,
        cotacaoTrabalho,
      });
    }

    // Determinar cotação atual para KPIs
    // REGRA: Cotação oficial (FastForex > PTAX) é SEMPRE primária para exibição
    // Cotação de trabalho é FALLBACK (se API indisponível)
    // Nota: Cotação de trabalho será usada em formulários para conversão entre operações
    let cotacaoAtual = 0;
    let fonte: "TRABALHO" | "OFICIAL" | "INDISPONIVEL" = "INDISPONIVEL";
    let disponivel = false;

    // Prioridade 1: Cotação oficial (FastForex/PTAX) - SEMPRE primária para KPIs
    if (cotacaoUSD && cotacaoUSD > 0) {
      cotacaoAtual = cotacaoUSD;
      fonte = "OFICIAL";
      disponivel = true;
    } 
    // Prioridade 2: Cotação de trabalho como FALLBACK
    else if (cotacaoTrabalho && cotacaoTrabalho > 0) {
      cotacaoAtual = cotacaoTrabalho;
      fonte = "TRABALHO";
      disponivel = true;
    }

    return {
      moedaConsolidacao,
      fonteCotacao,
      cotacaoTrabalho,
      cotacaoAtual,
      loading: loading || cotacaoLoading,
      disponivel,
      fonte,
    };
  }, [projectConfig, cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, loading, cotacaoLoading]);

  /**
   * Converte um valor para a moeda de consolidação do projeto
   * 
   * @param valor - Valor original
   * @param moedaOrigem - Moeda do valor (ex: "USD", "BRL")
   * @returns Valor convertido para moeda de consolidação
   */
  const converterParaConsolidacao = useCallback((
    valor: number,
    moedaOrigem: string
  ): number => {
    if (!valor || valor === 0) return 0;

    const { moedaConsolidacao, cotacaoAtual, disponivel } = config;

    // Normalizar moeda de origem (stablecoins = USD)
    const isUSDLike = (m: string) => ["USD", "USDT", "USDC"].includes(m);
    const moedaOrigemNormalizada = isUSDLike(moedaOrigem) ? "USD" : moedaOrigem;
    const moedaDestinoNormalizada = isUSDLike(moedaConsolidacao) ? "USD" : moedaConsolidacao;

    // CRÍTICO: Moeda igual (após normalização) = SEM conversão
    if (moedaOrigemNormalizada === moedaDestinoNormalizada) {
      return valor;
    }

    // Se cotação não disponível, retornar valor original
    if (!disponivel || cotacaoAtual <= 0) {
      console.warn(`[converterParaConsolidacao] Cotação indisponível para converter ${moedaOrigem} -> ${moedaConsolidacao}`);
      return valor;
    }

    // ===================================================================
    // FÓRMULA PIVOT BRL UNIVERSAL
    // Converter qualquer moeda -> BRL primeiro, depois BRL -> consolidação
    // ===================================================================
    
    // Mapa de cotações para BRL
    const getCotacaoBRL = (moeda: string): number | null => {
      if (moeda === "BRL") return 1;
      if (moeda === "USD") return cotacaoUSD;
      if (moeda === "EUR") return cotacaoEUR;
      if (moeda === "GBP") return cotacaoGBP;
      if (moeda === "MYR") return cotacaoMYR;
      if (moeda === "MXN") return cotacaoMXN;
      return null;
    };

    const taxaOrigemBRL = getCotacaoBRL(moedaOrigemNormalizada);
    const taxaDestinoBRL = getCotacaoBRL(moedaDestinoNormalizada);

    if (taxaOrigemBRL && taxaOrigemBRL > 0 && taxaDestinoBRL && taxaDestinoBRL > 0) {
      // Fórmula Pivot: (valor * taxa_BRL_origem) / taxa_BRL_destino
      return (valor * taxaOrigemBRL) / taxaDestinoBRL;
    }

    // Conversão não suportada - retornar original
    console.warn(`[converterParaConsolidacao] Conversão não suportada: ${moedaOrigem} -> ${moedaConsolidacao}`);
    return valor;
  }, [config, cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN]);

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
    const { moedaConsolidacao } = config;
    const symbol = moedaConsolidacao === "USD" ? "$" : "R$";
    
    return `${symbol} ${valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [config]);

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
