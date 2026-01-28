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
// LIQUIDAR SUREBET (apostas multi-perna / arbitragem)
// ============================================================================

/**
 * Interface para resultado de perna em liquidação de Surebet
 */
export interface LiquidarSurebetPernaInput {
  perna_id: string;
  bookmaker_id: string;
  resultado: 'GREEN' | 'RED' | 'VOID' | 'MEIO_GREEN' | 'MEIO_RED';
  stake: number;
  odd: number;
  lucro_prejuizo: number;
  moeda?: string;
}

/**
 * Liquida uma Surebet (aposta multi-perna / arbitragem).
 * 
 * DIFERENÇA DO liquidarAposta:
 * - Surebets têm bookmaker_id NULL no registro pai
 * - Cada perna tem seu próprio bookmaker_id
 * - Precisamos processar eventos financeiros POR PERNA
 * 
 * O fluxo:
 * 1. Atualiza resultado de cada perna
 * 2. Cria eventos financeiros para cada perna (PAYOUT para winners)
 * 3. Atualiza registro pai com status LIQUIDADA e lucro total
 */
export async function liquidarSurebet(
  surebetId: string,
  pernasResultados: LiquidarSurebetPernaInput[],
  resultadoFinal: 'GREEN' | 'RED' | 'VOID',
  lucroTotal: number,
  workspaceId: string
): Promise<ApostaServiceResult<{ events_created: number }>> {
  console.log("[ApostaService] Iniciando liquidação de Surebet:", surebetId, resultadoFinal);

  try {
    // Verificar se a surebet existe e está pendente
    const { data: surebet, error: fetchError } = await supabase
      .from('apostas_unificada')
      .select('id, status, forma_registro')
      .eq('id', surebetId)
      .single();

    if (fetchError || !surebet) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Surebet não encontrada',
        },
      };
    }

    if (surebet.status === 'LIQUIDADA') {
      return {
        success: false,
        error: {
          code: 'ALREADY_LIQUIDATED',
          message: 'Surebet já foi liquidada',
        },
      };
    }

    let eventsCreated = 0;

    // Processar cada perna
    for (const perna of pernasResultados) {
      // 1. Atualizar resultado da perna
      const { error: updatePernaError } = await supabase
        .from('apostas_pernas')
        .update({
          resultado: perna.resultado,
          lucro_prejuizo: perna.lucro_prejuizo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', perna.perna_id);

      if (updatePernaError) {
        console.error("[ApostaService] Erro ao atualizar perna:", updatePernaError);
        // Continue para não travar - log o erro
      }

      // 2. Criar evento financeiro para pernas vencedoras (GREEN, VOID, MEIO_GREEN)
      if (['GREEN', 'VOID', 'MEIO_GREEN', 'MEIO_RED'].includes(perna.resultado) && perna.lucro_prejuizo !== undefined) {
        let payout = 0;
        let tipoEvento = 'PAYOUT';

        if (perna.resultado === 'GREEN') {
          payout = perna.stake * perna.odd; // stake + lucro
        } else if (perna.resultado === 'VOID') {
          payout = perna.stake; // devolve stake
          tipoEvento = 'VOID_REFUND';
        } else if (perna.resultado === 'MEIO_GREEN') {
          payout = perna.stake + (perna.stake * (perna.odd - 1) / 2);
        } else if (perna.resultado === 'MEIO_RED') {
          payout = perna.stake / 2;
          tipoEvento = 'VOID_REFUND';
        }

        if (payout > 0) {
          const idempotencyKey = `surebet_payout_${surebetId}_${perna.perna_id}`;
          
          const { error: eventError } = await supabase
            .from('financial_events')
            .insert({
              bookmaker_id: perna.bookmaker_id,
              aposta_id: surebetId,
              workspace_id: workspaceId,
              tipo_evento: tipoEvento,
              tipo_uso: 'NORMAL',
              origem: 'LUCRO',
              valor: payout,
              moeda: perna.moeda || 'BRL',
              idempotency_key: idempotencyKey,
              descricao: `Payout Surebet - ${perna.resultado}`,
              processed_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (!eventError) {
            eventsCreated++;
            
            // Nota: O trigger tr_financial_event_sync atualiza automaticamente 
            // bookmakers.saldo_atual quando um evento é inserido em financial_events
          }
        }
      }
    }

    // 3. Atualizar registro pai da surebet
    const { error: updateError } = await supabase
      .from('apostas_unificada')
      .update({
        status: 'LIQUIDADA',
        resultado: resultadoFinal,
        lucro_prejuizo: lucroTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', surebetId);

    if (updateError) {
      console.error("[ApostaService] Erro ao atualizar surebet pai:", updateError);
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: `Falha ao atualizar surebet: ${updateError.message}`,
        },
      };
    }

    console.log("[ApostaService] ✅ Surebet liquidada:", surebetId, {
      resultado: resultadoFinal,
      lucro: lucroTotal,
      events_created: eventsCreated,
    });

    return {
      success: true,
      data: { events_created: eventsCreated },
    };

  } catch (err: any) {
    console.error("[ApostaService] Exceção na liquidação de Surebet:", err);
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message || 'Erro inesperado ao liquidar surebet',
        details: { error: err },
      },
    };
  }
}

// ============================================================================
// LIQUIDAR PERNA DE SUREBET (pernas JSONB - Motor Financeiro v9.5)
// ============================================================================

/**
 * Input para liquidação de perna individual de Surebet
 */
export interface LiquidarPernaSurebetInput {
  surebet_id: string;
  perna_index: number;
  bookmaker_id: string;
  resultado: 'GREEN' | 'RED' | 'VOID' | 'MEIO_GREEN' | 'MEIO_RED' | null;
  resultado_anterior: string | null;
  stake: number;
  odd: number;
  moeda: string;
  workspace_id: string;
  stake_bonus?: number;
  fonte_saldo?: string;
}

/**
 * Liquida uma perna individual de Surebet usando motor financeiro.
 * 
 * MOTOR v9.5: Esta função substitui o updateBookmakerBalance() legado.
 * Todo impacto financeiro passa por financial_events -> trigger SST.
 * 
 * Fluxo:
 * 1. Calcula delta (reversão anterior + aplicação novo resultado)
 * 2. Cria evento financeiro (PAYOUT/VOID_REFUND/ADJUSTMENT)
 * 3. Atualiza JSONB da perna
 * 4. Atualiza status do registro pai se todas pernas liquidadas
 */
export async function liquidarPernaSurebet(
  input: LiquidarPernaSurebetInput
): Promise<ApostaServiceResult<{ lucro_prejuizo: number; delta: number }>> {
  const { 
    surebet_id, perna_index, bookmaker_id, resultado, resultado_anterior,
    stake, odd, moeda, workspace_id, stake_bonus = 0, fonte_saldo = 'REAL'
  } = input;
  
  console.log("[ApostaService] Liquidando perna surebet:", { surebet_id, perna_index, resultado, resultado_anterior });

  // Se resultado não mudou, não fazer nada
  if (resultado_anterior === resultado) {
    return { success: true, data: { lucro_prejuizo: 0, delta: 0 } };
  }

  try {
    // 1. BUSCAR PERNAS ATUAIS
    const { data: operacaoData, error: fetchError } = await supabase
      .from('apostas_unificada')
      .select('pernas, stake_total')
      .eq('id', surebet_id)
      .single();

    if (fetchError || !operacaoData?.pernas) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Surebet não encontrada' },
      };
    }

    const pernas = operacaoData.pernas as any[];
    const perna = pernas[perna_index];
    if (!perna) {
      return {
        success: false,
        error: { code: 'PERNA_NOT_FOUND', message: `Perna ${perna_index} não encontrada` },
      };
    }

    // 2. CALCULAR LUCRO/PREJUÍZO
    let lucro: number | null = 0;
    if (resultado === null) {
      lucro = null;
    } else if (resultado === 'GREEN') {
      lucro = stake * (odd - 1);
    } else if (resultado === 'MEIO_GREEN') {
      lucro = (stake * (odd - 1)) / 2;
    } else if (resultado === 'RED') {
      lucro = -stake;
    } else if (resultado === 'MEIO_RED') {
      lucro = -stake / 2;
    } else if (resultado === 'VOID') {
      lucro = 0;
    }

    // 3. CALCULAR DELTA FINANCEIRO (reversão + aplicação)
    let delta = 0;
    
    // 3a. REVERTER resultado anterior
    if (resultado_anterior && resultado_anterior !== 'PENDENTE') {
      if (resultado_anterior === 'GREEN') {
        delta -= stake * (odd - 1);
      } else if (resultado_anterior === 'MEIO_GREEN') {
        delta -= (stake * (odd - 1)) / 2;
      } else if (resultado_anterior === 'RED') {
        delta += stake;
      } else if (resultado_anterior === 'MEIO_RED') {
        delta += stake / 2;
      }
    }
    
    // 3b. APLICAR novo resultado
    if (resultado === 'GREEN') {
      delta += stake * (odd - 1);
    } else if (resultado === 'MEIO_GREEN') {
      delta += (stake * (odd - 1)) / 2;
    } else if (resultado === 'RED') {
      delta -= stake;
    } else if (resultado === 'MEIO_RED') {
      delta -= stake / 2;
    }

    // 4. CRIAR EVENTO FINANCEIRO (se delta != 0)
    if (delta !== 0) {
      const tipoEvento = delta > 0 ? 'PAYOUT' : 'ADJUSTMENT';
      const idempotencyKey = `surebet_perna_${surebet_id}_${perna_index}_${Date.now()}`;
      
      // Determinar tipo_uso baseado em fonte_saldo
      const tipoUso = fonte_saldo === 'FREEBET' ? 'FREEBET' 
        : (stake_bonus > 0 ? 'BONUS' : 'NORMAL');

      const { error: eventError } = await supabase
        .from('financial_events')
        .insert({
          bookmaker_id,
          aposta_id: surebet_id,
          workspace_id,
          tipo_evento: tipoEvento,
          tipo_uso: tipoUso,
          origem: delta > 0 ? 'LUCRO' : 'PERDA',
          valor: delta, // positivo = crédito, negativo = débito
          moeda,
          idempotency_key: idempotencyKey,
          descricao: `Perna ${perna_index + 1} Surebet: ${resultado_anterior || 'PENDENTE'} → ${resultado}`,
          processed_at: new Date().toISOString(),
        });

      if (eventError) {
        console.error("[ApostaService] Erro ao criar evento financeiro:", eventError);
        return {
          success: false,
          error: { code: 'EVENT_CREATION_FAILED', message: eventError.message },
        };
      }
      
      console.log("[ApostaService] ✅ Evento financeiro criado:", { delta, tipoEvento });
    }

    // 5. ATUALIZAR PERNA NO JSONB
    const novasPernas = [...pernas];
    novasPernas[perna_index] = {
      ...perna,
      resultado,
      lucro_prejuizo: lucro,
    };

    // 6. CALCULAR STATUS E RESULTADO FINAL
    const todasLiquidadas = novasPernas.every(
      p => p.resultado && p.resultado !== 'PENDENTE' && p.resultado !== null
    );
    const lucroTotal = novasPernas.reduce((acc, p) => acc + (p.lucro_prejuizo || 0), 0);
    const resultadoFinal = todasLiquidadas 
      ? (lucroTotal > 0 ? 'GREEN' : lucroTotal < 0 ? 'RED' : 'EMPATE')
      : null;

    // 7. ATUALIZAR REGISTRO PAI
    const stakeTotal = operacaoData.stake_total || 0;
    const { error: updateError } = await supabase
      .from('apostas_unificada')
      .update({
        pernas: novasPernas as any,
        status: todasLiquidadas ? 'LIQUIDADA' : 'PENDENTE',
        resultado: resultadoFinal,
        lucro_prejuizo: todasLiquidadas ? lucroTotal : null,
        roi_real: todasLiquidadas && stakeTotal > 0 ? (lucroTotal / stakeTotal) * 100 : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', surebet_id);

    if (updateError) {
      console.error("[ApostaService] Erro ao atualizar surebet:", updateError);
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: updateError.message },
      };
    }

    console.log("[ApostaService] ✅ Perna surebet liquidada:", { perna_index, resultado, delta, lucro });
    
    return {
      success: true,
      data: { lucro_prejuizo: lucro ?? 0, delta },
    };

  } catch (err: any) {
    console.error("[ApostaService] Exceção ao liquidar perna:", err);
    return {
      success: false,
      error: { code: 'UNEXPECTED_ERROR', message: err.message },
    };
  }
}

// ============================================================================
// LIQUIDAR SUREBET SIMPLES (apenas atualiza registro pai, sem eventos)
// ============================================================================

/**
 * Liquida uma Surebet de forma simples, apenas atualizando o registro pai.
 * 
 * Usado para casos onde:
 * - As pernas vêm de dados JSONB legados (sem ID individual)
 * - Não é necessário criar eventos financeiros por perna
 * 
 * Esta função apenas:
 * 1. Atualiza status para LIQUIDADA
 * 2. Define o resultado
 * 3. Grava o lucro/prejuízo
 */
export async function liquidarSurebetSimples(
  surebetId: string,
  resultadoFinal: 'GREEN' | 'RED' | 'VOID',
  lucroTotal: number
): Promise<ApostaServiceResult> {
  console.log("[ApostaService] Liquidando Surebet (simples):", surebetId, resultadoFinal);

  try {
    const { error } = await supabase
      .from('apostas_unificada')
      .update({
        status: 'LIQUIDADA',
        resultado: resultadoFinal,
        lucro_prejuizo: lucroTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', surebetId);

    if (error) {
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: `Falha ao liquidar surebet: ${error.message}`,
        },
      };
    }

    console.log("[ApostaService] ✅ Surebet liquidada (simples):", surebetId);
    return { success: true };

  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err.message || 'Erro inesperado ao liquidar surebet',
      },
    };
  }
}

// ============================================================================
// RELIQUIDAR APOSTA (mudar resultado de aposta já liquidada)
// ============================================================================

/**
 * Reliquida uma aposta (muda resultado de uma aposta já liquidada).
 * 
 * Para apostas simples/múltiplas: Usa reliquidar_aposta_v5 que reverte apenas PAYOUT
 * Para surebets/arbitragem: Apenas atualiza o registro pai (sem eventos)
 */
export async function reliquidarAposta(
  apostaId: string,
  novoResultado: string,
  lucroPrejuizo?: number
): Promise<ApostaServiceResult<{ resultado_anterior?: string; impacto_total?: number }>> {
  console.log("[ApostaService] Iniciando reliquidação:", apostaId, novoResultado);

  try {
    // Buscar aposta para detectar tipo
    const { data: apostaAtual } = await supabase
      .from('apostas_unificada')
      .select('resultado, status, forma_registro, bookmaker_id')
      .eq('id', apostaId)
      .single();
    
    const resultadoAnterior = apostaAtual?.resultado;
    const isArbitragem = apostaAtual?.forma_registro === 'ARBITRAGEM' || apostaAtual?.forma_registro === 'SUREBET';
    const hasNullBookmaker = !apostaAtual?.bookmaker_id;
    
    // ============================================================
    // CASO ESPECIAL: Surebet/Arbitragem (bookmaker_id NULL)
    // Não pode usar RPC liquidar_aposta_v4 que requer bookmaker_id
    // ============================================================
    if (isArbitragem || hasNullBookmaker) {
      console.log("[ApostaService] Detectada Surebet/Arbitragem - usando liquidação simples");
      
      const result = await liquidarSurebetSimples(
        apostaId,
        novoResultado as 'GREEN' | 'RED' | 'VOID',
        lucroPrejuizo ?? 0
      );
      
      if (!result.success) return result as any;
      
      return {
        success: true,
        data: { resultado_anterior: resultadoAnterior || undefined },
      };
    }
    
    // ============================================================
    // CASO NORMAL: Aposta simples/múltipla
    // ============================================================
    
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

    // Usar reliquidar_aposta_v5 (reverte apenas PAYOUT, não STAKE)
    const { data: reliqData, error: reliqError } = await supabase.rpc('reliquidar_aposta_v5', {
      p_aposta_id: apostaId,
      p_novo_resultado: novoResultado,
      p_lucro_prejuizo: lucroPrejuizo ?? null,
    });

    if (reliqError) {
      console.error("[ApostaService] Erro ao reliquidar:", reliqError);
      return {
        success: false,
        error: {
          code: 'RELIQUIDATION_RPC_ERROR',
          message: `Falha ao reliquidar aposta: ${reliqError.message}`,
          details: { error: reliqError },
        },
      };
    }

    const reliqResult = reliqData?.[0];
    if (!reliqResult?.success) {
      return {
        success: false,
        error: {
          code: 'RELIQUIDATION_FAILED',
          message: reliqResult?.message || 'Falha ao reliquidar aposta',
        },
      };
    }

    console.log("[ApostaService] ✅ Aposta reliquidada v5:", apostaId, {
      resultado_anterior: resultadoAnterior,
      resultado_novo: novoResultado,
      events_created: reliqResult.events_created,
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
