import { toZonedTime } from "date-fns-tz";
import { startOfMonth, endOfMonth } from "date-fns";

/** Timezone operacional canônico do sistema */
export const OPERATIONAL_TIMEZONE = "America/Sao_Paulo";

/** Retorna "agora" já convertido para o timezone operacional */
function nowOperational(): Date {
  return toZonedTime(new Date(), OPERATIONAL_TIMEZONE);
}

/**
 * Resolve o mês em que o Calendário de Lucros deve abrir.
 *
 * Regras:
 * 1. Se hoje está dentro do intervalo -> mês corrente
 * 2. Se hoje é posterior ao intervalo -> mês de `end` (mês mais recente com dados)
 * 3. Se o intervalo é totalmente futuro -> mês de `start`
 * 4. Sem intervalo -> mês corrente
 *
 * Todas as comparações usam o timezone operacional (America/Sao_Paulo),
 * coerente com `extractLocalDateKey`.
 */
export function resolveCalendarInitialMonth(
  start?: Date | null,
  end?: Date | null,
): Date {
  const hoje = nowOperational();

  if (!start && !end) return hoje;

  const inicio = start ? startOfMonth(toZonedTime(start, OPERATIONAL_TIMEZONE)) : null;
  const fim = end ? endOfMonth(toZonedTime(end, OPERATIONAL_TIMEZONE)) : null;

  const depoisDoInicio = !inicio || hoje >= inicio;
  const antesDoFim = !fim || hoje <= fim;

  // 1. Hoje dentro do intervalo
  if (depoisDoInicio && antesDoFim) return hoje;

  // 2. Intervalo no passado
  if (!antesDoFim && fim) return fim;

  // 3. Intervalo no futuro
  return inicio ?? hoje;
}