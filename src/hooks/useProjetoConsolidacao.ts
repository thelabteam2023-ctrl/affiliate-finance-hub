/**
 * Hook para gerenciar a moeda de consolidação do projeto
 * 
 * PRINCÍPIO FUNDAMENTAL:
 * - KPIs SEMPRE em UMA única moeda de consolidação
 * - Moeda de origem NUNCA é alterada
 * - Conversão apenas para fins analíticos
 */

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "./useCotacoes";
import { toast } from "sonner";
import type { 
  MoedaConsolidacao, 
  FonteCotacao, 
  ProjetoConsolidationConfig,
  ConversionDisplayInfo,
  MultiCurrencyConsolidation 
} from "@/types/projeto";

interface UseProjetoConsolidacaoProps {
  projetoId: string | undefined;
}

interface ProjetoConsolidacaoData {
  moeda_consolidacao: MoedaConsolidacao;
  cotacao_trabalho: number | null;
  fonte_cotacao: FonteCotacao;
}

export function useProjetoConsolidacao({ projetoId }: UseProjetoConsolidacaoProps) {
  const queryClient = useQueryClient();
  const { cotacaoUSD, loading: loadingCotacao, source } = useCotacoes();

  // Buscar configuração do projeto - SEM FALLBACKS LOCAIS
  const { data: config, isLoading } = useQuery({
    queryKey: ["projeto-consolidacao", projetoId],
    queryFn: async (): Promise<ProjetoConsolidacaoData> => {
      if (!projetoId) throw new Error("projetoId é obrigatório");
      
      const { data, error } = await supabase
        .from("projetos")
        .select("moeda_consolidacao, cotacao_trabalho, fonte_cotacao")
        .eq("id", projetoId)
        .single();

      if (error) throw error;
      
      // CRÍTICO: Usar o valor EXATO do banco, sem fallback
      // O default do banco é 'USD', então se vier null significa problema de schema
      const result = {
        moeda_consolidacao: data.moeda_consolidacao as MoedaConsolidacao,
        cotacao_trabalho: data.cotacao_trabalho,
        fonte_cotacao: data.fonte_cotacao as FonteCotacao,
      };
      
      console.log("[useProjetoConsolidacao] Config carregada do banco:", result);
      return result;
    },
    enabled: !!projetoId,
    staleTime: 0, // Sempre buscar dados frescos após invalidação
  });

  // Mutation para atualizar configuração - COM LOGS E INVALIDAÇÃO COMPLETA
  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<ProjetoConsolidationConfig>) => {
      if (!projetoId) throw new Error("projetoId é obrigatório");
      
      console.log("[useProjetoConsolidacao] Salvando config:", newConfig);
      
      const { data, error } = await supabase
        .from("projetos")
        .update(newConfig)
        .eq("id", projetoId)
        .select("moeda_consolidacao, cotacao_trabalho, fonte_cotacao")
        .single();

      if (error) throw error;
      
      console.log("[useProjetoConsolidacao] Config salva, retorno do banco:", data);
      return data;
    },
    onSuccess: (data) => {
      // Invalidar TODAS as queries relacionadas à moeda do projeto
      queryClient.invalidateQueries({ queryKey: ["projeto-consolidacao", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["projeto-currency-config", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["projeto", projetoId] });
      
      console.log("[useProjetoConsolidacao] Cache invalidado, novo valor:", data?.moeda_consolidacao);
      toast.success(`Moeda de consolidação alterada para ${data?.moeda_consolidacao}`);
    },
    onError: (error) => {
      console.error("[useProjetoConsolidacao] Erro ao salvar:", error);
      toast.error("Erro ao atualizar configuração: " + error.message);
    },
  });

  // Obter cotação atual baseada na fonte configurada
  const getCotacaoAtual = useCallback((): number => {
    if (config?.fonte_cotacao === "TRABALHO" && config?.cotacao_trabalho) {
      return config.cotacao_trabalho;
    }
    return cotacaoUSD; // PTAX ou fallback
  }, [config, cotacaoUSD]);

  // Calcular delta entre cotação de trabalho e PTAX
  const getDeltaCambial = useCallback((): number | null => {
    if (!config?.cotacao_trabalho) return null;
    const delta = ((config.cotacao_trabalho - cotacaoUSD) / cotacaoUSD) * 100;
    return Math.round(delta * 100) / 100;
  }, [config?.cotacao_trabalho, cotacaoUSD]);

  // Converter valor para moeda de consolidação
  const converterParaConsolidacao = useCallback((
    valor: number,
    moedaOrigem: string
  ): { valorConsolidado: number; cotacaoUsada: number } => {
    // CRÍTICO: Usar moeda do config, fallback apenas se config não existir
    const moedaConsolidacao = config?.moeda_consolidacao ?? "BRL";
    const cotacao = getCotacaoAtual();

    // Sem conversão necessária
    if (moedaOrigem === moedaConsolidacao) {
      return { valorConsolidado: valor, cotacaoUsada: 1 };
    }

    // BRL -> USD
    if (moedaOrigem === "BRL" && moedaConsolidacao === "USD") {
      return { 
        valorConsolidado: valor / cotacao, 
        cotacaoUsada: cotacao 
      };
    }

    // USD -> BRL
    if (moedaOrigem === "USD" && moedaConsolidacao === "BRL") {
      return { 
        valorConsolidado: valor * cotacao, 
        cotacaoUsada: cotacao 
      };
    }

    // Crypto (assumindo cotação em USD)
    if (["USDT", "BTC", "ETH"].includes(moedaOrigem)) {
      if (moedaConsolidacao === "USD") {
        return { valorConsolidado: valor, cotacaoUsada: 1 };
      }
      // Crypto -> BRL
      return { 
        valorConsolidado: valor * cotacao, 
        cotacaoUsada: cotacao 
      };
    }

    // Fallback
    return { valorConsolidado: valor, cotacaoUsada: 1 };
  }, [config?.moeda_consolidacao, getCotacaoAtual]);

  // Detectar se operação é multi-moeda
  const isMultiCurrency = useCallback((moedas: string[]): boolean => {
    const moedasUnicas = [...new Set(moedas.filter(Boolean))];
    return moedasUnicas.length > 1;
  }, []);

  // Gerar dados de consolidação para operação
  const gerarDadosConsolidacao = useCallback((
    pernas: Array<{ moeda: string; stake: number; retorno: number | null }>
  ): MultiCurrencyConsolidation => {
    const moedas = pernas.map(p => p.moeda);
    const isMulti = isMultiCurrency(moedas);
    // CRÍTICO: Usar moeda do config sem fallback hardcoded
    const moedaConsolidacao = config?.moeda_consolidacao ?? "BRL";
    const fonteCotacao = config?.fonte_cotacao ?? "TRABALHO";
    const cotacao = getCotacaoAtual();

    if (!isMulti) {
      // Operação mono-moeda - sem conversão
      const totalStake = pernas.reduce((sum, p) => sum + (p.stake || 0), 0);
      const totalRetorno = pernas.reduce((sum, p) => sum + (p.retorno || 0), 0);
      
      return {
        is_multicurrency: false,
        consolidation_currency: moedaConsolidacao,
        conversion_rate_used: null,
        conversion_source: fonteCotacao,
        stake_consolidado: totalStake,
        retorno_consolidado: totalRetorno,
        pl_consolidado: totalRetorno - totalStake,
      };
    }

    // Operação multi-moeda - converter para moeda de consolidação
    let stakeConsolidado = 0;
    let retornoConsolidado = 0;

    for (const perna of pernas) {
      const { valorConsolidado: stakeConv } = converterParaConsolidacao(perna.stake || 0, perna.moeda);
      const { valorConsolidado: retornoConv } = converterParaConsolidacao(perna.retorno || 0, perna.moeda);
      
      stakeConsolidado += stakeConv;
      retornoConsolidado += retornoConv;
    }

    return {
      is_multicurrency: true,
      consolidation_currency: moedaConsolidacao,
      conversion_rate_used: cotacao,
      conversion_source: fonteCotacao,
      stake_consolidado: Math.round(stakeConsolidado * 100) / 100,
      retorno_consolidado: Math.round(retornoConsolidado * 100) / 100,
      pl_consolidado: Math.round((retornoConsolidado - stakeConsolidado) * 100) / 100,
    };
  }, [config, getCotacaoAtual, isMultiCurrency, converterParaConsolidacao]);

  // Gerar informações de exibição para transparência
  const getConversionDisplayInfo = useCallback((moedaOrigem: string): ConversionDisplayInfo | null => {
    const moedaConsolidacao = config?.moeda_consolidacao ?? "BRL";
    
    if (moedaOrigem === moedaConsolidacao) {
      return null; // Sem conversão necessária
    }

    const cotacao = getCotacaoAtual();
    const delta = getDeltaCambial();

    return {
      moedaOrigem,
      moedaDestino: moedaConsolidacao,
      cotacaoUsada: cotacao,
      fonteCotacao: config?.fonte_cotacao || "TRABALHO",
      ptaxAtual: cotacaoUSD,
      deltaPercentual: delta,
    };
  }, [config, getCotacaoAtual, getDeltaCambial, cotacaoUSD]);

  return {
    // Configuração - RESPEITAR VALOR DO BANCO
    config,
    isLoading: isLoading || loadingCotacao,
    moedaConsolidacao: config?.moeda_consolidacao ?? "BRL",
    fonteCotacao: config?.fonte_cotacao ?? "TRABALHO",
    cotacaoTrabalho: config?.cotacao_trabalho,
    
    // Cotação
    cotacaoAtual: getCotacaoAtual(),
    ptaxAtual: cotacaoUSD,
    deltaCambial: getDeltaCambial(),
    sourceCotacao: source.usd,
    
    // Ações
    updateConfig: updateConfigMutation.mutate,
    isUpdating: updateConfigMutation.isPending,
    
    // Utilitários
    converterParaConsolidacao,
    isMultiCurrency,
    gerarDadosConsolidacao,
    getConversionDisplayInfo,
  };
}
