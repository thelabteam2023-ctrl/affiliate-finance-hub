/**
 * Normalização e comparação de nomes de equipes vindos de OCR.
 *
 * Objetivo: decidir, com segurança, se uma seleção lida de um print
 * corresponde ao mandante, ao empate ou ao visitante do evento.
 */

const NOISE_TOKENS = new Set([
  "fc", "sc", "cf", "ac", "afc", "cd", "ec", "ca", "se", "ad", "as", "ss", "us",
  "club", "clube", "futebol", "football", "soccer", "team", "time",
  "de", "do", "da", "dos", "das", "the", "of", "e", "and",
  "esporte", "esportivo", "esportiva", "atletico", "atletico", "united", "city",
]);

/** Sufixos de categoria que NÃO podem ser removidos (mudam a identidade do time). */
const CATEGORY_TOKENS = [
  "feminino", "feminina", "women", "women's", "womens", "ladies", "fem",
  "sub20", "sub21", "sub23", "sub19", "sub17", "sub15",
  "u15", "u17", "u18", "u19", "u20", "u21", "u23",
  "b", "ii", "reservas", "reserve", "reserves", "amateur", "am",
];

export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Tokens significativos do nome (sem ruído, preservando categoria). */
export function teamTokens(raw: string): { core: string[]; category: string[] } {
  const cleaned = stripDiacritics(String(raw || ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const core: string[] = [];
  const category: string[] = [];

  for (const token of cleaned.split(" ")) {
    if (!token) continue;
    const compact = token.replace(/\s/g, "");
    if (CATEGORY_TOKENS.includes(compact)) {
      category.push(compact);
      continue;
    }
    if (NOISE_TOKENS.has(compact)) continue;
    core.push(compact);
  }

  // Se tudo virou ruído, volta a usar os tokens brutos
  if (core.length === 0) {
    for (const token of cleaned.split(" ")) if (token) core.push(token);
  }

  return { core, category };
}

export function normalizeTeamName(raw: string): string {
  const { core, category } = teamTokens(raw);
  return [...core, ...category].join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similaridade 0..1 entre dois nomes de equipe já normalizados. */
export function teamSimilarity(a: string, b: string): number {
  const ta = teamTokens(a);
  const tb = teamTokens(b);
  if (!ta.core.length || !tb.core.length) return 0;

  // Categorias diferentes (feminino vs masculino, sub-20 vs principal) => não é o mesmo time
  const catA = ta.category.join(" ");
  const catB = tb.category.join(" ");
  if (catA !== catB) return 0;

  const setA = new Set(ta.core);
  const setB = new Set(tb.core);

  // Token exato compartilhado
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  if (shared > 0) {
    return shared / Math.min(setA.size, setB.size);
  }

  // Abreviações: "gimcheon" vs "gimcheon sangmu"
  for (const tokenA of setA) {
    for (const tokenB of setB) {
      if (tokenA.length >= 4 && tokenB.length >= 4) {
        if (tokenA.startsWith(tokenB) || tokenB.startsWith(tokenA)) return 0.85;
        const dist = levenshtein(tokenA, tokenB);
        const maxLen = Math.max(tokenA.length, tokenB.length);
        const sim = 1 - dist / maxLen;
        if (sim >= 0.8) return sim;
      }
    }
  }

  const na = ta.core.join("");
  const nb = tb.core.join("");
  const dist = levenshtein(na, nb);
  return Math.max(0, 1 - dist / Math.max(na.length, nb.length));
}

export const TEAM_MATCH_THRESHOLD = 0.7;

export type MatchPosition = "HOME" | "DRAW" | "AWAY";

const DRAW_PATTERN = /^(empate|draw|tie|x|igualdade|empata)$/i;

export interface SelectionPositionResult {
  position: MatchPosition;
  confidence: "high" | "medium";
  score: number;
}

/**
 * Identifica se a seleção lida no print é a casa, o empate ou o visitante.
 * Retorna null quando não há evidência suficiente (nunca "chuta").
 */
export function resolveSelectionPosition(
  selection: string,
  home: string | null | undefined,
  away: string | null | undefined,
): SelectionPositionResult | null {
  const sel = String(selection || "").trim();
  if (!sel) return null;

  if (DRAW_PATTERN.test(stripDiacritics(sel).toLowerCase())) {
    return { position: "DRAW", confidence: "high", score: 1 };
  }
  if (sel === "1") return { position: "HOME", confidence: "medium", score: 0.75 };
  if (sel === "2") return { position: "AWAY", confidence: "medium", score: 0.75 };

  const scoreHome = home ? teamSimilarity(sel, home) : 0;
  const scoreAway = away ? teamSimilarity(sel, away) : 0;

  if (scoreHome < TEAM_MATCH_THRESHOLD && scoreAway < TEAM_MATCH_THRESHOLD) return null;
  // Ambíguo: os dois times pontuam praticamente igual
  if (Math.abs(scoreHome - scoreAway) < 0.05) return null;

  const position: MatchPosition = scoreHome > scoreAway ? "HOME" : "AWAY";
  const score = Math.max(scoreHome, scoreAway);
  return { position, confidence: score >= 0.95 ? "high" : "medium", score };
}
