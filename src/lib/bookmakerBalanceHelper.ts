/**
 * Bookmaker Balance Helper - Motor Financeiro v7
 * 
 * ATENÇÃO: Este arquivo está DEPRECIADO para operações de apostas.
 * Use FinancialEngine.processFinancialEvent() para todas as movimentações.
 * 
 * Este helper só deve ser usado para:
 * - Operações de bônus legadas
 * - Migração gradual de código antigo
 */

import { supabase } from "@/integrations/supabase/client";
import { processFinancialEvent } from "./financialEngine";

// ============================================================================
// BÔNUS (mantido para compatibilidade)
// ============================================================================

export async function getActiveBonus(
  bookmakerId: string,
  projetoId?: string
): Promise<{ id: string; saldo: number } | null> {
  try {
    let query = supabase
      .from('project_bookmaker_link_bonuses')
      .select('id, saldo_atual')
      .eq('bookmaker_id', bookmakerId)
      .eq('status', 'ativo')
      .gt('saldo_atual', 0);

    if (projetoId) {
      query = query.eq('projeto_id', projetoId);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      saldo: data.saldo_atual,
    };
  } catch (error) {
    console.error('[getActiveBonus] Exceção:', error);
    return null;
  }
}

export async function updateBonusBalance(
  bonusId: string,
  delta: number
): Promise<boolean> {
  try {
    const { data: bonus, error: fetchError } = await supabase
      .from('project_bookmaker_link_bonuses')
      .select('saldo_atual')
      .eq('id', bonusId)
      .single();

    if (fetchError || !bonus) {
      console.error('[updateBonusBalance] Erro ao buscar bônus:', fetchError);
      return false;
    }

    const novoSaldo = Math.max(0, (bonus.saldo_atual || 0) + delta);

    const { error: updateError } = await supabase
      .from('project_bookmaker_link_bonuses')
      .update({ 
        saldo_atual: novoSaldo,
        updated_at: new Date().toISOString()
      })
      .eq('id', bonusId);

    if (updateError) {
      console.error('[updateBonusBalance] Erro ao atualizar:', updateError);
      return false;
    }

    console.log(`[updateBonusBalance] Bônus ${bonusId}: delta ${delta}, novo saldo ${novoSaldo}`);
    return true;
  } catch (error) {
    console.error('[updateBonusBalance] Exceção:', error);
    return false;
  }
}

// ============================================================================
// DEPRECIADO - USE FinancialEngine.processFinancialEvent()
// ============================================================================

/**
 * @deprecated Use FinancialEngine.processFinancialEvent() para movimentações de saldo.
 * Esta função é mantida apenas para compatibilidade com código legado.
 */
export async function updateBookmakerBalance(
  bookmakerId: string,
  delta: number,
  projetoId?: string,
  auditInfo?: {
    origem: string;
    referenciaId?: string;
    referenciaTipo?: string;
    observacoes?: string;
  },
  skipBonusCheck: boolean = false
): Promise<boolean> {
  if (delta === 0) return true;
  
  console.warn(`[updateBookmakerBalance] DEPRECIADO - use FinancialEngine.processFinancialEvent()`);
  
  try {
    // Verificar se há bônus ativo
    if (!skipBonusCheck) {
      const activeBonus = await getActiveBonus(bookmakerId, projetoId);
      
      if (activeBonus) {
        console.log(`[updateBookmakerBalance] Bônus ativo detectado, aplicando delta no bônus`);
        return await updateBonusBalance(activeBonus.id, delta);
      }
    }
    
    // Usar o motor de eventos v7
    const result = await processFinancialEvent({
      bookmakerId,
      tipoEvento: 'AJUSTE',
      tipoUso: 'NORMAL',
      origem: 'AJUSTE',
      valor: delta,
      descricao: auditInfo?.observacoes || 'Ajuste via updateBookmakerBalance (legado)',
      idempotencyKey: `legacy_${bookmakerId}_${Date.now()}`,
    });

    if (!result.success) {
      console.error('[updateBookmakerBalance] Erro ao processar evento:', result.errorMessage);
      return false;
    }

    console.log(`[updateBookmakerBalance] Bookmaker ${bookmakerId}: delta ${delta} aplicado via motor v7`);
    return true;
  } catch (error) {
    console.error('[updateBookmakerBalance] Exceção:', error);
    return false;
  }
}

/**
 * @deprecated Use FinancialEngine para operações em batch
 */
export async function updateMultipleBookmakerBalances(
  updates: Array<{
    bookmakerId: string;
    delta: number;
    projetoId?: string;
    auditInfo?: {
      origem: string;
      referenciaId?: string;
      referenciaTipo?: string;
      observacoes?: string;
    };
  }>
): Promise<{ success: boolean; failedCount: number }> {
  let failedCount = 0;

  for (const update of updates) {
    const success = await updateBookmakerBalance(
      update.bookmakerId,
      update.delta,
      update.projetoId,
      update.auditInfo
    );
    if (!success) failedCount++;
  }

  return {
    success: failedCount === 0,
    failedCount,
  };
}

// Exportar funções para compatibilidade
export { processFinancialEvent } from "./financialEngine";
