// Tipos para a tabela unificada de apostas (apostas_unificada)
// Esta tabela consolida apostas simples, múltiplas e surebets

import { Database } from "@/integrations/supabase/types";

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
  | "DUTCHING"
  | "MATCHED_BETTING"
  | "DUPLO_GREEN"
  | "FREEBET"
  | "PROMOCAO";

// Contextos operacionais
export type ContextoOperacional = "NORMAL" | "FREEBET" | "BONUS";

// Status da aposta
export type ApostaStatus = "PENDENTE" | "LIQUIDADA";

// Resultados possíveis
export type ApostaResultado = "PENDENTE" | "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID";

// Lado da aposta (para surebets/arbitragens)
export type LadoAposta = "BACK" | "LAY" | null;

// Modelos de surebet
export type SurebetModelo = "1-X-2" | "1-2";

// Estrutura de uma perna de surebet/arbitragem
export interface PernaArbitragem {
  bookmaker_id: string;
  bookmaker_nome: string;
  selecao: string;
  odd: number;
  stake: number;
  resultado: ApostaResultado | null;
  lucro_prejuizo: number | null;
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
  return json as PernaArbitragem[];
}

export function parseSelecoesFromJson(json: unknown): SelecaoMultipla[] {
  if (!json || !Array.isArray(json)) return [];
  return json as SelecaoMultipla[];
}

// Calcular stake total das pernas
export function calcularStakeTotalPernas(pernas: PernaArbitragem[]): number {
  return pernas.reduce((acc, p) => acc + (p.stake || 0), 0);
}

// Calcular spread de uma arbitragem
export function calcularSpread(pernas: PernaArbitragem[]): number {
  const probs = pernas.map(p => p.odd > 1 ? 1 / p.odd : 0);
  const total = probs.reduce((a, b) => a + b, 0);
  return total > 0 ? (total - 1) * 100 : 0;
}

// Calcular ROI esperado de uma arbitragem
export function calcularRoiEsperado(pernas: PernaArbitragem[]): number {
  const stakeTotal = calcularStakeTotalPernas(pernas);
  if (stakeTotal <= 0) return 0;
  
  // Menor retorno garantido
  const retornos = pernas.map(p => p.odd > 1 ? p.stake * p.odd : 0);
  const menorRetorno = Math.min(...retornos);
  const lucro = menorRetorno - stakeTotal;
  
  return (lucro / stakeTotal) * 100;
}

// Calcular lucro esperado de uma arbitragem
export function calcularLucroEsperado(pernas: PernaArbitragem[]): number {
  const stakeTotal = calcularStakeTotalPernas(pernas);
  if (stakeTotal <= 0) return 0;
  
  const retornos = pernas.map(p => p.odd > 1 ? p.stake * p.odd : 0);
  const menorRetorno = Math.min(...retornos);
  
  return menorRetorno - stakeTotal;
}

// Calcular lucro real após liquidação
export function calcularLucroReal(pernas: PernaArbitragem[]): number {
  const stakeTotal = calcularStakeTotalPernas(pernas);
  
  let retorno = 0;
  pernas.forEach(p => {
    if (p.resultado === "GREEN") {
      retorno += p.stake * p.odd;
    } else if (p.resultado === "VOID") {
      retorno += p.stake;
    }
    // RED = perda da stake (não adiciona nada)
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
