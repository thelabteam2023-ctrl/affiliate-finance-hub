/**
 * Tipos centralizados para o Serviço de Apostas
 * 
 * Este arquivo define os contratos que TODOS os componentes devem respeitar.
 * Nenhuma inserção/atualização em apostas_unificada ou apostas_pernas
 * deve acontecer fora do ApostaService.
 */

import type { ApostaEstrategia, FormaRegistro, ContextoOperacional, FonteSaldo } from '@/lib/apostaConstants';

// ============================================================================
// INVARIANTES DE DOMÍNIO
// ============================================================================

/**
 * Lista de invariantes que NUNCA podem ser violadas
 * O sistema deve lançar erro se qualquer uma for violada
 */
export const DOMAIN_INVARIANTS = {
  /** Aposta com múltiplas pernas DEVE ter registros em apostas_pernas */
  PERNAS_REQUIRED_FOR_MULTI: 'PERNAS_REQUIRED_FOR_MULTI',
  /** Bookmaker da perna DEVE pertencer ao mesmo projeto da aposta */
  BOOKMAKER_PROJETO_MATCH: 'BOOKMAKER_PROJETO_MATCH',
  /** Aposta PENDENTE SEMPRE impacta saldo_em_aposta */
  PENDING_IMPACTS_BALANCE: 'PENDING_IMPACTS_BALANCE',
  /** Dual-write DEVE ser atômico */
  ATOMIC_DUAL_WRITE: 'ATOMIC_DUAL_WRITE',
  /** Estratégia SUREBET requer forma ARBITRAGEM e 2+ pernas */
  SUREBET_REQUIRES_ARBITRAGEM: 'SUREBET_REQUIRES_ARBITRAGEM',
  /** Stake total não pode exceder saldo operável */
  STAKE_WITHIN_BALANCE: 'STAKE_WITHIN_BALANCE',
} as const;

export type DomainInvariant = typeof DOMAIN_INVARIANTS[keyof typeof DOMAIN_INVARIANTS];

// ============================================================================
// TIPOS DE ENTRADA (O que os Dialogs devem fornecer)
// ============================================================================

/**
 * Perna de aposta para criação/edição
 * Formato canônico que o serviço espera
 */
export interface PernaInput {
  bookmaker_id: string;
  bookmaker_nome?: string;
  moeda: string;
  selecao: string;
  selecao_livre?: string | null;
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
  is_freebet?: boolean;
}

/**
 * Dados da aposta para criação
 */
/**
 * Seleção para apostas múltiplas (JSONB)
 */
export interface SelecaoMultipla {
  descricao: string;
  odd: string | number;
  resultado?: string;
}

/**
 * Dados da aposta para criação
 */
export interface CriarApostaInput {
  projeto_id: string;
  workspace_id: string;
  user_id: string;
  
  // Classificação (obrigatória e explícita)
  forma_registro: FormaRegistro;
  estrategia: ApostaEstrategia;
  
  /**
   * DEPRECATED: contexto_operacional é agora opcional e interno.
   * NÃO usar para decisões financeiras!
   * A verdade é determinada por usar_freebet toggle.
   */
  contexto_operacional?: ContextoOperacional | null;
  
  /**
   * VERDADE FINANCEIRA: determina qual pool de capital é usado.
   * - 'NORMAL' = saldo_real + saldo_bonus (unificados)
   * - 'FREEBET' = saldo_freebet (quando usar_freebet = true)
   */
  fonte_saldo?: FonteSaldo;
  
  /** Toggle explícito: se true, debita de saldo_freebet */
  usar_freebet?: boolean;
  
  // Dados do evento
  data_aposta: string;
  evento?: string | null;
  esporte?: string | null;
  mercado?: string | null;
  
  // Para apostas simples
  bookmaker_id?: string | null;
  selecao?: string | null;
  odd?: number | null;
  stake?: number | null;
  
  // Para apostas múltiplas (forma_registro = MULTIPLA)
  tipo_multipla?: 'DUPLA' | 'TRIPLA' | null;
  selecoes?: SelecaoMultipla[] | null;
  odd_final?: number | null;
  retorno_potencial?: number | null;
  
  // Para arbitragem (forma_registro = ARBITRAGEM)
  pernas?: PernaInput[];
  
  // Freebet
  tipo_freebet?: string | null;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  
  // Metadados opcionais
  observacoes?: string | null;
  modelo?: string | null;
  lay_exchange?: string | null;
  lay_odd?: number | null;
  lay_stake?: number | null;
  lay_liability?: number | null;
  lay_comissao?: number | null;
  
  // Multi-currency
  moeda_operacao?: string;
  is_multicurrency?: boolean;
  cotacao_snapshot?: number | null;
  valor_brl_referencia?: number | null;
}

/**
 * Dados para atualização de aposta
 */
export interface AtualizarApostaInput {
  id: string;
  
  // Campos que podem ser atualizados
  evento?: string | null;
  esporte?: string | null;
  mercado?: string | null;
  observacoes?: string | null;
  
  // Para arbitragem, pode atualizar pernas
  pernas?: PernaInput[];
  
  // NUNCA mudar: projeto_id, estrategia, forma_registro, contexto_operacional
}

/**
 * Dados para liquidação
 */
export interface LiquidarApostaInput {
  id: string;
  resultado: 'GREEN' | 'RED' | 'MEIO_GREEN' | 'MEIO_RED' | 'VOID';
  lucro_prejuizo: number;
  lucro_prejuizo_brl_referencia?: number | null;
  
  // Para arbitragem, resultados por perna
  resultados_pernas?: Array<{
    ordem: number;
    resultado: string;
    lucro_prejuizo: number;
    lucro_prejuizo_brl_referencia?: number | null;
  }>;
}

// ============================================================================
// TIPOS DE SAÍDA
// ============================================================================

export interface ApostaServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    invariant?: DomainInvariant;
    details?: Record<string, unknown>;
  };
}

export interface InvariantViolation {
  invariant: DomainInvariant;
  message: string;
  context: Record<string, unknown>;
}

// ============================================================================
// VALIDAÇÃO
// ============================================================================

export interface ValidationContext {
  projeto_id: string;
  bookmaker_ids: string[];
  forma_registro: FormaRegistro;
  estrategia: ApostaEstrategia;
  pernas_count: number;
  total_stake: number;
}

export interface ValidationResult {
  valid: boolean;
  violations: InvariantViolation[];
  warnings: string[];
}
