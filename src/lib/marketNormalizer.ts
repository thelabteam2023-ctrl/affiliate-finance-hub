/**
 * Market Normalizer v2.0 - Sistema Completo de Normalização de Mercados
 * 
 * Arquitetura:
 * 1. market_raw_label: texto vindo do OCR/print (ex: "Mais 21.5", "TOTAL DE GAMES")
 * 2. market_canonical_type: classificação lógica (ex: "TOTAL_GAMES_OVER", "MONEYLINE")
 * 3. market_display_name: nome para exibição no UI (ex: "Over/Under Games")
 * 
 * O sistema usa regras semânticas por esporte para garantir classificação correta
 */

// ========================================================================
// TIPOS CANÔNICOS EXPANDIDOS - Classificação lógica de mercados
// ========================================================================

export type MarketCanonicalType = 
  // === VENCEDOR ===
  | "MONEYLINE"              // Vencedor (2 opções, sem empate)
  | "1X2"                    // Vencedor com empate (3 opções)
  | "DNB"                    // Draw No Bet
  | "DOUBLE_CHANCE"          // Dupla chance (1X, X2, 12)
  
  // === TOTAIS (OVER/UNDER) ===
  | "TOTAL_GOALS_OVER"       // Over gols (futebol)
  | "TOTAL_GOALS_UNDER"      // Under gols (futebol)
  | "TOTAL_POINTS_OVER"      // Over pontos (basquete, futebol americano)
  | "TOTAL_POINTS_UNDER"     // Under pontos
  | "TOTAL_GAMES_OVER"       // Over games (tênis)
  | "TOTAL_GAMES_UNDER"      // Under games (tênis)
  | "TOTAL_SETS_OVER"        // Over sets (tênis, vôlei)
  | "TOTAL_SETS_UNDER"       // Under sets
  | "TOTAL_RUNS_OVER"        // Over runs (baseball)
  | "TOTAL_RUNS_UNDER"       // Under runs
  | "TOTAL_ROUNDS_OVER"      // Over rounds (MMA, boxe, CS)
  | "TOTAL_ROUNDS_UNDER"     // Under rounds
  | "TOTAL_MAPS_OVER"        // Over mapas (eSports)
  | "TOTAL_MAPS_UNDER"       // Under mapas
  | "TOTAL_KILLS_OVER"       // Over kills (eSports)
  | "TOTAL_KILLS_UNDER"      // Under kills
  | "TOTAL_CORNERS_OVER"     // Over escanteios
  | "TOTAL_CORNERS_UNDER"    // Under escanteios
  | "TOTAL_CARDS_OVER"       // Over cartões
  | "TOTAL_CARDS_UNDER"      // Under cartões
  | "OVER_UNDER"             // Over/Under genérico (fallback)
  
  // === HANDICAPS ===
  | "HANDICAP_ASIAN"         // Handicap asiático (futebol)
  | "HANDICAP_EUROPEAN"      // Handicap europeu
  | "HANDICAP_GAMES"         // Handicap de games (tênis)
  | "HANDICAP_SETS"          // Handicap de sets (tênis, vôlei)
  | "HANDICAP_POINTS"        // Handicap de pontos (basquete)
  | "HANDICAP_ROUNDS"        // Handicap de rounds (MMA, CS)
  | "HANDICAP_MAPS"          // Handicap de mapas (eSports)
  | "HANDICAP_KILLS"         // Handicap de kills (eSports)
  | "SPREAD"                 // Spread (futebol americano)
  | "RUN_LINE"               // Run Line (baseball)
  | "PUCK_LINE"              // Puck Line (hockey)
  | "HANDICAP"               // Handicap genérico (fallback)
  
  // === PARCIAIS ===
  | "FIRST_HALF"             // Resultado 1º tempo
  | "SECOND_HALF"            // Resultado 2º tempo
  | "FIRST_SET"              // Resultado 1º set
  | "FIRST_PERIOD"           // Resultado 1º período
  | "FIRST_QUARTER"          // Resultado 1º quarto
  | "FIRST_INNING"           // Resultado 1º inning
  | "FIRST_MAP"              // Resultado 1º mapa
  
  // === ESPECIAIS ===
  | "BTTS"                   // Ambas Marcam
  | "CORRECT_SCORE"          // Placar exato
  | "ODD_EVEN"               // Ímpar/Par
  | "FIRST_GOAL"             // Primeiro gol
  | "LAST_GOAL"              // Último gol
  | "CLEAN_SHEET"            // Clean Sheet
  | "WINNING_MARGIN"         // Margem de vitória
  
  // === PROPS ===
  | "PLAYER_PROPS"           // Props de jogadores
  | "TEAM_PROPS"             // Props de time
  | "SPECIAL_PROPS"          // Props especiais
  
  // === ESPORTES ESPECÍFICOS ===
  | "METHOD_OF_VICTORY"      // Método de vitória (MMA/boxe)
  | "ROUND_FINISH"           // Round da finalização (MMA/boxe)
  | "GO_THE_DISTANCE"        // Vai até o fim (MMA/boxe)
  | "FIRST_BLOOD"            // First Blood (eSports)
  | "FIRST_TOWER"            // First Tower (LoL/Dota)
  | "FIRST_DRAGON"           // First Dragon (LoL)
  | "FIRST_BARON"            // First Baron (LoL)
  | "FIRST_ROSHAN"           // First Roshan (Dota)
  | "TIEBREAK"               // Haverá Tiebreak (tênis)
  | "ACE"                    // Aces (tênis)
  | "DOUBLE_FAULT"           // Dupla falta (tênis)
  
  // === TORNEIOS ===
  | "OUTRIGHT"               // Vencedor do torneio
  | "TOP_FINISH"             // Top 5/10/20
  | "HEAD_TO_HEAD"           // Head-to-Head
  | "MAKE_CUT"               // Fazer o cut (golfe)
  
  // === FALLBACK ===
  | "OTHER";                 // Outros não mapeados

// ========================================================================
// INTERFACES
// ========================================================================

export interface SemanticMarketContext {
  sport: string;
  marketLabel: string;
  selectionLabel?: string;
  selections?: string[];
  selectionsCount?: number;
  hasDrawOption?: boolean;
}

export interface SemanticMarketResult {
  canonicalType: MarketCanonicalType;
  displayName: string;
  confidence: "exact" | "high" | "medium" | "low";
  reason?: string;
  subType?: string; // Para identificar especificidades (ex: "games", "sets")
}

interface CanonicalRule {
  patterns: RegExp[];
  canonicalType: MarketCanonicalType;
  displayName: string;
  priority?: number; // Maior = mais prioritário
}

interface SportRules {
  sport: string[];
  rules: CanonicalRule[];
}

// ========================================================================
// REGRAS DE DETECÇÃO DE SELEÇÃO (ANTES DO MERCADO)
// ========================================================================
// Estas regras analisam o TEXTO DA SELEÇÃO para identificar o tipo canônico
// São aplicadas ANTES das regras de mercado

interface SelectionPattern {
  patterns: RegExp[];
  canonicalType: MarketCanonicalType;
  displayNameBySport: Record<string, string>;
  defaultDisplayName: string;
}

const SELECTION_PATTERNS: SelectionPattern[] = [
  // CRÍTICO: "Mais X" = OVER
  {
    patterns: [
      /^mais\s+\d+[.,]?\d*/i,           // "Mais 21.5"
      /^over\s+\d+[.,]?\d*/i,           // "Over 21.5"
      /^acima\s+\d+[.,]?\d*/i,          // "Acima 21.5"
      /^\+\s*\d+[.,]?\d*/,              // "+21.5"
      /^o\s*\d+[.,]?\d*/i,              // "O 21.5"
      /^>\s*\d+[.,]?\d*/,               // "> 21.5"
    ],
    canonicalType: "OVER_UNDER",
    displayNameBySport: {
      "Tênis": "Over/Under Games",
      "Tennis": "Over/Under Games",
      "Futebol": "Over/Under Gols",
      "Soccer": "Over/Under Gols",
      "Basquete": "Over/Under Pontos",
      "Basketball": "Over/Under Pontos",
      "NBA": "Over/Under Pontos",
      "Vôlei": "Over/Under Pontos",
      "Volleyball": "Over/Under Pontos",
      "Hockey": "Over/Under Gols",
      "NHL": "Over/Under Gols",
      "Futebol Americano": "Over/Under Pontos",
      "NFL": "Over/Under Pontos",
      "Baseball": "Over/Under Runs",
      "MLB": "Over/Under Runs",
      "MMA/UFC": "Over/Under Rounds",
      "MMA": "Over/Under Rounds",
      "UFC": "Over/Under Rounds",
      "Boxe": "Over/Under Rounds",
      "Boxing": "Over/Under Rounds",
    },
    defaultDisplayName: "Over/Under"
  },
  // CRÍTICO: "Menos X" = UNDER
  {
    patterns: [
      /^menos\s+\d+[.,]?\d*/i,          // "Menos 21.5"
      /^under\s+\d+[.,]?\d*/i,          // "Under 21.5"
      /^abaixo\s+\d+[.,]?\d*/i,         // "Abaixo 21.5"
      /^-\s*\d+[.,]?\d*\s*$/,           // "-21.5" (fim da string, sem contexto de handicap)
      /^u\s*\d+[.,]?\d*/i,              // "U 21.5"
      /^<\s*\d+[.,]?\d*/,               // "< 21.5"
    ],
    canonicalType: "OVER_UNDER",
    displayNameBySport: {
      "Tênis": "Over/Under Games",
      "Tennis": "Over/Under Games",
      "Futebol": "Over/Under Gols",
      "Soccer": "Over/Under Gols",
      "Basquete": "Over/Under Pontos",
      "Basketball": "Over/Under Pontos",
      "NBA": "Over/Under Pontos",
      "Vôlei": "Over/Under Pontos",
      "Volleyball": "Over/Under Pontos",
    },
    defaultDisplayName: "Over/Under"
  },
  // Handicap na seleção: "Jogador -1.5", "Time +2.5"
  {
    patterns: [
      /\s[+-]\d+[.,]?\d*\s*$/i,         // " -1.5" ou " +2.5" no fim
      /\([+-]\d+[.,]?\d*\)/i,           // "(-1.5)" ou "(+2.5)"
    ],
    canonicalType: "HANDICAP",
    displayNameBySport: {
      "Tênis": "Handicap de Games",
      "Tennis": "Handicap de Games",
      "Basquete": "Handicap / Spread",
      "Basketball": "Handicap / Spread",
      "Vôlei": "Handicap de Sets",
      "Volleyball": "Handicap de Sets",
    },
    defaultDisplayName: "Handicap"
  }
];

// ========================================================================
// REGRAS SEMÂNTICAS POR ESPORTE - MAPEAMENTO COMPLETO
// ========================================================================

const SPORT_RULES: SportRules[] = [
  // ==================== FUTEBOL ====================
  {
    sport: ["Futebol", "Soccer", "Football"],
    rules: [
      // Vencedor / 1X2
      { patterns: [/1x2/i, /resultado\s*final/i, /match\s*result/i, /full\s*time/i, /tres\s*vias/i, /three\s*way/i, /main\s*line/i], canonicalType: "1X2", displayName: "1X2", priority: 10 },
      { patterns: [/vencedor\s*(da\s*)?partida/i, /winner/i, /match\s*winner/i, /matched?\s*winner/i], canonicalType: "1X2", displayName: "1X2" },
      
      // Dupla Chance
      { patterns: [/dupla\s*chance/i, /double\s*chance/i], canonicalType: "DOUBLE_CHANCE", displayName: "Dupla Chance", priority: 10 },
      { patterns: [/\b1x\b/i, /\bx2\b/i, /\b12\b/i, /casa\s*ou\s*empate/i, /fora\s*ou\s*empate/i], canonicalType: "DOUBLE_CHANCE", displayName: "Dupla Chance" },
      
      // DNB
      { patterns: [/draw\s*no\s*bet/i, /\bdnb\b/i, /empate\s*anula/i, /empate\s*reembolsa/i], canonicalType: "DNB", displayName: "Draw No Bet", priority: 10 },
      
      // Ambas Marcam
      { patterns: [/ambas?\s*marcam/i, /btts/i, /both\s*teams?\s*to\s*score/i, /gol\s*gol/i, /\bgg\b/i], canonicalType: "BTTS", displayName: "Ambas Marcam", priority: 10 },
      
      // Over/Under Gols
      { patterns: [/over\s*\/?\s*under\s*(de\s*)?(gol|goal)/i, /total\s*(de\s*)?(gol|goal)/i], canonicalType: "OVER_UNDER", displayName: "Over/Under Gols", priority: 10 },
      { patterns: [/gols?\s*(acima|abaixo|over|under)/i, /mais\s*de\s*\d+[.,]?\d*\s*gol/i, /menos\s*de\s*\d+[.,]?\d*\s*gol/i], canonicalType: "OVER_UNDER", displayName: "Over/Under Gols" },
      { patterns: [/over\s*\d+[.,]?\d*\s*gol/i, /under\s*\d+[.,]?\d*\s*gol/i], canonicalType: "OVER_UNDER", displayName: "Over/Under Gols" },
      
      // Over/Under Escanteios
      { patterns: [/escanteio/i, /corner/i, /cantos/i, /total\s*(de\s*)?corner/i], canonicalType: "TOTAL_CORNERS_OVER", displayName: "Over/Under Escanteios" },
      
      // Over/Under Cartões
      { patterns: [/cart(ao|ão|oes|ões)/i, /card/i, /total\s*(de\s*)?cart/i], canonicalType: "TOTAL_CARDS_OVER", displayName: "Over/Under Cartões" },
      
      // Handicaps
      { patterns: [/handicap\s*asia/i, /asian\s*handicap/i, /\bah\s*[+-]?\d/i], canonicalType: "HANDICAP_ASIAN", displayName: "Handicap Asiático", priority: 10 },
      { patterns: [/handicap\s*europeu/i, /european\s*handicap/i, /\beh\s*[+-]?\d/i], canonicalType: "HANDICAP_EUROPEAN", displayName: "Handicap Europeu" },
      { patterns: [/handicap\s*(de\s*)?gol/i, /goal\s*handicap/i, /\bhandicap\b/i], canonicalType: "HANDICAP", displayName: "Handicap de Gols" },
      
      // 1º Tempo
      { patterns: [/1[ºo°]?\s*tempo/i, /primeiro\s*tempo/i, /1st\s*half/i, /first\s*half/i, /\bht\b/i, /half\s*time/i, /intervalo/i], canonicalType: "FIRST_HALF", displayName: "Resultado do 1º Tempo", priority: 10 },
      { patterns: [/resultado.*1.*tempo/i, /1.*tempo.*resultado/i], canonicalType: "FIRST_HALF", displayName: "Resultado do 1º Tempo" },
      
      // 2º Tempo
      { patterns: [/2[ºo°]?\s*tempo/i, /segundo\s*tempo/i, /2nd\s*half/i, /second\s*half/i], canonicalType: "SECOND_HALF", displayName: "Resultado do 2º Tempo" },
      
      // Placar Correto
      { patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i, /exact\s*score/i, /resultado\s*exato/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Correto", priority: 10 },
      { patterns: [/^\d+-\d+$/], canonicalType: "CORRECT_SCORE", displayName: "Placar Correto" },
      
      // Primeiro/Último Gol
      { patterns: [/primeiro\s*gol/i, /first\s*goal/i, /primeiro\s*a\s*marcar/i, /first\s*scorer/i], canonicalType: "FIRST_GOAL", displayName: "Primeiro Gol" },
      { patterns: [/ultimo\s*gol/i, /last\s*goal/i, /ultimo\s*a\s*marcar/i], canonicalType: "LAST_GOAL", displayName: "Último Gol" },
      
      // Ímpar/Par
      { patterns: [/gols?\s*(impar|par|odd|even)/i, /(impar|par|odd|even)\s*gols?/i], canonicalType: "ODD_EVEN", displayName: "Gols Ímpares/Pares" },
      
      // Clean Sheet
      { patterns: [/clean\s*sheet/i, /n(ao|ão)\s*sofrer\s*gol/i, /sem\s*sofrer/i], canonicalType: "CLEAN_SHEET", displayName: "Clean Sheet" },
      
      // Margem de Vitória
      { patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i], canonicalType: "WINNING_MARGIN", displayName: "Margem de Vitória" },
    ]
  },
  
  // ==================== TÊNIS ====================
  {
    sport: ["Tênis", "Tennis"],
    rules: [
      // Vencedor
      { patterns: [/vencedor\s*(da\s*)?(partida)?/i, /winner/i, /match\s*winner/i, /to\s*win\s*match/i], canonicalType: "MONEYLINE", displayName: "Vencedor da Partida", priority: 10 },
      
      // *** TOTAL DE GAMES - CRÍTICO ***
      { patterns: [/total\s*(de\s*)?games?/i, /games?\s*total/i], canonicalType: "TOTAL_GAMES_OVER", displayName: "Over/Under Games", priority: 20 },
      { patterns: [/over\s*\/?\s*under\s*(de\s*)?games?/i, /games?\s*(over|under)/i], canonicalType: "TOTAL_GAMES_OVER", displayName: "Over/Under Games", priority: 20 },
      { patterns: [/games?\s*(acima|abaixo|mais|menos)/i], canonicalType: "TOTAL_GAMES_OVER", displayName: "Over/Under Games", priority: 20 },
      { patterns: [/(acima|abaixo|mais|menos)\s*\d+[.,]?\d*\s*games?/i], canonicalType: "TOTAL_GAMES_OVER", displayName: "Over/Under Games", priority: 20 },
      
      // *** TOTAL DE SETS ***
      { patterns: [/total\s*(de\s*)?sets?/i, /sets?\s*total/i], canonicalType: "TOTAL_SETS_OVER", displayName: "Total de Sets", priority: 15 },
      { patterns: [/sets?\s*(over|under)/i, /numero\s*de\s*sets?/i], canonicalType: "TOTAL_SETS_OVER", displayName: "Total de Sets" },
      
      // *** HANDICAP DE GAMES ***
      { patterns: [/handicap\s*(de\s*)?games?/i, /games?\s*handicap/i, /spread\s*games?/i], canonicalType: "HANDICAP_GAMES", displayName: "Handicap de Games", priority: 15 },
      { patterns: [/games?\s*[+-]\d+[.,]?\d*/i, /[+-]\d+[.,]?\d*\s*games?/i], canonicalType: "HANDICAP_GAMES", displayName: "Handicap de Games" },
      
      // *** HANDICAP DE SETS ***
      { patterns: [/handicap\s*(de\s*)?sets?/i, /sets?\s*handicap/i, /spread\s*sets?/i], canonicalType: "HANDICAP_SETS", displayName: "Handicap de Sets", priority: 15 },
      { patterns: [/sets?\s*[+-]\d+[.,]?\d*/i, /[+-]\d+[.,]?\d*\s*sets?/i], canonicalType: "HANDICAP_SETS", displayName: "Handicap de Sets" },
      
      // Vencedor do Set
      { patterns: [/vencedor\s*(do\s*)?1[ºo°]?\s*set/i, /1st\s*set\s*winner/i, /primeiro\s*set\s*vencedor/i], canonicalType: "FIRST_SET", displayName: "Vencedor do 1º Set", priority: 10 },
      { patterns: [/vencedor\s*(do\s*)?set/i, /set\s*winner/i], canonicalType: "MONEYLINE", displayName: "Vencedor do Set" },
      { patterns: [/1[ºo°]?\s*set/i, /primeiro\s*set/i, /1st\s*set/i], canonicalType: "FIRST_SET", displayName: "Vencedor do 1º Set" },
      
      // Placar Exato de Sets
      { patterns: [/placar\s*(exato|correto)\s*(de\s*)?sets?/i, /sets?\s*(exato|correto)/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Exato (Sets)", priority: 10 },
      { patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Exato" },
      
      // Tie-break
      { patterns: [/tie\s*break/i, /tiebreak/i, /haver(a|á)\s*tie/i], canonicalType: "TIEBREAK", displayName: "Tie-break (Sim/Não)" },
      
      // Ímpar/Par
      { patterns: [/(games?|sets?)\s*(impar|par|odd|even)/i, /(impar|par|odd|even)\s*(games?|sets?)/i], canonicalType: "ODD_EVEN", displayName: "Games Ímpares/Pares" },
      
      // Aces
      { patterns: [/total\s*(de\s*)?aces?/i, /aces?\s*(over|under)/i], canonicalType: "OVER_UNDER", displayName: "Total de Aces" },
      
      // Dupla Falta
      { patterns: [/dupla\s*falta/i, /double\s*fault/i], canonicalType: "OVER_UNDER", displayName: "Total Duplas Faltas" },
    ]
  },
  
  // ==================== BASQUETE / NBA ====================
  {
    sport: ["Basquete", "NBA", "Basketball", "NBB", "Euroleague"],
    rules: [
      // Vencedor (Moneyline) - inclui prorrogação
      { patterns: [/moneyline/i, /money\s*line/i, /\bml\b/i], canonicalType: "MONEYLINE", displayName: "Moneyline", priority: 10 },
      { patterns: [/vencedor\s*(da\s*)?partida/i, /vencedor.*prorrogacao/i, /winner.*overtime/i, /to\s*win/i], canonicalType: "MONEYLINE", displayName: "Moneyline" },
      
      // Resultado Tempo Regulamentar (pode ter empate)
      { patterns: [/resultado\s*tempo\s*regulamentar/i, /regulation\s*time/i, /48\s*min/i, /40\s*min/i], canonicalType: "1X2", displayName: "Resultado Tempo Regulamentar" },
      
      // *** HANDICAP / SPREAD ***
      { patterns: [/\bspread\b/i, /point\s*spread/i], canonicalType: "SPREAD", displayName: "Spread", priority: 15 },
      { patterns: [/handicap/i, /linha\s*de\s*pontos/i, /hcap/i], canonicalType: "HANDICAP_POINTS", displayName: "Handicap / Spread" },
      
      // *** TOTAL DE PONTOS ***
      { patterns: [/total\s*(de\s*)?pontos/i, /pontos\s*total/i, /total\s*points/i], canonicalType: "TOTAL_POINTS_OVER", displayName: "Over/Under Pontos", priority: 15 },
      { patterns: [/over\s*\/?\s*under/i, /pontos\s*(acima|abaixo|over|under)/i], canonicalType: "TOTAL_POINTS_OVER", displayName: "Over/Under Pontos" },
      { patterns: [/mais\s*de\s*\d+.*pontos/i, /menos\s*de\s*\d+.*pontos/i], canonicalType: "TOTAL_POINTS_OVER", displayName: "Over/Under Pontos" },
      
      // Total por Equipe
      { patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /pontos.*equipe/i], canonicalType: "TEAM_PROPS", displayName: "Total por Equipe" },
      
      // Parciais
      { patterns: [/resultado\s*1[ºo°]?\s*tempo/i, /1st\s*half/i, /first\s*half/i, /1[ºo°]?\s*tempo/i], canonicalType: "FIRST_HALF", displayName: "Resultado 1º Tempo", priority: 10 },
      { patterns: [/resultado.*quarto/i, /quarter\s*result/i, /[1-4][ºo°]?\s*quarto/i, /\d(st|nd|rd|th)\s*quarter/i], canonicalType: "FIRST_QUARTER", displayName: "Resultado por Quarto" },
      
      // Handicap Parciais
      { patterns: [/handicap\s*1[ºo°]?\s*tempo/i, /1st\s*half\s*spread/i], canonicalType: "HANDICAP", displayName: "Handicap 1º Tempo" },
      { patterns: [/over\s*\/?\s*under\s*1[ºo°]?\s*tempo/i, /1st\s*half\s*total/i], canonicalType: "OVER_UNDER", displayName: "Over/Under 1º Tempo" },
      
      // Props de Jogadores
      { patterns: [/props?\s*(de\s*)?jogador/i, /player\s*props?/i], canonicalType: "PLAYER_PROPS", displayName: "Props de Jogadores", priority: 10 },
      { patterns: [/pontos.*jogador/i, /rebounds?/i, /assists?/i, /triple\s*double/i, /double\s*double/i], canonicalType: "PLAYER_PROPS", displayName: "Props de Jogadores" },
      
      // Ímpar/Par
      { patterns: [/pontos\s*(impar|par|odd|even)/i, /(impar|par|odd|even)\s*pontos/i], canonicalType: "ODD_EVEN", displayName: "Pontos Ímpares/Pares" },
      
      // Margem de Vitória
      { patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i], canonicalType: "WINNING_MARGIN", displayName: "Margem de Vitória" },
    ]
  },
  
  // ==================== FUTEBOL AMERICANO / NFL ====================
  {
    sport: ["Futebol Americano", "NFL", "American Football", "NCAAF", "College Football"],
    rules: [
      // Vencedor (Moneyline) - inclui prorrogação
      { patterns: [/moneyline/i, /money\s*line/i, /\bml\b/i], canonicalType: "MONEYLINE", displayName: "Moneyline", priority: 10 },
      { patterns: [/vencedor.*prorrogacao/i, /vencedor.*overtime/i, /winner.*ot/i, /to\s*win/i, /vencedor\s*(da\s*)?partida/i], canonicalType: "MONEYLINE", displayName: "Moneyline" },
      
      // Resultado Tempo Regulamentar (pode ter empate)
      { patterns: [/resultado\s*tempo\s*regulamentar/i, /regulation\s*time/i, /60\s*min/i], canonicalType: "1X2", displayName: "Resultado Tempo Regulamentar" },
      
      // *** SPREAD ***
      { patterns: [/\bspread\b/i, /point\s*spread/i], canonicalType: "SPREAD", displayName: "Spread", priority: 15 },
      { patterns: [/handicap/i, /linha\s*de\s*pontos/i], canonicalType: "SPREAD", displayName: "Spread" },
      
      // *** TOTAL DE PONTOS ***
      { patterns: [/total\s*(de\s*)?pontos/i, /total\s*points/i], canonicalType: "TOTAL_POINTS_OVER", displayName: "Total de Pontos", priority: 15 },
      { patterns: [/over\s*\/?\s*under/i, /pontos\s*(acima|abaixo|over|under)/i], canonicalType: "TOTAL_POINTS_OVER", displayName: "Total de Pontos" },
      
      // Total por Equipe
      { patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /pontos.*equipe/i], canonicalType: "TEAM_PROPS", displayName: "Total por Equipe" },
      
      // Parciais
      { patterns: [/resultado\s*1[ºo°]?\s*tempo/i, /1st\s*half/i, /first\s*half/i, /1[ºo°]?\s*tempo/i], canonicalType: "FIRST_HALF", displayName: "Resultado 1º Tempo", priority: 10 },
      { patterns: [/resultado.*quarto/i, /quarter\s*result/i, /[1-4][ºo°]?\s*quarto/i], canonicalType: "FIRST_QUARTER", displayName: "Resultado por Quarto" },
      
      // Handicap Parciais
      { patterns: [/handicap\s*1[ºo°]?\s*tempo/i, /1st\s*half\s*spread/i], canonicalType: "HANDICAP", displayName: "Handicap 1º Tempo" },
      
      // Props de Jogadores
      { patterns: [/props?\s*(de\s*)?jogador/i, /player\s*props?/i], canonicalType: "PLAYER_PROPS", displayName: "Props de Jogadores", priority: 10 },
      { patterns: [/yards/i, /passing/i, /rushing/i, /receiving/i], canonicalType: "PLAYER_PROPS", displayName: "Props de Jogadores" },
      
      // Touchdowns
      { patterns: [/touchdown/i, /\btd\b/i, /primeiro\s*td/i, /anytime\s*td/i, /first\s*td/i], canonicalType: "PLAYER_PROPS", displayName: "Touchdowns" },
      
      // Margem de Vitória
      { patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i], canonicalType: "WINNING_MARGIN", displayName: "Margem de Vitória" },
    ]
  },
  
  // ==================== BASEBALL / MLB ====================
  {
    sport: ["Baseball", "MLB", "Beisebol"],
    rules: [
      // Vencedor (Moneyline)
      { patterns: [/moneyline/i, /money\s*line/i, /\bml\b/i, /vencedor/i, /winner/i, /to\s*win/i], canonicalType: "MONEYLINE", displayName: "Moneyline", priority: 10 },
      
      // *** RUN LINE ***
      { patterns: [/run\s*line/i, /\brl\b/i], canonicalType: "RUN_LINE", displayName: "Run Line", priority: 15 },
      { patterns: [/handicap/i, /spread/i], canonicalType: "RUN_LINE", displayName: "Run Line" },
      
      // *** TOTAL DE RUNS ***
      { patterns: [/total\s*(de\s*)?runs?/i, /runs?\s*total/i], canonicalType: "TOTAL_RUNS_OVER", displayName: "Total de Runs", priority: 15 },
      { patterns: [/over\s*\/?\s*under/i, /runs?\s*(over|under|acima|abaixo)/i], canonicalType: "TOTAL_RUNS_OVER", displayName: "Total de Runs" },
      
      // Total por Equipe
      { patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /runs?\s*equipe/i], canonicalType: "TEAM_PROPS", displayName: "Total por Equipe" },
      
      // Parciais
      { patterns: [/resultado\s*(apos|after)\s*9\s*innings?/i, /9\s*innings?/i, /regulamentar/i], canonicalType: "1X2", displayName: "Resultado após 9 Innings" },
      { patterns: [/resultado\s*5\s*innings?/i, /5\s*innings?/i, /first\s*5/i, /\bf5\b/i], canonicalType: "FIRST_HALF", displayName: "Resultado 5 Innings" },
      { patterns: [/resultado.*inning/i, /inning\s*result/i, /[1-9][ºo°]?\s*inning/i], canonicalType: "FIRST_INNING", displayName: "Resultado por Inning" },
      { patterns: [/1[ªa]?\s*metade/i, /1st\s*half/i, /first\s*half/i], canonicalType: "FIRST_HALF", displayName: "1ª Metade" },
      
      // Props de Arremessadores
      { patterns: [/props?\s*(de\s*)?arremessador/i, /pitcher\s*props?/i, /strikeout/i], canonicalType: "PLAYER_PROPS", displayName: "Props de Arremessadores" },
      
      // Hits Totais
      { patterns: [/hits?\s*total/i, /total\s*(de\s*)?hits?/i], canonicalType: "OVER_UNDER", displayName: "Hits Totais" },
      
      // Ímpar/Par
      { patterns: [/runs?\s*(impar|par|odd|even)/i], canonicalType: "ODD_EVEN", displayName: "Runs Ímpares/Pares" },
    ]
  },
  
  // ==================== HOCKEY / NHL ====================
  {
    sport: ["Hockey", "NHL", "Hóquei", "Ice Hockey", "KHL"],
    rules: [
      // Vencedor (Moneyline) - inclui prorrogação/shootout
      { patterns: [/moneyline/i, /money\s*line/i, /\bml\b/i], canonicalType: "MONEYLINE", displayName: "Moneyline", priority: 10 },
      { patterns: [/vencedor.*overtime/i, /vencedor.*prorrogacao/i, /to\s*win/i, /winner/i], canonicalType: "MONEYLINE", displayName: "Moneyline" },
      
      // Resultado Tempo Regulamentar (pode ter empate)
      { patterns: [/resultado\s*tempo\s*regulamentar/i, /regulation\s*time/i, /60\s*min/i, /tres\s*vias/i, /3\s*way/i], canonicalType: "1X2", displayName: "Resultado Tempo Regulamentar" },
      
      // *** PUCK LINE ***
      { patterns: [/puck\s*line/i, /\bpl\b/i], canonicalType: "PUCK_LINE", displayName: "Puck Line", priority: 15 },
      { patterns: [/handicap/i, /spread/i], canonicalType: "PUCK_LINE", displayName: "Puck Line" },
      
      // *** TOTAL DE GOLS ***
      { patterns: [/total\s*(de\s*)?gols?/i, /gols?\s*total/i, /total\s*goals?/i], canonicalType: "TOTAL_GOALS_OVER", displayName: "Total de Gols", priority: 15 },
      { patterns: [/over\s*\/?\s*under/i, /gols?\s*(over|under|acima|abaixo)/i], canonicalType: "TOTAL_GOALS_OVER", displayName: "Total de Gols" },
      
      // Parciais por Período
      { patterns: [/resultado.*periodo/i, /period\s*result/i, /[1-3][ºo°]?\s*periodo/i, /\d(st|nd|rd)\s*period/i], canonicalType: "FIRST_PERIOD", displayName: "Resultado por Período" },
      { patterns: [/1[ºo°]?\s*periodo/i, /1st\s*period/i, /primeiro\s*periodo/i], canonicalType: "FIRST_PERIOD", displayName: "1º Período" },
      
      // Total por Equipe
      { patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /gols?\s*equipe/i], canonicalType: "TEAM_PROPS", displayName: "Total por Equipe" },
      
      // Margem de Vitória
      { patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i], canonicalType: "WINNING_MARGIN", displayName: "Margem de Vitória" },
      
      // Ímpar/Par
      { patterns: [/gols?\s*(impar|par|odd|even)/i], canonicalType: "ODD_EVEN", displayName: "Gols Ímpares/Pares" },
    ]
  },
  
  // ==================== VÔLEI ====================
  {
    sport: ["Vôlei", "Volleyball", "Voleibol"],
    rules: [
      // Vencedor
      { patterns: [/vencedor\s*(da\s*)?(partida)?/i, /winner/i, /match\s*winner/i, /to\s*win/i], canonicalType: "MONEYLINE", displayName: "Vencedor da Partida", priority: 10 },
      
      // *** HANDICAP DE SETS ***
      { patterns: [/handicap\s*(de\s*)?sets?/i, /sets?\s*handicap/i, /spread\s*sets?/i], canonicalType: "HANDICAP_SETS", displayName: "Handicap de Sets", priority: 15 },
      
      // *** TOTAL DE SETS ***
      { patterns: [/total\s*(de\s*)?sets?/i, /sets?\s*total/i], canonicalType: "TOTAL_SETS_OVER", displayName: "Over/Under Sets", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*sets?/i, /sets?\s*(over|under)/i], canonicalType: "TOTAL_SETS_OVER", displayName: "Over/Under Sets" },
      
      // *** TOTAL DE PONTOS ***
      { patterns: [/total\s*(de\s*)?pontos/i, /pontos\s*total/i], canonicalType: "TOTAL_POINTS_OVER", displayName: "Total de Pontos", priority: 15 },
      { patterns: [/pontos\s*(over|under)/i, /over\s*\/?\s*under\s*pontos/i], canonicalType: "TOTAL_POINTS_OVER", displayName: "Total de Pontos" },
      
      // *** HANDICAP DE PONTOS ***
      { patterns: [/handicap\s*(de\s*)?pontos/i, /point\s*handicap/i], canonicalType: "HANDICAP_POINTS", displayName: "Handicap de Pontos" },
      
      // Resultado por Set
      { patterns: [/resultado.*set/i, /set\s*result/i, /[1-5][ºo°]?\s*set/i], canonicalType: "FIRST_SET", displayName: "Resultado por Set" },
      { patterns: [/primeiro\s*set/i, /1[ºo°]?\s*set/i, /1st\s*set/i, /vencedor.*1.*set/i], canonicalType: "FIRST_SET", displayName: "Primeiro Set" },
      
      // Placar Exato (Sets)
      { patterns: [/placar\s*(exato|correto).*sets?/i, /sets?\s*exato/i, /correct\s*score/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Exato (Sets)" },
      
      // Over/Under Pontos Set
      { patterns: [/over\s*\/?\s*under.*pontos.*set/i, /set\s*points?\s*total/i], canonicalType: "OVER_UNDER", displayName: "Over/Under Pontos Set" },
      
      // Ímpar/Par
      { patterns: [/sets?\s*(impar|par|odd|even)/i], canonicalType: "ODD_EVEN", displayName: "Sets Ímpares/Pares" },
    ]
  },
  
  // ==================== MMA / UFC ====================
  {
    sport: ["MMA/UFC", "MMA", "UFC", "Bellator", "ONE FC"],
    rules: [
      // Vencedor
      { patterns: [/vencedor\s*(da\s*)?(luta)?/i, /winner/i, /to\s*win/i, /moneyline/i], canonicalType: "MONEYLINE", displayName: "Vencedor da Luta", priority: 10 },
      
      // Método de Vitória
      { patterns: [/metodo\s*(de\s*)?vitoria/i, /method\s*of\s*victory/i, /como\s*vence/i], canonicalType: "METHOD_OF_VICTORY", displayName: "Método de Vitória", priority: 10 },
      
      // Round da Finalização
      { patterns: [/round\s*(da\s*)?finalizacao/i, /round.*termina/i, /em\s*qual\s*round/i], canonicalType: "ROUND_FINISH", displayName: "Round da Finalização" },
      
      // *** TOTAL DE ROUNDS ***
      { patterns: [/total\s*(de\s*)?rounds?/i, /rounds?\s*total/i], canonicalType: "TOTAL_ROUNDS_OVER", displayName: "Over/Under Rounds", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*rounds?/i, /rounds?\s*(over|under)/i], canonicalType: "TOTAL_ROUNDS_OVER", displayName: "Over/Under Rounds" },
      
      // Luta Completa (Goes the Distance)
      { patterns: [/luta\s*completa/i, /goes\s*the\s*distance/i, /vai\s*ate\s*o\s*fim/i, /full\s*fight/i], canonicalType: "GO_THE_DISTANCE", displayName: "Luta Completa (Sim/Não)" },
      
      // Vitória por KO/TKO
      { patterns: [/vitoria\s*por\s*ko/i, /ko\s*win/i, /nocaute/i, /knockout/i, /\btko\b/i], canonicalType: "METHOD_OF_VICTORY", displayName: "Vitória por KO" },
      
      // Vitória por Decisão
      { patterns: [/vitoria\s*por\s*decisao/i, /decision\s*win/i, /decisao/i], canonicalType: "METHOD_OF_VICTORY", displayName: "Vitória por Decisão" },
      
      // Vitória por Finalização
      { patterns: [/vitoria\s*por\s*finalizacao/i, /submission\s*win/i, /finalizacao/i, /submission/i], canonicalType: "METHOD_OF_VICTORY", displayName: "Vitória por Finalização" },
      
      // Handicap de Rounds
      { patterns: [/handicap\s*(de\s*)?rounds?/i, /rounds?\s*handicap/i], canonicalType: "HANDICAP_ROUNDS", displayName: "Handicap de Rounds" },
      
      // Round Específico
      { patterns: [/round\s*1.*vencedor/i, /1[ºo°]?\s*round.*winner/i, /vencedor.*round\s*1/i], canonicalType: "MONEYLINE", displayName: "Round 1 – Vencedor" },
    ]
  },
  
  // ==================== BOXE ====================
  {
    sport: ["Boxe", "Boxing"],
    rules: [
      // Vencedor
      { patterns: [/vencedor\s*(da\s*)?(luta)?/i, /winner/i, /to\s*win/i, /moneyline/i], canonicalType: "MONEYLINE", displayName: "Vencedor da Luta", priority: 10 },
      
      // Método de Vitória
      { patterns: [/metodo\s*(de\s*)?vitoria/i, /method\s*of\s*victory/i], canonicalType: "METHOD_OF_VICTORY", displayName: "Método de Vitória", priority: 10 },
      
      // Round da Finalização
      { patterns: [/round\s*(da\s*)?finalizacao/i, /round.*termina/i, /em\s*qual\s*round/i], canonicalType: "ROUND_FINISH", displayName: "Round da Finalização" },
      
      // *** TOTAL DE ROUNDS ***
      { patterns: [/total\s*(de\s*)?rounds?/i, /rounds?\s*total/i], canonicalType: "TOTAL_ROUNDS_OVER", displayName: "Over/Under Rounds", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*rounds?/i, /rounds?\s*(over|under)/i], canonicalType: "TOTAL_ROUNDS_OVER", displayName: "Over/Under Rounds" },
      
      // Luta Completa
      { patterns: [/luta\s*completa/i, /goes\s*the\s*distance/i, /12\s*rounds/i], canonicalType: "GO_THE_DISTANCE", displayName: "Luta Completa (Sim/Não)" },
      
      // Vitória por KO
      { patterns: [/vitoria\s*por\s*ko/i, /ko\s*win/i, /nocaute/i, /knockout/i, /\btko\b/i], canonicalType: "METHOD_OF_VICTORY", displayName: "Vitória por KO" },
      
      // Vitória por Decisão
      { patterns: [/vitoria\s*por\s*decisao/i, /decision\s*win/i], canonicalType: "METHOD_OF_VICTORY", displayName: "Vitória por Decisão" },
      
      // Handicap de Rounds
      { patterns: [/handicap\s*(de\s*)?rounds?/i, /rounds?\s*handicap/i], canonicalType: "HANDICAP_ROUNDS", displayName: "Handicap de Rounds" },
    ]
  },
  
  // ==================== GOLFE ====================
  {
    sport: ["Golfe", "Golf"],
    rules: [
      // Vencedor do Torneio
      { patterns: [/vencedor\s*(do\s*)?torneio/i, /tournament\s*winner/i, /outright/i, /campeao/i], canonicalType: "OUTRIGHT", displayName: "Vencedor do Torneio", priority: 10 },
      
      // Top 5/10/20
      { patterns: [/top\s*[5|10|20]/i, /terminar.*top/i, /finish\s*top/i], canonicalType: "TOP_FINISH", displayName: "Top 5/10/20" },
      
      // Head-to-Head
      { patterns: [/head\s*to\s*head/i, /\bh2h\b/i, /confronto\s*direto/i, /matchup/i], canonicalType: "HEAD_TO_HEAD", displayName: "Head-to-Head", priority: 10 },
      
      // Melhor Round
      { patterns: [/melhor\s*round/i, /best\s*round/i, /low\s*round/i], canonicalType: "SPECIAL_PROPS", displayName: "Melhor Round" },
      
      // Nacionalidade do Vencedor
      { patterns: [/nacionalidade.*vencedor/i, /winner.*nationality/i], canonicalType: "SPECIAL_PROPS", displayName: "Nacionalidade do Vencedor" },
      
      // Primeiro Líder
      { patterns: [/primeiro\s*lider/i, /first\s*round\s*leader/i, /lider.*round/i], canonicalType: "OUTRIGHT", displayName: "Primeiro Líder" },
      
      // Fazer Cut
      { patterns: [/fazer\s*cut/i, /make\s*cut/i, /cut\s*(sim|nao|yes|no)/i], canonicalType: "MAKE_CUT", displayName: "Fazer Cut (Sim/Não)" },
      
      // Over/Under Score
      { patterns: [/over\s*\/?\s*under\s*score/i, /score\s*(over|under)/i, /total\s*strokes/i], canonicalType: "OVER_UNDER", displayName: "Over/Under Score" },
      
      // Hole-in-One
      { patterns: [/hole\s*in\s*one/i, /\bace\b/i], canonicalType: "SPECIAL_PROPS", displayName: "Hole-in-One no Torneio" },
    ]
  },
  
  // ==================== LEAGUE OF LEGENDS ====================
  {
    sport: ["League of Legends", "LoL"],
    rules: [
      // Vencedor da Série
      { patterns: [/vencedor\s*(da\s*)?serie/i, /series?\s*winner/i, /match\s*winner/i, /to\s*win/i], canonicalType: "MONEYLINE", displayName: "Vencedor da Série", priority: 10 },
      
      // Vencedor do Mapa
      { patterns: [/vencedor\s*(do\s*)?mapa/i, /map\s*winner/i, /game\s*winner/i], canonicalType: "MONEYLINE", displayName: "Vencedor do Mapa" },
      
      // *** HANDICAP DE MAPAS ***
      { patterns: [/handicap\s*(de\s*)?mapas?/i, /maps?\s*handicap/i], canonicalType: "HANDICAP_MAPS", displayName: "Handicap de Mapas", priority: 15 },
      
      // *** TOTAL DE MAPAS ***
      { patterns: [/total\s*(de\s*)?mapas?/i, /mapas?\s*total/i], canonicalType: "TOTAL_MAPS_OVER", displayName: "Total de Mapas", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*mapas?/i, /mapas?\s*(over|under)/i], canonicalType: "TOTAL_MAPS_OVER", displayName: "Total de Mapas" },
      
      // Placar Exato
      { patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i, /mapas?\s*exato/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Exato" },
      
      // *** TOTAL DE KILLS ***
      { patterns: [/total\s*(de\s*)?kills?/i, /kills?\s*total/i], canonicalType: "TOTAL_KILLS_OVER", displayName: "Over/Under Kills", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*kills?/i, /kills?\s*(over|under)/i], canonicalType: "TOTAL_KILLS_OVER", displayName: "Over/Under Kills" },
      
      // Handicap de Kills
      { patterns: [/handicap\s*(de\s*)?kills?/i, /kills?\s*handicap/i], canonicalType: "HANDICAP_KILLS", displayName: "Handicap de Kills" },
      
      // Primeiro Objetivo
      { patterns: [/primeiro\s*objetivo/i, /first\s*objective/i], canonicalType: "SPECIAL_PROPS", displayName: "Primeiro Objetivo" },
      { patterns: [/first\s*blood/i, /primeiro\s*sangue/i], canonicalType: "FIRST_BLOOD", displayName: "First Blood" },
      { patterns: [/first\s*dragon/i, /primeiro\s*dragao/i], canonicalType: "FIRST_DRAGON", displayName: "First Dragon" },
      { patterns: [/first\s*baron/i, /primeiro\s*barao/i], canonicalType: "FIRST_BARON", displayName: "First Baron" },
      { patterns: [/first\s*tower/i, /primeira\s*torre/i], canonicalType: "FIRST_TOWER", displayName: "First Tower" },
      
      // Total de Torres
      { patterns: [/total\s*(de\s*)?torres?/i, /towers?\s*(over|under)/i], canonicalType: "OVER_UNDER", displayName: "Total de Torres" },
    ]
  },
  
  // ==================== COUNTER-STRIKE ====================
  {
    sport: ["Counter-Strike", "CS", "CS2", "CSGO"],
    rules: [
      // Vencedor da Série
      { patterns: [/vencedor\s*(da\s*)?serie/i, /series?\s*winner/i, /match\s*winner/i, /to\s*win/i], canonicalType: "MONEYLINE", displayName: "Vencedor da Série", priority: 10 },
      
      // Vencedor do Mapa
      { patterns: [/vencedor\s*(do\s*)?mapa/i, /map\s*winner/i], canonicalType: "MONEYLINE", displayName: "Vencedor do Mapa" },
      
      // *** HANDICAP DE MAPAS ***
      { patterns: [/handicap\s*(de\s*)?mapas?/i, /maps?\s*handicap/i], canonicalType: "HANDICAP_MAPS", displayName: "Handicap de Mapas", priority: 15 },
      
      // *** TOTAL DE MAPAS ***
      { patterns: [/total\s*(de\s*)?mapas?/i, /mapas?\s*total/i], canonicalType: "TOTAL_MAPS_OVER", displayName: "Total de Mapas", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*mapas?/i, /mapas?\s*(over|under)/i], canonicalType: "TOTAL_MAPS_OVER", displayName: "Total de Mapas" },
      
      // Placar Exato
      { patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Exato" },
      
      // *** TOTAL DE ROUNDS ***
      { patterns: [/total\s*(de\s*)?rounds?/i, /rounds?\s*total/i], canonicalType: "TOTAL_ROUNDS_OVER", displayName: "Over/Under Rounds", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*rounds?/i, /rounds?\s*(over|under)/i], canonicalType: "TOTAL_ROUNDS_OVER", displayName: "Over/Under Rounds" },
      
      // Handicap de Rounds
      { patterns: [/handicap\s*(de\s*)?rounds?/i, /rounds?\s*handicap/i], canonicalType: "HANDICAP_ROUNDS", displayName: "Handicap de Rounds" },
      
      // Primeiro a 10
      { patterns: [/primeiro\s*a\s*10/i, /first\s*to\s*10/i, /race\s*to\s*10/i], canonicalType: "SPECIAL_PROPS", displayName: "Primeiro a 10 Rounds" },
      
      // Total de Kills
      { patterns: [/total\s*(de\s*)?kills?/i, /kills?\s*(over|under)/i], canonicalType: "TOTAL_KILLS_OVER", displayName: "Total de Kills" },
    ]
  },
  
  // ==================== DOTA 2 ====================
  {
    sport: ["Dota 2", "Dota"],
    rules: [
      // Vencedor da Série
      { patterns: [/vencedor\s*(da\s*)?serie/i, /series?\s*winner/i, /match\s*winner/i, /to\s*win/i], canonicalType: "MONEYLINE", displayName: "Vencedor da Série", priority: 10 },
      
      // Vencedor do Mapa
      { patterns: [/vencedor\s*(do\s*)?mapa/i, /map\s*winner/i, /game\s*winner/i], canonicalType: "MONEYLINE", displayName: "Vencedor do Mapa" },
      
      // *** HANDICAP DE MAPAS ***
      { patterns: [/handicap\s*(de\s*)?mapas?/i, /maps?\s*handicap/i], canonicalType: "HANDICAP_MAPS", displayName: "Handicap de Mapas", priority: 15 },
      
      // *** TOTAL DE MAPAS ***
      { patterns: [/total\s*(de\s*)?mapas?/i, /mapas?\s*total/i], canonicalType: "TOTAL_MAPS_OVER", displayName: "Total de Mapas", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*mapas?/i, /mapas?\s*(over|under)/i], canonicalType: "TOTAL_MAPS_OVER", displayName: "Total de Mapas" },
      
      // Placar Exato
      { patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Exato" },
      
      // *** TOTAL DE KILLS ***
      { patterns: [/total\s*(de\s*)?kills?/i, /kills?\s*total/i], canonicalType: "TOTAL_KILLS_OVER", displayName: "Over/Under Kills", priority: 15 },
      { patterns: [/over\s*\/?\s*under\s*kills?/i, /kills?\s*(over|under)/i], canonicalType: "TOTAL_KILLS_OVER", displayName: "Over/Under Kills" },
      
      // Handicap de Kills
      { patterns: [/handicap\s*(de\s*)?kills?/i, /kills?\s*handicap/i], canonicalType: "HANDICAP_KILLS", displayName: "Handicap de Kills" },
      
      // Primeiro Objetivo
      { patterns: [/primeiro\s*objetivo/i, /first\s*objective/i], canonicalType: "SPECIAL_PROPS", displayName: "Primeiro Objetivo" },
      { patterns: [/first\s*blood/i, /primeiro\s*sangue/i], canonicalType: "FIRST_BLOOD", displayName: "First Blood" },
      { patterns: [/first\s*roshan/i, /primeiro\s*roshan/i], canonicalType: "FIRST_ROSHAN", displayName: "First Roshan" },
      { patterns: [/first\s*tower/i, /primeira\s*torre/i], canonicalType: "FIRST_TOWER", displayName: "First Tower" },
      
      // Total de Torres
      { patterns: [/total\s*(de\s*)?torres?/i, /towers?\s*(over|under)/i], canonicalType: "OVER_UNDER", displayName: "Total de Torres" },
    ]
  },
  
  // ==================== eFOOTBALL (FIFA/EA FC) ====================
  {
    sport: ["eFootball", "FIFA", "PES", "EA FC", "EA Sports FC"],
    rules: [
      // Vencedor / 1X2
      { patterns: [/1x2/i, /resultado\s*final/i, /final\s*(da|de)\s*partida/i, /vencedor\s*(da\s*)?partida/i, /winner/i], canonicalType: "1X2", displayName: "1X2", priority: 10 },
      
      // Over/Under Gols
      { patterns: [/over\s*\/?\s*under\s*(de\s*)?(gol|goal)/i, /total\s*(de\s*)?(gol|goal)/i], canonicalType: "OVER_UNDER", displayName: "Over/Under Gols" },
      { patterns: [/gols?\s*(acima|abaixo|over|under)/i], canonicalType: "OVER_UNDER", displayName: "Over/Under Gols" },
      
      // Handicap
      { patterns: [/handicap\s*(de\s*)?gols?/i, /goal\s*handicap/i], canonicalType: "HANDICAP", displayName: "Handicap de Gols" },
      
      // Ambas Marcam
      { patterns: [/ambas?\s*marcam/i, /btts/i, /both\s*teams?\s*to\s*score/i], canonicalType: "BTTS", displayName: "Ambas Marcam" },
      
      // 1º Tempo
      { patterns: [/resultado.*1[ºo°]?\s*tempo/i, /1st\s*half/i, /primeiro\s*tempo/i], canonicalType: "FIRST_HALF", displayName: "Resultado do 1º Tempo" },
      
      // Placar Correto
      { patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Correto" },
      
      // Dupla Chance
      { patterns: [/dupla\s*chance/i, /double\s*chance/i], canonicalType: "DOUBLE_CHANCE", displayName: "Dupla Chance" },
      
      // Escanteios
      { patterns: [/total\s*(de\s*)?escanteios?/i, /corners?/i], canonicalType: "OVER_UNDER", displayName: "Total de Escanteios" },
      
      // Margem de Vitória
      { patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i], canonicalType: "WINNING_MARGIN", displayName: "Margem de Vitória" },
    ]
  },
];

// ========================================================================
// REGRAS GENÉRICAS (FALLBACK)
// ========================================================================

const GENERIC_RULES: CanonicalRule[] = [
  // === OVER/UNDER GENÉRICOS (ALTA PRIORIDADE) ===
  { patterns: [/^mais\s+\d+[.,]?\d*/i, /^over\s+\d+[.,]?\d*/i, /^acima\s+\d+[.,]?\d*/i], canonicalType: "OVER_UNDER", displayName: "Over/Under", priority: 100 },
  { patterns: [/^menos\s+\d+[.,]?\d*/i, /^under\s+\d+[.,]?\d*/i, /^abaixo\s+\d+[.,]?\d*/i], canonicalType: "OVER_UNDER", displayName: "Over/Under", priority: 100 },
  { patterns: [/\bmais\s+\d+[.,]?\d*\b/i, /\bover\s+\d+[.,]?\d*\b/i], canonicalType: "OVER_UNDER", displayName: "Over/Under", priority: 90 },
  { patterns: [/\bmenos\s+\d+[.,]?\d*\b/i, /\bunder\s+\d+[.,]?\d*\b/i], canonicalType: "OVER_UNDER", displayName: "Over/Under", priority: 90 },
  { patterns: [/total\s*(de\s*)?\w+/i, /over\s*\/?\s*under/i, /acima\s*\/?\s*abaixo/i, /mais\s*\/?\s*menos/i], canonicalType: "OVER_UNDER", displayName: "Over/Under", priority: 50 },
  
  // === HANDICAPS GENÉRICOS ===
  { patterns: [/\bhandicap\b/i, /\bspread\b/i], canonicalType: "HANDICAP", displayName: "Handicap", priority: 50 },
  { patterns: [/\bah\s*[+-]?\d/i, /\beh\s*[+-]?\d/i], canonicalType: "HANDICAP", displayName: "Handicap" },
  
  // === ESPECIAIS ===
  { patterns: [/ambas?\s*marcam/i, /\bbtts\b/i, /both\s*teams?\s*to\s*score/i, /gol\s*gol/i], canonicalType: "BTTS", displayName: "Ambas Marcam", priority: 80 },
  { patterns: [/placar\s*(exato|correto)/i, /resultado\s*exato/i, /correct\s*score/i, /exact\s*score/i], canonicalType: "CORRECT_SCORE", displayName: "Placar Correto", priority: 80 },
  { patterns: [/dupla\s*chance/i, /double\s*chance/i, /\b1x\b/i, /\bx2\b/i, /\b12\b/i], canonicalType: "DOUBLE_CHANCE", displayName: "Dupla Chance", priority: 80 },
  { patterns: [/1[ºo°]?\s*tempo/i, /primeiro\s*tempo/i, /1st\s*half/i, /first\s*half/i, /half\s*time/i, /\bht\b/i, /intervalo/i], canonicalType: "FIRST_HALF", displayName: "Resultado do 1º Tempo", priority: 70 },
  { patterns: [/draw\s*no\s*bet/i, /\bdnb\b/i, /empate\s*anula/i, /empate\s*reembolsa/i], canonicalType: "DNB", displayName: "Draw No Bet", priority: 80 },
  { patterns: [/props?\s*(de\s*)?(jogador|player)/i, /player\s*props?/i], canonicalType: "PLAYER_PROPS", displayName: "Props de Jogadores", priority: 60 },
  
  // === VENCEDOR ===
  { patterns: [/moneyline/i, /money\s*line/i], canonicalType: "MONEYLINE", displayName: "Moneyline", priority: 40 },
  { patterns: [/vencedor/i, /winner/i, /to\s*win/i], canonicalType: "MONEYLINE", displayName: "Moneyline", priority: 30 },
  { patterns: [/1x2/i, /tres\s*vias/i, /three\s*way/i, /resultado\s*final/i], canonicalType: "1X2", displayName: "1X2", priority: 40 },
];

// ========================================================================
// FUNÇÕES AUXILIARES
// ========================================================================

/**
 * Normaliza texto para comparação (lowercase, sem acentos, sem espaços extras)
 */
function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verifica se um esporte corresponde a uma lista de esportes
 */
function matchesSport(sport: string, sportList: string[]): boolean {
  if (sportList.length === 0) return true; // Regra genérica
  
  const normalizedSport = normalizeText(sport);
  return sportList.some(s => {
    const normalizedS = normalizeText(s);
    return normalizedSport === normalizedS || 
           normalizedSport.includes(normalizedS) ||
           normalizedS.includes(normalizedSport);
  });
}

/**
 * Obtém o displayName apropriado para o esporte
 */
function getDisplayNameForSport(pattern: SelectionPattern, sport: string): string {
  const normalized = normalizeText(sport);
  
  for (const [key, displayName] of Object.entries(pattern.displayNameBySport)) {
    if (normalizeText(key) === normalized || normalized.includes(normalizeText(key))) {
      return displayName;
    }
  }
  
  return pattern.defaultDisplayName;
}

// ========================================================================
// FUNÇÃO PRINCIPAL DE NORMALIZAÇÃO
// ========================================================================

/**
 * Normaliza um mercado semanticamente, considerando esporte e contexto
 * Esta é a função principal que deve ser usada
 */
export function normalizeMarketSemantically(context: SemanticMarketContext): SemanticMarketResult {
  const { sport, marketLabel, selectionLabel, selections } = context;
  
  // ========== PASSO 1: Verificar SELEÇÃO primeiro ==========
  // Isso é CRÍTICO para casos como "Mais 21.5" onde o mercado pode estar genérico
  const selectionToCheck = selectionLabel || (selections && selections[0]) || "";
  
  if (selectionToCheck) {
    for (const pattern of SELECTION_PATTERNS) {
      if (pattern.patterns.some(p => p.test(selectionToCheck))) {
        return {
          canonicalType: pattern.canonicalType,
          displayName: getDisplayNameForSport(pattern, sport),
          confidence: "high",
          reason: `Selection "${selectionToCheck}" matches pattern`
        };
      }
    }
  }
  
  // ========== PASSO 2: Verificar regras específicas do esporte ==========
  const sportRules = SPORT_RULES.find(sr => matchesSport(sport, sr.sport));
  
  if (sportRules) {
    // Ordenar regras por prioridade (maior primeiro)
    const sortedRules = [...sportRules.rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    for (const rule of sortedRules) {
      if (rule.patterns.some(p => p.test(marketLabel))) {
        return {
          canonicalType: rule.canonicalType,
          displayName: rule.displayName,
          confidence: "high",
          reason: `Sport-specific rule matched for ${sport}`
        };
      }
      
      // Também verificar na seleção
      if (selectionToCheck && rule.patterns.some(p => p.test(selectionToCheck))) {
        return {
          canonicalType: rule.canonicalType,
          displayName: rule.displayName,
          confidence: "high",
          reason: `Sport-specific rule matched in selection for ${sport}`
        };
      }
    }
  }
  
  // ========== PASSO 3: Verificar regras genéricas ==========
  const sortedGenericRules = [...GENERIC_RULES].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  
  for (const rule of sortedGenericRules) {
    if (rule.patterns.some(p => p.test(marketLabel))) {
      return {
        canonicalType: rule.canonicalType,
        displayName: rule.displayName,
        confidence: "medium",
        reason: `Generic rule matched`
      };
    }
    
    // Também verificar na seleção
    if (selectionToCheck && rule.patterns.some(p => p.test(selectionToCheck))) {
      return {
        canonicalType: rule.canonicalType,
        displayName: rule.displayName,
        confidence: "medium",
        reason: `Generic rule matched in selection`
      };
    }
  }
  
  // ========== PASSO 4: Fallback para equivalências de texto ==========
  const textBasedResult = findCanonicalMarketFromEquivalences(marketLabel);
  if (textBasedResult.canonicalType !== "OTHER") {
    return textBasedResult;
  }
  
  // ========== PASSO 5: Retornar OTHER como último recurso ==========
  return {
    canonicalType: "OTHER",
    displayName: "Outro",
    confidence: "low",
    reason: "No matching rule found"
  };
}

// ========================================================================
// MAPEAMENTO DE EQUIVALÊNCIAS (TEXTO LEGADO)
// ========================================================================

const MARKET_EQUIVALENCES: Record<string, string[]> = {
  "1X2": [
    "1x2", "1 x 2", "resultado final", "match result", "full time result",
    "match winner", "vencedor", "winner", "três vias", "tres vias", "3 way",
    "final da partida", "final de partida"
  ],
  "Moneyline": [
    "moneyline", "money line", "ml", "to win", "vencedor da partida incluindo prorrogação"
  ],
  "Over/Under": [
    "over", "under", "acima", "abaixo", "mais de", "menos de", "total"
  ],
  "Handicap Asiático": [
    "asian handicap", "ah", "handicap asiático", "handicap asiatico"
  ],
  "Handicap": [
    "handicap", "spread", "linha de pontos", "point spread"
  ],
  "Ambas Marcam": [
    "btts", "ambas marcam", "both teams to score", "gol gol", "gg"
  ],
  "Placar Correto": [
    "resultado exato", "correct score", "placar exato", "exact score", "placar correto"
  ],
  "Dupla Chance": [
    "dupla chance", "double chance", "dc", "casa ou empate", "fora ou empate"
  ],
  "Resultado do 1º Tempo": [
    "resultado do 1º tempo", "primeiro tempo", "1st half", "first half", "ht", "half time"
  ],
  "Draw No Bet": [
    "draw no bet", "dnb", "empate anula", "empate reembolsa"
  ],
};

/**
 * Busca mercado canônico baseado em equivalências de texto
 */
function findCanonicalMarketFromEquivalences(marketLabel: string): SemanticMarketResult {
  const normalized = normalizeText(marketLabel);
  
  const canonicalMapping: Record<string, { type: MarketCanonicalType; display: string }> = {
    "1X2": { type: "1X2", display: "1X2" },
    "Moneyline": { type: "MONEYLINE", display: "Moneyline" },
    "Over/Under": { type: "OVER_UNDER", display: "Over/Under" },
    "Handicap Asiático": { type: "HANDICAP_ASIAN", display: "Handicap Asiático" },
    "Handicap": { type: "HANDICAP", display: "Handicap" },
    "Ambas Marcam": { type: "BTTS", display: "Ambas Marcam" },
    "Placar Correto": { type: "CORRECT_SCORE", display: "Placar Correto" },
    "Dupla Chance": { type: "DOUBLE_CHANCE", display: "Dupla Chance" },
    "Resultado do 1º Tempo": { type: "FIRST_HALF", display: "Resultado do 1º Tempo" },
    "Draw No Bet": { type: "DNB", display: "Draw No Bet" },
  };
  
  for (const [canonicalName, synonyms] of Object.entries(MARKET_EQUIVALENCES)) {
    if (synonyms.some(s => normalizeText(s) === normalized || normalized.includes(normalizeText(s)))) {
      const mapping = canonicalMapping[canonicalName];
      if (mapping) {
        return { canonicalType: mapping.type, displayName: mapping.display, confidence: "high" };
      }
    }
  }
  
  return { canonicalType: "OTHER", displayName: "Outro", confidence: "low" };
}

// ========================================================================
// FUNÇÕES DE RESOLUÇÃO PARA UI
// ========================================================================

/**
 * Mapeia tipo canônico para opções de display disponíveis no sistema
 */
const CANONICAL_TO_DISPLAY_OPTIONS: Record<MarketCanonicalType, string[]> = {
  // Vencedor
  "MONEYLINE": ["Moneyline", "Vencedor", "Vencedor da Partida", "Vencedor da Luta", "Vencedor da Série", "Vencedor do Mapa", "Winner"],
  "1X2": ["1X2", "Resultado Final", "1x2"],
  "DNB": ["Draw No Bet", "DNB", "Empate Anula"],
  "DOUBLE_CHANCE": ["Dupla Chance", "Double Chance"],
  
  // Totais
  "TOTAL_GOALS_OVER": ["Over/Under Gols", "Over/Under", "Total de Gols"],
  "TOTAL_GOALS_UNDER": ["Over/Under Gols", "Over/Under", "Total de Gols"],
  "TOTAL_POINTS_OVER": ["Over/Under Pontos", "Over/Under", "Total de Pontos"],
  "TOTAL_POINTS_UNDER": ["Over/Under Pontos", "Over/Under", "Total de Pontos"],
  "TOTAL_GAMES_OVER": ["Over/Under Games", "Over/Under", "Total de Games"],
  "TOTAL_GAMES_UNDER": ["Over/Under Games", "Over/Under", "Total de Games"],
  "TOTAL_SETS_OVER": ["Over/Under Sets", "Over/Under", "Total de Sets"],
  "TOTAL_SETS_UNDER": ["Over/Under Sets", "Over/Under", "Total de Sets"],
  "TOTAL_RUNS_OVER": ["Total de Runs", "Over/Under", "Over/Under Runs"],
  "TOTAL_RUNS_UNDER": ["Total de Runs", "Over/Under", "Over/Under Runs"],
  "TOTAL_ROUNDS_OVER": ["Over/Under Rounds", "Over/Under", "Total de Rounds"],
  "TOTAL_ROUNDS_UNDER": ["Over/Under Rounds", "Over/Under", "Total de Rounds"],
  "TOTAL_MAPS_OVER": ["Total de Mapas", "Over/Under", "Over/Under Mapas"],
  "TOTAL_MAPS_UNDER": ["Total de Mapas", "Over/Under", "Over/Under Mapas"],
  "TOTAL_KILLS_OVER": ["Over/Under Kills", "Over/Under", "Total de Kills"],
  "TOTAL_KILLS_UNDER": ["Over/Under Kills", "Over/Under", "Total de Kills"],
  "TOTAL_CORNERS_OVER": ["Over/Under Escanteios", "Over/Under", "Total de Escanteios"],
  "TOTAL_CORNERS_UNDER": ["Over/Under Escanteios", "Over/Under", "Total de Escanteios"],
  "TOTAL_CARDS_OVER": ["Over/Under Cartões", "Over/Under", "Total de Cartões"],
  "TOTAL_CARDS_UNDER": ["Over/Under Cartões", "Over/Under", "Total de Cartões"],
  "OVER_UNDER": ["Over/Under", "Over/Under Gols", "Over/Under Pontos", "Over/Under Games", "Total"],
  
  // Handicaps
  "HANDICAP_ASIAN": ["Handicap Asiático", "Handicap", "Asian Handicap"],
  "HANDICAP_EUROPEAN": ["Handicap Europeu", "Handicap", "European Handicap"],
  "HANDICAP_GAMES": ["Handicap de Games", "Handicap", "Games Handicap"],
  "HANDICAP_SETS": ["Handicap de Sets", "Handicap", "Sets Handicap"],
  "HANDICAP_POINTS": ["Handicap / Spread", "Handicap", "Spread", "Point Spread"],
  "HANDICAP_ROUNDS": ["Handicap de Rounds", "Handicap", "Rounds Handicap"],
  "HANDICAP_MAPS": ["Handicap de Mapas", "Handicap", "Maps Handicap"],
  "HANDICAP_KILLS": ["Handicap de Kills", "Handicap", "Kills Handicap"],
  "SPREAD": ["Spread", "Handicap / Spread", "Handicap", "Point Spread"],
  "RUN_LINE": ["Run Line", "Handicap", "Spread"],
  "PUCK_LINE": ["Puck Line", "Handicap", "Spread"],
  "HANDICAP": ["Handicap", "Spread", "Handicap de Gols"],
  
  // Parciais
  "FIRST_HALF": ["Resultado do 1º Tempo", "1º Tempo", "Resultado 1º Tempo", "1ª Metade", "First Half"],
  "SECOND_HALF": ["Resultado do 2º Tempo", "2º Tempo", "Second Half"],
  "FIRST_SET": ["Vencedor do 1º Set", "Primeiro Set", "1º Set", "First Set"],
  "FIRST_PERIOD": ["1º Período", "Primeiro Período", "Resultado por Período"],
  "FIRST_QUARTER": ["Resultado por Quarto", "1º Quarto", "First Quarter"],
  "FIRST_INNING": ["Resultado por Inning", "1º Inning"],
  "FIRST_MAP": ["Vencedor do Mapa", "1º Mapa", "First Map"],
  
  // Especiais
  "BTTS": ["Ambas Marcam", "BTTS", "Ambas Marcam (BTTS)"],
  "CORRECT_SCORE": ["Placar Correto", "Placar Exato", "Placar Exato (Sets)", "Resultado Exato", "Correct Score"],
  "ODD_EVEN": ["Ímpares/Pares", "Odd/Even", "Gols Ímpares/Pares", "Pontos Ímpares/Pares"],
  "FIRST_GOAL": ["Primeiro Gol", "First Goal", "Primeiro a Marcar"],
  "LAST_GOAL": ["Último Gol", "Last Goal", "Último a Marcar"],
  "CLEAN_SHEET": ["Clean Sheet", "Sem Sofrer Gol"],
  "WINNING_MARGIN": ["Margem de Vitória", "Winning Margin"],
  
  // Props
  "PLAYER_PROPS": ["Props de Jogadores", "Player Props", "Props de Arremessadores", "Touchdowns"],
  "TEAM_PROPS": ["Total por Equipe", "Team Total", "Props de Time"],
  "SPECIAL_PROPS": ["Props Especiais", "Special Props", "Prop Especial"],
  
  // Esportes específicos
  "METHOD_OF_VICTORY": ["Método de Vitória", "Method of Victory"],
  "ROUND_FINISH": ["Round da Finalização", "Round Finish"],
  "GO_THE_DISTANCE": ["Luta Completa (Sim/Não)", "Goes the Distance"],
  "FIRST_BLOOD": ["First Blood", "Primeiro Sangue"],
  "FIRST_TOWER": ["First Tower", "Primeira Torre"],
  "FIRST_DRAGON": ["First Dragon", "Primeiro Dragão"],
  "FIRST_BARON": ["First Baron", "Primeiro Barão"],
  "FIRST_ROSHAN": ["First Roshan", "Primeiro Roshan"],
  "TIEBREAK": ["Tie-break (Sim/Não)", "Tiebreak"],
  "ACE": ["Aces", "Total de Aces"],
  "DOUBLE_FAULT": ["Dupla Falta", "Double Fault"],
  
  // Torneios
  "OUTRIGHT": ["Vencedor do Torneio", "Outright", "Campeão"],
  "TOP_FINISH": ["Top 5/10/20", "Top Finish"],
  "HEAD_TO_HEAD": ["Head-to-Head", "H2H", "Confronto Direto"],
  "MAKE_CUT": ["Fazer Cut (Sim/Não)", "Make Cut"],
  
  // Fallback
  "OTHER": ["Outro", "Other"],
};

/**
 * Resolve o tipo canônico para uma opção disponível no select
 */
export function resolveCanonicalToAvailableOption(
  canonicalType: MarketCanonicalType,
  availableOptions: string[]
): string | null {
  const possibleMatches = CANONICAL_TO_DISPLAY_OPTIONS[canonicalType] || [];
  
  // Busca exata primeiro
  for (const match of possibleMatches) {
    if (availableOptions.includes(match)) {
      return match;
    }
  }
  
  // Busca por similaridade
  const normalized = possibleMatches.map(m => normalizeText(m));
  for (const option of availableOptions) {
    const normalizedOption = normalizeText(option);
    if (normalized.some(n => n === normalizedOption || normalizedOption.includes(n) || n.includes(normalizedOption))) {
      return option;
    }
  }
  
  return null;
}

// ========================================================================
// MERCADOS POR ESPORTE (PARA UI)
// ========================================================================

export const MERCADOS_POR_ESPORTE: Record<string, string[]> = {
  "Futebol": [
    "1X2", "Dupla Chance", "Ambas Marcam", "Over/Under Gols", "Handicap Asiático",
    "Resultado do 1º Tempo", "Over/Under Escanteios", "Handicap de Gols",
    "Resultado Final + Gols", "Placar Correto", "Draw No Bet", "Outro"
  ],
  "Basquete": [
    "Moneyline", "Handicap / Spread", "Over/Under Pontos", "Total por Equipe",
    "Resultado 1º Tempo", "Resultado Tempo Regulamentar", "Resultado por Quarto",
    "Handicap 1º Tempo", "Over/Under 1º Tempo", "Props de Jogadores", "Outro"
  ],
  "Tênis": [
    "Vencedor da Partida", "Handicap de Games", "Over/Under Games", "Vencedor do Set",
    "Placar Exato", "Total de Sets", "Handicap de Sets", "Vencedor do 1º Set",
    "Tie-break (Sim/Não)", "Sets Ímpares/Pares", "Outro"
  ],
  "Baseball": [
    "Moneyline", "Run Line", "Total de Runs", "Total por Equipe",
    "Resultado após 9 Innings", "Resultado 5 Innings", "Resultado por Inning",
    "1ª Metade", "Handicap", "Props de Arremessadores", "Outro"
  ],
  "Hockey": [
    "Moneyline", "Puck Line", "Total de Gols", "Resultado Tempo Regulamentar",
    "Resultado por Período", "Handicap", "Total por Equipe", "1º Período",
    "Margem de Vitória", "Outro"
  ],
  "Futebol Americano": [
    "Moneyline", "Spread", "Total de Pontos", "Resultado Tempo Regulamentar",
    "Resultado 1º Tempo", "Handicap 1º Tempo", "Props de Jogadores",
    "Total por Equipe", "Touchdowns", "Outro"
  ],
  "Vôlei": [
    "Vencedor da Partida", "Handicap de Sets", "Over/Under Sets", "Total de Pontos",
    "Resultado por Set", "Placar Exato (Sets)", "Handicap de Pontos",
    "Primeiro Set", "Outro"
  ],
  "MMA/UFC": [
    "Vencedor da Luta", "Método de Vitória", "Round da Finalização",
    "Over/Under Rounds", "Luta Completa (Sim/Não)", "Vitória por KO",
    "Vitória por Decisão", "Handicap de Rounds", "Outro"
  ],
  "Boxe": [
    "Vencedor da Luta", "Método de Vitória", "Round da Finalização",
    "Over/Under Rounds", "Luta Completa (Sim/Não)", "Vitória por KO",
    "Vitória por Decisão", "Handicap de Rounds", "Outro"
  ],
  "Golfe": [
    "Vencedor do Torneio", "Top 5/10/20", "Head-to-Head", "Melhor Round",
    "Nacionalidade do Vencedor", "Primeiro Líder", "Fazer Cut (Sim/Não)",
    "Over/Under Score", "Outro"
  ],
  "League of Legends": [
    "Vencedor do Mapa", "Handicap de Mapas", "Total de Mapas", "Vencedor da Série",
    "Placar Exato", "Over/Under Kills", "Primeiro Objetivo", "Total de Torres",
    "Handicap de Kills", "Outro"
  ],
  "Counter-Strike": [
    "Vencedor do Mapa", "Handicap de Mapas", "Total de Mapas", "Vencedor da Série",
    "Placar Exato", "Over/Under Rounds", "Primeiro a 10 Rounds",
    "Total de Kills", "Handicap de Rounds", "Outro"
  ],
  "Dota 2": [
    "Vencedor do Mapa", "Handicap de Mapas", "Total de Mapas", "Vencedor da Série",
    "Placar Exato", "Over/Under Kills", "Primeiro Objetivo", "Total de Torres",
    "Handicap de Kills", "Outro"
  ],
  "eFootball": [
    "1X2", "Handicap de Gols", "Over/Under Gols", "Ambas Marcam",
    "Resultado do 1º Tempo", "Placar Correto", "Dupla Chance",
    "Total de Escanteios", "Outro"
  ],
  "Outro": ["Vencedor", "Over/Under", "Handicap", "Outro"]
};

/**
 * Obtém os mercados disponíveis para um esporte
 */
export function getMarketsForSport(sport: string): string[] {
  return MERCADOS_POR_ESPORTE[sport] || MERCADOS_POR_ESPORTE["Outro"];
}

// ========================================================================
// COMPATIBILIDADE COM MODELOS (1-2 vs 1-X-2)
// ========================================================================

export const MERCADOS_COM_EMPATE_POR_ESPORTE: Record<string, string[]> = {
  "Futebol": ["1X2", "Resultado Final", "Dupla Chance", "Resultado do 1º Tempo"],
  "Basquete": ["Resultado Tempo Regulamentar", "Resultado 1º Tempo", "Resultado por Quarto"],
  "Hockey": ["Resultado Tempo Regulamentar", "Resultado por Período"],
  "Baseball": ["Resultado após 9 Innings", "Resultado 5 Innings", "Resultado por Inning"],
  "Futebol Americano": ["Resultado Tempo Regulamentar", "Resultado 1º Tempo"],
  "eFootball": ["1X2", "Resultado do 1º Tempo", "Dupla Chance"],
  "Tênis": [],
  "Vôlei": [],
  "MMA/UFC": [],
  "Boxe": [],
  "Golfe": [],
  "League of Legends": [],
  "Counter-Strike": [],
  "Dota 2": [],
  "Outro": [],
};

export type ModeloAposta = "1-2" | "1-X-2";

export function mercadoAdmiteEmpate(mercado: string, esporte: string): boolean {
  const mercadosComEmpate = MERCADOS_COM_EMPATE_POR_ESPORTE[esporte] || [];
  return mercadosComEmpate.includes(mercado);
}

export function isMercadoCompativelComModelo(
  mercado: string, 
  modelo: ModeloAposta, 
  esporte: string = "Futebol"
): boolean {
  if (!mercado) return true;
  const admiteEmpate = mercadoAdmiteEmpate(mercado, esporte);
  if (modelo === "1-X-2") return admiteEmpate;
  return !admiteEmpate;
}

export function getMarketsForSportAndModel(esporte: string, modelo: ModeloAposta): string[] {
  const mercadosEsporte = getMarketsForSport(esporte);
  const mercadosComEmpate = MERCADOS_COM_EMPATE_POR_ESPORTE[esporte] || [];
  
  const mercadosFiltrados = mercadosEsporte.filter(mercado => {
    if (mercado === "Outro") return true;
    const admiteEmpate = mercadosComEmpate.includes(mercado);
    if (modelo === "1-X-2") return admiteEmpate;
    return !admiteEmpate;
  });
  
  if (!mercadosFiltrados.includes("Outro")) {
    mercadosFiltrados.push("Outro");
  }
  
  return mercadosFiltrados;
}

export function getModeloParaMercado(mercado: string, esporte: string = "Futebol"): ModeloAposta | null {
  const admiteEmpate = mercadoAdmiteEmpate(mercado, esporte);
  return admiteEmpate ? "1-X-2" : "1-2";
}

// ========================================================================
// FUNÇÕES LEGADAS (MANTIDAS PARA COMPATIBILIDADE)
// ========================================================================

export interface NormalizedMarket {
  original: string;
  normalized: string;
  confidence: "exact" | "high" | "medium" | "low" | "none";
  matchedKeyword?: string;
}

export function findCanonicalMarket(rawMarket: string): NormalizedMarket {
  if (!rawMarket || rawMarket.trim() === "") {
    return { original: rawMarket, normalized: "", confidence: "none" };
  }
  
  // Usa o novo normalizador
  const result = normalizeMarketSemantically({ sport: "", marketLabel: rawMarket });
  
  return {
    original: rawMarket,
    normalized: result.displayName,
    confidence: result.confidence
  };
}

export function resolveMarketToOptions(
  rawMarket: string,
  availableOptions: string[]
): NormalizedMarket {
  if (!rawMarket || !availableOptions.length) {
    return { original: rawMarket, normalized: "", confidence: "none" };
  }
  
  // Usa o novo normalizador
  const result = normalizeMarketSemantically({ sport: "", marketLabel: rawMarket });
  
  // Tenta encontrar nas opções disponíveis
  const resolved = resolveCanonicalToAvailableOption(result.canonicalType, availableOptions);
  
  if (resolved) {
    return {
      original: rawMarket,
      normalized: resolved,
      confidence: result.confidence
    };
  }
  
  // Fallback para "Outro"
  if (availableOptions.includes("Outro")) {
    return { original: rawMarket, normalized: "Outro", confidence: "low" };
  }
  
  return { original: rawMarket, normalized: availableOptions[0] || "", confidence: "low" };
}

export function normalizeSport(rawSport: string): { normalized: string; confidence: "exact" | "high" | "low" | "none" } {
  if (!rawSport) return { normalized: "", confidence: "none" };
  
  const SPORTS = Object.keys(MERCADOS_POR_ESPORTE);
  const normalizedRaw = normalizeText(rawSport);
  
  // Busca exata
  for (const sport of SPORTS) {
    if (normalizeText(sport) === normalizedRaw) {
      return { normalized: sport, confidence: "exact" };
    }
  }
  
  // Busca por inclusão
  const sportAliases: Record<string, string[]> = {
    "Futebol": ["soccer", "football", "fut", "futebol"],
    "Basquete": ["basketball", "nba", "basquete"],
    "Tênis": ["tennis", "tenis"],
    "Baseball": ["mlb", "baseball", "beisebol"],
    "Hockey": ["nhl", "ice hockey", "hoquei", "khl"],
    "Futebol Americano": ["nfl", "american football", "ncaaf"],
    "Vôlei": ["volleyball", "volei", "voleibol"],
    "MMA/UFC": ["mma", "ufc", "luta", "fight", "bellator"],
    "Boxe": ["boxing", "boxe"],
    "Golfe": ["golf", "golfe"],
    "League of Legends": ["lol", "league"],
    "Counter-Strike": ["cs", "csgo", "cs2", "counter strike"],
    "Dota 2": ["dota"],
    "eFootball": ["efootball", "pes", "fifa", "ea fc", "ea sports fc"]
  };
  
  for (const [sport, aliases] of Object.entries(sportAliases)) {
    for (const alias of aliases) {
      if (normalizedRaw.includes(normalizeText(alias))) {
        return { normalized: sport, confidence: "high" };
      }
    }
  }
  
  return { normalized: "Outro", confidence: "low" };
}

// ========================================================================
// FUNÇÕES AUXILIARES EXPORTADAS
// ========================================================================

export function isMoneylineMarket(context: SemanticMarketContext): boolean {
  const result = normalizeMarketSemantically(context);
  return result.canonicalType === "MONEYLINE";
}

export function getMarketDisplayName(context: SemanticMarketContext): string {
  const result = normalizeMarketSemantically(context);
  return result.displayName;
}

// Para compatibilidade com código legado
export interface SemanticMarketContext {
  sport: string;
  marketLabel: string;
  selectionLabel?: string;
  selections?: string[];
  selectionsCount?: number;
  hasDrawOption?: boolean;
}
