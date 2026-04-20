/**
 * Propaga o resultado de uma aposta multi-perna (PUNTER, VALUEBET, DUPLO_GREEN,
 * EXTRACAO_BONUS, etc.) para todas as suas pernas em apostas_pernas.
 *
 * Para apostas simples multi-entry, todas as pernas compartilham o mesmo resultado.
 * O lucro de cada perna é calculado na sua moeda nativa (stake * odd - stake) etc.
 *
 * IMPORTANTE: Esta função NÃO toca em financial_events nem em saldos —
 * a RPC `reliquidar_aposta_v6` já cuida disso usando o lucro consolidado do pai.
 * Esta função apenas SINCRONIZA o estado visual das pernas com o resultado do pai.
 */

import { supabase } from "@/integrations/supabase/client";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";

export async function propagarResultadoParaPernas(
  apostaId: string,
  resultado: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Buscar todas as pernas da aposta
    const { data: pernas, error: fetchError } = await supabase
      .from("apostas_pernas")
      .select("id, stake, odd, moeda")
      .eq("aposta_id", apostaId);

    if (fetchError) {
      console.error("[propagarResultadoParaPernas] Erro ao buscar pernas:", fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!pernas || pernas.length === 0) {
      // Sem pernas (aposta single) — nada a propagar
      return { success: true };
    }

    // 2. Atualizar cada perna com o resultado e lucro nativo
    const updates = pernas.map((perna) => {
      const stake = Number(perna.stake) || 0;
      const odd = Number(perna.odd) || 1;
      const lucro = calcularImpactoResultado(stake, odd, resultado);

      return supabase
        .from("apostas_pernas")
        .update({
          resultado,
          lucro_prejuizo: lucro,
          updated_at: new Date().toISOString(),
        })
        .eq("id", perna.id);
    });

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);

    if (firstError?.error) {
      console.error("[propagarResultadoParaPernas] Erro ao atualizar:", firstError.error);
      return { success: false, error: firstError.error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("[propagarResultadoParaPernas] Exceção:", error);
    return { success: false, error: error.message };
  }
}