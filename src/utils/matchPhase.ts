/**
 * Determina a fase de um jogo a partir de horário de início + esporte,
 * sem depender de chamada externa. Usado para decidir se exibimos
 * "Agendado", "Ao Vivo" ou "Encerrado" no UI.
 */
export type MatchPhase = "scheduled" | "live" | "finished";

export interface MatchPhaseInfo {
  phase: MatchPhase;
  /** Minutos desde o kickoff (apenas quando `phase === 'live'`). */
  minutesIn: number | null;
  /** Duração esperada usada no cálculo (em minutos). */
  expectedMinutes: number;
}

/** Duração total esperada (com intervalos / buffer) por esporte, em minutos. */
const SPORT_DURATION_MIN: Record<string, number> = {
  soccer: 115,
  futebol: 115,
  basketball: 130,
  basquete: 130,
  tennis: 180,
  tenis: 180,
  volleyball: 120,
  baseball: 200,
  mlb: 200,
  americanfootball: 210,
  nfl: 210,
  icehockey: 160,
  hockey: 160,
  rugby: 130,
  mma: 90,
  boxing: 90,
};

const DEFAULT_DURATION_MIN = 150;

function durationFor(sport: string | null | undefined): number {
  if (!sport) return DEFAULT_DURATION_MIN;
  const key = sport.toLowerCase().trim();
  return SPORT_DURATION_MIN[key] ?? DEFAULT_DURATION_MIN;
}

const FINISHED_STATUSES = new Set([
  "finished",
  "ft",
  "encerrado",
  "ended",
  "completed",
  "aet",
  "pen",
]);

export interface MatchPhaseInput {
  commence_time: string | Date | null | undefined;
  sport?: string | null;
  status?: string | null;
  /** Quando há placar conhecido, força `finished`. */
  has_result?: boolean;
}

export function computeMatchPhase(
  ev: MatchPhaseInput,
  now: Date = new Date(),
): MatchPhaseInfo {
  const expectedMinutes = durationFor(ev.sport);
  const statusKey = (ev.status ?? "").toString().toLowerCase().trim();

  // 1) Status canônico do banco prevalece
  if (FINISHED_STATUSES.has(statusKey) || ev.has_result) {
    return { phase: "finished", minutesIn: null, expectedMinutes };
  }

  // 2) Sem horário não dá pra inferir — trata como agendado.
  if (!ev.commence_time) {
    return { phase: "scheduled", minutesIn: null, expectedMinutes };
  }

  const start =
    ev.commence_time instanceof Date ? ev.commence_time : new Date(ev.commence_time);
  if (Number.isNaN(start.getTime())) {
    return { phase: "scheduled", minutesIn: null, expectedMinutes };
  }

  const diffMin = (now.getTime() - start.getTime()) / 60000;

  if (diffMin < 0) {
    return { phase: "scheduled", minutesIn: null, expectedMinutes };
  }
  if (diffMin <= expectedMinutes) {
    return { phase: "live", minutesIn: Math.floor(diffMin), expectedMinutes };
  }
  return { phase: "finished", minutesIn: null, expectedMinutes };
}

/** Atalho conveniente quando só interessa a fase. */
export function getMatchPhase(ev: MatchPhaseInput, now?: Date): MatchPhase {
  return computeMatchPhase(ev, now).phase;
}