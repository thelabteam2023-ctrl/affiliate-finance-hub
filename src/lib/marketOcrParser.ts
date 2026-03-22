/**
 * Market OCR Parser v2.0 - Extração Inteligente de Mercados do OCR
 * 
 * Este módulo extrai SEPARADAMENTE:
 * - side   → Over / Under
 * - line   → 0.5, 2.5, 21.5, etc
 * - domain → Gols, Pontos, Games, Sets, etc
 * 
 * NUNCA assume domínio - detecta explicitamente
 */

import { 
  MarketType, 
  MarketDomain, 
  MarketSide, 
  CanonicalMarket,
  DOMAIN_LABELS,
  getDomainsForSport,
  getDefaultDomainForSport,
} from "./marketTypes";

// ========================================================================
// INTERFACES
// ========================================================================

export interface OcrMarketResult {
  type: MarketType;
  domain?: MarketDomain;
  side?: MarketSide;
  line?: number;
  displayName: string;
  confidence: "exact" | "high" | "medium" | "low";
  rawMarket: string;
  rawSelection: string;
}

interface DomainPattern {
  domain: MarketDomain;
  patterns: RegExp[];
}

interface SideLineResult {
  side: MarketSide;
  line: number;
}

// ========================================================================
// PADRÕES DE DOMÍNIO (O QUE ESTÁ SENDO MEDIDO)
// ========================================================================

const DOMAIN_PATTERNS: DomainPattern[] = [
  // Gols
  { domain: "GOALS", patterns: [/gols?/i, /goals?/i, /golo/i] },
  
  // Pontos
  { domain: "POINTS", patterns: [/pont(o|os|uação)/i, /points?/i, /pts?/i] },
  
  // Games (Tênis)
  { domain: "GAMES", patterns: [/games?/i, /jog(o|os)/i] },
  
  // Sets
  { domain: "SETS", patterns: [/sets?/i] },
  
  // Runs (Baseball)
  { domain: "RUNS", patterns: [/runs?/i, /corridas?/i] },
  
  // Escanteios
  { domain: "CORNERS", patterns: [/corner(s)?/i, /escanteio(s)?/i, /canto(s)?/i] },
  
  // Cartões
  { domain: "CARDS", patterns: [/cart(ão|ao|ões|oes)/i, /cards?/i, /yellow/i, /red/i] },
  
  // Rounds (MMA, Boxe, CS)
  { domain: "ROUNDS", patterns: [/rounds?/i, /rodada(s)?/i] },
  
  // Mapas (eSports)
  { domain: "MAPS", patterns: [/mapas?/i, /maps?/i] },
  
  // Kills (eSports)
  { domain: "KILLS", patterns: [/kills?/i, /abates?/i] },
  
  // Torres (LoL, Dota)
  { domain: "TOWERS", patterns: [/torres?/i, /towers?/i] },
  
  // Aces (Tênis)
  { domain: "ACES", patterns: [/aces?/i] },
];

// ========================================================================
// PADRÕES DE LADO + LINHA
// ========================================================================

const OVER_PATTERNS = [
  /mais\s+(\d+[.,]?\d*)/i,           // "Mais 21.5"
  /over\s+(\d+[.,]?\d*)/i,           // "Over 21.5"
  /acima\s+(de\s+)?(\d+[.,]?\d*)/i,  // "Acima de 21.5"
  /\+(\d+[.,]?\d*)/,                  // "+21.5" (quando é over)
  /\bo\s+(\d+[.,]?\d*)/i,              // "O 21.5" (word boundary to avoid matching inside words like "Como")
  />\s*(\d+[.,]?\d*)/,                // "> 21.5"
  /(\d+[.,]?\d*)\s*\+/,               // "21.5+"
];

const UNDER_PATTERNS = [
  /menos\s+(\d+[.,]?\d*)/i,          // "Menos 21.5"
  /under\s+(\d+[.,]?\d*)/i,          // "Under 21.5"
  /abaixo\s+(de\s+)?(\d+[.,]?\d*)/i, // "Abaixo de 21.5"
  /u\s*(\d+[.,]?\d*)/i,               // "U 21.5"
  /<\s*(\d+[.,]?\d*)/,                // "< 21.5"
  /(\d+[.,]?\d*)\s*-/,                // "21.5-"
];

// Padrões para detectar TOTAL de forma genérica
const TOTAL_MARKET_PATTERNS = [
  /total\s*(de\s*)?([\w]+)/i,        // "Total de Games"
  /over\s*\/?\s*under/i,              // "Over/Under"
  /o\/u/i,                            // "O/U"
];

// Padrões para detectar HANDICAP
const HANDICAP_MARKET_PATTERNS = [
  /handicap\s*(de\s*)?([\w]+)?/i,    // "Handicap de Games"
  /\bspread\b/i,                      // "Spread"
  /run\s*line/i,                      // "Run Line"
  /puck\s*line/i,                     // "Puck Line"
  /\bah\b/i,                          // "AH" (Asian Handicap)
  /\beh\b/i,                          // "EH" (European Handicap)
  /\bh\.?\s*a\.?\b/i,                // "H.A." or "HA"
];

// Padrão para detectar linha DIVIDIDA de handicap asiático (ex: "0.0, -0.5" ou "0.0,-0.5")
const SPLIT_HANDICAP_PATTERN = /([+-]?\d+[.,]?\d*)\s*[,\/]\s*([+-]?\d+[.,]?\d*)/;

// Padrão para detectar nome de time + números (forte indicador de handicap)
const TEAM_WITH_NUMBERS_PATTERN = /([a-zA-ZÀ-ÿ][\w\s]*?)\s+([+-]?\d+[.,]?\d*(?:\s*[,\/]\s*[+-]?\d+[.,]?\d*)?)\s*$/;

// Padrão para extrair linha de handicap da seleção
const HANDICAP_LINE_PATTERNS = [
  /([+-]?\d+[.,]?\d*)\s*$/,          // "+1.5" ou "-2.5" no final
  /\(([+-]?\d+[.,]?\d*)\)/,          // "(-1.5)" entre parênteses
  /\s([+-]\d+[.,]?\d*)/,             // " -1.5" com espaço antes
];

// ========================================================================
// FUNÇÕES DE EXTRAÇÃO
// ========================================================================

/**
 * Detecta o domínio do mercado a partir do texto
 */
function detectDomain(text: string): MarketDomain | null {
  const normalizedText = text.toLowerCase();
  
  for (const { domain, patterns } of DOMAIN_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        return domain;
      }
    }
  }
  
  return null;
}

/**
 * Extrai lado (Over/Under) e linha do texto
 */
function extractSideAndLine(text: string): SideLineResult | null {
  // Try OVER patterns first
  for (const pattern of OVER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Find the first capture group that's a number
      for (let i = 1; i < match.length; i++) {
        if (match[i] && /\d/.test(match[i])) {
          const line = parseFloat(match[i].replace(",", "."));
          if (!isNaN(line)) {
            return { side: "OVER", line };
          }
        }
      }
    }
  }
  
  // Try UNDER patterns
  for (const pattern of UNDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      for (let i = 1; i < match.length; i++) {
        if (match[i] && /\d/.test(match[i])) {
          const line = parseFloat(match[i].replace(",", "."));
          if (!isNaN(line)) {
            return { side: "UNDER", line };
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Extrai linha de handicap da seleção
 */
function extractHandicapLine(text: string): number | null {
  for (const pattern of HANDICAP_LINE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const line = parseFloat(match[1].replace(",", "."));
      if (!isNaN(line)) {
        return line;
      }
    }
  }
  return null;
}

/**
 * Verifica se o texto indica um mercado TOTAL
 */
function isTotalMarket(text: string): boolean {
  return TOTAL_MARKET_PATTERNS.some(p => p.test(text));
}

/**
 * Verifica se o texto indica um mercado HANDICAP (explícito)
 */
function isHandicapMarket(text: string): boolean {
  return HANDICAP_MARKET_PATTERNS.some(p => p.test(text));
}

/**
 * Verifica se o texto contém termos explícitos de Over/Under
 */
function hasExplicitTotalTerms(text: string): boolean {
  return /\b(over|under|mais\s+de|menos\s+de|acima|abaixo|o\/u|gols?|goals?)\b/i.test(text);
}

/**
 * Detecta handicap asiático com linha dividida (split line)
 * Ex: "0.0, -0.5" → -0.25, "Team +0.5, +1.0" → +0.75
 */
function detectSplitHandicap(text: string): { line: number; team: string | null } | null {
  const match = text.match(SPLIT_HANDICAP_PATTERN);
  if (!match) return null;
  
  const val1 = parseFloat(match[1].replace(",", "."));
  const val2 = parseFloat(match[2].replace(",", "."));
  
  if (isNaN(val1) || isNaN(val2)) return null;
  
  const avgLine = (val1 + val2) / 2;
  
  // Extrair nome do time (texto antes dos números)
  const teamMatch = text.match(/^([a-zA-ZÀ-ÿ][\w\s]*?)\s+[+-]?\d/);
  const team = teamMatch ? teamMatch[1].trim() : null;
  
  return { line: Math.round(avgLine * 100) / 100, team };
}

/**
 * Detecta se a seleção contém padrão de handicap com nome de time
 * Ex: "Modbury Jets 0.0,-0.5" → handicap pertence ao Modbury Jets
 */
function detectTeamHandicap(text: string): { line: number; team: string } | null {
  const match = text.match(TEAM_WITH_NUMBERS_PATTERN);
  if (!match) return null;
  
  const teamName = match[1].trim();
  const numbersStr = match[2];
  
  // Tentar split handicap primeiro (ex: "0.0,-0.5")
  const splitMatch = numbersStr.match(SPLIT_HANDICAP_PATTERN);
  if (splitMatch) {
    const val1 = parseFloat(splitMatch[1].replace(",", "."));
    const val2 = parseFloat(splitMatch[2].replace(",", "."));
    if (!isNaN(val1) && !isNaN(val2)) {
      const avgLine = (val1 + val2) / 2;
      return { line: Math.round(avgLine * 100) / 100, team: teamName };
    }
  }
  
  // Handicap simples (ex: "Team -1.5")
  const val = parseFloat(numbersStr.replace(",", "."));
  if (!isNaN(val)) {
    return { line: val, team: teamName };
  }
  
  return null;
}

/**
 * Infere o domínio padrão baseado no esporte quando não detectado
 */
function inferDomainFromSport(sport: string): MarketDomain {
  return getDefaultDomainForSport(sport);
}

// ========================================================================
// FUNÇÃO PRINCIPAL DE PARSING
// ========================================================================

/**
 * Analisa o mercado e seleção do OCR e extrai informações estruturadas
 * 
 * @param rawMarket - Texto do mercado vindo do OCR (ex: "Total de Games")
 * @param rawSelection - Texto da seleção vindo do OCR (ex: "Mais 21.5")
 * @param sport - Esporte detectado
 */
export function parseOcrMarket(
  rawMarket: string,
  rawSelection: string,
  sport: string
): OcrMarketResult {
  const combinedText = `${rawMarket} ${rawSelection}`.toLowerCase();
  const marketTextLower = rawMarket.toLowerCase();
  
  // 1. DETECTAR TIPO DE MERCADO
  let type: MarketType = "OTHER";
  let confidence: "exact" | "high" | "medium" | "low" = "low";
  
  // Pre-detect: split handicap in selection (ex: "Modbury Jets 0.0,-0.5")
  const splitHandicapFromSelection = detectSplitHandicap(rawSelection);
  const splitHandicapFromMarket = detectSplitHandicap(rawMarket);
  const teamHandicap = detectTeamHandicap(rawSelection) || detectTeamHandicap(rawMarket);
  
  // Extract side/line for potential TOTAL detection
  const sideLineFromSelection = extractSideAndLine(rawSelection);
  const sideLineFromMarket = extractSideAndLine(rawMarket);
  const sideLine = sideLineFromSelection || sideLineFromMarket;
  
  const MATCH_ODDS_PATTERN = /(?:^|\s|[^a-z0-9])(?:1\s*[x×X]\s*2|[1Il]\s*[xX×]\s*2|match\s*odds?|resultado\s*(?:da\s*)?(?:partida|final)|final\s*(?:da|de)\s*partida|full\s*time\s*result|ft\s*result|tres\s*vias|três\s*vias|three\s*way|vencedor\s*(?:da\s*)?(?:partida|match)|match\s*(?:winner|result)|main\s*line)/i;

  // Prioridade 0: Se o texto do MERCADO explicitamente contém padrões 1X2
  if (MATCH_ODDS_PATTERN.test(marketTextLower)) {
    type = "1X2";
    confidence = "high";
  }
  // Prioridade 1: HANDICAP EXPLÍCITO no texto do mercado (ex: "Handicap Asiático")
  else if (isHandicapMarket(marketTextLower)) {
    type = "HANDICAP";
    confidence = "high";
  }
  // Prioridade 2: Split handicap detectado na seleção (ex: "Team 0.0,-0.5")
  // MAS só se NÃO houver termos explícitos de Over/Under
  else if ((splitHandicapFromSelection || splitHandicapFromMarket || teamHandicap) && !hasExplicitTotalTerms(combinedText)) {
    type = "HANDICAP";
    confidence = "high";
  }
  // Prioridade 3: HANDICAP explícito no texto combinado
  else if (isHandicapMarket(combinedText) && !hasExplicitTotalTerms(combinedText)) {
    type = "HANDICAP";
    confidence = "high";
  }
  // Prioridade 4: Verificar se é TOTAL (Over/Under) - só se não for handicap
  else if (sideLine || isTotalMarket(combinedText)) {
    type = "TOTAL";
    confidence = sideLine ? "high" : "medium";
  }
  // Prioridade 5: Verificar 1X2 no texto combinado
  else if (MATCH_ODDS_PATTERN.test(combinedText)) {
    type = "1X2";
    confidence = "high";
  }
  else if (/moneyline|money\s*line|\bml\b|vencedor/i.test(combinedText)) {
    type = "MONEYLINE";
    confidence = "high";
  }
  else if (/btts|ambas?\s*marcam|gol.*gol|\bgg\b/i.test(combinedText)) {
    type = "BTTS";
    confidence = "high";
  }
  else if (/placar|correct.*score|resultado.*exato/i.test(combinedText)) {
    type = "CORRECT_SCORE";
    confidence = "high";
  }
  else if (/dupla.*chance|double.*chance/i.test(combinedText)) {
    type = "DOUBLE_CHANCE";
    confidence = "high";
  }
  else if (/draw.*no.*bet|\bdnb\b|empate.*anula/i.test(combinedText)) {
    type = "DNB";
    confidence = "high";
  }
  else if (/1[ºo°]?\s*tempo|primeiro.*tempo|first.*half|\bht\b/i.test(combinedText)) {
    type = "FIRST_HALF";
    confidence = "high";
  }
  
  // 2. DETECTAR DOMÍNIO
  let domain: MarketDomain | undefined;
  
  if (type === "TOTAL" || type === "HANDICAP") {
    // Tentar detectar domínio explícito
    domain = detectDomain(combinedText) || undefined;
    
    // Se não detectou, inferir do esporte
    if (!domain) {
      domain = inferDomainFromSport(sport);
      // Reduzir confiança se domínio foi inferido
      if (confidence === "high") {
        confidence = "medium";
      }
    }
  }
  
  // 3. EXTRAIR LADO E LINHA
  let side: MarketSide | undefined;
  let line: number | undefined;
  
  if (type === "TOTAL" && sideLine) {
    side = sideLine.side;
    line = sideLine.line;
  } else if (type === "HANDICAP") {
    // Prioridade 1: Split handicap (ex: "0.0,-0.5" → -0.25)
    const splitResult = splitHandicapFromSelection || splitHandicapFromMarket;
    if (splitResult) {
      line = Math.abs(splitResult.line);
      side = splitResult.line >= 0 ? "POSITIVE" : "NEGATIVE";
    }
    // Prioridade 2: Team handicap (ex: "Modbury Jets 0.0,-0.5")
    else if (teamHandicap) {
      line = Math.abs(teamHandicap.line);
      side = teamHandicap.line >= 0 ? "POSITIVE" : "NEGATIVE";
    }
    // Prioridade 3: Handicap simples (ex: "-1.5")
    else {
      const handicapLine = extractHandicapLine(rawSelection) || extractHandicapLine(rawMarket);
      if (handicapLine !== null) {
        line = Math.abs(handicapLine);
        side = handicapLine >= 0 ? "POSITIVE" : "NEGATIVE";
      }
    }
  }
  
  // 4. GERAR NOME DE EXIBIÇÃO
  let displayName = "";
  
  if (type === "TOTAL" && domain) {
    displayName = `Total de ${DOMAIN_LABELS[domain]}`;
  } else if (type === "HANDICAP") {
    // Se detectou handicap asiático (split line ou padrão asiático), usar nome específico
    const isAsian = !!(splitHandicapFromSelection || splitHandicapFromMarket || teamHandicap) 
      || /asi[aá]tic/i.test(combinedText) || /\bah\b/i.test(combinedText);
    if (isAsian) {
      displayName = "Handicap Asiático";
    } else if (domain) {
      displayName = `Handicap de ${DOMAIN_LABELS[domain]}`;
    } else {
      displayName = "Handicap Asiático";
    }
  } else {
    // Mapeamento simples para outros tipos
    const typeDisplayMap: Record<MarketType, string> = {
      "MONEYLINE": "Moneyline / Vencedor",
      "1X2": "1X2 (Resultado)",
      "BTTS": "Ambas Marcam",
      "CORRECT_SCORE": "Placar Exato",
      "DOUBLE_CHANCE": "Dupla Chance",
      "DNB": "Draw No Bet",
      "FIRST_HALF": "Resultado do 1º Tempo",
      "SECOND_HALF": "Resultado do 2º Tempo",
      "FIRST_PERIOD": "Resultado do 1º Período",
      "FIRST_QUARTER": "Resultado do 1º Quarto",
      "FIRST_SET": "Resultado do 1º Set",
      "METHOD_OF_VICTORY": "Método de Vitória",
      "ROUND_FINISH": "Round de Finalização",
      "PLAYER_PROPS": "Props de Jogadores",
      "OUTRIGHT": "Vencedor do Torneio",
      "TOTAL": "Total",
      "HANDICAP": "Handicap",
      "OTHER": "Outro",
    };
    displayName = typeDisplayMap[type];
  }
  
  // Log para debug
  console.log(`[OCR Parser] Market: "${rawMarket}", Selection: "${rawSelection}", Sport: "${sport}"
    → Type: ${type}, Domain: ${domain || "N/A"}, Side: ${side || "N/A"}, Line: ${line ?? "N/A"}
    → Display: "${displayName}", Confidence: ${confidence}`);
  
  return {
    type,
    domain,
    side,
    line,
    displayName,
    confidence,
    rawMarket,
    rawSelection,
  };
}

/**
 * Resolve o resultado do OCR para uma opção disponível no select
 */
export function resolveOcrResultToOption(
  result: OcrMarketResult,
  availableOptions: string[]
): string {
  // Tentar match exato primeiro
  if (availableOptions.includes(result.displayName)) {
    return result.displayName;
  }
  
  // Tentar match parcial normalizado
  const normalizedDisplay = result.displayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  for (const option of availableOptions) {
    const normalizedOption = option.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Match exato normalizado
    if (normalizedOption === normalizedDisplay) {
      return option;
    }
    
    // Match por inclusão para TOTAL
    if (result.type === "TOTAL") {
      if (normalizedOption.includes("total") || normalizedOption.includes("over") || normalizedOption.includes("under")) {
        // Verificar se o domínio bate
        if (result.domain) {
          const domainLabel = DOMAIN_LABELS[result.domain].toLowerCase();
          if (normalizedOption.includes(domainLabel)) {
            return option;
          }
        }
      }
    }
    
    // Match por inclusão para HANDICAP
    if (result.type === "HANDICAP") {
      if (normalizedOption.includes("handicap") || normalizedOption.includes("spread")) {
        // Match "Handicap Asiático" diretamente
        if (normalizedOption.includes("asiatico") || normalizedOption.includes("asian")) {
          return option;
        }
        // Verificar se o domínio bate
        if (result.domain) {
          const domainLabel = DOMAIN_LABELS[result.domain].toLowerCase();
          if (normalizedOption.includes(domainLabel)) {
            return option;
          }
        }
        // Fallback: aceitar qualquer handicap
        return option;
      }
    }
    
    // Match por tipo para 1X2 / Moneyline
    if (result.type === "1X2") {
      if (normalizedOption.includes("1x2") || normalizedOption.includes("1 x 2")) {
        return option;
      }
    }
    if (result.type === "MONEYLINE") {
      if (normalizedOption.includes("moneyline") || normalizedOption.includes("vencedor")) {
        return option;
      }
    }
  }
  
  // Fallback: Outro
  if (availableOptions.includes("Outro")) {
    return "Outro";
  }
  
  return availableOptions[0] || "";
}

/**
 * Formata a seleção baseada no resultado do OCR
 */
export function formatSelectionFromOcrResult(result: OcrMarketResult): string {
  if (result.type === "TOTAL" && result.side && result.line !== undefined && result.domain) {
    const sideLabel = result.side === "OVER" ? "Mais" : "Menos";
    return `${sideLabel} ${result.line} ${DOMAIN_LABELS[result.domain]}`;
  }
  
  // Para HANDICAP, formatar com o sinal correto da linha
  if (result.type === "HANDICAP" && result.line !== undefined && result.side) {
    const sign = result.side === "NEGATIVE" ? "-" : "+";
    const lineStr = `${sign}${result.line}`;
    // Se a seleção original contém nome de time, preservar
    const teamMatch = result.rawSelection.match(/^([a-zA-ZÀ-ÿ][\w\s]*?)\s+[+-]?\d/);
    if (teamMatch) {
      return `${teamMatch[1].trim()} ${lineStr}`;
    }
    return lineStr;
  }
  
  // Retornar seleção original se não conseguir formatar
  return result.rawSelection;
}
