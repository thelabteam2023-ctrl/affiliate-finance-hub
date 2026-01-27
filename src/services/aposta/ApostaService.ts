/**
 * ApostaService - Serviço Centralizado de Apostas
 * 
 * REGRA FUNDAMENTAL:
 * TODA criação, atualização e exclusão de apostas DEVE passar por este serviço.
 * Inserções diretas em apostas_unificada ou apostas_pernas são PROIBIDAS.
 * 
 * Este serviço garante:
 * 1. Validação de invariantes antes de qualquer operação
 * 2. Dual-write atômico (apostas_unificada + apostas_pernas)
 * 3. Fail fast - erros explícitos, nunca silenciosos
 * 4. Auditoria completa de operações
 * 
 * ARQUITETURA FINANCEIRA v7:
 * - Usa RPCs v4 (criar_aposta_atomica_v3, liquidar_aposta_v4, reverter_liquidacao_v4)
 * - Toda movimentação financeira gera eventos em financial_events
 * - NENHUM trigger atualiza saldo - tudo via RPC
 */

import { supabase } from "@/integrations/supabase/client";
import { pernasToInserts } from "@/types/apostasPernas";
import { validateInvariants, validateUpdateInvariants, formatViolations } from "./invariants";
import type {
  CriarApostaInput,
  AtualizarApostaInput,
  LiquidarApostaInput,
  ApostaServiceResult,
  PernaInput,
} from "./types";

// ============================================================================
// HELPERS
// ============================================================================

function inferFonteSaldo(contexto?: string, estrategia?: string, usarFreebet?: boolean): string {
  if (usarFreebet) return 'FREEBET';
  return 'REAL';
}

function detectarMoeda(pernas: PernaInput[]): string {
  if (pernas.length === 0) return 'BRL';
  const moedas = new Set(pernas.map(p => p.moeda || 'BRL'));
  return moedas.size === 1 ? [...moedas][0] : 'MULTI';
}

// ============================================================================
// CRIAR APOSTA
// ============================================================================

export async function criarAposta(
  input: CriarApostaInput
): Promise<ApostaServiceResult<{ id: string }>> {
  console.log("[ApostaService] Iniciando criação de aposta", {
    forma_registro: input.forma_registro,
    estrategia: input.estrategia,
    pernas_count: input.pernas?.length || 0,
  });

  // ================================================================
  // ETAPA 1: VALIDAR INVARIANTES (FAIL FAST)
  // ================================================================
  const validation = await validateInvariants(input);
  
  if (!validation.valid) {
    console.error("[ApostaService] Invariantes violadas:", validation.violations);
    return {
      success: false,
      error: {
        code: 'INVARIANT_VIOLATION',
        message: formatViolations(validation.violations),
        invariant: validation.violations[0]?.invariant,
        details: { violations: validation.violations },
      },
    };
  }

  if (validation.warnings.length > 0) {
    console.warn("[ApostaService] Warnings:", validation.warnings);
  }

  // ================================================================
  // ETAPA 2: PREPARAR DADOS
  // ================================================================
  const isArbitragem = input.forma_registro === 'ARBITRAGEM';
  const isMultipla = input.forma_registro === 'MULTIPLA';
  const pernas = input.pernas || [];

  // Calcular valores agregados para arbitragem
  let stakeTotal: number | null = null;
  let lucroEsperado: number | null = null;
  let roiEsperado: number | null = null;
  let valorBrlReferencia: number | null = null;

  if (isArbitragem && pernas.length > 0) {
    const moedas = new Set(pernas.map(p => p.moeda));
    const isMulticurrency = moedas.size > 1;

    if (isMulticurrency) {
      valorBrlReferencia = pernas.reduce(
        (sum, p) => sum + (p.stake_brl_referencia || p.stake),
        0
      );
      stakeTotal = null;
    } else {
      stakeTotal = pernas.reduce((sum, p) => sum + p.stake, 0);
      valorBrlReferencia = null;
    }

    const inverseSumOdds = pernas.reduce((sum, p) => sum + (1 / p.odd), 0);
    roiEsperado = (1 - inverseSumOdds) * 100;
    lucroEsperado = (stakeTotal || valorBrlReferencia || 0) * (roiEsperado / 100);
  }

  // Calcular odd_final para múltiplas (se não fornecida)
  let oddFinalCalculada = input.odd_final;
  let retornoPotencialCalculado = input.retorno_potencial;
  
  if (isMultipla && input.selecoes && input.selecoes.length > 0) {
    if (!oddFinalCalculada) {
      oddFinalCalculada = input.selecoes.reduce((acc, s) => {
        const odd = typeof s.odd === 'string' ? parseFloat(s.odd) : s.odd;
        return acc * (odd || 1);
      }, 1);
    }
    if (!retornoPotencialCalculado && input.stake && oddFinalCalculada) {
      retornoPotencialCalculado = input.stake * oddFinalCalculada;
    }
  }

  // Montar objeto para inserção
  const apostaData: Record<string, unknown> = {
    projeto_id: input.projeto_id,
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    forma_registro: input.forma_registro,
    estrategia: input.estrategia,
    contexto_operacional: input.contexto_operacional || 'NORMAL',
    fonte_saldo: input.fonte_saldo || inferFonteSaldo(input.contexto_operacional, input.estrategia, input.usar_freebet),
    usar_freebet: input.usar_freebet || false,
    data_aposta: input.data_aposta,
    evento: input.evento,
    esporte: input.esporte,
    mercado: input.mercado,
    observacoes: input.observacoes,
    status: 'PENDENTE',
    resultado: 'PENDENTE',
    
    // Para simples e múltipla
    bookmaker_id: isArbitragem ? null : input.bookmaker_id,
    selecao: isArbitragem || isMultipla ? null : input.selecao,
    odd: isArbitragem || isMultipla ? null : input.odd,
    stake: isArbitragem ? null : input.stake,
    
    // Para múltipla (JSONB selecoes)
    tipo_multipla: isMultipla ? input.tipo_multipla : null,
    selecoes: isMultipla && input.selecoes ? input.selecoes : null,
    odd_final: isMultipla ? oddFinalCalculada : null,
    retorno_potencial: isMultipla ? retornoPotencialCalculado : null,
    
    // Freebet
    tipo_freebet: input.tipo_freebet || null,
    gerou_freebet: input.gerou_freebet || false,
    valor_freebet_gerada: input.valor_freebet_gerada || null,
    
    // Para arbitragem
    pernas: isArbitragem ? JSON.stringify(pernas) : null,
    stake_total: stakeTotal,
    lucro_esperado: lucroEsperado,
    roi_esperado: roiEsperado,
    
    // Multi-currency
    moeda_operacao: input.moeda_operacao || (isArbitragem ? detectarMoeda(pernas) : 'BRL'),
    is_multicurrency: input.is_multicurrency,
    valor_brl_referencia: valorBrlReferencia || input.valor_brl_referencia,
    cotacao_snapshot: input.cotacao_snapshot,
    
    // Modelo surebet (se aplicável)
    modelo: input.modelo,
    
    // Lay (se aplicável)
    lay_exchange: input.lay_exchange,
    lay_odd: input.lay_odd,
    lay_stake: input.lay_stake,
    lay_liability: input.lay_liability,
    lay_comissao: input.lay_comissao,
  };

  // ================================================================
  // ETAPA 3: TRANSAÇÃO ATÔMICA (DUAL-WRITE)
  // ================================================================
  try {
    // 3a. Inserir aposta principal
    const { data: insertedAposta, error: insertError } = await supabase
      .from('apostas_unificada')
      .insert(apostaData as any)
      .select('id')
      .single();

    if (insertError) {
      console.error("[ApostaService] Erro ao inserir apostas_unificada:", insertError);
      return {
        success: false,
        error: {
          code: 'INSERT_FAILED',
          message: `Falha ao inserir aposta: ${insertError.message}`,
          details: { error: insertError },
        },
      };
    }

    const apostaId = insertedAposta.id;

    // 3b. Inserir pernas (se arbitragem)
    if (isArbitragem && pernas.length > 0) {
      const pernasInsert = pernasToInserts(apostaId, pernas);
      
      const { error: pernasError } = await supabase
        .from('apostas_pernas')
        .insert(pernasInsert);

      if (pernasError) {
        console.error("[ApostaService] Erro ao inserir apostas_pernas, fazendo rollback:", pernasError);
        
        await supabase
          .from('apostas_unificada')
          .delete()
          .eq('id', apostaId);

        return {
          success: false,
          error: {
            code: 'DUAL_WRITE_FAILED',
            message: `Falha no dual-write: ${pernasError.message}. Operação revertida.`,
            invariant: 'ATOMIC_DUAL_WRITE',
            details: { error: pernasError },
          },
        };
      }

      console.log("[ApostaService] Dual-write concluído:", {
        aposta_id: apostaId,
        pernas_inseridas: pernasInsert.length,
      });
    }

    console.log("[ApostaService] ✅ Aposta criada:", apostaId);
    return {
      success: true,
      data: { id: apostaId },
    };

  } catch (err: any) {
    console.error("[ApostaService] Exceção na criação:", err);
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message || 'Erro inesperado ao criar aposta',
        details: { error: err },
      },
    };
  }
}

// ============================================================================
// ATUALIZAR APOSTA
// ============================================================================

export async function atualizarAposta(
  apostaId: string,
  input: AtualizarApostaInput
): Promise<ApostaServiceResult> {
  console.log("[ApostaService] Iniciando atualização:", apostaId, input);

  // Validar invariantes de atualização
  const validation = await validateUpdateInvariants(apostaId, input);
  
  if (!validation.valid) {
    return {
      success: false,
      error: {
        code: 'INVARIANT_VIOLATION',
        message: formatViolations(validation.violations),
        details: { violations: validation.violations },
      },
    };
  }

  try {
    // Remover pernas do input antes de atualizar (pernas são atualizadas separadamente)
    const { pernas, ...updateData } = input as any;
    
    const { error } = await supabase
      .from('apostas_unificada')
      .update(updateData)
      .eq('id', apostaId);

    if (error) {
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: `Falha ao atualizar: ${error.message}`,
          details: { error },
        },
      };
    }

    console.log("[ApostaService] ✅ Aposta atualizada:", apostaId);
    return { success: true };

  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message,
        details: { error: err },
      },
    };
  }
}

// ============================================================================
// DELETAR APOSTA
// ============================================================================

/**
 * Deleta uma aposta usando o motor de eventos v7.
 * O RPC deletar_aposta_v4 cuida de:
 * 1. Reverter liquidação se necessário
 * 2. Reverter stake via eventos REVERSAL
 * 3. Deletar pernas e aposta
 */
export async function deletarAposta(
  apostaId: string
): Promise<ApostaServiceResult> {
  console.log("[ApostaService] Iniciando deleção v7:", apostaId);

  try {
    const { data, error } = await supabase.rpc('deletar_aposta_v4', {
      p_aposta_id: apostaId,
    });

    if (error) {
      console.error("[ApostaService] Erro RPC deletar_aposta_v4:", error);
      return {
        success: false,
        error: {
          code: 'DELETE_RPC_ERROR',
          message: `Falha ao deletar aposta: ${error.message}`,
          details: { error },
        },
      };
    }

    const result = data?.[0];
    if (!result?.success) {
      return {
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: result?.message || 'Falha ao deletar aposta',
        },
      };
    }

    console.log("[ApostaService] ✅ Aposta deletada:", apostaId);
    return { success: true };

  } catch (err: any) {
    console.error("[ApostaService] Exceção na deleção:", err);
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message || 'Erro inesperado ao deletar aposta',
        details: { error: err },
      },
    };
  }
}

// ============================================================================
// LIQUIDAR APOSTA
// ============================================================================

/**
 * Liquida uma aposta usando o motor de eventos v7.
 * O RPC liquidar_aposta_v4 cuida de:
 * 1. Calcular payout baseado no resultado
 * 2. Criar eventos em financial_events
 * 3. Atualizar saldo da bookmaker
 * 4. Atualizar status da aposta
 */
export async function liquidarAposta(
  input: LiquidarApostaInput
): Promise<ApostaServiceResult> {
  console.log("[ApostaService] Iniciando liquidação v7:", input.id, input.resultado);

  try {
    const { data, error } = await supabase.rpc('liquidar_aposta_v4', {
      p_aposta_id: input.id,
      p_resultado: input.resultado,
      p_lucro_prejuizo: input.lucro_prejuizo ?? null,
    });

    if (error) {
      console.error("[ApostaService] Erro RPC liquidar_aposta_v4:", error);
      return {
        success: false,
        error: {
          code: 'LIQUIDATION_RPC_ERROR',
          message: `Falha ao liquidar aposta: ${error.message}`,
          details: { error },
        },
      };
    }

    const result = data?.[0];
    if (!result?.success) {
      console.error("[ApostaService] RPC retornou erro:", result);
      return {
        success: false,
        error: {
          code: 'LIQUIDATION_FAILED',
          message: result?.message || 'Falha ao liquidar aposta',
        },
      };
    }

    console.log("[ApostaService] ✅ Aposta liquidada:", input.id, {
      resultado: input.resultado,
      events_created: result.events_created,
    });
    
    return { success: true };

  } catch (err: any) {
    console.error("[ApostaService] Exceção na liquidação:", err);
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message || 'Erro inesperado ao liquidar aposta',
        details: { error: err },
      },
    };
  }
}

// ============================================================================
// RELIQUIDAR APOSTA (mudar resultado de aposta já liquidada)
// ============================================================================

/**
 * Reliquida uma aposta (muda resultado de uma aposta já liquidada).
 * Usa reverter_liquidacao_v4 + liquidar_aposta_v4 para garantir
 * que eventos de reversão sejam criados corretamente.
 */
export async function reliquidarAposta(
  apostaId: string,
  novoResultado: string,
  lucroPrejuizo?: number
): Promise<ApostaServiceResult<{ resultado_anterior?: string; impacto_total?: number }>> {
  console.log("[ApostaService] Iniciando reliquidação v7:", apostaId, novoResultado);

  try {
    // Buscar resultado anterior
    const { data: apostaAtual } = await supabase
      .from('apostas_unificada')
      .select('resultado, status')
      .eq('id', apostaId)
      .single();
    
    const resultadoAnterior = apostaAtual?.resultado;
    
    // Se não estava liquidada, apenas liquidar
    if (apostaAtual?.status !== 'LIQUIDADA') {
      const liquidResult = await liquidarAposta({
        id: apostaId,
        resultado: novoResultado as any,
        lucro_prejuizo: lucroPrejuizo,
      });
      
      if (!liquidResult.success) return liquidResult as any;
      
      return {
        success: true,
        data: { resultado_anterior: resultadoAnterior || undefined },
      };
    }

    // 1. Reverter liquidação anterior
    const { data: revertData, error: revertError } = await supabase.rpc('reverter_liquidacao_v4', {
      p_aposta_id: apostaId,
    });

    if (revertError) {
      console.error("[ApostaService] Erro ao reverter:", revertError);
      return {
        success: false,
        error: {
          code: 'REVERT_RPC_ERROR',
          message: `Falha ao reverter liquidação: ${revertError.message}`,
          details: { error: revertError },
        },
      };
    }

    const revertResult = revertData?.[0];
    if (!revertResult?.success) {
      return {
        success: false,
        error: {
          code: 'REVERT_FAILED',
          message: revertResult?.message || 'Falha ao reverter liquidação',
        },
      };
    }

    // 2. Aplicar novo resultado
    const { data: liquidData, error: liquidError } = await supabase.rpc('liquidar_aposta_v4', {
      p_aposta_id: apostaId,
      p_resultado: novoResultado,
      p_lucro_prejuizo: lucroPrejuizo ?? null,
    });

    if (liquidError) {
      console.error("[ApostaService] Erro ao reliquidar:", liquidError);
      return {
        success: false,
        error: {
          code: 'RELIQUIDATION_RPC_ERROR',
          message: `Falha ao reliquidar aposta: ${liquidError.message}`,
          details: { error: liquidError },
        },
      };
    }

    const liquidResult = liquidData?.[0];
    if (!liquidResult?.success) {
      return {
        success: false,
        error: {
          code: 'RELIQUIDATION_FAILED',
          message: liquidResult?.message || 'Falha ao reliquidar aposta',
        },
      };
    }

    console.log("[ApostaService] ✅ Aposta reliquidada:", apostaId, {
      resultado_anterior: resultadoAnterior,
      resultado_novo: novoResultado,
      events_created: liquidResult.events_created,
    });
    
    return {
      success: true,
      data: { resultado_anterior: resultadoAnterior || undefined },
    };

  } catch (err: any) {
    console.error("[ApostaService] Exceção na reliquidação:", err);
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message || 'Erro inesperado ao reliquidar aposta',
        details: { error: err },
      },
    };
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase
      .from('apostas_unificada')
      .select('id')
      .limit(1);
    
    if (error) {
      return { ok: false, message: `Database error: ${error.message}` };
    }
    
    return { ok: true, message: 'ApostaService v7 operational' };
  } catch (err: any) {
    return { ok: false, message: `Exception: ${err.message}` };
  }
}
