// Utilitários compartilhados pelo catálogo de jogos (thesportsdb-sync e odds-api-catalog-sync).
// MANTER em paridade — qualquer divergência quebra a dedup via canonical_key.

export const COUNTRY_TO_CONTINENT: Record<string, string> = {
  Brazil: "América do Sul", Argentina: "América do Sul", Uruguay: "América do Sul",
  Chile: "América do Sul", Colombia: "América do Sul", Peru: "América do Sul",
  Ecuador: "América do Sul", Paraguay: "América do Sul", Venezuela: "América do Sul",
  Bolivia: "América do Sul",
  USA: "América do Norte", "United States": "América do Norte",
  Mexico: "América do Norte", Canada: "América do Norte",
  England: "Europa", Scotland: "Europa", Wales: "Europa", Ireland: "Europa",
  Spain: "Europa", Italy: "Europa", Germany: "Europa", France: "Europa",
  Portugal: "Europa", Netherlands: "Europa", Belgium: "Europa",
  Switzerland: "Europa", Austria: "Europa", Poland: "Europa", Russia: "Europa",
  Turkey: "Europa", Greece: "Europa", Sweden: "Europa", Norway: "Europa",
  Denmark: "Europa", Croatia: "Europa", Serbia: "Europa", "Czech Republic": "Europa",
  Ukraine: "Europa", Romania: "Europa",
  Japan: "Ásia", China: "Ásia", "South Korea": "Ásia", "Saudi Arabia": "Ásia",
  UAE: "Ásia", Qatar: "Ásia", India: "Ásia",
  Australia: "Oceania", "New Zealand": "Oceania",
  Egypt: "África", Morocco: "África", Nigeria: "África", "South Africa": "África",
  Algeria: "África", Tunisia: "África", Cameroon: "África", Senegal: "África",
};

export function inferCompetitionType(name?: string | null): string {
  if (!name) return "league";
  const n = name.toLowerCase();
  if (/(world cup|mundial|euro\b|copa am[eé]rica|nations league|olympics|olimp)/.test(n)) return "continental";
  if (/(champions|libertadores|sudamericana|europa league|conference league|afc cup|caf cup|concacaf)/.test(n)) return "continental";
  if (/(copa|cup|coupe|pokal|taça|trophy)/.test(n)) return "cup";
  return "league";
}

export function normTeam(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|cd|sk|if|bk|hc|club|football|futbol|futebol|soccer)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function brtDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function brtDateOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function buildCanonicalKey(
  sport: string,
  commenceUtc: Date,
  home: string,
  away: string,
): string {
  const ts = commenceUtc.toISOString().replace(/[-:T]/g, "").slice(0, 12); // YYYYMMDDHHmm
  const a = normTeam(home);
  const b = normTeam(away);
  const [t1, t2] = [a, b].sort();
  return `${sport}|${ts}|${t1}_${t2}`;
}