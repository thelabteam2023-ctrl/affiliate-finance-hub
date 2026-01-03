/**
 * Hook para gerenciar o consumo proporcional de saldo real e bônus em apostas.
 * 
 * Arquitetura:
 * - Ao registrar aposta: calcula decomposição da stake entre saldo_real e saldo_bonus
 * - Na liquidação RED: consome proporcionalmente ambos os saldos
 * - Na liquidação GREEN: recompõe saldos conforme regra
 * - O saldo do bônus é rastreado em project_bookmaker_link_bonuses.saldo_atual
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
   * Calcula a decomposição da stake entre saldo real e saldo bônus.
   * 
   * Regra: Primeiro usa saldo bônus disponível, depois saldo real.
   * Isso é economicamente vantajoso pois bônus é "dinheiro grátis".
   * 
   * @param stake - Valor total da stake
   * @param saldoRealDisponivel - Saldo real disponível na bookmaker
   * @param saldoBonusDisponivel - Saldo de bônus disponível
   * @param bonusId - ID do bônus ativo (se houver)
   */
  const calcularDecomposicaoStake = useCallback((
    stake: number,
    saldoRealDisponivel: number,
    saldoBonusDisponivel: number,
    bonusId: string | null
  ): StakeDecomposition => {
    // Se não há bônus disponível, toda stake é real
    if (saldoBonusDisponivel <= 0 || !bonusId) {
      return {
        stake_real: stake,
        stake_bonus: 0,
        bonus_id: null
      };
    }

    // Primeiro usa bônus, depois real
    const stakeBonus = Math.min(stake, saldoBonusDisponivel);
    const stakeReal = stake - stakeBonus;

    return {
      stake_real: stakeReal,
      stake_bonus: stakeBonus,
      bonus_id: stakeBonus > 0 ? bonusId : null
    };
  }, []);

  /**
   * Atualiza o saldo do bônus após liquidação.
   * 
   * @param bonusId - ID do bônus
   * @param deltaBonus - Variação do saldo (negativo = consumo, positivo = recomposição)
   */
  const atualizarSaldoBonus = useCallback(async (
    bonusId: string,
    deltaBonus: number
  ): Promise<boolean> => {
    try {
      // Buscar saldo atual
      const { data: bonus, error: fetchError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("saldo_atual, status")
        .eq("id", bonusId)
        .single();

      if (fetchError || !bonus) {
        console.error("Bônus não encontrado:", fetchError);
        return false;
      }

      // Só permite alteração em bônus creditados
      if (bonus.status !== "credited") {
        console.warn("Tentativa de alterar saldo de bônus não-creditado");
        return false;
      }

      const saldoAtual = Number(bonus.saldo_atual || 0);
      const novoSaldo = Math.max(0, saldoAtual + deltaBonus);

      const { error: updateError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .update({ 
          saldo_atual: novoSaldo,
          updated_at: new Date().toISOString()
        })
        .eq("id", bonusId);

      if (updateError) {
        console.error("Erro ao atualizar saldo do bônus:", updateError);
        return false;
      }

      // Se o saldo zerou, finalizar o bônus automaticamente
      if (novoSaldo === 0) {
        const { data: userData } = await supabase.auth.getUser();
        await supabase
          .from("project_bookmaker_link_bonuses")
          .update({
            status: "finalized",
            finalized_at: new Date().toISOString(),
            finalized_by: userData?.user?.id || null,
            finalize_reason: "bonus_consumed"
          })
          .eq("id", bonusId);
      }

      return true;
    } catch (error) {
      console.error("Erro ao atualizar saldo do bônus:", error);
      return false;
    }
  }, []);

  /**
   * Processa a liquidação de uma aposta, consumindo proporcionalmente 
   * saldo real e bônus conforme o resultado.
   * 
   * @param resultado - Resultado da aposta (GREEN, RED, VOID, etc.)
   * @param stakeReal - Parte da stake que veio do saldo real
   * @param stakeBonus - Parte da stake que veio do saldo bônus
   * @param bonusId - ID do bônus utilizado
   * @param lucroPrejuizo - Lucro/prejuízo calculado da aposta
   * @param bookmakerId - ID da bookmaker
   */
  const processarLiquidacaoBonus = useCallback(async (
    resultado: string,
    stakeReal: number,
    stakeBonus: number,
    bonusId: string | null,
    lucroPrejuizo: number,
    bookmakerId: string
  ): Promise<BalanceUpdateResult> => {
    // Se não há componente de bônus, não há nada a fazer aqui
    if (!bonusId || stakeBonus <= 0) {
      return {
        success: true,
        newSaldoReal: 0, // Não gerenciamos saldo real aqui
        newSaldoBonus: 0
      };
    }

    try {
      const stakeTotal = stakeReal + stakeBonus;
      const proporcaoBonus = stakeTotal > 0 ? stakeBonus / stakeTotal : 0;

      switch (resultado) {
        case "RED":
        case "RED_BOOKMAKER": {
          // Perda total: consumir toda a stake_bonus do bônus
          const consumoBonus = -stakeBonus;
          await atualizarSaldoBonus(bonusId, consumoBonus);
          
          return {
            success: true,
            newSaldoReal: 0,
            newSaldoBonus: consumoBonus
          };
        }

        case "MEIO_RED": {
          // Perda parcial (50%): consumir metade da stake_bonus
          const consumoBonus = -(stakeBonus * 0.5);
          await atualizarSaldoBonus(bonusId, consumoBonus);
          
          return {
            success: true,
            newSaldoReal: 0,
            newSaldoBonus: consumoBonus
          };
        }

        case "GREEN":
        case "GREEN_BOOKMAKER": {
          // Vitória: o lucro é creditado ao saldo real (não ao bônus)
          // O bônus não é alterado - a stake retorna ao bônus
          // Neste modelo, o lucro do bônus vira saldo real
          // A stake_bonus permanece no bônus para futuras apostas
          return {
            success: true,
            newSaldoReal: 0,
            newSaldoBonus: 0 // Stake permanece no bônus
          };
        }

        case "MEIO_GREEN": {
          // Vitória parcial: metade do lucro, stake retorna
          // Comportamento similar ao GREEN
          return {
            success: true,
            newSaldoReal: 0,
            newSaldoBonus: 0
          };
        }

        case "VOID": {
          // Cancelada: stake retorna integralmente
          // Não há consumo nem ganho
          return {
            success: true,
            newSaldoReal: 0,
            newSaldoBonus: 0
          };
        }

        default:
          return {
            success: true,
            newSaldoReal: 0,
            newSaldoBonus: 0
          };
      }
    } catch (error: any) {
      console.error("Erro ao processar liquidação do bônus:", error);
      return {
        success: false,
        newSaldoReal: 0,
        newSaldoBonus: 0,
        error: error.message
      };
    }
  }, [atualizarSaldoBonus]);

  /**
   * Reverte a liquidação de uma aposta, restaurando os saldos.
   */
  const reverterLiquidacaoBonus = useCallback(async (
    resultadoAnterior: string,
    stakeBonus: number,
    bonusId: string | null
  ): Promise<boolean> => {
    if (!bonusId || stakeBonus <= 0) return true;

    try {
      switch (resultadoAnterior) {
        case "RED":
        case "RED_BOOKMAKER": {
          // Reverter perda: devolver stake_bonus ao bônus
          await atualizarSaldoBonus(bonusId, stakeBonus);
          return true;
        }

        case "MEIO_RED": {
          // Reverter perda parcial: devolver metade
          await atualizarSaldoBonus(bonusId, stakeBonus * 0.5);
          return true;
        }

        default:
          // GREEN, VOID: não houve consumo, nada a reverter
          return true;
      }
    } catch (error) {
      console.error("Erro ao reverter liquidação do bônus:", error);
      return false;
    }
  }, [atualizarSaldoBonus]);

  /**
   * Obtém o saldo total de bônus disponível para uma bookmaker em um projeto.
   */
  const getSaldoBonusDisponivel = useCallback(async (
    projectId: string,
    bookmakerId: string
  ): Promise<number> => {
    const bonus = await getActiveBonus(projectId, bookmakerId);
    return bonus?.saldo_atual || 0;
  }, [getActiveBonus]);

  /**
   * Verifica se existe bônus ativo com rollover em andamento nesta casa.
   *
   * Regra: status=credited, saldo_atual > 0 e rollover_target_amount > 0.
   * (Assim, qualquer aposta liquidada nessa casa deve contar para o rollover,
   * independente da aba/contexto em que foi registrada.)
   */
  const hasActiveRolloverBonus = useCallback(async (
    projectId: string,
    bookmakerId: string
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from("project_bookmaker_link_bonuses")
      .select("saldo_atual, rollover_target_amount")
      .eq("project_id", projectId)
      .eq("bookmaker_id", bookmakerId)
      .eq("status", "credited");

    if (error) {
      console.error("Erro ao verificar bônus ativo para rollover:", error);
      return false;
    }

    return (data || []).some((b) => {
      const saldoAtual = Number((b as any).saldo_atual || 0);
      const target = Number((b as any).rollover_target_amount || 0);
      return saldoAtual > 0 && target > 0;
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
  const atualizarProgressoRollover = useCallback(async (
    projectId: string,
    bookmakerId: string,
    stakeApostada: number,
    oddAposta?: number
  ): Promise<boolean> => {
    try {
      // Buscar todos os bônus ativos para esta bookmaker
      const { data: bonusesAtivos, error: fetchError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("id, rollover_progress, rollover_target_amount, min_odds")
        .eq("project_id", projectId)
        .eq("bookmaker_id", bookmakerId)
        .eq("status", "credited");

      if (fetchError) {
        console.error("Erro ao buscar bônus para rollover:", fetchError);
        return false;
      }

      if (!bonusesAtivos || bonusesAtivos.length === 0) {
        return true; // Sem bônus ativo, nada a atualizar
      }

      // Atualizar o progresso de cada bônus ativo
      for (const bonus of bonusesAtivos) {
        // Verificar se a aposta atende a odd mínima (se configurada)
        if (bonus.min_odds && oddAposta && oddAposta < bonus.min_odds) {
          console.log(`Aposta com odd ${oddAposta} não atende min_odds ${bonus.min_odds} do bônus ${bonus.id}`);
          continue; // Não conta para este bônus
        }

        // Calcular novo progresso
        const currentProgress = Number(bonus.rollover_progress || 0);
        const newProgress = currentProgress + stakeApostada;

        // Atualizar no banco
        const { error: updateError } = await supabase
          .from("project_bookmaker_link_bonuses")
          .update({ 
            rollover_progress: newProgress,
            updated_at: new Date().toISOString()
          })
          .eq("id", bonus.id);

        if (updateError) {
          console.error("Erro ao atualizar rollover_progress:", updateError);
          return false;
        }

        console.log(`Rollover atualizado: bônus ${bonus.id}, progresso ${currentProgress} -> ${newProgress}`);
      }

      return true;
    } catch (error) {
      console.error("Erro ao atualizar progresso do rollover:", error);
      return false;
    }
  }, []);

  /**
   * Reverte o progresso do rollover quando um resultado válido é alterado para VOID/PENDENTE.
   * 
   * @param projectId - ID do projeto
   * @param bookmakerId - ID da bookmaker
   * @param stakeApostada - Valor que foi contabilizado e precisa ser revertido
   */
  const reverterProgressoRollover = useCallback(async (
    projectId: string,
    bookmakerId: string,
    stakeApostada: number
  ): Promise<boolean> => {
    try {
      // Buscar todos os bônus ativos para esta bookmaker
      const { data: bonusesAtivos, error: fetchError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("id, rollover_progress")
        .eq("project_id", projectId)
        .eq("bookmaker_id", bookmakerId)
        .eq("status", "credited");

      if (fetchError) {
        console.error("Erro ao buscar bônus para reverter rollover:", fetchError);
        return false;
      }

      if (!bonusesAtivos || bonusesAtivos.length === 0) {
        return true; // Sem bônus ativo, nada a reverter
      }

      // Reverter o progresso de cada bônus ativo
      for (const bonus of bonusesAtivos) {
        const currentProgress = Number(bonus.rollover_progress || 0);
        const newProgress = Math.max(0, currentProgress - stakeApostada);

        // Atualizar no banco
        const { error: updateError } = await supabase
          .from("project_bookmaker_link_bonuses")
          .update({ 
            rollover_progress: newProgress,
            updated_at: new Date().toISOString()
          })
          .eq("id", bonus.id);

        if (updateError) {
          console.error("Erro ao reverter rollover_progress:", updateError);
          return false;
        }

        console.log(`Rollover revertido: bônus ${bonus.id}, progresso ${currentProgress} -> ${newProgress}`);
      }

      return true;
    } catch (error) {
      console.error("Erro ao reverter progresso do rollover:", error);
      return false;
    }
  }, []);

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
