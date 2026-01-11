/**
 * Market Normalizer - Converte nomes de mercados externos para os internos do sistema
 * 
 * Fluxo:
 * 1. OCR detecta mercado_raw (texto do print)
 * 2. Normalizador transforma em uma categoria canônica (mercado_canon)
 * 3. Resolver tenta encontrar o melhor match dentro das opções disponíveis
 * 4. Preenche o Select com a opção encontrada
 */

// Tipo canônico de mercado (classificação lógica do sistema)
export type MarketCanonicalType = 
  | "MONEYLINE"      // Vencedor (2 opções, sem empate)
  | "1X2"            // Vencedor com empate (3 opções)
  | "OVER_UNDER"     // Acima/Abaixo de um valor
  | "HANDICAP"       // Spread/Handicap
  | "BTTS"           // Ambas Marcam
  | "CORRECT_SCORE"  // Placar exato
  | "DOUBLE_CHANCE"  // Dupla chance
  | "FIRST_HALF"     // Resultado 1º tempo
  | "DNB"            // Draw No Bet
  | "PROPS"          // Props de jogadores
  | "OTHER";         // Outros

// Interface para normalização semântica de mercados
export interface SemanticMarketContext {
  sport: string;
  marketLabel: string;
  selections?: string[];
  hasDrawOption?: boolean;
}

// Interface para resultado da normalização semântica
export interface SemanticMarketResult {
  canonicalType: MarketCanonicalType;
  displayName: string;
  confidence: "exact" | "high" | "medium" | "low";
  reason?: string;
}

// ========== REGRAS SEMÂNTICAS POR ESPORTE ==========
// Regras que consideram contexto para classificar mercados corretamente

interface SemanticRule {
  sport: string | string[];
  patterns: RegExp[];
  selectionsCount?: number;
  hasNoDrawOption?: boolean;
  result: MarketCanonicalType;
  displayName: string;
}

const SEMANTIC_RULES: SemanticRule[] = [
  // ==================== FUTEBOL ====================
  {
    sport: ["Futebol", "Soccer", "Football"],
    patterns: [/1x2/i, /resultado\s*final/i, /match\s*result/i, /full\s*time/i, /vencedor/i, /winner/i, /tres\s*vias/i, /three\s*way/i],
    result: "1X2",
    displayName: "1X2"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/dupla\s*chance/i, /double\s*chance/i, /1x\b/i, /x2\b/i, /12\b/i, /casa\s*ou\s*empate/i],
    result: "DOUBLE_CHANCE",
    displayName: "Dupla Chance"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/ambas?\s*marcam/i, /btts/i, /both\s*teams?\s*to\s*score/i, /gol\s*gol/i, /gg\s*(sim|nao|yes|no)?/i],
    result: "BTTS",
    displayName: "Ambas Marcam"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/over\s*\/?\s*under\s*gol/i, /total\s*(de\s*)?gol/i, /gols\s*(acima|abaixo)/i, /over\s*\d+\.?\d*\s*gol/i, /under\s*\d+\.?\d*\s*gol/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Gols"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/handicap\s*asia/i, /asian\s*handicap/i, /ah\s*[+-]?\d/i],
    result: "HANDICAP",
    displayName: "Handicap Asiático"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/1[ºo°]?\s*tempo/i, /primeiro\s*tempo/i, /1st\s*half/i, /first\s*half/i, /ht\s*result/i, /intervalo/i, /half\s*time/i],
    result: "FIRST_HALF",
    displayName: "Resultado do 1º Tempo"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/escanteio/i, /corner/i, /cantos/i, /total\s*(de\s*)?corner/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Escanteios"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/handicap\s*(de\s*)?gol/i, /goal\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Gols"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/resultado.*gol/i, /resultado.*total/i, /1x2.*gol/i],
    result: "1X2",
    displayName: "Resultado Final + Gols"
  },
  {
    sport: ["Futebol", "Soccer"],
    patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i, /exact\s*score/i, /^\d+-\d+$/],
    result: "CORRECT_SCORE",
    displayName: "Placar Correto"
  },
  
  // ==================== FUTEBOL AMERICANO / NFL ====================
  {
    sport: ["Futebol Americano", "NFL", "American Football"],
    patterns: [/vencedor.*prorrogacao/i, /vencedor.*overtime/i, /winner.*ot/i, /moneyline/i, /money\s*line/i, /vencedor\s*(da\s*)?partida/i, /to\s*win/i],
    result: "MONEYLINE",
    displayName: "Moneyline"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/spread/i, /handicap/i, /linha\s*de\s*pontos/i, /point\s*spread/i],
    result: "HANDICAP",
    displayName: "Spread"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/total\s*(de\s*)?pontos/i, /over\s*\/?\s*under/i, /pontos\s*(acima|abaixo)/i, /total\s*points/i],
    result: "OVER_UNDER",
    displayName: "Total de Pontos"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/resultado\s*tempo\s*regulamentar/i, /regulation\s*time/i, /60\s*min/i],
    result: "1X2",
    displayName: "Resultado Tempo Regulamentar"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/resultado\s*1[ºo°]?\s*tempo/i, /1st\s*half/i, /first\s*half/i, /1[ºo°]?\s*tempo/i],
    result: "FIRST_HALF",
    displayName: "Resultado 1º Tempo"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/handicap\s*1[ºo°]?\s*tempo/i, /1st\s*half\s*spread/i],
    result: "HANDICAP",
    displayName: "Handicap 1º Tempo"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/props?\s*(de\s*)?jogador/i, /player\s*props?/i, /yards/i, /touchdown.*jogador/i, /passing/i, /rushing/i, /receiving/i],
    result: "PROPS",
    displayName: "Props de Jogadores"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /pontos.*equipe/i],
    result: "OVER_UNDER",
    displayName: "Total por Equipe"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/touchdown/i, /td\s*(total|primeiro|anytime)/i, /primeiro\s*td/i, /anytime\s*td/i],
    result: "PROPS",
    displayName: "Touchdowns"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i],
    result: "OTHER",
    displayName: "Margem de Vitória"
  },
  {
    sport: ["Futebol Americano", "NFL"],
    patterns: [/same\s*game\s*parlay/i, /sgp/i],
    result: "OTHER",
    displayName: "Same Game Parlay"
  },
  
  // ==================== BASQUETE / NBA ====================
  {
    sport: ["Basquete", "NBA", "Basketball", "NBB"],
    patterns: [/vencedor/i, /winner/i, /moneyline/i, /money\s*line/i, /to\s*win/i],
    result: "MONEYLINE",
    displayName: "Moneyline"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/handicap/i, /spread/i, /linha\s*de\s*pontos/i, /point\s*spread/i],
    result: "HANDICAP",
    displayName: "Handicap / Spread"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/over\s*\/?\s*under/i, /total\s*(de\s*)?pontos/i, /pontos\s*(acima|abaixo)/i, /total\s*points/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Pontos"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /pontos.*equipe/i],
    result: "OVER_UNDER",
    displayName: "Total por Equipe"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/resultado\s*1[ºo°]?\s*tempo/i, /1st\s*half/i, /first\s*half/i, /1[ºo°]?\s*tempo/i],
    result: "FIRST_HALF",
    displayName: "Resultado 1º Tempo"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/resultado\s*tempo\s*regulamentar/i, /regulation\s*time/i, /48\s*min/i, /40\s*min/i],
    result: "1X2",
    displayName: "Resultado Tempo Regulamentar"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/resultado.*quarto/i, /quarter\s*result/i, /[1-4][ºo°]?\s*quarto/i, /\d(st|nd|rd|th)\s*quarter/i],
    result: "FIRST_HALF",
    displayName: "Resultado por Quarto"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/handicap\s*1[ºo°]?\s*tempo/i, /1st\s*half\s*spread/i],
    result: "HANDICAP",
    displayName: "Handicap 1º Tempo"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/over\s*\/?\s*under\s*1[ºo°]?\s*tempo/i, /1st\s*half\s*total/i],
    result: "OVER_UNDER",
    displayName: "Over/Under 1º Tempo"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/props?\s*(de\s*)?jogador/i, /player\s*props?/i, /pontos.*jogador/i, /rebounds?/i, /assists?/i, /triple\s*double/i, /double\s*double/i],
    result: "PROPS",
    displayName: "Props de Jogadores"
  },
  {
    sport: ["Basquete", "NBA", "Basketball"],
    patterns: [/same\s*game\s*parlay/i, /sgp/i],
    result: "OTHER",
    displayName: "Same Game Parlay"
  },
  
  // ==================== TÊNIS ====================
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/vencedor\s*(da\s*)?(partida)?/i, /winner/i, /match\s*winner/i, /to\s*win/i],
    result: "MONEYLINE",
    displayName: "Vencedor da Partida"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/handicap\s*(de\s*)?games?/i, /game\s*handicap/i, /spread\s*games?/i],
    result: "HANDICAP",
    displayName: "Handicap de Games"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/over\s*\/?\s*under\s*games?/i, /total\s*(de\s*)?games?/i, /games?\s*(acima|abaixo)/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Games"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/vencedor\s*(do\s*)?set/i, /set\s*winner/i, /1[ºo°]?\s*set/i, /primeiro\s*set/i, /1st\s*set/i],
    result: "MONEYLINE",
    displayName: "Vencedor do Set"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i, /sets?\s*exato/i],
    result: "CORRECT_SCORE",
    displayName: "Placar Exato"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/total\s*(de\s*)?sets?/i, /sets?\s*(over|under)/i, /numero\s*de\s*sets?/i],
    result: "OVER_UNDER",
    displayName: "Total de Sets"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/handicap\s*(de\s*)?sets?/i, /set\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Sets"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/vencedor\s*1[ºo°]?\s*set/i, /1st\s*set\s*winner/i, /primeiro\s*set/i],
    result: "MONEYLINE",
    displayName: "Vencedor do 1º Set"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/tie\s*break/i, /tiebreak/i, /havera\s*tie/i],
    result: "OTHER",
    displayName: "Tie-break (Sim/Não)"
  },
  {
    sport: ["Tênis", "Tennis"],
    patterns: [/sets?\s*(impar|par|odd|even)/i],
    result: "OTHER",
    displayName: "Sets Ímpares/Pares"
  },
  
  // ==================== BASEBALL / MLB ====================
  {
    sport: ["Baseball", "MLB", "Beisebol"],
    patterns: [/moneyline/i, /money\s*line/i, /vencedor/i, /winner/i, /to\s*win/i],
    result: "MONEYLINE",
    displayName: "Moneyline"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/run\s*line/i, /handicap/i, /spread/i, /rl\s*[+-]/i],
    result: "HANDICAP",
    displayName: "Run Line"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/total\s*(de\s*)?runs?/i, /over\s*\/?\s*under/i, /runs?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Total de Runs"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /runs?\s*equipe/i],
    result: "OVER_UNDER",
    displayName: "Total por Equipe"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/resultado\s*(apos|after)\s*9\s*innings?/i, /9\s*innings?/i, /regulamentar/i],
    result: "1X2",
    displayName: "Resultado após 9 Innings"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/resultado\s*5\s*innings?/i, /5\s*innings?/i, /first\s*5/i, /f5/i],
    result: "1X2",
    displayName: "Resultado 5 Innings"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/resultado.*inning/i, /inning\s*result/i, /[1-9][ºo°]?\s*inning/i],
    result: "FIRST_HALF",
    displayName: "Resultado por Inning"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/1[ªa]?\s*metade/i, /1st\s*half/i, /first\s*half/i, /primeiro\s*tempo/i],
    result: "FIRST_HALF",
    displayName: "1ª Metade"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/props?\s*(de\s*)?arremessador/i, /pitcher\s*props?/i, /strikeout/i],
    result: "PROPS",
    displayName: "Props de Arremessadores"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/runs?\s*(impar|par|odd|even)/i],
    result: "OTHER",
    displayName: "Odd/Even Runs"
  },
  {
    sport: ["Baseball", "MLB"],
    patterns: [/hits?\s*total/i, /total\s*(de\s*)?hits?/i],
    result: "OVER_UNDER",
    displayName: "Hits Totais"
  },
  
  // ==================== HOCKEY / NHL ====================
  {
    sport: ["Hockey", "NHL", "Hóquei"],
    patterns: [/moneyline/i, /money\s*line/i, /vencedor.*overtime/i, /vencedor.*prorrogacao/i, /to\s*win/i],
    result: "MONEYLINE",
    displayName: "Moneyline"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/puck\s*line/i, /handicap/i, /spread/i, /pl\s*[+-]/i],
    result: "HANDICAP",
    displayName: "Puck Line"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/total\s*(de\s*)?gols?/i, /over\s*\/?\s*under/i, /gols?\s*(over|under)/i, /total\s*goals?/i],
    result: "OVER_UNDER",
    displayName: "Total de Gols"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/resultado\s*tempo\s*regulamentar/i, /regulation\s*time/i, /60\s*min/i, /tres\s*vias/i, /3\s*way/i],
    result: "1X2",
    displayName: "Resultado Tempo Regulamentar"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/resultado.*periodo/i, /period\s*result/i, /[1-3][ºo°]?\s*periodo/i, /\d(st|nd|rd)\s*period/i],
    result: "FIRST_HALF",
    displayName: "Resultado por Período"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/total\s*por\s*equipe/i, /team\s*total/i, /gols?\s*equipe/i],
    result: "OVER_UNDER",
    displayName: "Total por Equipe"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/1[ºo°]?\s*periodo/i, /1st\s*period/i, /primeiro\s*periodo/i],
    result: "FIRST_HALF",
    displayName: "1º Período"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i],
    result: "OTHER",
    displayName: "Margem de Vitória"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/over\s*\/?\s*under.*periodo/i, /period\s*total/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Períodos"
  },
  {
    sport: ["Hockey", "NHL"],
    patterns: [/gols?\s*(impar|par|odd|even)/i],
    result: "OTHER",
    displayName: "Gols Ímpares/Pares"
  },
  
  // ==================== VÔLEI ====================
  {
    sport: ["Vôlei", "Volleyball", "Voleibol"],
    patterns: [/vencedor\s*(da\s*)?(partida)?/i, /winner/i, /match\s*winner/i, /to\s*win/i],
    result: "MONEYLINE",
    displayName: "Vencedor da Partida"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/handicap\s*(de\s*)?sets?/i, /set\s*handicap/i, /spread\s*sets?/i],
    result: "HANDICAP",
    displayName: "Handicap de Sets"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/over\s*\/?\s*under\s*sets?/i, /total\s*(de\s*)?sets?/i, /sets?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Sets"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/total\s*(de\s*)?pontos/i, /pontos\s*(over|under)/i, /over\s*\/?\s*under\s*pontos/i],
    result: "OVER_UNDER",
    displayName: "Total de Pontos"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/resultado.*set/i, /set\s*result/i, /[1-5][ºo°]?\s*set/i],
    result: "FIRST_HALF",
    displayName: "Resultado por Set"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/placar\s*(exato|correto).*sets?/i, /sets?\s*exato/i, /correct\s*score/i],
    result: "CORRECT_SCORE",
    displayName: "Placar Exato (Sets)"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/handicap\s*(de\s*)?pontos/i, /point\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Pontos"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/primeiro\s*set/i, /1[ºo°]?\s*set/i, /1st\s*set/i, /vencedor.*1.*set/i],
    result: "MONEYLINE",
    displayName: "Primeiro Set"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/over\s*\/?\s*under.*pontos.*set/i, /set\s*points?\s*total/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Pontos Set"
  },
  {
    sport: ["Vôlei", "Volleyball"],
    patterns: [/sets?\s*(impar|par|odd|even)/i],
    result: "OTHER",
    displayName: "Sets Ímpares/Pares"
  },
  
  // ==================== MMA / UFC ====================
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/vencedor\s*(da\s*)?(luta)?/i, /winner/i, /to\s*win/i, /moneyline/i],
    result: "MONEYLINE",
    displayName: "Vencedor da Luta"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/metodo\s*(de\s*)?vitoria/i, /method\s*of\s*victory/i, /como\s*vence/i],
    result: "OTHER",
    displayName: "Método de Vitória"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/round\s*(da\s*)?finalizacao/i, /round.*termina/i, /em\s*qual\s*round/i],
    result: "OTHER",
    displayName: "Round da Finalização"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/over\s*\/?\s*under\s*rounds?/i, /total\s*(de\s*)?rounds?/i, /rounds?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Rounds"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/luta\s*completa/i, /goes\s*the\s*distance/i, /vai\s*ate\s*o\s*fim/i, /full\s*fight/i],
    result: "OTHER",
    displayName: "Luta Completa (Sim/Não)"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/vitoria\s*por\s*ko/i, /ko\s*win/i, /nocaute/i, /knockout/i, /tko/i],
    result: "OTHER",
    displayName: "Vitória por KO"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/vitoria\s*por\s*decisao/i, /decision\s*win/i, /decisao/i],
    result: "OTHER",
    displayName: "Vitória por Decisão"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/handicap\s*(de\s*)?rounds?/i, /round\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Rounds"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/round\s*1.*vencedor/i, /1[ºo°]?\s*round.*winner/i, /vencedor.*round\s*1/i],
    result: "MONEYLINE",
    displayName: "Round 1 – Vencedor"
  },
  {
    sport: ["MMA/UFC", "MMA", "UFC"],
    patterns: [/prop\s*especial/i, /special\s*prop/i, /finalizacao/i, /submission/i],
    result: "PROPS",
    displayName: "Prop Especial"
  },
  
  // ==================== BOXE ====================
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/vencedor\s*(da\s*)?(luta)?/i, /winner/i, /to\s*win/i, /moneyline/i],
    result: "MONEYLINE",
    displayName: "Vencedor da Luta"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/metodo\s*(de\s*)?vitoria/i, /method\s*of\s*victory/i],
    result: "OTHER",
    displayName: "Método de Vitória"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/round\s*(da\s*)?finalizacao/i, /round.*termina/i, /em\s*qual\s*round/i],
    result: "OTHER",
    displayName: "Round da Finalização"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/over\s*\/?\s*under\s*rounds?/i, /total\s*(de\s*)?rounds?/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Rounds"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/luta\s*completa/i, /goes\s*the\s*distance/i, /12\s*rounds/i],
    result: "OTHER",
    displayName: "Luta Completa (Sim/Não)"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/vitoria\s*por\s*ko/i, /ko\s*win/i, /nocaute/i, /knockout/i, /tko/i],
    result: "OTHER",
    displayName: "Vitória por KO"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/vitoria\s*por\s*decisao/i, /decision\s*win/i],
    result: "OTHER",
    displayName: "Vitória por Decisão"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/handicap\s*(de\s*)?rounds?/i, /round\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Rounds"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/round\s*1.*vencedor/i, /1[ºo°]?\s*round/i],
    result: "MONEYLINE",
    displayName: "Round 1 – Vencedor"
  },
  {
    sport: ["Boxe", "Boxing"],
    patterns: [/prop\s*especial/i, /special\s*prop/i],
    result: "PROPS",
    displayName: "Prop Especial"
  },
  
  // ==================== GOLFE ====================
  {
    sport: ["Golfe", "Golf"],
    patterns: [/vencedor\s*(do\s*)?torneio/i, /tournament\s*winner/i, /outright/i, /campeao/i],
    result: "MONEYLINE",
    displayName: "Vencedor do Torneio"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/top\s*[5|10|20]/i, /terminar.*top/i, /finish\s*top/i],
    result: "OTHER",
    displayName: "Top 5/10/20"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/head\s*to\s*head/i, /h2h/i, /confronto\s*direto/i, /matchup/i],
    result: "MONEYLINE",
    displayName: "Head-to-Head"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/melhor\s*round/i, /best\s*round/i, /low\s*round/i],
    result: "OTHER",
    displayName: "Melhor Round"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/nacionalidade.*vencedor/i, /winner.*nationality/i],
    result: "OTHER",
    displayName: "Nacionalidade do Vencedor"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/primeiro\s*lider/i, /first\s*round\s*leader/i, /lider.*round/i],
    result: "MONEYLINE",
    displayName: "Primeiro Líder"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/fazer\s*cut/i, /make\s*cut/i, /cut\s*(sim|nao|yes|no)/i],
    result: "OTHER",
    displayName: "Fazer Cut (Sim/Não)"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/over\s*\/?\s*under\s*score/i, /score\s*(over|under)/i, /total\s*strokes/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Score"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/hole\s*in\s*one/i, /ace/i],
    result: "OTHER",
    displayName: "Hole-in-One no Torneio"
  },
  {
    sport: ["Golfe", "Golf"],
    patterns: [/prop\s*especial/i, /special\s*prop/i],
    result: "PROPS",
    displayName: "Prop Especial"
  },
  
  // ==================== LEAGUE OF LEGENDS ====================
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/vencedor\s*(do\s*)?mapa/i, /map\s*winner/i, /game\s*winner/i],
    result: "MONEYLINE",
    displayName: "Vencedor do Mapa"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/handicap\s*(de\s*)?mapas?/i, /map\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Mapas"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/total\s*(de\s*)?mapas?/i, /over\s*\/?\s*under\s*mapas?/i, /mapas?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Total de Mapas"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/vencedor\s*(da\s*)?serie/i, /series?\s*winner/i, /match\s*winner/i],
    result: "MONEYLINE",
    displayName: "Vencedor da Série"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i, /mapas?\s*exato/i],
    result: "CORRECT_SCORE",
    displayName: "Placar Exato"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/over\s*\/?\s*under\s*kills?/i, /total\s*(de\s*)?kills?/i, /kills?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Kills"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/primeiro\s*objetivo/i, /first\s*(blood|dragon|baron|tower|objective)/i, /primeiro\s*(sangue|dragao|barao|torre)/i],
    result: "OTHER",
    displayName: "Primeiro Objetivo"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/total\s*(de\s*)?torres?/i, /towers?\s*(over|under)/i, /over\s*\/?\s*under\s*torres?/i],
    result: "OVER_UNDER",
    displayName: "Total de Torres"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/handicap\s*(de\s*)?kills?/i, /kills?\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Kills"
  },
  {
    sport: ["League of Legends", "LoL"],
    patterns: [/props?\s*especiais?/i, /special\s*props?/i],
    result: "PROPS",
    displayName: "Props Especiais"
  },
  
  // ==================== COUNTER-STRIKE ====================
  {
    sport: ["Counter-Strike", "CS", "CS2", "CSGO"],
    patterns: [/vencedor\s*(do\s*)?mapa/i, /map\s*winner/i],
    result: "MONEYLINE",
    displayName: "Vencedor do Mapa"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/handicap\s*(de\s*)?mapas?/i, /map\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Mapas"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/total\s*(de\s*)?mapas?/i, /over\s*\/?\s*under\s*mapas?/i],
    result: "OVER_UNDER",
    displayName: "Total de Mapas"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/vencedor\s*(da\s*)?serie/i, /series?\s*winner/i, /match\s*winner/i],
    result: "MONEYLINE",
    displayName: "Vencedor da Série"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i],
    result: "CORRECT_SCORE",
    displayName: "Placar Exato"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/over\s*\/?\s*under\s*rounds?/i, /total\s*(de\s*)?rounds?/i, /rounds?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Rounds"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/primeiro\s*a\s*10/i, /first\s*to\s*10/i, /race\s*to\s*10/i],
    result: "OTHER",
    displayName: "Primeiro a 10 Rounds"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/total\s*(de\s*)?kills?/i, /kills?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Total de Kills"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/handicap\s*(de\s*)?rounds?/i, /rounds?\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Rounds"
  },
  {
    sport: ["Counter-Strike", "CS", "CS2"],
    patterns: [/props?\s*especiais?/i, /special\s*props?/i],
    result: "PROPS",
    displayName: "Props Especiais"
  },
  
  // ==================== DOTA 2 ====================
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/vencedor\s*(do\s*)?mapa/i, /map\s*winner/i, /game\s*winner/i],
    result: "MONEYLINE",
    displayName: "Vencedor do Mapa"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/handicap\s*(de\s*)?mapas?/i, /map\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Mapas"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/total\s*(de\s*)?mapas?/i, /over\s*\/?\s*under\s*mapas?/i],
    result: "OVER_UNDER",
    displayName: "Total de Mapas"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/vencedor\s*(da\s*)?serie/i, /series?\s*winner/i, /match\s*winner/i],
    result: "MONEYLINE",
    displayName: "Vencedor da Série"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i],
    result: "CORRECT_SCORE",
    displayName: "Placar Exato"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/over\s*\/?\s*under\s*kills?/i, /total\s*(de\s*)?kills?/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Kills"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/primeiro\s*objetivo/i, /first\s*(blood|roshan|tower|objective)/i, /primeiro\s*(sangue|roshan|torre)/i],
    result: "OTHER",
    displayName: "Primeiro Objetivo"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/total\s*(de\s*)?torres?/i, /towers?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Total de Torres"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/handicap\s*(de\s*)?kills?/i, /kills?\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Kills"
  },
  {
    sport: ["Dota 2", "Dota"],
    patterns: [/props?\s*especiais?/i, /special\s*props?/i],
    result: "PROPS",
    displayName: "Props Especiais"
  },
  
  // ==================== eFOOTBALL (FIFA/PES) ====================
  {
    sport: ["eFootball", "FIFA", "PES", "EA FC"],
    patterns: [/vencedor\s*(da\s*)?(partida)?/i, /winner/i, /1x2/i, /resultado\s*final/i],
    result: "1X2",
    displayName: "Vencedor da Partida"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/handicap\s*(de\s*)?gols?/i, /goal\s*handicap/i],
    result: "HANDICAP",
    displayName: "Handicap de Gols"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/over\s*\/?\s*under\s*gols?/i, /total\s*(de\s*)?gols?/i, /gols?\s*(over|under)/i],
    result: "OVER_UNDER",
    displayName: "Over/Under Gols"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/ambas?\s*marcam/i, /btts/i, /both\s*teams?\s*to\s*score/i],
    result: "BTTS",
    displayName: "Ambas Marcam"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/resultado.*1[ºo°]?\s*tempo/i, /1st\s*half/i, /primeiro\s*tempo/i],
    result: "FIRST_HALF",
    displayName: "Resultado do 1º Tempo"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/placar\s*(exato|correto)/i, /correct\s*score/i],
    result: "CORRECT_SCORE",
    displayName: "Placar Correto"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/dupla\s*chance/i, /double\s*chance/i],
    result: "DOUBLE_CHANCE",
    displayName: "Dupla Chance"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/total\s*(de\s*)?escanteios?/i, /corners?/i],
    result: "OVER_UNDER",
    displayName: "Total de Escanteios"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/margem\s*(de\s*)?vitoria/i, /winning\s*margin/i],
    result: "OTHER",
    displayName: "Margem de Vitória"
  },
  {
    sport: ["eFootball", "FIFA", "PES"],
    patterns: [/props?\s*especiais?/i, /special\s*props?/i],
    result: "PROPS",
    displayName: "Props Especiais"
  },
  
  // ==================== REGRAS GENÉRICAS (FALLBACK) ====================
  // Estas regras são aplicadas quando nenhuma regra específica do esporte corresponde
  
  // REGRA CRÍTICA: "Mais X" / "Menos X" são SEMPRE Over/Under
  // Esta regra DEVE vir antes de outras para capturar corretamente
  {
    sport: [],  // Qualquer esporte
    patterns: [
      /^mais\s+\d+[.,]?\d*/i,           // "Mais 21.5", "Mais 2.5"
      /^menos\s+\d+[.,]?\d*/i,          // "Menos 21.5", "Menos 2.5"
      /\bmais\s+\d+[.,]?\d*\b/i,        // "Total Mais 21.5"
      /\bmenos\s+\d+[.,]?\d*\b/i,       // "Total Menos 21.5"
      /\bover\s+\d+[.,]?\d*/i,          // "Over 21.5"
      /\bunder\s+\d+[.,]?\d*/i,         // "Under 21.5"
      /\b[+-]?\d+[.,]\d+\s*(mais|menos|over|under)/i,  // "21.5 Mais"
      /\bacima\s+\d+[.,]?\d*/i,         // "Acima 21.5"
      /\babaixo\s+\d+[.,]?\d*/i,        // "Abaixo 21.5"
    ],
    result: "OVER_UNDER",
    displayName: "Over/Under"
  },
  
  // REGRA: Total de qualquer coisa (games, pontos, gols, sets, etc.)
  {
    sport: [],
    patterns: [
      /total\s*(de\s*)?(games?|pontos?|gols?|runs?|sets?|rounds?|kills?|mapas?|corners?|escanteios?)/i,
      /total\s*\d+[.,]?\d*/i,           // "Total 21.5"
      /over\s*\/?\s*under/i,
      /acima\s*\/?\s*abaixo/i,
      /mais\s*\/?\s*menos/i,            // "Mais/Menos"
      /over.*total/i,
      /under.*total/i,
    ],
    result: "OVER_UNDER",
    displayName: "Over/Under"
  },
  
  {
    sport: [],
    patterns: [/handicap/i, /spread/i, /ah\s*[+-]?\d/i, /eh\s*[+-]?\d/i],
    result: "HANDICAP",
    displayName: "Handicap"
  },
  {
    sport: [],
    patterns: [/ambas?\s*marcam/i, /btts/i, /both\s*teams?\s*to\s*score/i, /gol\s*gol/i],
    result: "BTTS",
    displayName: "Ambas Marcam"
  },
  {
    sport: [],
    patterns: [/placar\s*(exato|correto)/i, /resultado\s*exato/i, /correct\s*score/i, /exact\s*score/i],
    result: "CORRECT_SCORE",
    displayName: "Placar Correto"
  },
  {
    sport: [],
    patterns: [/dupla\s*chance/i, /double\s*chance/i, /1x\b/i, /x2\b/i, /12\b/i],
    result: "DOUBLE_CHANCE",
    displayName: "Dupla Chance"
  },
  {
    sport: [],
    patterns: [/1[ºo°]?\s*tempo/i, /primeiro\s*tempo/i, /1st\s*half/i, /first\s*half/i, /half\s*time/i, /ht\s*result/i, /intervalo/i],
    result: "FIRST_HALF",
    displayName: "Resultado do 1º Tempo"
  },
  {
    sport: [],
    patterns: [/draw\s*no\s*bet/i, /dnb/i, /empate\s*anula/i, /empate\s*reembolsa/i],
    result: "DNB",
    displayName: "Draw No Bet"
  },
  {
    sport: [],
    patterns: [/props?\s*(de\s*)?(jogador|player)/i, /player\s*props?/i],
    result: "PROPS",
    displayName: "Props de Jogadores"
  },
  {
    sport: [],
    patterns: [/moneyline/i, /money\s*line/i, /vencedor/i, /winner/i, /to\s*win/i],
    result: "MONEYLINE",
    displayName: "Moneyline"
  },
  {
    sport: [],
    patterns: [/1x2/i, /tres\s*vias/i, /three\s*way/i, /resultado\s*final/i],
    result: "1X2",
    displayName: "1X2"
  },
];

/**
 * Verifica se o texto indica Over/Under através de padrões comuns
 * "Mais X", "Menos X", "Over X", "Under X", etc.
 */
function isOverUnderPattern(text: string): boolean {
  if (!text) return false;
  const patterns = [
    /^mais\s+\d+[.,]?\d*/i,           // "Mais 21.5"
    /^menos\s+\d+[.,]?\d*/i,          // "Menos 21.5"
    /\bover\s+\d+[.,]?\d*/i,          // "Over 21.5"
    /\bunder\s+\d+[.,]?\d*/i,         // "Under 21.5"
    /\bacima\s+\d+[.,]?\d*/i,         // "Acima 21.5"
    /\babaixo\s+\d+[.,]?\d*/i,        // "Abaixo 21.5"
    /\b\+\s*\d+[.,]?\d*/,             // "+21.5"
    /\b-\s*\d+[.,]?\d*/,              // "-21.5" (pode ser handicap, mas em contexto de total é over/under)
    /\bover\b/i,
    /\bunder\b/i,
    /\bmais\b.*\d+/i,
    /\bmenos\b.*\d+/i,
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Normaliza um mercado semanticamente, considerando esporte e contexto
 */
export function normalizeMarketSemantically(context: SemanticMarketContext): SemanticMarketResult {
  const { sport, marketLabel, selections, hasDrawOption } = context;
  const normalizedLabel = normalizeText(marketLabel);
  const normalizedSport = normalizeText(sport);
  
  // PASSO 1: Verificar se a SELEÇÃO indica Over/Under
  // Isso é CRÍTICO para casos como "Mais 21.5" onde o mercado pode estar genérico
  if (selections && selections.length > 0) {
    const firstSelection = selections[0];
    if (isOverUnderPattern(firstSelection)) {
      // Determinar o displayName baseado no esporte
      let displayName = "Over/Under";
      if (/tenis|tennis/i.test(sport)) {
        displayName = "Over/Under Games";
      } else if (/futebol|soccer/i.test(sport)) {
        displayName = "Over/Under Gols";
      } else if (/basquete|basketball|nba/i.test(sport)) {
        displayName = "Over/Under Pontos";
      } else if (/volei|volleyball/i.test(sport)) {
        displayName = "Over/Under Pontos";
      }
      
      return {
        canonicalType: "OVER_UNDER",
        displayName,
        confidence: "high",
        reason: `Selection "${firstSelection}" indicates Over/Under pattern`
      };
    }
  }
  
  // PASSO 2: Verificar se o MERCADO indica Over/Under diretamente
  if (isOverUnderPattern(marketLabel)) {
    let displayName = "Over/Under";
    if (/tenis|tennis/i.test(sport)) {
      displayName = "Over/Under Games";
    } else if (/futebol|soccer/i.test(sport)) {
      displayName = "Over/Under Gols";
    } else if (/basquete|basketball|nba/i.test(sport)) {
      displayName = "Over/Under Pontos";
    }
    
    return {
      canonicalType: "OVER_UNDER",
      displayName,
      confidence: "high",
      reason: `Market label "${marketLabel}" indicates Over/Under pattern`
    };
  }
  
  // PASSO 3: Verifica cada regra semântica
  for (const rule of SEMANTIC_RULES) {
    // Verifica se a regra se aplica ao esporte
    const sportList = Array.isArray(rule.sport) ? rule.sport : [rule.sport];
    const sportMatches = sportList.length === 0 || 
      sportList.some(s => normalizeText(s) === normalizedSport || normalizedSport.includes(normalizeText(s)));
    
    if (!sportMatches) continue;
    
    // Verifica se algum padrão corresponde ao mercado OU às seleções
    let patternMatches = rule.patterns.some(p => p.test(marketLabel));
    
    // Também verificar nas seleções
    if (!patternMatches && selections && selections.length > 0) {
      patternMatches = selections.some(sel => 
        rule.patterns.some(p => p.test(sel))
      );
    }
    
    if (!patternMatches) continue;
    
    // Verifica contagem de seleções se especificado
    if (rule.selectionsCount !== undefined && selections) {
      if (selections.length !== rule.selectionsCount) continue;
    }
    
    // Verifica se não tem opção de empate
    if (rule.hasNoDrawOption && hasDrawOption === true) continue;
    
    return {
      canonicalType: rule.result,
      displayName: rule.displayName,
      confidence: "high",
      reason: `Matched rule for ${sport}: ${rule.patterns[0]}`
    };
  }
  
  // PASSO 4: Fallback - usa o normalizador de texto existente
  const textBasedResult = findCanonicalMarketFromEquivalences(marketLabel);
  
  return {
    canonicalType: textBasedResult.canonicalType,
    displayName: textBasedResult.displayName,
    confidence: textBasedResult.confidence,
    reason: "Text-based matching"
  };
}

/**
 * Busca mercado canônico baseado em equivalências de texto
 */
function findCanonicalMarketFromEquivalences(marketLabel: string): SemanticMarketResult {
  const normalized = normalizeText(marketLabel);
  
  // Mapeamento de nomes canônicos para tipos
  const canonicalMapping: Record<string, { type: MarketCanonicalType; display: string }> = {
    "1X2": { type: "1X2", display: "1X2" },
    "Over (Gols)": { type: "OVER_UNDER", display: "Over (Gols)" },
    "Under (Gols)": { type: "OVER_UNDER", display: "Under (Gols)" },
    "Handicap Asiático": { type: "HANDICAP", display: "Handicap Asiático" },
    "Handicap Europeu": { type: "HANDICAP", display: "Handicap Europeu" },
    "Ambas Marcam (BTTS)": { type: "BTTS", display: "Ambas Marcam" },
    "Resultado Exato": { type: "CORRECT_SCORE", display: "Placar Correto" },
    "Dupla Chance": { type: "DOUBLE_CHANCE", display: "Dupla Chance" },
    "Resultado do 1º Tempo": { type: "FIRST_HALF", display: "Resultado do 1º Tempo" },
    "Draw No Bet": { type: "DNB", display: "Draw No Bet" },
  };
  
  for (const [key, value] of Object.entries(canonicalMapping)) {
    if (normalizeText(key) === normalized) {
      return { canonicalType: value.type, displayName: value.display, confidence: "exact" };
    }
  }
  
  // Busca em sinônimos
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

/**
 * Verifica se um mercado é semanticamente equivalente a MONEYLINE
 * Considera esporte e contexto para determinar corretamente
 */
export function isMoneylineMarket(context: SemanticMarketContext): boolean {
  const result = normalizeMarketSemantically(context);
  return result.canonicalType === "MONEYLINE";
}

/**
 * Obtém o nome de exibição do mercado para o select
 */
export function getMarketDisplayName(context: SemanticMarketContext): string {
  const result = normalizeMarketSemantically(context);
  return result.displayName;
}

// Mapeamento de equivalências: termo externo -> termo interno do sistema
const MARKET_EQUIVALENCES: Record<string, string[]> = {
  // 1X2 - Principal mercado de futebol (3 vias)
  "1X2": [
    // Variações de 1X2
    "1x2", "1 x 2", "1-x-2", "1 - x - 2",
    // Moneyline / Money Line (para futebol, onde há empate)
    "resultado final", "resultado do jogo", "resultado da partida", "resultado",
    "final result", "match result", "full time result", "ftr", "ft result",
    // Vencedor com empate
    "match winner", "matchwinners", "winner", "vencedor", "ganhador", "quem vence",
    "vencedor da partida", "vencedor do jogo", "who wins",
    // Outras variações
    "home/draw/away", "casa empate fora", "moneyline / 1x2",
    "3 way", "3-way", "three way", "três vias", "tres vias"
  ],
  
  // Moneyline binário (sem empate) - para esportes americanos
  "Moneyline": [
    "moneyline", "money line", "ml", "money-line",
    "vencedor da partida – incluindo prorrogacao",
    "vencedor da partida incluindo prorrogacao",
    "winner including overtime",
    "winner incl. ot",
    "to win",
  ],
  
  // Over (Gols)
  "Over (Gols)": [
    "over", "acima", "mais de", "over goals", "total over",
    "over 0.5", "over 1.5", "over 2.5", "over 3.5", "over 4.5",
    "o0.5", "o1.5", "o2.5", "o3.5", "o4.5",
    "+0.5 gols", "+1.5 gols", "+2.5 gols", "+3.5 gols"
  ],
  
  // Under (Gols)
  "Under (Gols)": [
    "under", "abaixo", "menos de", "under goals", "total under",
    "under 0.5", "under 1.5", "under 2.5", "under 3.5", "under 4.5",
    "u0.5", "u1.5", "u2.5", "u3.5", "u4.5",
    "-0.5 gols", "-1.5 gols", "-2.5 gols", "-3.5 gols"
  ],
  
  // Handicap Asiático
  "Handicap Asiático": [
    "asian handicap", "ah", "handicap asiático", "handicap asiatico",
    "asian hcap", "ah 0", "ah -1", "ah +1", "ah -0.5", "ah +0.5",
    "ah -1.5", "ah +1.5", "spread asiático"
  ],
  
  // Handicap Europeu
  "Handicap Europeu": [
    "european handicap", "eh", "handicap europeu", "handicap",
    "hcap", "eh 0", "spread europeu"
  ],
  
  // Ambas Marcam (BTTS)
  "Ambas Marcam (BTTS)": [
    "btts", "ambas marcam", "both teams to score", "both score",
    "gol gol", "gg", "ambas equipes marcam", "sim/não",
    "btts yes", "btts no", "btts sim", "btts não"
  ],
  
  // Resultado Exato
  "Resultado Exato": [
    "resultado exato", "correct score", "placar exato", "exact score",
    "placar correto", "score exato", "1-0", "2-1", "0-0"
  ],
  
  // Dupla Chance
  "Dupla Chance": [
    // Português
    "dupla chance", "chance dupla", "duas chances",
    // Inglês
    "double chance", "dc",
    // Combinações específicas
    "1x", "x2", "12", "1 ou x", "x ou 2", "1 ou 2",
    "casa ou empate", "fora ou empate", "casa ou fora",
    "home or draw", "away or draw", "home or away",
    "double chance 1x", "double chance x2", "double chance 12",
    "1x (dupla chance)", "x2 (dupla chance)", "12 (dupla chance)"
  ],
  
  // Resultado do 1º Tempo
  "Resultado do 1º Tempo": [
    // Português
    "resultado do 1º tempo", "resultado 1º tempo", "resultado 1 tempo",
    "resultado do primeiro tempo", "resultado primeiro tempo",
    "1º tempo", "primeiro tempo", "1t", "1º t", "1o tempo",
    "intervalo", "resultado intervalo", "resultado ao intervalo",
    // Inglês
    "1st half result", "first half result", "first half",
    "ht result", "half time result", "half-time result",
    "half time", "half-time", "ht", "h.t.", "1h", "1st half",
    // Variações
    "resultado ht", "ht", "halftime"
  ],
  
  // Draw No Bet
  "Draw No Bet": [
    "draw no bet", "dnb", "empate anula", "empate reembolsa",
    "devolução empate", "no draw", "sem empate"
  ],
  
  // Primeiro/Último Gol
  "Primeiro/Último Gol": [
    "primeiro gol", "último gol", "first goal", "last goal",
    "first scorer", "last scorer", "primeiro a marcar", "último a marcar",
    "anytime scorer", "primeiro golo"
  ],
  
  // Total de Cantos
  "Total de Cantos": [
    "cantos", "corners", "escanteios", "total corners",
    "over corners", "under corners", "total cantos"
  ],
  
  // Outro (genérico)
  "Outro": []
};

// ========== MATRIZ DE COMPATIBILIDADE MODELO × MERCADO POR ESPORTE ==========
// Define quais mercados ADMITEM EMPATE em cada esporte
// Isso determina se o mercado é compatível com modelo 1-X-2 (3 pernas)

// Mercados que admitem empate, POR ESPORTE
// Estes mercados são compatíveis com modelo 1-X-2
export const MERCADOS_COM_EMPATE_POR_ESPORTE: Record<string, string[]> = {
  // Futebol: praticamente todos os mercados de resultado admitem empate
  "Futebol": [
    "1X2",
    "Resultado Final",
    "Dupla Chance",
    "Resultado do 1º Tempo",
  ],
  
  // Basquete: apenas tempo regulamentar e parciais admitem empate
  // Resultado final com prorrogação NÃO admite empate
  "Basquete": [
    "Resultado Tempo Regulamentar",
    "Resultado 1º Tempo",
    "Resultado por Quarto",
  ],
  
  // Hockey: tempo regulamentar pode ter empate (OT/shootout depois)
  "Hockey": [
    "Resultado Tempo Regulamentar",
    "Resultado por Período",
  ],
  
  // Baseball: apenas parciais admitem empate
  // Após 9 innings pode haver extra innings
  "Baseball": [
    "Resultado após 9 Innings",
    "Resultado 5 Innings",
    "Resultado por Inning",
  ],
  
  // Futebol Americano: parciais podem empatar
  "Futebol Americano": [
    "Resultado Tempo Regulamentar",
    "Resultado 1º Tempo",
  ],
  
  // eFootball: segue regras do futebol tradicional
  "eFootball": [
    "1X2",
    "Resultado do 1º Tempo",
    "Dupla Chance",
  ],
  
  // Esportes que NUNCA têm empate em resultado final
  "Tênis": [], // Sets decidem sempre
  "Vôlei": [], // Sets decidem sempre
  "MMA/UFC": [], // Empate técnico é raríssimo, não consideramos
  "Boxe": [], // Empate técnico é raríssimo, não consideramos
  "Golfe": [], // Playoffs decidem
  "League of Legends": [], // BO decidem sempre
  "Counter-Strike": [], // BO decidem sempre
  "Dota 2": [], // BO decidem sempre
  "Outro": [],
};

// Tipo para modelo de aposta
export type ModeloAposta = "1-2" | "1-X-2";

/**
 * Verifica se um mercado admite empate para um esporte específico
 */
export function mercadoAdmiteEmpate(mercado: string, esporte: string): boolean {
  const mercadosComEmpate = MERCADOS_COM_EMPATE_POR_ESPORTE[esporte] || [];
  return mercadosComEmpate.includes(mercado);
}

/**
 * Verifica se um mercado é compatível com o modelo selecionado para um esporte
 * @param mercado - Nome do mercado
 * @param modelo - "1-2" (binário) ou "1-X-2" (3 pernas)
 * @param esporte - Nome do esporte (usado para determinar se mercado admite empate)
 */
export function isMercadoCompativelComModelo(
  mercado: string, 
  modelo: ModeloAposta, 
  esporte: string = "Futebol"
): boolean {
  if (!mercado) return true; // Mercado vazio é sempre compatível
  
  const admiteEmpate = mercadoAdmiteEmpate(mercado, esporte);
  
  if (modelo === "1-X-2") {
    // Modelo 3-way: apenas mercados que admitem empate nesse esporte
    return admiteEmpate;
  }
  
  // Modelo binário: apenas mercados que NÃO admitem empate nesse esporte
  return !admiteEmpate;
}

/**
 * Filtra mercados compatíveis com o modelo selecionado para um esporte
 * SEMPRE inclui "Outro" como opção para mercados não mapeados
 */
export function getMarketsForSportAndModel(esporte: string, modelo: ModeloAposta): string[] {
  const mercadosEsporte = getMarketsForSport(esporte);
  const mercadosComEmpate = MERCADOS_COM_EMPATE_POR_ESPORTE[esporte] || [];
  
  const mercadosFiltrados = mercadosEsporte.filter(mercado => {
    // "Outro" sempre passa - é compatível com qualquer modelo
    if (mercado === "Outro") return true;
    
    const admiteEmpate = mercadosComEmpate.includes(mercado);
    
    if (modelo === "1-X-2") {
      // Para 1-X-2, mostrar apenas mercados que admitem empate
      return admiteEmpate;
    }
    // Para 1-2, mostrar mercados que NÃO admitem empate
    return !admiteEmpate;
  });
  
  // Garantir que "Outro" esteja sempre presente
  if (!mercadosFiltrados.includes("Outro")) {
    mercadosFiltrados.push("Outro");
  }
  
  return mercadosFiltrados;
}

/**
 * Determina o modelo apropriado para um mercado em um esporte
 * Retorna null se o mercado for compatível com ambos (raro)
 */
export function getModeloParaMercado(mercado: string, esporte: string = "Futebol"): ModeloAposta | null {
  const admiteEmpate = mercadoAdmiteEmpate(mercado, esporte);
  
  if (admiteEmpate) {
    return "1-X-2";
  }
  // Se não admite empate, é binário
  return "1-2";
}

// Mercados por esporte - TOP 10 mais populares por modalidade
export const MERCADOS_POR_ESPORTE: Record<string, string[]> = {
  "Futebol": [
    "1X2",
    "Dupla Chance",
    "Ambas Marcam",
    "Over/Under Gols",
    "Handicap Asiático",
    "Resultado do 1º Tempo",
    "Over/Under Escanteios",
    "Handicap de Gols",
    "Resultado Final + Gols",
    "Placar Correto",
    "Outro"
  ],
  "Basquete": [
    "Moneyline",
    "Handicap / Spread",
    "Over/Under Pontos",
    "Total por Equipe",
    "Resultado 1º Tempo",
    "Resultado Tempo Regulamentar", // NOVO: admite empate (1-X-2)
    "Resultado por Quarto", // Pode admitir empate em parciais
    "Handicap 1º Tempo",
    "Over/Under 1º Tempo",
    "Props de Jogadores",
    "Same Game Parlay",
    "Outro"
  ],
  "Tênis": [
    "Vencedor da Partida",
    "Handicap de Games",
    "Over/Under Games",
    "Vencedor do Set",
    "Placar Exato",
    "Total de Sets",
    "Handicap de Sets",
    "Vencedor do 1º Set",
    "Tie-break (Sim/Não)",
    "Sets Ímpares/Pares",
    "Outro"
  ],
  "Baseball": [
    "Moneyline",
    "Run Line",
    "Total de Runs",
    "Total por Equipe",
    "Resultado após 9 Innings", // NOVO: admite empate (1-X-2)
    "Resultado 5 Innings", // NOVO: admite empate (1-X-2)
    "Resultado por Inning", // Pode admitir empate
    "1ª Metade",
    "Handicap",
    "Props de Arremessadores",
    "Odd/Even Runs",
    "Hits Totais",
    "Outro"
  ],
  "Hockey": [
    "Moneyline",
    "Puck Line",
    "Total de Gols",
    "Resultado Tempo Regulamentar", // NOVO: admite empate (1-X-2)
    "Resultado por Período", // Pode admitir empate
    "Handicap",
    "Total por Equipe",
    "1º Período",
    "Margem de Vitória",
    "Over/Under Períodos",
    "Gols Ímpares/Pares",
    "Outro"
  ],
  "Futebol Americano": [
    "Moneyline",
    "Spread",
    "Total de Pontos",
    "Resultado Tempo Regulamentar", // NOVO: admite empate (1-X-2)
    "Resultado 1º Tempo", // Pode admitir empate
    "Handicap 1º Tempo",
    "Props de Jogadores",
    "Total por Equipe",
    "Touchdowns",
    "Margem de Vitória",
    "Same Game Parlay",
    "Outro"
  ],
  "Vôlei": [
    "Vencedor da Partida",
    "Handicap de Sets",
    "Over/Under Sets",
    "Total de Pontos",
    "Resultado por Set",
    "Placar Exato (Sets)",
    "Handicap de Pontos",
    "Primeiro Set",
    "Over/Under Pontos Set",
    "Sets Ímpares/Pares",
    "Outro"
  ],
  "MMA/UFC": [
    "Vencedor da Luta",
    "Método de Vitória",
    "Round da Finalização",
    "Over/Under Rounds",
    "Luta Completa (Sim/Não)",
    "Vitória por KO",
    "Vitória por Decisão",
    "Handicap de Rounds",
    "Round 1 – Vencedor",
    "Prop Especial",
    "Outro"
  ],
  "Boxe": [
    "Vencedor da Luta",
    "Método de Vitória",
    "Round da Finalização",
    "Over/Under Rounds",
    "Luta Completa (Sim/Não)",
    "Vitória por KO",
    "Vitória por Decisão",
    "Handicap de Rounds",
    "Round 1 – Vencedor",
    "Prop Especial",
    "Outro"
  ],
  "Golfe": [
    "Vencedor do Torneio",
    "Top 5/10/20",
    "Head-to-Head",
    "Melhor Round",
    "Nacionalidade do Vencedor",
    "Primeiro Líder",
    "Fazer Cut (Sim/Não)",
    "Over/Under Score",
    "Hole-in-One no Torneio",
    "Prop Especial",
    "Outro"
  ],
  "League of Legends": [
    "Vencedor do Mapa",
    "Handicap de Mapas",
    "Total de Mapas",
    "Vencedor da Série",
    "Placar Exato",
    "Over/Under Kills",
    "Primeiro Objetivo",
    "Total de Torres",
    "Handicap de Kills",
    "Props Especiais",
    "Outro"
  ],
  "Counter-Strike": [
    "Vencedor do Mapa",
    "Handicap de Mapas",
    "Total de Mapas",
    "Vencedor da Série",
    "Placar Exato",
    "Over/Under Rounds",
    "Primeiro a 10 Rounds",
    "Total de Kills",
    "Handicap de Rounds",
    "Props Especiais",
    "Outro"
  ],
  "Dota 2": [
    "Vencedor do Mapa",
    "Handicap de Mapas",
    "Total de Mapas",
    "Vencedor da Série",
    "Placar Exato",
    "Over/Under Kills",
    "Primeiro Objetivo",
    "Total de Torres",
    "Handicap de Kills",
    "Props Especiais",
    "Outro"
  ],
  "eFootball": [
    "Vencedor da Partida",
    "Handicap de Gols",
    "Over/Under Gols",
    "Ambas Marcam",
    "Resultado do 1º Tempo",
    "Placar Correto",
    "Dupla Chance",
    "Total de Escanteios",
    "Margem de Vitória",
    "Props Especiais",
    "Outro"
  ],
  "Outro": [
    "Vencedor",
    "Over",
    "Under",
    "Handicap",
    "Outro"
  ]
};

/**
 * Normaliza um texto para comparação (lowercase, sem acentos, sem espaços extras)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula similaridade entre duas strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);
  
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Jaccard similarity baseado em palavras
  const words1 = new Set(s1.split(" "));
  const words2 = new Set(s2.split(" "));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

export interface NormalizedMarket {
  original: string;
  normalized: string;
  confidence: "exact" | "high" | "medium" | "low" | "none";
  matchedKeyword?: string;
}

/**
 * Encontra o mercado canônico a partir de um texto raw
 */
export function findCanonicalMarket(rawMarket: string): NormalizedMarket {
  if (!rawMarket || rawMarket.trim() === "") {
    return { original: rawMarket, normalized: "", confidence: "none" };
  }
  
  const normalizedRaw = normalizeText(rawMarket);
  
  // Busca exata nos valores canônicos
  for (const canonicalMarket of Object.keys(MARKET_EQUIVALENCES)) {
    if (normalizeText(canonicalMarket) === normalizedRaw) {
      return {
        original: rawMarket,
        normalized: canonicalMarket,
        confidence: "exact"
      };
    }
  }
  
  // Busca nos sinônimos/equivalências
  for (const [canonicalMarket, synonyms] of Object.entries(MARKET_EQUIVALENCES)) {
    for (const synonym of synonyms) {
      const normalizedSynonym = normalizeText(synonym);
      
      // Match exato com sinônimo
      if (normalizedSynonym === normalizedRaw) {
        return {
          original: rawMarket,
          normalized: canonicalMarket,
          confidence: "exact",
          matchedKeyword: synonym
        };
      }
      
      // Match parcial (sinônimo contido no raw ou vice-versa)
      if (normalizedRaw.includes(normalizedSynonym) || normalizedSynonym.includes(normalizedRaw)) {
        return {
          original: rawMarket,
          normalized: canonicalMarket,
          confidence: "high",
          matchedKeyword: synonym
        };
      }
    }
  }
  
  // Busca por similaridade
  let bestMatch = { market: "", similarity: 0, keyword: "" };
  
  for (const [canonicalMarket, synonyms] of Object.entries(MARKET_EQUIVALENCES)) {
    // Compara com o nome canônico
    const simCanonical = calculateSimilarity(rawMarket, canonicalMarket);
    if (simCanonical > bestMatch.similarity) {
      bestMatch = { market: canonicalMarket, similarity: simCanonical, keyword: canonicalMarket };
    }
    
    // Compara com cada sinônimo
    for (const synonym of synonyms) {
      const sim = calculateSimilarity(rawMarket, synonym);
      if (sim > bestMatch.similarity) {
        bestMatch = { market: canonicalMarket, similarity: sim, keyword: synonym };
      }
    }
  }
  
  if (bestMatch.similarity >= 0.6) {
    return {
      original: rawMarket,
      normalized: bestMatch.market,
      confidence: bestMatch.similarity >= 0.8 ? "high" : "medium",
      matchedKeyword: bestMatch.keyword
    };
  }
  
  if (bestMatch.similarity >= 0.4) {
    return {
      original: rawMarket,
      normalized: bestMatch.market,
      confidence: "low",
      matchedKeyword: bestMatch.keyword
    };
  }
  
  // Não encontrou match - retorna "Outro" se disponível
  return {
    original: rawMarket,
    normalized: "Outro",
    confidence: "low"
  };
}

/**
 * Resolve o melhor match dentro de uma lista de opções disponíveis
 */
export function resolveMarketToOptions(
  rawMarket: string,
  availableOptions: string[]
): NormalizedMarket {
  if (!rawMarket || !availableOptions.length) {
    return { original: rawMarket, normalized: "", confidence: "none" };
  }
  
  const normalizedRaw = normalizeText(rawMarket);
  
  // Primeiro, tenta encontrar o mercado canônico
  const canonical = findCanonicalMarket(rawMarket);
  
  // Verifica se o canônico está nas opções
  if (canonical.normalized && availableOptions.includes(canonical.normalized)) {
    return canonical;
  }
  
  // Busca direta nas opções disponíveis
  for (const option of availableOptions) {
    if (normalizeText(option) === normalizedRaw) {
      return { original: rawMarket, normalized: option, confidence: "exact" };
    }
  }
  
  // Busca por similaridade nas opções disponíveis
  let bestMatch = { option: "", similarity: 0 };
  
  for (const option of availableOptions) {
    const sim = calculateSimilarity(rawMarket, option);
    if (sim > bestMatch.similarity) {
      bestMatch = { option, similarity: sim };
    }
    
    // Também compara com o canônico
    if (canonical.normalized) {
      const simCanonical = calculateSimilarity(canonical.normalized, option);
      if (simCanonical > bestMatch.similarity) {
        bestMatch = { option, similarity: simCanonical };
      }
    }
  }
  
  if (bestMatch.similarity >= 0.6) {
    return {
      original: rawMarket,
      normalized: bestMatch.option,
      confidence: bestMatch.similarity >= 0.8 ? "high" : "medium"
    };
  }
  
  // Fallback: retorna "Outro" se existir nas opções
  if (availableOptions.includes("Outro")) {
    return {
      original: rawMarket,
      normalized: "Outro",
      confidence: "low"
    };
  }
  
  // Último recurso: retorna a primeira opção
  return {
    original: rawMarket,
    normalized: availableOptions[0] || "",
    confidence: "low"
  };
}

/**
 * Obtém os mercados disponíveis para um esporte
 */
export function getMarketsForSport(sport: string): string[] {
  return MERCADOS_POR_ESPORTE[sport] || MERCADOS_POR_ESPORTE["Outro"];
}

/**
 * Normaliza um esporte para o nome canônico do sistema
 */
export function normalizeSport(rawSport: string): { normalized: string; confidence: "exact" | "high" | "low" | "none" } {
  if (!rawSport) return { normalized: "", confidence: "none" };
  
  const SPORTS = [
    "Futebol", "Basquete", "Tênis", "Baseball", "Hockey",
    "Futebol Americano", "Vôlei", "MMA/UFC", "League of Legends",
    "Counter-Strike", "Dota 2", "eFootball", "Outro"
  ];
  
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
    "Hockey": ["nhl", "ice hockey", "hoquei"],
    "Futebol Americano": ["nfl", "american football"],
    "Vôlei": ["volleyball", "volei", "voleibol"],
    "MMA/UFC": ["mma", "ufc", "luta", "fight"],
    "League of Legends": ["lol", "league"],
    "Counter-Strike": ["cs", "csgo", "cs2", "counter strike"],
    "Dota 2": ["dota"],
    "eFootball": ["efootball", "pes", "fifa"]
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
