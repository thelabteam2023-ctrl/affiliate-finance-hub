/**
 * Market Types v3.0 - Sistema Canônico Global de Mercados
 * 
 * REGRA GLOBAL OBRIGATÓRIA:
 * - Over/Under NUNCA são mercados sozinhos
 * - Sempre: TOTAL + DOMÍNIO + LADO + LINHA
 * - Handicap sempre tem: HANDICAP + DOMÍNIO + LADO + LINHA
 */

// ========================================================================
// TIPOS CANÔNICOS DE MERCADO (NÍVEL SUPERIOR)
// ========================================================================

export type MarketType = 
  | "MONEYLINE"       // Vencedor (2 opções)
  | "1X2"             // Vencedor com empate (3 opções)
  | "TOTAL"           // Over/Under - REQUER domínio + lado + linha
  | "HANDICAP"        // Handicap - REQUER domínio + lado + linha
  | "BTTS"            // Ambas Marcam
  | "CORRECT_SCORE"   // Placar Exato
  | "DOUBLE_CHANCE"   // Dupla Chance
  | "DNB"             // Draw No Bet
  | "FIRST_HALF"      // Resultado 1º Tempo
  | "SECOND_HALF"     // Resultado 2º Tempo
  | "FIRST_PERIOD"    // Resultado 1º Período
  | "FIRST_QUARTER"   // Resultado 1º Quarto
  | "FIRST_SET"       // Resultado 1º Set
  | "METHOD_OF_VICTORY" // Método de Vitória (MMA/Boxe)
  | "ROUND_FINISH"    // Round de Finalização
  | "PLAYER_PROPS"    // Props de Jogadores
  | "OUTRIGHT"        // Vencedor do Torneio
  | "OTHER";          // Outros

// ========================================================================
// DOMÍNIOS DE TOTAL E HANDICAP (O QUE ESTÁ SENDO MEDIDO)
// ========================================================================

export type MarketDomain = 
  | "GOALS"       // Gols (Futebol, Hockey)
  | "POINTS"      // Pontos (Basquete, Futebol Americano, Vôlei)
  | "GAMES"       // Games (Tênis)
  | "SETS"        // Sets (Tênis, Vôlei)
  | "RUNS"        // Runs (Baseball)
  | "CORNERS"     // Escanteios (Futebol)
  | "CARDS"       // Cartões (Futebol)
  | "ROUNDS"      // Rounds (MMA, Boxe, CS)
  | "MAPS"        // Mapas (eSports)
  | "KILLS"       // Kills (eSports)
  | "TOWERS"      // Torres (LoL, Dota)
  | "ACES"        // Aces (Tênis)
  | "GENERIC";    // Genérico (fallback)

// ========================================================================
// LADO DO MERCADO (OVER/UNDER, POSITIVO/NEGATIVO)
// ========================================================================

export type MarketSide = "OVER" | "UNDER" | "POSITIVE" | "NEGATIVE";

// ========================================================================
// ESTRUTURA CANÔNICA COMPLETA
// ========================================================================

export interface CanonicalMarket {
  type: MarketType;
  domain?: MarketDomain;    // Obrigatório para TOTAL e HANDICAP
  side?: MarketSide;        // Obrigatório para TOTAL e HANDICAP
  line?: number;            // Linha numérica (2.5, 21.5, etc.)
}

// ========================================================================
// DOMÍNIOS VÁLIDOS POR ESPORTE
// ========================================================================

export const DOMAINS_BY_SPORT: Record<string, MarketDomain[]> = {
  // Futebol
  "Futebol": ["GOALS", "CORNERS", "CARDS"],
  "Soccer": ["GOALS", "CORNERS", "CARDS"],
  "eFootball": ["GOALS"],
  
  // Tênis
  "Tênis": ["GAMES", "SETS"],
  "Tennis": ["GAMES", "SETS"],
  
  // Basquete
  "Basquete": ["POINTS"],
  "NBA": ["POINTS"],
  "Basketball": ["POINTS"],
  
  // Futebol Americano
  "Futebol Americano": ["POINTS"],
  "NFL": ["POINTS"],
  
  // Hockey
  "Hockey": ["GOALS"],
  "NHL": ["GOALS"],
  
  // Vôlei
  "Vôlei": ["POINTS", "SETS"],
  "Volleyball": ["POINTS", "SETS"],
  
  // Baseball
  "Baseball": ["RUNS"],
  "MLB": ["RUNS"],
  
  // MMA / Boxe
  "MMA/UFC": ["ROUNDS"],
  "MMA": ["ROUNDS"],
  "UFC": ["ROUNDS"],
  "Boxe": ["ROUNDS"],
  "Boxing": ["ROUNDS"],
  
  // eSports
  "League of Legends": ["MAPS", "KILLS", "TOWERS"],
  "Counter-Strike": ["MAPS", "ROUNDS"],
  "Dota 2": ["MAPS", "KILLS", "TOWERS"],
  
  // Fallback
  "Outro": ["GENERIC"],
};

// ========================================================================
// LABELS DE DOMÍNIO EM PORTUGUÊS
// ========================================================================

export const DOMAIN_LABELS: Record<MarketDomain, string> = {
  "GOALS": "Gols",
  "POINTS": "Pontos",
  "GAMES": "Games",
  "SETS": "Sets",
  "RUNS": "Runs",
  "CORNERS": "Escanteios",
  "CARDS": "Cartões",
  "ROUNDS": "Rounds",
  "MAPS": "Mapas",
  "KILLS": "Kills",
  "TOWERS": "Torres",
  "ACES": "Aces",
  "GENERIC": "Total",
};

// ========================================================================
// LABELS DE TIPO DE MERCADO EM PORTUGUÊS
// ========================================================================

export const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  "MONEYLINE": "Moneyline / Vencedor",
  "1X2": "1X2 (Resultado)",
  "TOTAL": "Total (Over/Under)",
  "HANDICAP": "Handicap",
  "BTTS": "Ambas Marcam",
  "CORRECT_SCORE": "Placar Exato",
  "DOUBLE_CHANCE": "Dupla Chance",
  "DNB": "Draw No Bet",
  "FIRST_HALF": "1º Tempo",
  "SECOND_HALF": "2º Tempo",
  "FIRST_PERIOD": "1º Período",
  "FIRST_QUARTER": "1º Quarto",
  "FIRST_SET": "1º Set",
  "METHOD_OF_VICTORY": "Método de Vitória",
  "ROUND_FINISH": "Round de Finalização",
  "PLAYER_PROPS": "Props de Jogadores",
  "OUTRIGHT": "Vencedor do Torneio",
  "OTHER": "Outro",
};

// ========================================================================
// TIPOS DE MERCADO DISPONÍVEIS POR ESPORTE
// ========================================================================

export const MARKET_TYPES_BY_SPORT: Record<string, MarketType[]> = {
  "Futebol": ["1X2", "TOTAL", "HANDICAP", "BTTS", "DOUBLE_CHANCE", "DNB", "CORRECT_SCORE", "FIRST_HALF", "OTHER"],
  "Basquete": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_HALF", "FIRST_QUARTER", "OTHER"],
  "NBA": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_HALF", "FIRST_QUARTER", "OTHER"],
  "Tênis": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_SET", "CORRECT_SCORE", "OTHER"],
  "Baseball": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_HALF", "OTHER"],
  "Hockey": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_PERIOD", "OTHER"],
  "NHL": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_PERIOD", "OTHER"],
  "Futebol Americano": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_HALF", "OTHER"],
  "NFL": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_HALF", "OTHER"],
  "Vôlei": ["MONEYLINE", "TOTAL", "HANDICAP", "FIRST_SET", "CORRECT_SCORE", "OTHER"],
  "MMA/UFC": ["MONEYLINE", "TOTAL", "METHOD_OF_VICTORY", "ROUND_FINISH", "OTHER"],
  "Boxe": ["MONEYLINE", "TOTAL", "METHOD_OF_VICTORY", "ROUND_FINISH", "OTHER"],
  "League of Legends": ["MONEYLINE", "TOTAL", "HANDICAP", "OTHER"],
  "Counter-Strike": ["MONEYLINE", "TOTAL", "HANDICAP", "OTHER"],
  "Dota 2": ["MONEYLINE", "TOTAL", "HANDICAP", "OTHER"],
  "eFootball": ["1X2", "TOTAL", "HANDICAP", "BTTS", "CORRECT_SCORE", "OTHER"],
  "Outro": ["MONEYLINE", "TOTAL", "HANDICAP", "OTHER"],
};

// ========================================================================
// FUNÇÕES UTILITÁRIAS
// ========================================================================

/**
 * Obtém os tipos de mercado disponíveis para um esporte
 */
export function getMarketTypesForSport(sport: string): MarketType[] {
  return MARKET_TYPES_BY_SPORT[sport] || MARKET_TYPES_BY_SPORT["Outro"];
}

/**
 * Obtém os domínios válidos para um esporte
 */
export function getDomainsForSport(sport: string): MarketDomain[] {
  return DOMAINS_BY_SPORT[sport] || DOMAINS_BY_SPORT["Outro"];
}

/**
 * Obtém o domínio padrão para um esporte
 */
export function getDefaultDomainForSport(sport: string): MarketDomain {
  const domains = getDomainsForSport(sport);
  return domains[0] || "GENERIC";
}

/**
 * Verifica se o tipo de mercado requer domínio
 */
export function marketTypeRequiresDomain(type: MarketType): boolean {
  return type === "TOTAL" || type === "HANDICAP";
}

/**
 * Formata o mercado para exibição
 */
export function formatMarketDisplay(market: CanonicalMarket): string {
  const typeLabel = MARKET_TYPE_LABELS[market.type];
  
  if (!marketTypeRequiresDomain(market.type)) {
    return typeLabel;
  }
  
  const domainLabel = market.domain ? DOMAIN_LABELS[market.domain] : "";
  
  if (market.type === "TOTAL" && market.domain) {
    return `Total de ${domainLabel}`;
  }
  
  if (market.type === "HANDICAP" && market.domain) {
    return `Handicap de ${domainLabel}`;
  }
  
  return typeLabel;
}

/**
 * Formata a seleção para TOTAL
 */
export function formatTotalSelection(side: MarketSide, line: number, domain: MarketDomain): string {
  const domainLabel = DOMAIN_LABELS[domain];
  const sideLabel = side === "OVER" ? "Mais" : "Menos";
  return `${sideLabel} ${line} ${domainLabel}`;
}

/**
 * Formata a seleção para HANDICAP
 */
export function formatHandicapSelection(team: string, line: number): string {
  const prefix = line >= 0 ? "+" : "";
  return `${team} (${prefix}${line})`;
}

// ========================================================================
// CONVERSÃO PARA FORMATO DE BANCO (STRING ÚNICA)
// ========================================================================

/**
 * Converte mercado canônico para string de banco
 * Ex: { type: "TOTAL", domain: "GAMES" } → "Total de Games"
 */
export function canonicalToDbMarket(market: CanonicalMarket): string {
  if (market.type === "TOTAL" && market.domain) {
    return `Total de ${DOMAIN_LABELS[market.domain]}`;
  }
  
  if (market.type === "HANDICAP" && market.domain) {
    return `Handicap de ${DOMAIN_LABELS[market.domain]}`;
  }
  
  return MARKET_TYPE_LABELS[market.type];
}

/**
 * Converte string de banco para mercado canônico parcial
 */
export function dbMarketToCanonical(dbMarket: string): Partial<CanonicalMarket> {
  const lower = dbMarket.toLowerCase();
  
  // Total patterns
  if (lower.includes("total") || lower.includes("over") || lower.includes("under")) {
    let domain: MarketDomain = "GENERIC";
    
    if (lower.includes("gol")) domain = "GOALS";
    else if (lower.includes("pont")) domain = "POINTS";
    else if (lower.includes("game")) domain = "GAMES";
    else if (lower.includes("set")) domain = "SETS";
    else if (lower.includes("run")) domain = "RUNS";
    else if (lower.includes("corner") || lower.includes("escante")) domain = "CORNERS";
    else if (lower.includes("card") || lower.includes("cart")) domain = "CARDS";
    else if (lower.includes("round")) domain = "ROUNDS";
    else if (lower.includes("mapa") || lower.includes("map")) domain = "MAPS";
    else if (lower.includes("kill")) domain = "KILLS";
    
    return { type: "TOTAL", domain };
  }
  
  // Handicap patterns
  if (lower.includes("handicap") || lower.includes("spread") || lower.includes("run line") || lower.includes("puck line")) {
    let domain: MarketDomain = "GENERIC";
    
    if (lower.includes("gol")) domain = "GOALS";
    else if (lower.includes("pont")) domain = "POINTS";
    else if (lower.includes("game")) domain = "GAMES";
    else if (lower.includes("set")) domain = "SETS";
    else if (lower.includes("round")) domain = "ROUNDS";
    else if (lower.includes("mapa") || lower.includes("map")) domain = "MAPS";
    
    return { type: "HANDICAP", domain };
  }
  
  // Other patterns
  if (lower.includes("moneyline") || lower.includes("vencedor")) return { type: "MONEYLINE" };
  if (lower.includes("1x2")) return { type: "1X2" };
  if (lower.includes("btts") || lower.includes("ambas marcam")) return { type: "BTTS" };
  if (lower.includes("placar") || lower.includes("correct score")) return { type: "CORRECT_SCORE" };
  if (lower.includes("dupla chance")) return { type: "DOUBLE_CHANCE" };
  if (lower.includes("draw no bet") || lower.includes("dnb")) return { type: "DNB" };
  if (lower.includes("1º tempo") || lower.includes("first half")) return { type: "FIRST_HALF" };
  
  return { type: "OTHER" };
}

// ========================================================================
// LISTA FIXA DE OPÇÕES PARA UI (COMPATIBILIDADE COM SELECT ATUAL)
// ========================================================================

/**
 * Gera lista de opções de mercado para UI baseada no esporte
 * Esta função mantém compatibilidade com o sistema atual de select
 */
export function getMarketOptionsForSport(sport: string): string[] {
  const types = getMarketTypesForSport(sport);
  const domains = getDomainsForSport(sport);
  const options: string[] = [];
  
  for (const type of types) {
    if (type === "TOTAL") {
      // Para TOTAL, criar uma opção para cada domínio
      for (const domain of domains) {
        options.push(`Total de ${DOMAIN_LABELS[domain]}`);
      }
    } else if (type === "HANDICAP") {
      // Para HANDICAP, criar uma opção para cada domínio relevante
      const handicapDomains = domains.filter(d => !["CORNERS", "CARDS", "ACES"].includes(d));
      for (const domain of handicapDomains) {
        options.push(`Handicap de ${DOMAIN_LABELS[domain]}`);
      }
    } else if (type !== "OTHER") {
      options.push(MARKET_TYPE_LABELS[type]);
    }
  }
  
  // Sempre adicionar Outro no final
  options.push("Outro");
  
  return options;
}

/**
 * Verifica se um mercado é do tipo TOTAL
 */
export function isTotalMarket(mercado: string): boolean {
  const lower = mercado.toLowerCase();
  return lower.includes("total") || lower.includes("over") || lower.includes("under");
}

/**
 * Verifica se um mercado é do tipo HANDICAP
 */
export function isHandicapMarket(mercado: string): boolean {
  const lower = mercado.toLowerCase();
  return lower.includes("handicap") || lower.includes("spread") || lower.includes("run line") || lower.includes("puck line");
}
