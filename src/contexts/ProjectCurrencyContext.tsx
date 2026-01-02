/**
 * Contexto global de moeda do projeto
 * 
 * REGRA SUPREMA: A moeda do PROJETO governa TODA a visualização financeira.
 * 
 * Se projeto = USD: tudo em $
 * Se projeto = BRL: tudo em R$
 * 
 * Nenhum componente decide moeda localmente.
 */

import { createContext, useContext, useMemo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "@/hooks/useCotacoes";
import type { MoedaConsolidacao, FonteCotacao } from "@/types/projeto";
import { CURRENCY_SYMBOLS, type SupportedCurrency } from "@/types/currency";

export interface ProjectCurrencyConfig {
  moedaConsolidacao: MoedaConsolidacao;
  fonteCotacao: FonteCotacao;
  cotacaoTrabalho: number | null;
  cotacaoAtual: number;
  ptaxAtual: number;
}

export interface ProjectCurrencyContextValue {
  // Configuração
  config: ProjectCurrencyConfig;
  isLoading: boolean;
  
  // Formatação
  formatCurrency: (valor: number, options?: FormatOptions) => string;
  formatCurrencyWithSign: (valor: number, options?: FormatOptions) => string;
  
  // Conversão (para valores que precisam ser consolidados)
  convertToConsolidation: (valor: number, moedaOrigem: string) => number;
  
  // Utilitários
  getSymbol: () => string;
  getMoeda: () => MoedaConsolidacao;
}

interface FormatOptions {
  decimals?: number;
  compact?: boolean;
  showSymbol?: boolean;
}

const ProjectCurrencyContext = createContext<ProjectCurrencyContextValue | null>(null);

interface ProjectCurrencyProviderProps {
  projetoId: string | undefined;
  children: ReactNode;
}

export function ProjectCurrencyProvider({ projetoId, children }: ProjectCurrencyProviderProps) {
  const { cotacaoUSD, loading: loadingCotacao } = useCotacoes();

  // Buscar configuração do projeto - SINCRONIZADO COM OUTROS HOOKS
  const { data: projetoConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ["projeto-currency-config", projetoId],
    queryFn: async () => {
      if (!projetoId) return null;
      
      const { data, error } = await supabase
        .from("projetos")
        .select("moeda_consolidacao, cotacao_trabalho, fonte_cotacao")
        .eq("id", projetoId)
        .single();

      if (error) throw error;
      console.log("[ProjectCurrencyContext] Config carregada:", data);
      return data;
    },
    enabled: !!projetoId,
    staleTime: 0, // Sempre buscar dados frescos
  });

  const config: ProjectCurrencyConfig = useMemo(() => {
    // CRÍTICO: Usar valor do banco SEM fallback hardcoded para USD
    // O banco tem default 'USD', então se vier do banco, RESPEITAR
    const moedaConsolidacao = (projetoConfig?.moeda_consolidacao as MoedaConsolidacao) ?? "BRL";
    const fonteCotacao = (projetoConfig?.fonte_cotacao as FonteCotacao) ?? "TRABALHO";
    const cotacaoTrabalho = projetoConfig?.cotacao_trabalho || null;
    
    // Cotação atual baseada na fonte configurada
    const cotacaoAtual = fonteCotacao === "TRABALHO" && cotacaoTrabalho 
      ? cotacaoTrabalho 
      : cotacaoUSD;

    console.log("[ProjectCurrencyContext] Config processada:", { moedaConsolidacao, fonteCotacao });

    return {
      moedaConsolidacao,
      fonteCotacao,
      cotacaoTrabalho,
      cotacaoAtual,
      ptaxAtual: cotacaoUSD,
    };
  }, [projetoConfig, cotacaoUSD]);

  // Obter símbolo da moeda de consolidação
  const getSymbol = useMemo(() => () => {
    return CURRENCY_SYMBOLS[config.moedaConsolidacao as SupportedCurrency] || config.moedaConsolidacao;
  }, [config.moedaConsolidacao]);

  // Obter moeda atual
  const getMoeda = useMemo(() => () => config.moedaConsolidacao, [config.moedaConsolidacao]);

  // Converter valor para moeda de consolidação
  const convertToConsolidation = useMemo(() => (valor: number, moedaOrigem: string): number => {
    const moedaDestino = config.moedaConsolidacao;
    const cotacao = config.cotacaoAtual;

    // Sem conversão necessária
    if (moedaOrigem === moedaDestino) {
      return valor;
    }

    // BRL -> USD
    if (moedaOrigem === "BRL" && moedaDestino === "USD") {
      return valor / cotacao;
    }

    // USD -> BRL
    if (moedaOrigem === "USD" && moedaDestino === "BRL") {
      return valor * cotacao;
    }

    // Crypto (assumindo cotação em USD)
    if (["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL"].includes(moedaOrigem)) {
      if (moedaDestino === "USD") {
        return valor; // Crypto já está em USD
      }
      return valor * cotacao; // Crypto -> BRL
    }

    // Fallback
    return valor;
  }, [config]);

  // Formatar valor com moeda do projeto
  const formatCurrency = useMemo(() => (valor: number, options?: FormatOptions): string => {
    const { decimals = 2, compact = false, showSymbol = true } = options || {};
    const symbol = getSymbol();
    
    let formatted: string;
    
    if (compact && Math.abs(valor) >= 1000) {
      if (Math.abs(valor) >= 1000000) {
        formatted = (valor / 1000000).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + "M";
      } else {
        formatted = (valor / 1000).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + "K";
      }
    } else {
      formatted = valor.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    
    return showSymbol ? `${symbol} ${formatted}` : formatted;
  }, [getSymbol]);

  // Formatar com sinal (+/-)
  const formatCurrencyWithSign = useMemo(() => (valor: number, options?: FormatOptions): string => {
    const formatted = formatCurrency(Math.abs(valor), options);
    const sign = valor >= 0 ? "+" : "-";
    return `${sign}${formatted.replace(/^[R$€£₿Ξ₮]+\s*/, "")}`;
  }, [formatCurrency]);

  const value: ProjectCurrencyContextValue = useMemo(() => ({
    config,
    isLoading: loadingConfig || loadingCotacao,
    formatCurrency,
    formatCurrencyWithSign,
    convertToConsolidation,
    getSymbol,
    getMoeda,
  }), [config, loadingConfig, loadingCotacao, formatCurrency, formatCurrencyWithSign, convertToConsolidation, getSymbol, getMoeda]);

  return (
    <ProjectCurrencyContext.Provider value={value}>
      {children}
    </ProjectCurrencyContext.Provider>
  );
}

/**
 * Hook para usar a formatação de moeda do projeto
 * 
 * IMPORTANTE: Este hook só funciona dentro de ProjectCurrencyProvider.
 * Para uso fora do provider, use useProjectCurrencyFormat com projetoId.
 */
export function useProjectCurrency(): ProjectCurrencyContextValue {
  const context = useContext(ProjectCurrencyContext);
  if (!context) {
    throw new Error("useProjectCurrency deve ser usado dentro de ProjectCurrencyProvider");
  }
  return context;
}

/**
 * Hook seguro que retorna null se estiver fora do provider
 * Útil para componentes que podem ser usados em diferentes contextos
 */
export function useProjectCurrencySafe(): ProjectCurrencyContextValue | null {
  return useContext(ProjectCurrencyContext);
}
