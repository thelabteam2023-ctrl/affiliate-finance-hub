/**
 * Resolução de horários lidos de prints de apostas.
 *
 * Um bilhete costuma trazer mais de um horário (registro da aposta, início do
 * evento, liquidação). Este módulo classifica cada horário pelo texto que o
 * acompanha e escolhe o início do evento com uma hierarquia explícita de
 * confiança — nunca "o primeiro que aparecer".
 */

export type TimeRole = "EVENT_START" | "BET_PLACED" | "SETTLED" | "UNKNOWN";

export interface TimeCandidate {
  /** Valor ISO local "YYYY-MM-DDTHH:mm" quando resolvido. */
  value: string;
  /** Texto original que acompanhava o horário no print. */
  label?: string | null;
  role: TimeRole;
  confidence: "high" | "medium" | "low";
}

export interface ResolvedTimes {
  eventStartsAt: string | null;
  betPlacedAt: string | null;
  settledAt: string | null;
  /** true quando há mais de um horário plausível para o evento. */
  ambiguous: boolean;
  candidates: TimeCandidate[];
  confidence: "high" | "medium" | "low" | "none";
}

const EVENT_LABEL =
  /(kick\s*-?\s*off|kickoff|starts?\s*(?:at|on)?|start\s*time|match\s*time|event\s*(?:start|time)|inicio|horario\s*(?:do\s*)?(?:jogo|evento|partida)|comeca|jogo\s*em)/i;
const BET_LABEL =
  /(bet\s*placed|placed\s*(?:at|on)?|bet\s*time|aposta\s*(?:feita|realizada|registrada|colocada)|realizada\s*em|feita\s*em|registro\s*da\s*aposta|criada\s*em|data\s*da\s*aposta)/i;
const SETTLED_LABEL =
  /(settle(?:d|ment)?\s*(?:at|time)?|resolved\s*at|liquidad[ao]|resolvid[ao]|pag[ao]\s*em|encerrad[ao])/i;

export function classifyTimeLabel(label: string | null | undefined): TimeRole {
  const text = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!text.trim()) return "UNKNOWN";
  if (SETTLED_LABEL.test(text)) return "SETTLED";
  if (EVENT_LABEL.test(text)) return "EVENT_START";
  if (BET_LABEL.test(text)) return "BET_PLACED";
  return "UNKNOWN";
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalIsoMinutes(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Interpreta um horário em texto livre.
 * Suporta 24h, AM/PM, "14h30", "14.30", "09/09 14:30", "2026-09-09 14:30",
 * "hoje 19:00", "amanhã 19:00" e data sem ano (usa o ano corrente).
 */
export function parseFlexibleDateTime(raw: string | null | undefined, now: Date = new Date()): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;

  const lower = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Data primeiro — e removida do texto para não ser confundida com hora
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let rest = lower;

  const isoMatch = lower.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
    rest = lower.replace(isoMatch[0], " ");
  } else {
    const dmyMatch = lower.match(/(\d{1,2})\s*[/]\s*(\d{1,2})(?:\s*[/]\s*(\d{2,4}))?/);
    if (dmyMatch) {
      day = parseInt(dmyMatch[1], 10);
      month = parseInt(dmyMatch[2], 10);
      if (dmyMatch[3]) {
        const y = parseInt(dmyMatch[3], 10);
        year = y < 100 ? 2000 + y : y;
      } else {
        year = now.getFullYear();
      }
      rest = lower.replace(dmyMatch[0], " ");
    }
  }

  // Hora: 14:30 | 14h30 | 14.30 | 2:30 pm
  const timeMatch = rest.match(/(\d{1,2})\s*(?::|h|\.)\s*(\d{2})\s*(am|pm)?/);
  const bareAmPm = !timeMatch ? rest.match(/(\d{1,2})\s*(am|pm)/) : null;

  let hours: number | null = null;
  let minutes = 0;
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    const meridiem = timeMatch[3];
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  } else if (bareAmPm) {
    hours = parseInt(bareAmPm[1], 10);
    if (bareAmPm[2] === "pm" && hours < 12) hours += 12;
    if (bareAmPm[2] === "am" && hours === 12) hours = 0;
  }
  if (hours === null || hours > 23 || minutes > 59) return null;



  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else if (dmyMatch) {
    // Prints de apostas usam DD/MM
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10);
    if (dmyMatch[3]) {
      const y = parseInt(dmyMatch[3], 10);
      year = y < 100 ? 2000 + y : y;
    } else {
      year = now.getFullYear();
    }
  } else if (/\bamanha\b|\btomorrow\b/.test(lower)) {
    const d = new Date(now.getTime() + 86400000);
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  } else if (/\bhoje\b|\btoday\b/.test(lower)) {
    year = now.getFullYear();
    month = now.getMonth() + 1;
    day = now.getDate();
  } else {
    // Apenas hora: assume o dia corrente
    year = now.getFullYear();
    month = now.getMonth() + 1;
    day = now.getDate();
  }

  if (!year || !month || !day || month > 12 || day > 31) return null;

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (isNaN(date.getTime())) return null;
  return toLocalIsoMinutes(date);
}

export interface RawTimeInput {
  value: string | null | undefined;
  label?: string | null;
  /** Papel já informado pela leitura (quando a IA identificou o rótulo). */
  role?: TimeRole;
}

/**
 * Escolhe o horário do evento a partir dos horários encontrados.
 * Hierarquia: rótulo explícito de evento > papel informado > comparação
 * temporal (o mais tarde, quando os dois estão no mesmo dia) > nada.
 */
export function resolveEventTimes(inputs: RawTimeInput[], now: Date = new Date()): ResolvedTimes {
  const candidates: TimeCandidate[] = [];

  for (const input of inputs) {
    const parsed = parseFlexibleDateTime(input?.value, now);
    if (!parsed) continue;
    const labelRole = classifyTimeLabel(input.label);
    const role: TimeRole = labelRole !== "UNKNOWN" ? labelRole : input.role || "UNKNOWN";
    candidates.push({
      value: parsed,
      label: input.label ?? null,
      role,
      confidence: labelRole !== "UNKNOWN" ? "high" : input.role && input.role !== "UNKNOWN" ? "medium" : "low",
    });
  }

  if (candidates.length === 0) {
    return { eventStartsAt: null, betPlacedAt: null, settledAt: null, ambiguous: false, candidates, confidence: "none" };
  }

  const byRole = (role: TimeRole) => candidates.filter(c => c.role === role);
  const eventLabeled = byRole("EVENT_START");
  const betLabeled = byRole("BET_PLACED");
  const settledLabeled = byRole("SETTLED");
  const unknown = byRole("UNKNOWN");

  let eventStartsAt: string | null = null;
  let confidence: ResolvedTimes["confidence"] = "none";
  let ambiguous = false;

  if (eventLabeled.length === 1) {
    eventStartsAt = eventLabeled[0].value;
    confidence = "high";
  } else if (eventLabeled.length > 1) {
    // Mais de um rótulo de evento: ambíguo, escolhe o primeiro mas pede confirmação
    eventStartsAt = eventLabeled[0].value;
    confidence = "medium";
    ambiguous = true;
  } else if (unknown.length === 1 && (betLabeled.length > 0 || settledLabeled.length > 0)) {
    // Um horário rotulado como aposta/liquidação e outro solto: o solto é o evento
    eventStartsAt = unknown[0].value;
    confidence = "medium";
  } else if (unknown.length > 1) {
    // Sem rótulos: o mais tarde é o candidato natural a início do evento,
    // mas o usuário precisa confirmar.
    const sorted = [...unknown].sort((a, b) => a.value.localeCompare(b.value));
    eventStartsAt = sorted[sorted.length - 1].value;
    confidence = "low";
    ambiguous = true;
  } else if (unknown.length === 1) {
    eventStartsAt = unknown[0].value;
    confidence = "low";
  }

  return {
    eventStartsAt,
    betPlacedAt: betLabeled[0]?.value ?? null,
    settledAt: settledLabeled[0]?.value ?? null,
    ambiguous,
    candidates,
    confidence,
  };
}
