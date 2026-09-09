/**
 * Normalização semântica de mercados lidos de prints.
 *
 * Converte as diferentes nomenclaturas usadas pelas casas em uma chave
 * canônica única, preservando a separação entre mercados que se parecem
 * mas NÃO são o mesmo (1X2 vs Dupla Chance vs Placar Exato vs 1º Tempo).
 */

export type CanonicalMarket =
  | "MATCH_RESULT_1X2"
  | "DOUBLE_CHANCE"
  | "DRAW_NO_BET"
  | "CORRECT_SCORE"
  | "HALF_TIME_RESULT"
  | "SECOND_HALF_RESULT"
  | "TO_QUALIFY"
  | "WINNER"
  | "BOTH_TEAMS_TO_SCORE"
  | "TOTAL_GOALS"
  | "TEAM_TOTALS"
  | "PLAYER_TOTALS"
  | "HANDICAP"
  | "ASIAN_HANDICAP"
  | "PERIOD_WINNER"
  | "PERIOD_TOTAL"
  | "PERIOD_HANDICAP"
  | "RACE_TO";

export interface CanonicalMarketResult {
  canonical: CanonicalMarket | null;
  /** Quantidade de resultados possíveis (3 = casa/empate/fora). */
  outcomes: 2 | 3 | null;
  confidence: "high" | "medium" | "low";
  matchedBy: string | null;
}

const norm = (text: string): string =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Indicadores de período — têm prioridade máxima sobre o mercado do jogo. */
const FIRST_HALF = /(1\s*(?:o|º|st|ª)?\s*(?:tempo|half)|primeiro\s*tempo|first\s*half|ht\b|half\s*time|intervalo)/;
const SECOND_HALF = /(2\s*(?:o|º|nd|ª)?\s*(?:tempo|half)|segundo\s*tempo|second\s*half)/;
const OTHER_PERIOD =
  /(quarter|quarto|\bq[1-4]\b|set\s*\d|\d\s*(?:st|nd|rd|th)?\s*set|inning|entrada|game\s*\d|periodo|period)/;

const TOTAL_HINT = /(total|over|under|mais\s*de|menos\s*de|acima\s*de|abaixo\s*de|o\s*\/\s*u|\bou\b)/;
const HANDICAP_HINT = /(handicap|spread|run\s*line|puck\s*line|linha\s*de\s*corrida)/;

interface Rule {
  canonical: CanonicalMarket;
  outcomes: 2 | 3 | null;
  pattern: RegExp;
}

/** Ordem importa: o mais específico vem primeiro. */
const RULES: Rule[] = [
  { canonical: "CORRECT_SCORE", outcomes: null, pattern: /(placar\s*(?:exato|correto)|resultado\s*exato|correct\s*score|score\s*exato|placar\s*final\s*exato)/ },
  { canonical: "DOUBLE_CHANCE", outcomes: 3, pattern: /(dupla\s*chance|double\s*chance|\b1x\b|\bx2\b|\b12\b\s*(?:dupla)?)/ },
  { canonical: "DRAW_NO_BET", outcomes: 2, pattern: /(draw\s*no\s*bet|\bdnb\b|empate\s*anula|empate\s*devolve)/ },
  { canonical: "TO_QUALIFY", outcomes: 2, pattern: /(classifica|to\s*qualify|qualify|avanca|avancar|passa\s*de\s*fase|progress)/ },
  { canonical: "BOTH_TEAMS_TO_SCORE", outcomes: 2, pattern: /(ambas\s*(?:as\s*)?(?:equipes|times)?\s*marcam|both\s*teams?\s*(?:to\s*)?score|\bbtts\b|gol\s*gol|ambos\s*marcam)/ },
  { canonical: "ASIAN_HANDICAP", outcomes: 2, pattern: /(handicap\s*asiatico|asian\s*handicap|\bah\b|handicap\s*a\b)/ },
  { canonical: "HANDICAP", outcomes: 2, pattern: /(handicap|spread|run\s*line|puck\s*line|handicap\s*europeu|european\s*handicap|\beh\b)/ },
  { canonical: "PLAYER_TOTALS", outcomes: 2, pattern: /(player\s*(?:props?|points?|rebounds?|assists?|shots?|goals?|aces?)|props?\s*de\s*jogador|jogador\s*(?:pontos|assistencias|rebotes|chutes)|pitcher\s*strikeouts|passing\s*yards|rushing\s*yards|receiving\s*yards|anytime\s*(?:td|touchdown))/ },
  { canonical: "TEAM_TOTALS", outcomes: 2, pattern: /(team\s*total|total\s*(?:do|da|de)\s*(?:time|equipe)|(?:home|away)\s*total)/ },
  { canonical: "TOTAL_GOALS", outcomes: 2, pattern: /(total\s*(?:de\s*)?(?:gols?|goals?|pontos?|points?|games?|sets?|corners?|escanteios?|cart[oe]es?|cards?|runs?)|over\s*\/?\s*under|o\s*\/\s*u|mais\s*\/?\s*menos|mais\s*de\s*\d|menos\s*de\s*\d|over\s*\d|under\s*\d|total\s*-\s*\d\s*(?:opcoes|options))/ },
  { canonical: "RACE_TO", outcomes: 2, pattern: /(race\s*to\s*\d+|corrida\s*(?:a|ate)\s*\d+)/ },
  {
    canonical: "MATCH_RESULT_1X2",
    outcomes: 3,
    pattern:
      /(\b1\s*[x×]\s*2\b|match\s*result|match\s*odds|full\s*time\s*result|\bft\s*result\b|resultado\s*(?:da\s*)?partida|resultado\s*final|resultado\s*do\s*jogo|resultado\s*no\s*tempo\s*regulamentar|resultado\s*tempo\s*regulamentar|tres\s*vias|three\s*way|1\s*-\s*x\s*-\s*2|casa\s*\/?\s*empate\s*\/?\s*fora|mandante\s*\/?\s*empate\s*\/?\s*visitante|home\s*\/?\s*draw\s*\/?\s*away|moneyline\s*soccer|^resultado$)/,
  },
  { canonical: "WINNER", outcomes: 2, pattern: /(moneyline|money\s*line|\bml\b|match\s*winner|vencedor(?:\s*(?:da\s*)?(?:partida|jogo|luta))?|winner|para\s*ganhar|to\s*win)/ },
];

/**
 * Classifica o texto de mercado em uma chave canônica.
 * Regra de ouro: contexto de período vence o mercado do jogo inteiro.
 */
export function normalizeMarketKey(
  rawMarket: string | null | undefined,
  rawSelection?: string | null,
): CanonicalMarketResult {
  const text = norm(`${rawMarket || ""} ${rawSelection && !rawMarket ? rawSelection : ""}`);
  if (!text) return { canonical: null, outcomes: null, confidence: "low", matchedBy: null };

  const hasFirstHalf = FIRST_HALF.test(text);
  const hasSecondHalf = SECOND_HALF.test(text);
  const hasOtherPeriod = OTHER_PERIOD.test(text);

  if (hasFirstHalf || hasSecondHalf || hasOtherPeriod) {
    if (TOTAL_HINT.test(text)) {
      return { canonical: "PERIOD_TOTAL", outcomes: 2, confidence: "high", matchedBy: "period+total" };
    }
    if (HANDICAP_HINT.test(text)) {
      return { canonical: "PERIOD_HANDICAP", outcomes: 2, confidence: "high", matchedBy: "period+handicap" };
    }
    // Resultado do 1º/2º tempo em futebol continua sendo 3 vias
    if (hasFirstHalf && /(resultado|result|1\s*[x×]\s*2|winner|vencedor)/.test(text)) {
      return { canonical: "HALF_TIME_RESULT", outcomes: 3, confidence: "high", matchedBy: "first-half-result" };
    }
    if (hasSecondHalf && /(resultado|result|1\s*[x×]\s*2|winner|vencedor)/.test(text)) {
      return { canonical: "SECOND_HALF_RESULT", outcomes: 3, confidence: "high", matchedBy: "second-half-result" };
    }
    return { canonical: "PERIOD_WINNER", outcomes: 2, confidence: "medium", matchedBy: "period-winner" };
  }

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return {
        canonical: rule.canonical,
        outcomes: rule.outcomes,
        confidence: "high",
        matchedBy: rule.pattern.source.slice(0, 40),
      };
    }
  }

  return { canonical: null, outcomes: null, confidence: "low", matchedBy: null };
}

/** Mercados de 3 vias com casa/empate/fora, para os quais podemos montar as pernas. */
export function isThreeWayMatchResult(canonical: CanonicalMarket | null): boolean {
  return canonical === "MATCH_RESULT_1X2" || canonical === "HALF_TIME_RESULT" || canonical === "SECOND_HALF_RESULT";
}
