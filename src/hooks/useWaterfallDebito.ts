/**
 * useWaterfallDebito - Hook para cálculo e execução do débito waterfall
 * 
 * REGRA DO SISTEMA:
 * 1. BONUS é consumido automaticamente primeiro
 * 2. FREEBET só é usado se o toggle estiver ativo
 * 3. REAL cobre o restante
 * 
 * Em caso de GREEN:
 * - Bonus/Freebet: apenas LUCRO retorna para saldo_real
 * - Real: STAKE + LUCRO retorna para saldo_real
 */

import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

export interface WaterfallResult {
  debitoBonus: number;
  debitoFreebet: number;
  debitoReal: number;
  saldoBonusDisponivel: number;
  saldoFreebetDisponivel: number;
  saldoRealDisponivel: number;
  stakeCoberto: boolean;
}

export interface WaterfallDebitoHook {
  /**
   * Calcula a distribuição do débito sem executar (preview)
   */
  calcularWaterfall: (
    bookmakerId: string,
    stake: number,
    usarFreebet: boolean
  ) => Promise<WaterfallResult | null>;

  /**
   * Executa o débito waterfall (usado internamente pela RPC)
   * Normalmente não chamado diretamente - usar criar_aposta_atomica_v2
   */
  processarWaterfall: (
    bookmakerId: string,
    stake: number,
    usarFreebet: boolean,
    workspaceId: string,
    userId: string,
    apostaId?: string
  ) => Promise<{
    success: boolean;
    debitoBonus: number;
    debitoFreebet: number;
    debitoReal: number;
    error?: string;
  }>;
}

export function useWaterfallDebito(): WaterfallDebitoHook {
  /**
   * Calcula a distribuição do stake entre os pools (preview)
   */
  const calcularWaterfall = useCallback(
    async (
      bookmakerId: string,
      stake: number,
      usarFreebet: boolean
    ): Promise<WaterfallResult | null> => {
      try {
        const { data, error } = await supabase.rpc("calcular_debito_waterfall", {
          p_bookmaker_id: bookmakerId,
          p_stake: stake,
          p_usar_freebet: usarFreebet,
        });

        if (error) {
          console.error("[useWaterfallDebito] Erro ao calcular:", error);
          return null;
        }

        if (!data || data.length === 0) {
          return null;
        }

        const row = data[0];
        return {
          debitoBonus: Number(row.debito_bonus) || 0,
          debitoFreebet: Number(row.debito_freebet) || 0,
          debitoReal: Number(row.debito_real) || 0,
          saldoBonusDisponivel: Number(row.saldo_bonus_disponivel) || 0,
          saldoFreebetDisponivel: Number(row.saldo_freebet_disponivel) || 0,
          saldoRealDisponivel: Number(row.saldo_real_disponivel) || 0,
          stakeCoberto: Boolean(row.stake_coberto),
        };
      } catch (err) {
        console.error("[useWaterfallDebito] Exception:", err);
        return null;
      }
    },
    []
  );

  /**
   * Executa o débito waterfall
   */
  const processarWaterfall = useCallback(
    async (
      bookmakerId: string,
      stake: number,
      usarFreebet: boolean,
      workspaceId: string,
      userId: string,
      apostaId?: string
    ) => {
      try {
        const { data, error } = await supabase.rpc("processar_debito_waterfall", {
          p_bookmaker_id: bookmakerId,
          p_stake: stake,
          p_usar_freebet: usarFreebet,
          p_workspace_id: workspaceId,
          p_user_id: userId,
          p_aposta_id: apostaId || null,
        });

        if (error) {
          console.error("[useWaterfallDebito] Erro ao processar:", error);
          return {
            success: false,
            debitoBonus: 0,
            debitoFreebet: 0,
            debitoReal: 0,
            error: error.message,
          };
        }

        if (!data || data.length === 0) {
          return {
            success: false,
            debitoBonus: 0,
            debitoFreebet: 0,
            debitoReal: 0,
            error: "Nenhum dado retornado",
          };
        }

        const row = data[0];
        return {
          success: Boolean(row.success),
          debitoBonus: Number(row.debito_bonus) || 0,
          debitoFreebet: Number(row.debito_freebet) || 0,
          debitoReal: Number(row.debito_real) || 0,
          error: row.error_message || undefined,
        };
      } catch (err) {
        console.error("[useWaterfallDebito] Exception:", err);
        return {
          success: false,
          debitoBonus: 0,
          debitoFreebet: 0,
          debitoReal: 0,
          error: String(err),
        };
      }
    },
    []
  );

  return {
    calcularWaterfall,
    processarWaterfall,
  };
}

/**
 * Calcula localmente o waterfall (para preview sem chamada ao servidor)
 */
export function calcularWaterfallLocal(
  stake: number,
  saldoBonus: number,
  saldoFreebet: number,
  saldoReal: number,
  usarFreebet: boolean
): {
  debitoBonus: number;
  debitoFreebet: number;
  debitoReal: number;
  stakeCoberto: boolean;
  saldoRestante: number;
} {
  let restante = stake;
  let debitoBonus = 0;
  let debitoFreebet = 0;
  let debitoReal = 0;

  // PASSO 1: Debitar BONUS primeiro (SEMPRE automático)
  if (saldoBonus > 0 && restante > 0) {
    debitoBonus = Math.min(saldoBonus, restante);
    restante -= debitoBonus;
  }

  // PASSO 2: Debitar FREEBET (APENAS se toggle ativo)
  if (usarFreebet && saldoFreebet > 0 && restante > 0) {
    debitoFreebet = Math.min(saldoFreebet, restante);
    restante -= debitoFreebet;
  }

  // PASSO 3: Debitar REAL (restante)
  if (restante > 0) {
    debitoReal = Math.min(saldoReal, restante);
    restante -= debitoReal;
  }

  return {
    debitoBonus,
    debitoFreebet,
    debitoReal,
    stakeCoberto: restante === 0,
    saldoRestante: restante,
  };
}
