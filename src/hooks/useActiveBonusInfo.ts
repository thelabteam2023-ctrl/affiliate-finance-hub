import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ActiveBonusInfo {
  id: string;
  rollover_progress: number;
  rollover_target_amount: number | null;
  min_odds: number | null;
  saldo_atual: number;
  bonus_amount: number | null;
}

interface UseActiveBonusInfoResult {
  hasActiveBonus: boolean;
  bonusInfo: ActiveBonusInfo | null;
  loading: boolean;
}

/**
 * Hook leve para verificar se uma bookmaker tem bônus ativo e obter info básica.
 * Usado para exibir alertas contextuais no momento do registro de apostas.
 */
export function useActiveBonusInfo(
  projectId: string | null,
  bookmakerId: string | null
): UseActiveBonusInfoResult {
  const [hasActiveBonus, setHasActiveBonus] = useState(false);
  const [bonusInfo, setBonusInfo] = useState<ActiveBonusInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const checkBonus = useCallback(async () => {
    if (!projectId || !bookmakerId) {
      setHasActiveBonus(false);
      setBonusInfo(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("id, rollover_progress, rollover_target_amount, min_odds, saldo_atual, bonus_amount")
        .eq("project_id", projectId)
        .eq("bookmaker_id", bookmakerId)
        .eq("status", "credited")
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Erro ao verificar bônus ativo:", error);
        setHasActiveBonus(false);
        setBonusInfo(null);
      } else if (data) {
        setHasActiveBonus(true);
        setBonusInfo({
          id: data.id,
          rollover_progress: Number(data.rollover_progress) || 0,
          rollover_target_amount: data.rollover_target_amount ? Number(data.rollover_target_amount) : null,
          min_odds: data.min_odds ? Number(data.min_odds) : null,
          saldo_atual: Number(data.saldo_atual) || 0,
          bonus_amount: data.bonus_amount ? Number(data.bonus_amount) : null,
        });
      } else {
        setHasActiveBonus(false);
        setBonusInfo(null);
      }
    } catch (err) {
      console.error("Erro ao verificar bônus ativo:", err);
      setHasActiveBonus(false);
      setBonusInfo(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, bookmakerId]);

  useEffect(() => {
    checkBonus();
  }, [checkBonus]);

  return { hasActiveBonus, bonusInfo, loading };
}
