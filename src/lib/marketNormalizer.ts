/**
 * Market Normalizer - Converte nomes de mercados externos para os internos do sistema
 * 
 * Fluxo:
 * 1. OCR detecta mercado_raw (texto do print)
 * 2. Normalizador transforma em uma categoria canônica (mercado_canon)
 * 3. Resolver tenta encontrar o melhor match dentro das opções disponíveis
 * 4. Preenche o Select com a opção encontrada
 */

// Mapeamento de equivalências: termo externo -> termo interno do sistema
const MARKET_EQUIVALENCES: Record<string, string[]> = {
  // 1X2 / Moneyline
  "Moneyline / 1X2": [
    "match winner", "matchwinners", "1x2", "moneyline", "money line", "ml",
    "full time result", "ftr", "winner", "vencedor", "ganhador",
    "resultado final", "quem vence", "1 x 2", "home/draw/away"
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
    "dupla chance", "double chance", "dc", "1x", "x2", "12",
    "casa ou empate", "fora ou empate", "casa ou fora"
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
 */
export function getMarketsForSportAndModel(esporte: string, modelo: ModeloAposta): string[] {
  const mercadosEsporte = getMarketsForSport(esporte);
  const mercadosComEmpate = MERCADOS_COM_EMPATE_POR_ESPORTE[esporte] || [];
  
  return mercadosEsporte.filter(mercado => {
    const admiteEmpate = mercadosComEmpate.includes(mercado);
    
    if (modelo === "1-X-2") {
      // Para 1-X-2, mostrar apenas mercados que admitem empate
      return admiteEmpate;
    }
    // Para 1-2, mostrar mercados que NÃO admitem empate
    return !admiteEmpate;
  });
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
