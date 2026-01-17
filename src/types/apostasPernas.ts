/**
 * Tipos para a tabela normalizada apostas_pernas
 * 
 * Esta tabela substitui o campo JSONB `pernas` da apostas_unificada
 * para cálculos financeiros mais confiáveis e auditáveis.
 * 
 * BENEFÍCIOS DA NORMALIZAÇÃO:
 * - Índices nativos por bookmaker_id (performance)
 * - Queries SQL simples sem jsonb_array_elements
 * - Não depende de filtro por estratégia
 * - Auditável externamente (tabela relacional padrão)
 */


import type { SupportedCurrency } from "./currency";

// Tipos base da tabela (quando disponível nos types gerados)
// Por enquanto, definimos manualmente baseado no schema criado
export interface ApostaPerna {
  id: string;
  aposta_id: string;
  bookmaker_id: string;
  ordem: number;
  
  // Dados da posição
  selecao: string;
  selecao_livre: string | null;
  odd: number;
  stake: number;
  moeda: SupportedCurrency;
  
  // Snapshot de conversão para BRL
  stake_brl_referencia: number | null;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  
  // Resultado
  resultado: ApostaPernaResultado | null;
  lucro_prejuizo: number | null;
  lucro_prejuizo_brl_referencia: number | null;
  
  // FreeBet
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  
  // Metadados
  created_at: string;
  updated_at: string;
}

export type ApostaPernaResultado = 
  | "PENDENTE" 
  | "GREEN" 
  | "RED" 
  | "MEIO_GREEN" 
  | "MEIO_RED" 
  | "VOID";

// Insert type (sem id, created_at, updated_at)
export interface ApostaPernaInsert {
  aposta_id: string;
  bookmaker_id: string;
  ordem: number;
  selecao: string;
  selecao_livre?: string | null;
  odd: number;
  stake: number;
  moeda?: string;
  stake_brl_referencia?: number | null;
  cotacao_snapshot?: number | null;
  cotacao_snapshot_at?: string | null;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
}

// Update type
export interface ApostaPernaUpdate {
  ordem?: number;
  selecao?: string;
  selecao_livre?: string | null;
  odd?: number;
  stake?: number;
  moeda?: string;
  stake_brl_referencia?: number | null;
  cotacao_snapshot?: number | null;
  cotacao_snapshot_at?: string | null;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
}

/**
 * Converte PernaArbitragem (formato JSONB legado) para ApostaPernaInsert
 * Usado durante a transição para dual-write
 */
export function pernaArbitragemToInsert(
  apostaId: string,
  perna: {
    bookmaker_id: string;
    bookmaker_nome?: string;
    moeda?: string;
    selecao: string;
    selecao_livre?: string;
    odd: number;
    stake: number;
    stake_brl_referencia?: number | null;
    cotacao_snapshot?: number | null;
    cotacao_snapshot_at?: string | null;
    resultado?: string | null;
    lucro_prejuizo?: number | null;
    lucro_prejuizo_brl_referencia?: number | null;
    gerou_freebet?: boolean;
    valor_freebet_gerada?: number | null;
  },
  ordem: number
): ApostaPernaInsert {
  return {
    aposta_id: apostaId,
    bookmaker_id: perna.bookmaker_id,
    ordem,
    selecao: perna.selecao || "N/A",
    selecao_livre: perna.selecao_livre || null,
    odd: perna.odd,
    stake: perna.stake,
    moeda: perna.moeda || "BRL",
    stake_brl_referencia: perna.stake_brl_referencia ?? null,
    cotacao_snapshot: perna.cotacao_snapshot ?? null,
    cotacao_snapshot_at: perna.cotacao_snapshot_at ?? null,
    resultado: perna.resultado ?? null,
    lucro_prejuizo: perna.lucro_prejuizo ?? null,
    lucro_prejuizo_brl_referencia: perna.lucro_prejuizo_brl_referencia ?? null,
    gerou_freebet: perna.gerou_freebet ?? false,
    valor_freebet_gerada: perna.valor_freebet_gerada ?? null,
  };
}

/**
 * Converte array de pernas para inserts
 */
export function pernasToInserts(
  apostaId: string,
  pernas: Array<{
    bookmaker_id: string;
    bookmaker_nome?: string;
    moeda?: string;
    selecao: string;
    selecao_livre?: string;
    odd: number;
    stake: number;
    stake_brl_referencia?: number | null;
    cotacao_snapshot?: number | null;
    cotacao_snapshot_at?: string | null;
    resultado?: string | null;
    lucro_prejuizo?: number | null;
    lucro_prejuizo_brl_referencia?: number | null;
    gerou_freebet?: boolean;
    valor_freebet_gerada?: number | null;
  }>
): ApostaPernaInsert[] {
  return pernas.map((perna, index) => 
    pernaArbitragemToInsert(apostaId, perna, index)
  );
}
