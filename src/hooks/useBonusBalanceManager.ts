/**
 * Hook para gerenciar rollover de bônus.
 * 
 * NOTA: Este hook foi simplificado após a migração para o modelo de SALDO UNIFICADO.
 * 
 * FUNÇÕES DEPRECIADAS (mantidas para compatibilidade retroativa):
 * - calcularDecomposicaoStake: Não mais necessária - saldo é único
 * - processarLiquidacaoBonus: Não mais necessária - saldo é único
 * - reverterLiquidacaoBonus: Não mais necessária - saldo é único
 * - atualizarSaldoBonus: Não mais necessária - saldo do bônus sempre = 0
 * - getSaldoBonusDisponivel: Sempre retorna 0 (modelo unificado)
 * - getActiveBonus: Mantida apenas para verificação de rollover
 * 
 * FUNÇÕES ATIVAS (ainda usadas):
 * - hasActiveRolloverBonus: Verifica se há bônus com rollover ativo
 * - atualizarProgressoRollover: Sincroniza progresso do rollover
 * - reverterProgressoRollover: Sincroniza progresso do rollover
 */
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BonusInfo {
  id: string;
  bonus_amount: number;
  saldo_atual: number;
  status: string;
}

interface StakeDecomposition {
  stake_real: number;
  stake_bonus: number;
  bonus_id: string | null; // ID do bônus utilizado (se houver)
}

interface BalanceUpdateResult {
  success: boolean;
  newSaldoReal: number;
  newSaldoBonus: number;
  error?: string;
}

export function useBonusBalanceManager() {
  /**
   * Busca o bônus ativo (credited) para uma bookmaker em um projeto
   */
  const getActiveBonus = useCallback(async (
    projectId: string,
    bookmakerId: string
  ): Promise<BonusInfo | null> => {
    const { data, error } = await supabase
      .from("project_bookmaker_link_bonuses")
      .select("id, bonus_amount, saldo_atual, status")
      .eq("project_id", projectId)
      .eq("bookmaker_id", bookmakerId)
      .eq("status", "credited")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar bônus ativo:", error);
      return null;
    }

    return data ? {
      id: data.id,
      bonus_amount: Number(data.bonus_amount),
      saldo_atual: Number(data.saldo_atual || 0),
      status: data.status
    } : null;
  }, []);

  /**
   * @deprecated MODELO UNIFICADO - Esta função não é mais necessária.
   * Mantida para compatibilidade retroativa. Sempre retorna stake como real.
   * 
   * Calcula a decomposição da stake entre saldo real e saldo bônus.
   * No modelo unificado, toda stake é considerada "real" pois o saldo é único.
   */
  const calcularDecomposicaoStake = useCallback((
    stake: number,
    _saldoRealDisponivel: number,
    _saldoBonusDisponivel: number,
    _bonusId: string | null
  ): StakeDecomposition => {
    // MODELO UNIFICADO: Toda stake é real - não há separação
    return {
      stake_real: stake,
      stake_bonus: 0,
      bonus_id: null
    };
  }, []);

  /**
   * @deprecated MODELO UNIFICADO - Esta função não é mais necessária.
   * O saldo do bônus na tabela project_bookmaker_link_bonuses é sempre 0.
   * O saldo real do bônus agora fica em bookmakers.saldo_atual.
   */
  const atualizarSaldoBonus = useCallback(async (
    _bonusId: string,
    _deltaBonus: number
  ): Promise<boolean> => {
    // MODELO UNIFICADO: Não há mais saldo separado de bônus
    console.warn("[DEPRECIADO] atualizarSaldoBonus não é mais usado no modelo unificado");
    return true;
  }, []);

  /**
   * @deprecated MODELO UNIFICADO - Esta função não é mais necessária.
   * A liquidação de apostas agora atualiza apenas bookmakers.saldo_atual.
   */
  const processarLiquidacaoBonus = useCallback(async (
    _resultado: string,
    _stakeReal: number,
    _stakeBonus: number,
    _bonusId: string | null,
    _lucroPrejuizo: number,
    _bookmakerId: string
  ): Promise<BalanceUpdateResult> => {
    // MODELO UNIFICADO: Não há mais processamento separado de bônus
    console.warn("[DEPRECIADO] processarLiquidacaoBonus não é mais usado no modelo unificado");
    return {
      success: true,
      newSaldoReal: 0,
      newSaldoBonus: 0
    };
  }, []);

  /**
   * @deprecated MODELO UNIFICADO - Esta função não é mais necessária.
   */
  const reverterLiquidacaoBonus = useCallback(async (
    _resultadoAnterior: string,
    _stakeBonus: number,
    _bonusId: string | null
  ): Promise<boolean> => {
    // MODELO UNIFICADO: Não há mais reversão de liquidação de bônus
    console.warn("[DEPRECIADO] reverterLiquidacaoBonus não é mais usado no modelo unificado");
    return true;
  }, []);

  /**
   * @deprecated MODELO UNIFICADO - Sempre retorna 0.
   * O saldo de bônus agora está integrado ao saldo_atual do bookmaker.
   */
  const getSaldoBonusDisponivel = useCallback(async (
    _projectId: string,
    _bookmakerId: string
  ): Promise<number> => {
    // MODELO UNIFICADO: Não há mais saldo separado de bônus
    return 0;
  }, []);

  /**
   * Verifica se existe bônus ativo com rollover em andamento nesta casa.
   *
   * CORREÇÃO: A verificação deve ser baseada em rollover não cumprido, não em saldo_atual.
   * No modelo de saldo unificado, o saldo_atual do bônus pode ser 0 mesmo com rollover ativo.
   * 
   * Regra correta: status=credited, rollover_target_amount > 0, e rollover_progress < target.
   * (Assim, qualquer aposta liquidada nessa casa deve contar para o rollover,
   * independente da aba/contexto em que foi registrada.)
   */
  const hasActiveRolloverBonus = useCallback(async (
    projectId: string,
    bookmakerId: string
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from("project_bookmaker_link_bonuses")
      .select("saldo_atual, rollover_target_amount, rollover_progress")
      .eq("project_id", projectId)
      .eq("bookmaker_id", bookmakerId)
      .eq("status", "credited");

    if (error) {
      console.error("Erro ao verificar bônus ativo para rollover:", error);
      return false;
    }

    return (data || []).some((b) => {
      const target = Number((b as any).rollover_target_amount || 0);
      const progress = Number((b as any).rollover_progress || 0);
      // Tem rollover ativo se: há meta definida E ainda não cumpriu
      return target > 0 && progress < target;
    });
  }, []);

  /**
   * Atualiza o progresso do rollover quando uma aposta é registrada.
   * 
   * @param projectId - ID do projeto
   * @param bookmakerId - ID da bookmaker
   * @param stakeApostada - Valor apostado que conta para o rollover
   * @param oddAposta - Odd da aposta (para validar odd mínima)
   */
  /**
   * Sincroniza o progresso do rollover recalculando baseado nos dados reais do banco.
   * Esta abordagem é mais segura porque evita duplicações e garante consistência.
   * 
   * @param projectId - ID do projeto
   * @param bookmakerId - ID da bookmaker
   */
  const sincronizarRollover = useCallback(async (
    projectId: string,
    bookmakerId: string
  ): Promise<boolean> => {
    try {
      // Buscar todos os bônus ativos para esta bookmaker
      const { data: bonusesAtivos, error: fetchError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("id")
        .eq("project_id", projectId)
        .eq("bookmaker_id", bookmakerId)
        .eq("status", "credited");

      if (fetchError) {
        console.error("Erro ao buscar bônus para sincronizar rollover:", fetchError);
        return false;
      }

      if (!bonusesAtivos || bonusesAtivos.length === 0) {
        return true; // Sem bônus ativo, nada a sincronizar
      }

      // Sincronizar o progresso de cada bônus ativo usando a RPC do banco
      for (const bonus of bonusesAtivos) {
        const { data: newProgress, error: rpcError } = await supabase
          .rpc("sync_bonus_rollover", { p_bonus_id: bonus.id });

        if (rpcError) {
          console.error("Erro ao sincronizar rollover via RPC:", rpcError);
          return false;
        }

        console.log(`Rollover sincronizado: bônus ${bonus.id}, novo progresso = ${newProgress}`);
      }

      return true;
    } catch (error) {
      console.error("Erro ao sincronizar progresso do rollover:", error);
      return false;
    }
  }, []);

  /**
   * Atualiza o progresso do rollover após liquidação de aposta.
   * IMPORTANTE: Esta função agora usa sincronização baseada nos dados reais do banco
   * para evitar duplicações causadas por atualizações incrementais incorretas.
   */
  const atualizarProgressoRollover = useCallback(async (
    projectId: string,
    bookmakerId: string,
    _stakeApostada: number,
    _oddAposta?: number
  ): Promise<boolean> => {
    // CORREÇÃO: Ao invés de incrementar manualmente (que pode causar duplicação),
    // sincronizamos recalculando baseado nos dados reais do banco
    return sincronizarRollover(projectId, bookmakerId);
  }, [sincronizarRollover]);

  /**
   * Reverte o progresso do rollover quando um resultado válido é alterado para VOID/PENDENTE.
   * IMPORTANTE: Esta função agora usa sincronização baseada nos dados reais do banco.
   */
  const reverterProgressoRollover = useCallback(async (
    projectId: string,
    bookmakerId: string,
    _stakeApostada: number
  ): Promise<boolean> => {
    // CORREÇÃO: Ao invés de decrementar manualmente,
    // sincronizamos recalculando baseado nos dados reais do banco
    return sincronizarRollover(projectId, bookmakerId);
  }, [sincronizarRollover]);

  return {
    getActiveBonus,
    calcularDecomposicaoStake,
    atualizarSaldoBonus,
    processarLiquidacaoBonus,
    reverterLiquidacaoBonus,
    getSaldoBonusDisponivel,
    hasActiveRolloverBonus,
    atualizarProgressoRollover,
    reverterProgressoRollover
  };
}
