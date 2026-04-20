/**
 * Propaga o resultado de uma aposta multi-perna (PUNTER, VALUEBET, DUPLO_GREEN,
 * EXTRACAO_BONUS, etc.) para todas as suas pernas em apostas_pernas.
 *
 * Para apostas simples multi-entry, todas as pernas compartilham o mesmo resultado.
 * O lucro de cada perna é calculado na sua moeda nativa, respeitando a divisão
 * entre stake_real e stake_freebet (SNR — Stake Not Returned).
 *
 * IMPORTANTE: Esta função NÃO toca em financial_events nem em saldos —
 * a RPC `reliquidar_aposta_v6` já cuida disso usando o lucro consolidado do pai.
 * Esta função apenas SINCRONIZA o estado visual das pernas com o resultado do pai.
 *
 * Fórmula por perna (na moeda nativa):
 *   lucro_real = calcularImpactoResultado(stake_real, odd, resultado)
 *   lucro_fb   = stake_freebet > 0 ? freebetSNR(stake_freebet, odd, resultado) : 0
 *   lucro_perna = lucro_real + lucro_fb
 *
 * Freebet SNR (Stake Not Returned):
 *   GREEN      → stake_freebet * (odd - 1)
 *   MEIO_GREEN → stake_freebet * (odd - 1) / 2
 *   RED        → 0  (não perde dinheiro real, perde apenas a freebet)
 *   MEIO_RED   → 0
 *   VOID       → 0  (freebet é devolvida ao saldo de freebet)
 */

import { supabase } from "@/integrations/supabase/client";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";

function calcularLucroFreebetSNR(
  stakeFreebet: number,
  odd: number,
  resultado: string,
): number {
  if (stakeFreebet <= 0) return 0;
  switch (resultado) {
    case "GREEN":
      return stakeFreebet * (odd - 1);
    case "MEIO_GREEN":
      return (stakeFreebet * (odd - 1)) / 2;
    case "RED":
    case "MEIO_RED":
    case "VOID":
    default:
      return 0;
  }
}

export async function propagarResultadoParaPernas(
  apostaId: string,
  resultado: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Buscar todas as pernas da aposta (incluindo split real/freebet)
    const { data: pernas, error: fetchError } = await supabase
      .from("apostas_pernas")
      .select("id, stake, stake_real, stake_freebet, odd, moeda, fonte_saldo")
      .eq("aposta_id", apostaId);

    if (fetchError) {
      console.error("[propagarResultadoParaPernas] Erro ao buscar pernas:", fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!pernas || pernas.length === 0) {
      // Sem pernas (aposta single) — nada a propagar
      return { success: true };
    }

    // 2. Atualizar cada perna com o resultado e lucro nativo (real + freebet SNR)
    const updates = pernas.map((perna) => {
      const odd = Number(perna.odd) || 1;
      const stakeTotal = Number(perna.stake) || 0;
      const stakeFreebet = Number(perna.stake_freebet) || 0;
      // stake_real pode estar nulo em pernas legadas — derivar de stake - freebet
      const stakeReal = perna.stake_real != null
        ? Number(perna.stake_real)
        : Math.max(0, stakeTotal - stakeFreebet);

      const lucroReal = calcularImpactoResultado(stakeReal, odd, resultado);
      const lucroFreebet = calcularLucroFreebetSNR(stakeFreebet, odd, resultado);
      const lucro = lucroReal + lucroFreebet;

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