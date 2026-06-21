import type { DailyEvent } from "@/hooks/useDailyEventsByDate";

/** Aliases sport (API) → label do form */
const SPORT_ALIASES: Record<string, string> = {
  soccer: "Futebol",
  football: "Futebol",
  futebol: "Futebol",
  basketball: "Basquete",
  basquete: "Basquete",
  tennis: "Tênis",
  baseball: "Baseball",
  hockey: "Hockey",
  "ice-hockey": "Hockey",
  handball: "Handebol",
  "american-football": "Futebol Americano",
  "americanfootball-nfl": "Futebol Americano",
  volleyball: "Vôlei",
  mma: "MMA/UFC",
  mma_mixed_martial_arts: "MMA/UFC",
  boxing: "Boxe",
  golf: "Golfe",
  rugby: "Rugby",
  lol: "League of Legends",
  "league-of-legends": "League of Legends",
  cs: "Counter-Strike",
  csgo: "Counter-Strike",
  "counter-strike": "Counter-Strike",
  dota2: "Dota 2",
  valorant: "Valorant",
  efootball: "eFootball",
};

const ESPORTES_KNOWN = new Set([
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", "Handebol",
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe", "Rugby",
  "League of Legends", "Counter-Strike", "Dota 2", "Valorant", "eFootball", "Outro",
]);

export function normalizeEsporte(sport: string | null | undefined): string {
  if (!sport) return "Outro";
  const raw = sport.trim().toLowerCase();
  if (SPORT_ALIASES[raw]) return SPORT_ALIASES[raw];
  // Match com a label exata (case-insensitive)
  for (const label of ESPORTES_KNOWN) {
    if (label.toLowerCase() === raw) return label;
  }
  return "Outro";
}

/** Converte commence_time (ISO UTC) para o formato datetime-local "YYYY-MM-DDTHH:mm" no fuso local */
function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export interface MappedEventFields {
  esporte: string;
  evento: string;
  dataAposta: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamLogoUrl: string | null;
  awayTeamLogoUrl: string | null;
  leagueLogoUrl: string | null;
  dailyEventId: string | null;
}

export function mapDailyEventToFormFields(ev: DailyEvent): MappedEventFields {
  return {
    esporte: normalizeEsporte(ev.sport),
    evento: `${ev.home_team} X ${ev.away_team}`.toUpperCase(),
    dataAposta: toLocalDateTimeInput(ev.commence_time),
    homeTeam: ev.home_team ?? null,
    awayTeam: ev.away_team ?? null,
    homeTeamLogoUrl: ev.home_team_logo ?? null,
    awayTeamLogoUrl: ev.away_team_logo ?? null,
    leagueLogoUrl: ev.league_logo ?? null,
    dailyEventId: (ev as any).id ?? null,
  };
}