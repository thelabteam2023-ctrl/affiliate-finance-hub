// Tipos para a tabela unificada de apostas (apostas_unificada)
// Esta tabela consolida apostas simples, múltiplas e surebets

import { Database } from "@/integrations/supabase/types";
import type { SupportedCurrency } from "./currency";

// Tipo da linha na tabela
export type ApostaUnificadaRow = Database["public"]["Tables"]["apostas_unificada"]["Row"];
export type ApostaUnificadaInsert = Database["public"]["Tables"]["apostas_unificada"]["Insert"];
export type ApostaUnificadaUpdate = Database["public"]["Tables"]["apostas_unificada"]["Update"];

// Formas de registro possíveis
export type FormaRegistro = "SIMPLES" | "MULTIPLA" | "ARBITRAGEM";

// Estratégias disponíveis
export type Estrategia = 
  | "PUNTER"
  | "SUREBET"
  | "VALUEBET"
  | "EXTRACAO_FREEBET"
  | "EXTRACAO_BONUS"
  | "DUPLO_GREEN";

// Contextos operacionais (APENAS UI - não usar para decisões financeiras)
export type ContextoOperacional = "NORMAL" | "FREEBET" | "BONUS";

// Fonte de Saldo (VERDADE FINANCEIRA - determina qual wallet é usada)
export type FonteSaldo = "REAL" | "FREEBET" | "BONUS";

// Status da aposta
export type ApostaStatus = "PENDENTE" | "LIQUIDADA";

// Resultados possíveis
export type ApostaResultado = "PENDENTE" | "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID";

// Lado da aposta (para surebets/arbitragens)
export type LadoAposta = "BACK" | "LAY" | null;

// Modelos de surebet
export type SurebetModelo = "1-X-2" | "1-2";

// Tipo para moeda de operação (inclui MULTI para operações multi-moeda)
export type MoedaOperacao = SupportedCurrency | "MULTI";

// Estrutura de uma perna de surebet/arbitragem COM SUPORTE MULTI-MOEDA
export interface PernaArbitragem {
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: SupportedCurrency; // OBRIGATÓRIO - moeda da bookmaker
  selecao: string;
  selecao_livre?: string; // Linha real da aposta (ex: Over 2.5, Handicap -1.5) - prioridade sobre selecao
  odd: number;
  stake: number;
  // Campos de snapshot para referência BRL
  stake_brl_referencia: number | null; // Valor em BRL no momento do registro
  cotacao_snapshot: number | null; // Cotação usada (1 [moeda] = X BRL)
  cotacao_snapshot_at: string | null; // ISO timestamp da cotação
  // Campos de resultado
  resultado: ApostaResultado | null;
  lucro_prejuizo: number | null; // Na moeda da casa
  lucro_prejuizo_brl_referencia: number | null; // Em BRL usando snapshot
  // Campos de freebet
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
}

// Estrutura de seleção para apostas múltiplas
export interface SelecaoMultipla {
  evento?: string;
  esporte?: string;
  mercado?: string;
  selecao: string;
  odd: number;
  resultado?: ApostaResultado | null;
}

// Interface completa para visualização (com joins)
export interface ApostaUnificadaComDetalhes extends ApostaUnificadaRow {
  bookmaker?: {
    id: string;
    nome: string;
    saldo_atual: number;
    saldo_freebet: number;
    parceiro?: {
      nome: string;
    } | null;
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  } | null;
}

// Interface para compatibilidade com código legado (surebets)
export interface SurebetCompat {
  id: string;
  data_operacao: string;
  evento: string | null;
  esporte: string | null;
  modelo: string | null;
  mercado: string | null;
  stake_total: number | null;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
  pernas?: PernaArbitragem[];
  // Campos de classificação
  forma_registro: string;
  estrategia: string;
  contexto_operacional: string;
}

// Parâmetros para criação de operação de arbitragem
export interface CriarArbitragemParams {
  projeto_id: string;
  evento: string;
  esporte: string;
  mercado?: string | null;
  modelo: SurebetModelo;
  pernas: PernaArbitragem[];
  observacoes?: string | null;
  estrategia: Estrategia;
  contexto_operacional: ContextoOperacional;
  // Suporte multi-moeda
  moeda_operacao?: string;
}

// Parâmetros para atualização de operação de arbitragem
export interface AtualizarArbitragemParams {
  id: string;
  evento?: string;
  esporte?: string;
  mercado?: string | null;
  observacoes?: string | null;
  pernas?: PernaArbitragem[];
}

// Parâmetros para liquidação de operação de arbitragem
export interface LiquidarArbitragemParams {
  id: string;
  pernas: {
    index: number;
    resultado: ApostaResultado;
    lucro_prejuizo?: number | null;
  }[];
}

// Métricas calculadas para exibição em KPIs
export interface ArbitragemMetrics {
  total: number;
  pendentes: number;
  liquidadas: number;
  greens: number;
  reds: number;
  lucroTotal: number;
  stakeTotal: number;
  roi: number;
}

// Dados para gráficos de evolução
export interface EvolucaoLucroData {
  data: string;
  lucro: number;
  operacoes: number;
}

// Dados para gráficos por casa
export interface EficienciaPorCasaData {
  casa: string;
  lucro: number;
  volume: number;
  operacoes: number;
  roi: number;
}

// Helpers para conversão de dados
export function parsePernaFromJson(json: unknown): PernaArbitragem[] {
  if (!json || !Array.isArray(json)) return [];
  // Garantir compatibilidade com dados antigos (sem campo moeda)
  return (json as any[]).map(p => ({
    ...p,
    moeda: p.moeda || "BRL", // Default para BRL em dados legados
    stake_brl_referencia: p.stake_brl_referencia ?? null,
    cotacao_snapshot: p.cotacao_snapshot ?? null,
    cotacao_snapshot_at: p.cotacao_snapshot_at ?? null,
    lucro_prejuizo_brl_referencia: p.lucro_prejuizo_brl_referencia ?? null,
  }));
}

export function parseSelecoesFromJson(json: unknown): SelecaoMultipla[] {
  if (!json || !Array.isArray(json)) return [];
  return json as SelecaoMultipla[];
}

/**
 * Detecta a moeda de operação baseada nas pernas
 * Retorna a moeda única se todas iguais, ou "MULTI" se diferentes
 */
export function detectarMoedaOperacao(pernas: PernaArbitragem[]): MoedaOperacao {
  if (pernas.length === 0) return "BRL";
  
  const moedas = pernas.map(p => p.moeda || "BRL");
  const moedasUnicas = [...new Set(moedas)];
  
  if (moedasUnicas.length === 1) {
    return moedasUnicas[0];
  }
  
  return "MULTI";
}

/**
 * Calcula o valor BRL de referência total (soma dos snapshots)
 * NUNCA soma stakes diretamente quando moedas são diferentes!
 */
export function calcularValorBRLReferencia(pernas: PernaArbitragem[]): number {
  return pernas.reduce((acc, p) => {
    // Usar snapshot se disponível, senão stake direto (para BRL ou legado)
    const valorBRL = p.stake_brl_referencia ?? p.stake;
    return acc + (valorBRL || 0);
  }, 0);
}

/**
 * Calcula stake total das pernas
 * ATENÇÃO: Só deve ser usado quando TODAS as pernas são da mesma moeda!
 * Para operações multi-moeda, retorna null
 */
export function calcularStakeTotalPernas(pernas: PernaArbitragem[]): number | null {
  const moedaOperacao = detectarMoedaOperacao(pernas);
  
  // Se multi-moeda, não podemos somar diretamente
  if (moedaOperacao === "MULTI") {
    return null;
  }
  
  return pernas.reduce((acc, p) => acc + (p.stake || 0), 0);
}

/**
 * Versão legada que sempre retorna número (para compatibilidade)
 * Usar calcularStakeTotalPernas para código novo
 */
export function calcularStakeTotalPernasLegacy(pernas: PernaArbitragem[]): number {
  return pernas.reduce((acc, p) => acc + (p.stake || 0), 0);
}

// Calcular spread de uma arbitragem
export function calcularSpread(pernas: PernaArbitragem[]): number {
  const probs = pernas.map(p => p.odd > 1 ? 1 / p.odd : 0);
  const total = probs.reduce((a, b) => a + b, 0);
  return total > 0 ? (total - 1) * 100 : 0;
}

// Calcular ROI esperado de uma arbitragem
// Usa valor BRL de referência para operações multi-moeda
export function calcularRoiEsperado(pernas: PernaArbitragem[]): number {
  const moedaOperacao = detectarMoedaOperacao(pernas);
  
  // Para multi-moeda, usar valores BRL de referência
  if (moedaOperacao === "MULTI") {
    const stakeTotalBRL = calcularValorBRLReferencia(pernas);
    if (stakeTotalBRL <= 0) return 0;
    
    // Calcular retornos em BRL
    const retornosBRL = pernas.map(p => {
      const stakeRef = p.stake_brl_referencia ?? p.stake;
      return p.odd > 1 ? stakeRef * p.odd : 0;
    });
    const menorRetorno = Math.min(...retornosBRL);
    const lucro = menorRetorno - stakeTotalBRL;
    
    return (lucro / stakeTotalBRL) * 100;
  }
  
  // Para moeda única, usar cálculo tradicional
  const stakeTotal = calcularStakeTotalPernasLegacy(pernas);
  if (stakeTotal <= 0) return 0;
  
  const retornos = pernas.map(p => p.odd > 1 ? p.stake * p.odd : 0);
  const menorRetorno = Math.min(...retornos);
  const lucro = menorRetorno - stakeTotal;
  
  return (lucro / stakeTotal) * 100;
}

// Calcular lucro esperado de uma arbitragem
export function calcularLucroEsperado(pernas: PernaArbitragem[]): number {
  const moedaOperacao = detectarMoedaOperacao(pernas);
  
  if (moedaOperacao === "MULTI") {
    const stakeTotalBRL = calcularValorBRLReferencia(pernas);
    if (stakeTotalBRL <= 0) return 0;
    
    const retornosBRL = pernas.map(p => {
      const stakeRef = p.stake_brl_referencia ?? p.stake;
      return p.odd > 1 ? stakeRef * p.odd : 0;
    });
    const menorRetorno = Math.min(...retornosBRL);
    
    return menorRetorno - stakeTotalBRL;
  }
  
  const stakeTotal = calcularStakeTotalPernasLegacy(pernas);
  if (stakeTotal <= 0) return 0;
  
  const retornos = pernas.map(p => p.odd > 1 ? p.stake * p.odd : 0);
  const menorRetorno = Math.min(...retornos);
  
  return menorRetorno - stakeTotal;
}

// Calcular lucro real após liquidação
// Retorna em BRL de referência para operações multi-moeda
export function calcularLucroReal(pernas: PernaArbitragem[]): number {
  const moedaOperacao = detectarMoedaOperacao(pernas);
  
  if (moedaOperacao === "MULTI") {
    // Usar lucro_prejuizo_brl_referencia quando disponível
    return pernas.reduce((total, p) => {
      if (p.lucro_prejuizo_brl_referencia !== null) {
        return total + p.lucro_prejuizo_brl_referencia;
      }
      // Fallback: calcular com stake BRL ref
      const stakeRef = p.stake_brl_referencia ?? p.stake;
      if (p.resultado === "GREEN") {
        return total + (stakeRef * p.odd - stakeRef);
      } else if (p.resultado === "VOID") {
        return total; // Sem ganho nem perda
      }
      return total - stakeRef; // RED
    }, 0);
  }
  
  // Cálculo tradicional para moeda única
  const stakeTotal = calcularStakeTotalPernasLegacy(pernas);
  
  let retorno = 0;
  pernas.forEach(p => {
    if (p.resultado === "GREEN") {
      retorno += p.stake * p.odd;
    } else if (p.resultado === "VOID") {
      retorno += p.stake;
    }
  });
  
  return retorno - stakeTotal;
}

// Determinar resultado geral da arbitragem baseado nas pernas
export function determinarResultadoArbitragem(pernas: PernaArbitragem[]): ApostaResultado {
  if (pernas.length === 0) return "PENDENTE";
  
  const resultados = pernas.map(p => p.resultado);
  
  // Se alguma perna ainda está pendente, a operação está pendente
  if (resultados.some(r => r === null || r === "PENDENTE")) {
    return "PENDENTE";
  }
  
  const lucroReal = calcularLucroReal(pernas);
  
  if (lucroReal > 0) return "GREEN";
  if (lucroReal < 0) return "RED";
  return "VOID"; // Lucro zero
}
