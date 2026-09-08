import { getTodayCivilDate } from "@/utils/dateUtils";

/**
 * Data de competência de um ajuste cambial (PERDA_CAMBIAL / GANHO_CAMBIAL).
 *
 * O ajuste é filho do lançamento que o gerou (ex.: um saque) e deve nascer com a
 * MESMA competência do pai — nunca com a data em que a confirmação foi feita.
 * Só cai para a data de hoje quando o pai não tem data alguma.
 */
export function dataCompetenciaAjusteCambial(
  dataTransacaoPai: string | Date | null | undefined,
): string {
  if (!dataTransacaoPai) return getTodayCivilDate();

  const raw =
    dataTransacaoPai instanceof Date
      ? dataTransacaoPai.toISOString()
      : String(dataTransacaoPai);

  const ymd = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : getTodayCivilDate();
}
