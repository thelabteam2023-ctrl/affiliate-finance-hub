/**
 * Validador de Invariantes de Domínio
 * 
 * Este módulo implementa as regras de negócio que NUNCA podem ser violadas.
 * Se qualquer invariante falhar, a operação deve ser abortada.
 * 
 * FAIL FAST: Nenhum comportamento silencioso. Erros são explícitos.
 */

import { supabase } from "@/integrations/supabase/client";
import { FORMA_REGISTRO } from "@/lib/apostaConstants";
import type {
  ValidationContext,
  ValidationResult,
  InvariantViolation,
  PernaInput,
  CriarApostaInput,
  DOMAIN_INVARIANTS,
} from "./types";

/**
 * Valida todas as invariantes antes de permitir a operação
 * 
 * @throws Nunca - sempre retorna resultado estruturado
 */
export async function validateInvariants(
  input: CriarApostaInput
): Promise<ValidationResult> {
  const violations: InvariantViolation[] = [];
  const warnings: string[] = [];

  // ================================================================
  // INVARIANT_001: Pernas obrigatórias para multi-perna
  // ================================================================
  if (input.forma_registro === FORMA_REGISTRO.ARBITRAGEM) {
    if (!input.pernas || input.pernas.length < 2) {
      violations.push({
        invariant: 'PERNAS_REQUIRED_FOR_MULTI',
        message: `Arbitragem requer no mínimo 2 pernas. Recebido: ${input.pernas?.length || 0}`,
        context: {
          forma_registro: input.forma_registro,
          pernas_count: input.pernas?.length || 0,
        },
      });
    }
  }

  // ================================================================
  // INVARIANT_002: Bookmaker deve pertencer ao projeto
  // ================================================================
  const bookmakerIds = getBookmakerIds(input);
  if (bookmakerIds.length > 0) {
    const { data: bookmakers, error } = await supabase
      .from('bookmakers')
      .select('id, nome, projeto_id')
      .in('id', bookmakerIds);

    if (error) {
      violations.push({
        invariant: 'BOOKMAKER_PROJETO_MATCH',
        message: `Erro ao verificar bookmakers: ${error.message}`,
        context: { error: error.message },
      });
    } else if (bookmakers) {
      for (const bk of bookmakers) {
        if (bk.projeto_id !== input.projeto_id) {
          violations.push({
            invariant: 'BOOKMAKER_PROJETO_MATCH',
            message: `Bookmaker "${bk.nome}" (${bk.id}) pertence ao projeto ${bk.projeto_id}, não ao projeto ${input.projeto_id}`,
            context: {
              bookmaker_id: bk.id,
              bookmaker_nome: bk.nome,
              bookmaker_projeto: bk.projeto_id,
              aposta_projeto: input.projeto_id,
            },
          });
        }
      }

      // Verificar se todos os bookmakers foram encontrados
      const foundIds = new Set(bookmakers.map(b => b.id));
      for (const id of bookmakerIds) {
        if (!foundIds.has(id)) {
          violations.push({
            invariant: 'BOOKMAKER_PROJETO_MATCH',
            message: `Bookmaker ${id} não encontrada`,
            context: { bookmaker_id: id },
          });
        }
      }
    }
  }

  // ================================================================
  // INVARIANT_005: SUREBET requer ARBITRAGEM e 2+ pernas
  // ================================================================
  if (input.estrategia === 'SUREBET') {
    if (input.forma_registro !== FORMA_REGISTRO.ARBITRAGEM) {
      violations.push({
        invariant: 'SUREBET_REQUIRES_ARBITRAGEM',
        message: `Estratégia SUREBET requer forma_registro ARBITRAGEM. Recebido: ${input.forma_registro}`,
        context: {
          estrategia: input.estrategia,
          forma_registro: input.forma_registro,
        },
      });
    }

    if (!input.pernas || input.pernas.length < 2) {
      violations.push({
        invariant: 'SUREBET_REQUIRES_ARBITRAGEM',
        message: `Estratégia SUREBET requer no mínimo 2 pernas. Recebido: ${input.pernas?.length || 0}`,
        context: {
          estrategia: input.estrategia,
          pernas_count: input.pernas?.length || 0,
        },
      });
    }
  }

  // ================================================================
  // INVARIANT_006: Stake não pode exceder saldo operável
  // ================================================================
  if (bookmakerIds.length > 0 && input.pernas) {
    const { data: saldos, error: saldosError } = await supabase
      .rpc('get_bookmaker_saldos', { p_projeto_id: input.projeto_id });

    if (!saldosError && saldos) {
      const saldosMap = new Map(saldos.map((s: any) => [s.id, s]));

      for (const perna of input.pernas) {
        if (perna.is_freebet) continue; // Freebet não debita saldo

        const saldo = saldosMap.get(perna.bookmaker_id) as any;
        if (saldo) {
          const saldoOperavel = saldo.saldo_operavel || 0;
          if (perna.stake > saldoOperavel) {
            violations.push({
              invariant: 'STAKE_WITHIN_BALANCE',
              message: `Stake R$ ${perna.stake.toFixed(2)} excede saldo operável R$ ${saldoOperavel.toFixed(2)} da bookmaker ${perna.bookmaker_nome || perna.bookmaker_id}`,
              context: {
                bookmaker_id: perna.bookmaker_id,
                stake: perna.stake,
                saldo_operavel: saldoOperavel,
              },
            });
          }
        }
      }
    }
  }

  // ================================================================
  // WARNINGS (não bloqueantes)
  // ================================================================
  if (input.estrategia === 'EXTRACAO_FREEBET' && input.contexto_operacional !== 'FREEBET') {
    warnings.push('Estratégia EXTRACAO_FREEBET geralmente usa contexto FREEBET');
  }

  if (input.estrategia === 'EXTRACAO_BONUS' && input.contexto_operacional !== 'BONUS') {
    warnings.push('Estratégia EXTRACAO_BONUS geralmente usa contexto BONUS');
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Valida invariantes para atualização
 */
export async function validateUpdateInvariants(
  apostaId: string,
  updates: { pernas?: PernaInput[] }
): Promise<ValidationResult> {
  const violations: InvariantViolation[] = [];
  const warnings: string[] = [];

  // Buscar aposta existente
  const { data: aposta, error } = await supabase
    .from('apostas_unificada')
    .select('id, projeto_id, forma_registro, estrategia')
    .eq('id', apostaId)
    .single();

  if (error || !aposta) {
    violations.push({
      invariant: 'BOOKMAKER_PROJETO_MATCH',
      message: `Aposta ${apostaId} não encontrada`,
      context: { aposta_id: apostaId },
    });
    return { valid: false, violations, warnings };
  }

  // Se atualizando pernas, validar bookmakers
  if (updates.pernas && updates.pernas.length > 0) {
    const bookmakerIds = updates.pernas.map(p => p.bookmaker_id);
    
    const { data: bookmakers } = await supabase
      .from('bookmakers')
      .select('id, nome, projeto_id')
      .in('id', bookmakerIds);

    if (bookmakers) {
      for (const bk of bookmakers) {
        if (bk.projeto_id !== aposta.projeto_id) {
          violations.push({
            invariant: 'BOOKMAKER_PROJETO_MATCH',
            message: `Bookmaker "${bk.nome}" não pertence ao projeto desta aposta`,
            context: {
              bookmaker_id: bk.id,
              bookmaker_projeto: bk.projeto_id,
              aposta_projeto: aposta.projeto_id,
            },
          });
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Extrai IDs de bookmaker do input
 */
function getBookmakerIds(input: CriarApostaInput): string[] {
  const ids: string[] = [];
  
  if (input.bookmaker_id) {
    ids.push(input.bookmaker_id);
  }
  
  if (input.pernas) {
    for (const perna of input.pernas) {
      if (perna.bookmaker_id && !ids.includes(perna.bookmaker_id)) {
        ids.push(perna.bookmaker_id);
      }
    }
  }
  
  return ids;
}

/**
 * Formata violações para exibição
 */
export function formatViolations(violations: InvariantViolation[]): string {
  return violations
    .map(v => `[${v.invariant}] ${v.message}`)
    .join('\n');
}

/**
 * Verifica se um erro é uma violação de invariante
 */
export function isInvariantViolation(error: unknown): error is { violations: InvariantViolation[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'violations' in error &&
    Array.isArray((error as any).violations)
  );
}
