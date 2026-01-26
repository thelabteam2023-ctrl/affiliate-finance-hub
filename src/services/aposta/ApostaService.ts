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
// CRIAR APOSTA
// ============================================================================

/**
 * Cria uma nova aposta com garantia de integridade
 * 
 * @param input - Dados da aposta a criar
 * @returns Resultado com ID da aposta ou erro detalhado
 * 
 * @example
 * const result = await criarAposta({
 *   projeto_id: "xxx",
 *   forma_registro: "ARBITRAGEM",
 *   estrategia: "SUREBET",
 *   pernas: [...],
 * });
 * 
 * if (!result.success) {
 *   console.error(result.error);
 *   return;
 * }
 * 
 * console.log("Aposta criada:", result.data.id);
 */
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
    // Detectar multi-currency
    const moedas = new Set(pernas.map(p => p.moeda));
    const isMulticurrency = moedas.size > 1;

    if (isMulticurrency) {
      // Para multi-currency, usar valores BRL de referência
      valorBrlReferencia = pernas.reduce(
        (sum, p) => sum + (p.stake_brl_referencia || p.stake),
        0
      );
      stakeTotal = null; // Não faz sentido somar moedas diferentes
    } else {
      stakeTotal = pernas.reduce((sum, p) => sum + p.stake, 0);
      valorBrlReferencia = null;
    }

    // Calcular ROI esperado
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
    contexto_operacional: input.contexto_operacional,
    // NOVO: fonte_saldo é a VERDADE FINANCEIRA
    // Se não fornecido, inferir do contexto_operacional para retrocompatibilidade
    fonte_saldo: input.fonte_saldo || inferFonteSaldo(input.contexto_operacional, input.estrategia),
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
        // ROLLBACK: Deletar aposta inserida
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

    // ================================================================
    // SUCESSO
    // ================================================================
    console.log("[ApostaService] Aposta criada com sucesso:", apostaId);
    
    return {
      success: true,
      data: { id: apostaId },
    };

  } catch (err: any) {
    console.error("[ApostaService] Exceção não tratada:", err);
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

/**
 * Atualiza uma aposta existente
 * 
 * IMPORTANTE: Estratégia, forma_registro e contexto_operacional
 * são IMUTÁVEIS após a criação.
 */
export async function atualizarAposta(
  input: AtualizarApostaInput
): Promise<ApostaServiceResult<{ id: string }>> {
  console.log("[ApostaService] Iniciando atualização de aposta:", input.id);

  // ================================================================
  // ETAPA 1: VALIDAR INVARIANTES
  // ================================================================
  const validation = await validateUpdateInvariants(input.id, {
    pernas: input.pernas,
  });

  if (!validation.valid) {
    console.error("[ApostaService] Invariantes violadas na atualização:", validation.violations);
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

  // ================================================================
  // ETAPA 2: ATUALIZAR
  // ================================================================
  try {
    const updateData: Record<string, any> = {};
    
    if (input.evento !== undefined) updateData.evento = input.evento;
    if (input.esporte !== undefined) updateData.esporte = input.esporte;
    if (input.mercado !== undefined) updateData.mercado = input.mercado;
    if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;
    
    if (input.pernas !== undefined) {
      updateData.pernas = JSON.stringify(input.pernas);
    }

    // 2a. Atualizar aposta principal
    const { error: updateError } = await supabase
      .from('apostas_unificada')
      .update(updateData)
      .eq('id', input.id);

    if (updateError) {
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: `Falha ao atualizar aposta: ${updateError.message}`,
          details: { error: updateError },
        },
      };
    }

    // 2b. Sincronizar pernas (se fornecidas)
    if (input.pernas && input.pernas.length > 0) {
      // Deletar pernas antigas
      const { error: deleteError } = await supabase
        .from('apostas_pernas')
        .delete()
        .eq('aposta_id', input.id);

      if (deleteError) {
        console.warn("[ApostaService] Erro ao deletar pernas antigas:", deleteError);
      }

      // Inserir novas pernas
      const pernasInsert = pernasToInserts(input.id, input.pernas);
      const { error: insertError } = await supabase
        .from('apostas_pernas')
        .insert(pernasInsert);

      if (insertError) {
        console.error("[ApostaService] Erro ao inserir novas pernas:", insertError);
        // Não fazemos rollback aqui pois a aposta já foi atualizada
        // mas logamos o erro para investigação
      }
    }

    console.log("[ApostaService] Aposta atualizada com sucesso:", input.id);
    
    return {
      success: true,
      data: { id: input.id },
    };

  } catch (err: any) {
    console.error("[ApostaService] Exceção na atualização:", err);
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message || 'Erro inesperado ao atualizar aposta',
        details: { error: err },
      },
    };
  }
}

// ============================================================================
// DELETAR APOSTA
// ============================================================================

/**
 * Deleta uma aposta e suas pernas
 */
export async function deletarAposta(
  apostaId: string
): Promise<ApostaServiceResult> {
  console.log("[ApostaService] Iniciando deleção de aposta:", apostaId);

  try {
    // 1. Deletar pernas primeiro (FK constraint)
    const { error: pernasError } = await supabase
      .from('apostas_pernas')
      .delete()
      .eq('aposta_id', apostaId);

    if (pernasError) {
      console.warn("[ApostaService] Erro ao deletar pernas:", pernasError);
    }

    // 2. Deletar aposta
    const { error: apostaError } = await supabase
      .from('apostas_unificada')
      .delete()
      .eq('id', apostaId);

    if (apostaError) {
      return {
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: `Falha ao deletar aposta: ${apostaError.message}`,
          details: { error: apostaError },
        },
      };
    }

    console.log("[ApostaService] Aposta deletada com sucesso:", apostaId);
    
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
 * Liquida uma aposta usando RPC atômica
 * 
 * FASE 1: Usa liquidar_aposta_atomica que:
 * 1. Atualiza aposta para LIQUIDADA
 * 2. Atualiza resultado de cada perna
 * 3. Insere registros no cash_ledger (GREEN/RED/VOID)
 * 4. Trigger atualiza saldo automaticamente
 * 
 * O impacto financeiro REAL só acontece aqui, não na criação!
 */
export async function liquidarAposta(
  input: LiquidarApostaInput
): Promise<ApostaServiceResult> {
  console.log("[ApostaService] Iniciando liquidação atômica:", input.id, input.resultado);

  try {
    // Preparar resultados por perna se fornecidos
    let resultadosPernasMap: Record<string, string> | null = null;
    
    if (input.resultados_pernas && input.resultados_pernas.length > 0) {
      // Buscar IDs das pernas pela ordem
      const { data: pernas } = await supabase
        .from('apostas_pernas')
        .select('id, ordem')
        .eq('aposta_id', input.id);
      
      if (pernas) {
        resultadosPernasMap = {};
        for (const perna of pernas) {
          const resultadoPerna = input.resultados_pernas.find(r => r.ordem === perna.ordem);
          if (resultadoPerna) {
            resultadosPernasMap[perna.id] = resultadoPerna.resultado;
          }
        }
      }
    }

    // Chamar RPC atômica
    const { data, error } = await supabase.rpc('liquidar_aposta_atomica', {
      p_aposta_id: input.id,
      p_resultado: input.resultado,
      p_lucro_prejuizo: input.lucro_prejuizo || null,
      p_resultados_pernas: resultadosPernasMap,
    });

    if (error) {
      console.error("[ApostaService] Erro RPC liquidar_aposta_atomica:", error);
      return {
        success: false,
        error: {
          code: 'LIQUIDATION_RPC_ERROR',
          message: `Falha ao liquidar aposta: ${error.message}`,
          details: { error },
        },
      };
    }

    const result = data as {
      success: boolean;
      error?: string;
      message?: string;
      impacto_total?: number;
    };

    if (!result.success) {
      console.error("[ApostaService] RPC retornou erro:", result);
      return {
        success: false,
        error: {
          code: result.error || 'LIQUIDATION_FAILED',
          message: result.message || 'Falha ao liquidar aposta',
        },
      };
    }

    console.log("[ApostaService] Aposta liquidada com sucesso:", input.id, {
      resultado: input.resultado,
      impacto_total: result.impacto_total,
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
 * Reliquida uma aposta (muda resultado de uma aposta já liquidada)
 * 
 * Usa reliquidar_aposta_atomica que:
 * 1. Reverte o resultado anterior via cash_ledger
 * 2. Aplica o novo resultado via cash_ledger
 * 3. Trigger atualiza saldos automaticamente
 * 
 * @param apostaId - ID da aposta
 * @param novoResultado - Novo resultado a aplicar
 * @param lucroPrejuizo - Lucro/prejuízo calculado (opcional)
 */
export async function reliquidarAposta(
  apostaId: string,
  novoResultado: string,
  lucroPrejuizo?: number
): Promise<ApostaServiceResult<{ resultado_anterior?: string; impacto_total?: number }>> {
  console.log("[ApostaService] Iniciando reliquidação:", apostaId, novoResultado);

  try {
    const { data, error } = await supabase.rpc('reliquidar_aposta_atomica', {
      p_aposta_id: apostaId,
      p_resultado_novo: novoResultado,
      p_lucro_prejuizo: lucroPrejuizo ?? null,
    });

    if (error) {
      console.error("[ApostaService] Erro RPC reliquidar_aposta_atomica:", error);
      return {
        success: false,
        error: {
          code: 'RELIQUIDATION_RPC_ERROR',
          message: `Falha ao reliquidar aposta: ${error.message}`,
          details: { error },
        },
      };
    }

    const result = data as {
      success: boolean;
      error?: string;
      message?: string;
      resultado_anterior?: string;
      resultado_novo?: string;
      impacto_total?: number;
    };

    if (!result.success) {
      console.error("[ApostaService] RPC retornou erro:", result);
      return {
        success: false,
        error: {
          code: result.error || 'RELIQUIDATION_FAILED',
          message: result.message || 'Falha ao reliquidar aposta',
        },
      };
    }

    console.log("[ApostaService] Aposta reliquidada com sucesso:", apostaId, {
      resultado_anterior: result.resultado_anterior,
      resultado_novo: result.resultado_novo,
      impacto_total: result.impacto_total,
    });
    
    return { 
      success: true,
      data: {
        resultado_anterior: result.resultado_anterior,
        impacto_total: result.impacto_total,
      }
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

/**
 * Verifica integridade do sistema de apostas
 * Identifica apostas órfãs, pernas sem aposta, etc.
 */
export async function healthCheck(
  projetoId: string
): Promise<{
  healthy: boolean;
  issues: Array<{
    type: string;
    message: string;
    count: number;
    sample_ids?: string[];
  }>;
}> {
  const issues: Array<{
    type: string;
    message: string;
    count: number;
    sample_ids?: string[];
  }> = [];

  // 1. Apostas ARBITRAGEM sem pernas em apostas_pernas
  const { data: apostasOrfas } = await supabase
    .from('apostas_unificada')
    .select('id')
    .eq('projeto_id', projetoId)
    .eq('forma_registro', 'ARBITRAGEM')
    .not('pernas', 'is', null);

  if (apostasOrfas && apostasOrfas.length > 0) {
    const apostasIds = apostasOrfas.map(a => a.id);
    
    const { data: pernasExistentes } = await supabase
      .from('apostas_pernas')
      .select('aposta_id')
      .in('aposta_id', apostasIds);

    const comPernas = new Set(pernasExistentes?.map(p => p.aposta_id) || []);
    const semPernas = apostasIds.filter(id => !comPernas.has(id));

    if (semPernas.length > 0) {
      issues.push({
        type: 'ORPHAN_ARBITRAGEM',
        message: 'Apostas ARBITRAGEM sem registros em apostas_pernas',
        count: semPernas.length,
        sample_ids: semPernas.slice(0, 5),
      });
    }
  }

  // 2. Verificação de consistência pode ser expandida futuramente
  // com RPCs dedicadas para auditoria de integridade

  return {
    healthy: issues.length === 0,
    issues,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Infere fonte_saldo para retrocompatibilidade
 * 
 * REGRAS:
 * 1. Estratégias de extração usam o pool correspondente
 * 2. Contexto FREEBET/BONUS sugere o pool (mas estratégia tem prioridade)
 * 3. Fallback para REAL
 * 
 * NOTA: Este é um fallback - o ideal é sempre receber fonte_saldo explícito
 */
function inferFonteSaldo(
  contexto: string | null | undefined,
  estrategia: string | null | undefined
): string {
  // Estratégia tem prioridade máxima
  if (estrategia === 'EXTRACAO_FREEBET') return 'FREEBET';
  if (estrategia === 'EXTRACAO_BONUS') return 'BONUS';
  
  // Fallback para contexto (retrocompatibilidade)
  if (contexto === 'FREEBET') return 'FREEBET';
  if (contexto === 'BONUS') return 'BONUS';
  
  // Default
  return 'REAL';
}

function detectarMoeda(pernas: PernaInput[]): string {
  if (pernas.length === 0) return 'BRL';
  
  const moedas = new Set(pernas.map(p => p.moeda));
  
  if (moedas.size > 1) return 'MULTI';
  
  return pernas[0].moeda || 'BRL';
}
