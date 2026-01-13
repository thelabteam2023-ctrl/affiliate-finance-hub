/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC)
 * This prevents timezone issues where dates shift by one day
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();

  // Datas financeiras/administrativas são datas civis (sem fuso).
  // Mesmo que venham do backend como timestamp (ex: "2026-01-13 00:00:00+00" ou "2026-01-13T00:00:00Z"),
  // extraímos apenas YYYY-MM-DD e criamos um Date local (ano, mês, dia) para evitar shift de -1 dia.
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(dateString);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(year, month - 1, day);
  }

  // Fallback para formatos inesperados
  return new Date(dateString);
}
