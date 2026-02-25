import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ParsedBetSlip, ParsedField } from "./useImportBetPrint";
import { 
  normalizeOcrData, 
  resolveMarketForSport as resolveMarketFn,
  type NormalizationPendingData,
  type NormalizedBetData
} from "@/lib/ocrNormalization";
import { detectDateAnomaly, type DateAnomalyResult } from "@/lib/dateAnomalyDetection";
import { calcularOddReal, formatOddDisplay, type OddCalculationResult } from "@/lib/oddRealCalculation";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ========================================================================
// MARKET FAMILY DETECTION PATTERNS
// ========================================================================

// MATCH_ODDS / 1X2 (3-way, football only)
const MATCH_ODDS_MARKET_PATTERN = /(?:1\s*[x×X]\s*2|[1Il]\s*[xX×]\s*2|match\s*odds?|resultado\s*(?:da\s*)?(?:partida|final)|final\s*(?:da|de)\s*partida|full\s*time\s*result|ft\s*result|tres\s*vias|três\s*vias|three\s*way|moneyline\s*soccer)/i;

// MONEYLINE / MATCH_WINNER (2-way, no draw — basketball, tennis, MMA, etc.)
const MONEYLINE_MARKET_PATTERN = /(?:moneyline|money\s*line|\bml\b|vencedor(?!\s*(?:da\s*)?(?:partida|match))|winner|match\s*winner|main\s*line)/i;

// TOTALS (Over/Under) — includes basketball + tennis + baseball-specific terms
const TOTALS_MARKET_PATTERN = /(?:total\s*(?:de\s*)?(?:gols?|goals?|pontos?|points?|games?|sets?|cards?|cart[õo]es?|corners?|escanteios?|faltas?|shots?|runs?|kills?|mapas?|maps?|towers?|torres?|aces?|rounds?|rebounds?|assists?|steals?|blocks?|turnovers?|fouls?|double\s*faults?|bases?|strikeouts?|hits?)|game\s*total|points?\s*total|match\s*total\s*games?|(?:1st|2nd|3rd)\s*set\s*total|set\s*total\s*games?|total\s*sets?|total\s*runs?|(?:first|1st)\s*5\s*innings?\s*total|inning\s*total|over\s*[\/\\]?\s*under|o\s*[\/\\]\s*u|mais\s*[\/\\]\s*menos)/i;

// TEAM TOTALS — team-specific over/under
const TEAM_TOTALS_MARKET_PATTERN = /(?:team\s*total|total\s*(?:do|de|da)\s*(?:equipe|time)|(?:home|away)\s*total)/i;

// PLAYER PROPS / PLAYER TOTALS — includes tennis + baseball-specific (strikeouts, hits, home runs, total bases, RBI)
const PLAYER_TOTALS_MARKET_PATTERN = /(?:player\s*(?:props?|totals?|points?|rebounds?|assists?|steals?|blocks?|turnovers?|shots?|goals?|fouls?|aces?|double\s*faults?|games?\s*won|strikeouts?|hits?|home\s*runs?|total\s*bases?|runs?\s*batted|rbi)|pitcher\s*strikeouts?|jogador\s*(?:pontos?|assistências?|rebotes?)|\bpra\b|points?\s*\+?\s*(?:assists?|rebounds?))/i;

// YES_NO (binary) — includes basketball + tennis + baseball-specific
const YES_NO_MARKET_PATTERN = /(?:ambas?\s*marcam?|both\s*teams?\s*(?:to\s*)?score|btts|gol\s*(?:nos?\s*)?(?:dois|2|primeiro|1[ºo]?)\s*tempo|clean\s*sheet|classifica|penalty\s*awarded|double\s*double|triple\s*double|overtime|prorroga[çc][ãa]o|tie\s*break|extra\s*innings?|yrfi|nrfi|run\s*scored?\s*(?:in\s*)?(?:first|1st)\s*inning)/i;

// HANDICAP / SPREAD — includes basketball spread + tennis handicaps
const HANDICAP_MARKET_PATTERN = /(?:asian\s*handicap|\bah\b|\beh\b|handicap\s*(?:europeu|asiatico|asiático)?|(?:point\s*)?spread|run\s*line|puck\s*line|games?\s*handicap|match\s*games?\s*handicap|set\s*handicap|(?:1st|2nd|3rd)\s*set\s*game\s*handicap)/i;

// DRAW NO BET
const DNB_MARKET_PATTERN = /(?:draw\s*no\s*bet|\bdnb\b|empate\s*anula)/i;

// RACE TO POINTS / RUNS
const RACE_TO_MARKET_PATTERN = /(?:race\s*to\s*\d+|corrida\s*(?:a|até)\s*\d+)/i;

// HALF / QUARTER / SET / GAME / INNING period markets — includes tennis set/game + baseball innings
const PERIOD_MARKET_PATTERN = /(?:1st\s*(?:half|quarter|set|inning)|2nd\s*(?:half|quarter|set|inning)|3rd\s*(?:quarter|set|inning)|4th\s*quarter|5th\s*(?:set|inning)|1[ºo°]?\s*(?:tempo|quarto|quarter|set|inning)|2[ºo°]?\s*(?:tempo|quarto|quarter|set|inning)|3[ºo°]?\s*(?:quarto|set|inning)|first\s*(?:half|5\s*innings?)|second\s*half|half\s*time|(?:1st|2nd|3rd)\s*set\s*(?:winner|total|handicap|game)|game\s*\d+\s*winner|set\s*\d+\s*winner|(?:first|1st)\s*5\s*innings?\s*(?:winner|total|spread|moneyline|ml)|f5\s*(?:winner|total|spread|ml)|inning\s*(?:winner|total))/i;

// Binary markets that support smart line inference (TOTALS + YES_NO)
const BINARY_MARKETS = [
  "Over/Under", "Ambas Marcam", "BTTS", "Sim/Não", "Yes/No",
  "Over", "Under", "Sim", "Não", "Yes", "No",
  "Total de Gols", "Total de Pontos", "Total de Games", "Total de Sets",
  "Total de Escanteios", "Total de Cartões", "Total de Faltas",
  "Clean Sheet", "Gol no Primeiro Tempo",
  // Basketball
  "Total Points", "Game Total", "Points Total",
  "Team Total", "Player Points", "Player Rebounds", "Player Assists",
  "Double Double", "Triple Double", "Overtime",
  // Tennis
  "Total Games", "Total Sets", "Match Total Games", "Set Total Games",
  "1st Set Total", "2nd Set Total", "3rd Set Total",
  "Player Aces", "Player Double Faults", "Player Games Won",
  "Tie Break", "Tie Break in Match", "Tie Break First Set",
  // Baseball
  "Total Runs", "Game Total Runs", "Run Line",
  "First 5 Innings Total", "F5 Total", "Inning Total",
  "Pitcher Strikeouts", "Player Hits", "Player Home Runs", "Player Total Bases",
  "Player RBI", "Runs Batted In",
  "Extra Innings", "YRFI", "NRFI", "Run Scored First Inning",
];

// Mapping of binary line pairs (both directions)
const BINARY_LINE_PAIRS: Record<string, string> = {
  // Over/Under (TOTALS)
  "over": "under", "under": "over",
  "mais": "menos", "menos": "mais",
  "acima": "abaixo", "abaixo": "acima",
  "above": "below", "below": "above",
  // Sim/Não (YES_NO)
  "sim": "não", "não": "sim",
  "yes": "no", "no": "yes",
  // BTTS
  "ambas marcam sim": "ambas marcam não", "ambas marcam não": "ambas marcam sim",
  "btts sim": "btts não", "btts não": "btts sim",
};

// ========================================================================
// MARKET FAMILY INFERENCE FUNCTIONS
// ========================================================================

/**
 * MATCH_ODDS: determines canonical position (0=Home, 1=Draw, 2=Away)
 * and returns selections for ALL 3 legs.
 */
function inferMatchOddsLegs(
  scannedSelection: string,
  mandante: string | null,
  visitante: string | null
): { legSelections: (string | null)[]; scannedPosition: number } | null {
  if (!mandante || !visitante) return null;

  const sel = scannedSelection.toLowerCase().trim();
  let scannedPosition = -1;

  if (/^(empate|draw|x)$/i.test(sel)) {
    scannedPosition = 1;
  } else if (mandante.toLowerCase().includes(sel) || sel.includes(mandante.toLowerCase())) {
    scannedPosition = 0;
  } else if (visitante.toLowerCase().includes(sel) || sel.includes(visitante.toLowerCase())) {
    scannedPosition = 2;
  } else if (sel === "1") {
    scannedPosition = 0;
  } else if (sel === "2") {
    scannedPosition = 2;
  }

  if (scannedPosition === -1) return null;
  const legSelections: (string | null)[] = [mandante.toUpperCase(), "EMPATE", visitante.toUpperCase()];
  return { legSelections, scannedPosition };
}

/**
 * HANDICAP: "Team A -1.5" → generates "Team B +1.5" with inverted sign.
 */
function inferHandicapOpposite(
  scannedSelection: string,
  mandante: string | null,
  visitante: string | null
): string | null {
  if (!mandante || !visitante) return null;

  // Extract the handicap line value: "+1.5", "-0.25", etc.
  const match = scannedSelection.match(/([+-]?\d+[.,]?\d*)\s*$/);
  if (!match) return null;

  const lineStr = match[1].replace(",", ".");
  const lineValue = parseFloat(lineStr);
  if (isNaN(lineValue)) return null;

  // Determine which team was in the scanned selection
  const selLower = scannedSelection.toLowerCase();
  const mandanteLower = mandante.toLowerCase();
  const visitanteLower = visitante.toLowerCase();

  let oppositeTeam: string | null = null;

  if (selLower.includes(mandanteLower)) {
    oppositeTeam = visitante;
  } else if (selLower.includes(visitanteLower)) {
    oppositeTeam = mandante;
  }

  if (!oppositeTeam) return null;

  // Invert the sign
  const invertedValue = -lineValue;
  const sign = invertedValue >= 0 ? "+" : "";
  // Format: remove trailing zeros but keep .5, .25, .75
  const formatted = invertedValue % 1 === 0 ? invertedValue.toFixed(0) : invertedValue.toString();

  return `${oppositeTeam.toUpperCase()} ${sign}${formatted}`;
}

/**
 * DNB (Draw No Bet): 2-leg with Team A / Team B (no draw).
 */
function inferDnbOpposite(
  scannedSelection: string,
  mandante: string | null,
  visitante: string | null
): string | null {
  if (!mandante || !visitante) return null;

  const selLower = scannedSelection.toLowerCase().trim();

  if (selLower.includes(mandante.toLowerCase())) {
    return visitante.toUpperCase();
  } else if (selLower.includes(visitante.toLowerCase())) {
    return mandante.toUpperCase();
  }

  return null;
}

/**
 * Detects the market family from the mercado text.
 * Priority order matters — more specific patterns first.
 */
function detectMarketFamily(mercado: string): "MATCH_ODDS" | "MONEYLINE" | "TOTALS" | "TEAM_TOTALS" | "PLAYER_TOTALS" | "YES_NO" | "HANDICAP" | "DNB" | "RACE_TO" | "BINARY" | null {
  // Specific patterns first
  if (MATCH_ODDS_MARKET_PATTERN.test(mercado)) return "MATCH_ODDS";
  if (HANDICAP_MARKET_PATTERN.test(mercado)) return "HANDICAP";
  if (DNB_MARKET_PATTERN.test(mercado)) return "DNB";
  if (RACE_TO_MARKET_PATTERN.test(mercado)) return "RACE_TO";
  if (PLAYER_TOTALS_MARKET_PATTERN.test(mercado)) return "PLAYER_TOTALS";
  if (TEAM_TOTALS_MARKET_PATTERN.test(mercado)) return "TEAM_TOTALS";
  if (TOTALS_MARKET_PATTERN.test(mercado)) return "TOTALS";
  if (YES_NO_MARKET_PATTERN.test(mercado)) return "YES_NO";
  if (MONEYLINE_MARKET_PATTERN.test(mercado)) return "MONEYLINE";
  // Period markets inherit the sub-type (total, spread, winner)
  if (PERIOD_MARKET_PATTERN.test(mercado)) {
    // Check what kind of period market
    if (/total|over|under|mais|menos/i.test(mercado)) return "TOTALS";
    if (/spread|handicap/i.test(mercado)) return "HANDICAP";
    return "MONEYLINE"; // Period winner = 2-way
  }
  // Fallback: check if it's a known binary market
  const lowerMercado = mercado.toLowerCase();
  if (BINARY_MARKETS.some(m => lowerMercado.includes(m.toLowerCase()))) return "BINARY";
  return null;
}

export interface LegPrintData {
  parsedData: ParsedBetSlip | null;
  imagePreview: string | null;
  isProcessing: boolean;
  isInferred: boolean;
  inferredFrom: number | null; // Index of the leg from which line was inferred
  pendingData: NormalizationPendingData;
  /** Metadados do cálculo da odd real (baseada no ganho) */
  oddCalculation: OddCalculationResult | null;
}

export interface UseSurebetPrintImportReturn {
  legPrints: LegPrintData[];
  isProcessingAny: boolean;
  sharedContext: {
    esporte: string | null;
    evento: string | null;
    mercado: string | null;
  };
  processLegImage: (legIndex: number, file: File) => Promise<void>;
  processLegFromClipboard: (legIndex: number, event: ClipboardEvent) => Promise<void>;
  clearLegPrint: (legIndex: number) => void;
  clearAllPrints: () => void;
  initializeLegPrints: (numLegs: number) => void;
  applyLegData: (legIndex: number) => {
    odd: string;
    stake: string;
    selecaoLivre: string; // Line
  };
  canInferLine: (mercado: string) => boolean;
  getInferredLine: (sourceLine: string) => string | null;
  acceptInference: (legIndex: number) => void;
  rejectInference: (legIndex: number) => void;
  resolveMarketForSport: (legIndex: number, sport: string, availableOptions: string[]) => string;
  /** Retorna anomalia de data para uma perna específica */
  getLegDateAnomaly: (legIndex: number) => DateAnomalyResult | null;
  /** Verifica se anomalia de data de uma perna foi confirmada */
  isLegDateAnomalyConfirmed: (legIndex: number) => boolean;
  /** Confirma a anomalia de data de uma perna */
  confirmLegDateAnomaly: (legIndex: number) => void;
  /** Retorna metadados do cálculo de odd para uma perna */
  getLegOddCalculation: (legIndex: number) => OddCalculationResult | null;
}

const createEmptyLegPrint = (): LegPrintData => ({
  parsedData: null,
  imagePreview: null,
  isProcessing: false,
  isInferred: false,
  inferredFrom: null,
  pendingData: { mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null },
  oddCalculation: null,
});

export function useSurebetPrintImport(): UseSurebetPrintImportReturn {
  const [legPrints, setLegPrints] = useState<LegPrintData[]>([]);
  const [sharedContext, setSharedContext] = useState<{
    esporte: string | null;
    evento: string | null;
    mercado: string | null;
  }>({
    esporte: null,
    evento: null,
    mercado: null,
  });
  // ★ DETECÇÃO DE ANOMALIA TEMPORAL - Estado de confirmação por perna
  const [dateAnomalyConfirmed, setDateAnomalyConfirmed] = useState<Set<number>>(new Set());

  const initializeLegPrints = useCallback((numLegs: number) => {
    setLegPrints(Array.from({ length: numLegs }, createEmptyLegPrint));
    setSharedContext({ esporte: null, evento: null, mercado: null });
    setDateAnomalyConfirmed(new Set());
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Check if a market supports binary inference
  const canInferLine = useCallback((mercado: string): boolean => {
    if (!mercado) return false;
    const lowerMercado = mercado.toLowerCase();
    return BINARY_MARKETS.some(m => lowerMercado.includes(m.toLowerCase()));
  }, []);

  // Get inferred line from source line
  // Preserves prefix (team/player name) and suffix (stat type like "Points", "Assists")
  // Ex: "LAKERS OVER 112.5" → "LAKERS UNDER 112.5"
  // Ex: "LEBRON JAMES OVER 26.5 POINTS" → "LEBRON JAMES UNDER 26.5 POINTS"
  const getInferredLine = useCallback((sourceLine: string): string | null => {
    if (!sourceLine) return null;
    
    const lowerLine = sourceLine.toLowerCase().trim();
    
    // Check direct pairs — preserve prefix and suffix
    for (const [source, target] of Object.entries(BINARY_LINE_PAIRS)) {
      const sourceIndex = lowerLine.indexOf(source);
      if (sourceIndex !== -1) {
        // Extract prefix (everything before the keyword)
        const prefix = sourceLine.substring(0, sourceIndex).trim();
        // Extract everything after the keyword
        const afterKeyword = sourceLine.substring(sourceIndex + source.length).trim();
        
        // Build the inferred line preserving prefix and suffix
        const upperTarget = target.toUpperCase();
        const parts = [prefix, upperTarget, afterKeyword].filter(Boolean);
        return parts.join(" ");
      }
    }
    
    return null;
  }, []);

  // Try to infer line for other legs when one leg is processed
  const tryInferOtherLegs = useCallback((processedLegIndex: number, parsedData: ParsedBetSlip, currentMercado: string | null) => {
    const mercado = currentMercado || parsedData.mercado?.value;
    if (!mercado) return;

    const sourceLine = parsedData.selecao?.value;
    if (!sourceLine) return;

    const mandanteVal = parsedData.mandante?.value || "";
    const visitanteVal = parsedData.visitante?.value || "";
    const eventoVal = mandanteVal && visitanteVal ? `${mandanteVal} x ${visitanteVal}` : (mandanteVal || visitanteVal || "");
    const eventoConf = parsedData.mandante?.confidence || parsedData.visitante?.confidence || "none";

    const buildInferredLegData = (selecao: string): LegPrintData => ({
      parsedData: {
        mandante: parsedData.mandante,
        visitante: parsedData.visitante,
        evento: { value: eventoVal, confidence: eventoConf as "high" | "medium" | "low" | "none" },
        dataHora: parsedData.dataHora,
        esporte: parsedData.esporte,
        mercado: parsedData.mercado,
        selecao: { value: selecao, confidence: "medium" as const },
        odd: { value: null, confidence: "none" as const },
        stake: { value: null, confidence: "none" as const },
        retorno: { value: null, confidence: "none" as const },
        resultado: { value: null, confidence: "none" as const },
        bookmakerNome: { value: null, confidence: "none" as const },
      },
      imagePreview: null,
      isProcessing: false,
      isInferred: true,
      inferredFrom: processedLegIndex,
      pendingData: { mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null },
      oddCalculation: null,
    });

    const fillOtherLegs = (inferredSelection: string) => {
      setLegPrints(prev => prev.map((leg, idx) => {
        if (idx === processedLegIndex || leg.parsedData || leg.imagePreview) return leg;
        if (prev.length === 2) return buildInferredLegData(inferredSelection);
        return leg;
      }));
    };

    const family = detectMarketFamily(mercado);
    console.log(`[SurebetPrintInfer] Market: "${mercado}", Family: ${family || "UNKNOWN"}, Selection: "${sourceLine}"`);

    switch (family) {
      // ========== MATCH_ODDS / 1X2 (3-leg) ==========
      case "MATCH_ODDS": {
        const result = inferMatchOddsLegs(sourceLine, mandanteVal || null, visitanteVal || null);
        if (result) {
          console.log(`[SurebetPrintInfer] MATCH_ODDS: position=${result.scannedPosition}`);
          setLegPrints(prev => prev.map((leg, idx) => {
            if (idx === processedLegIndex || leg.parsedData || leg.imagePreview) return leg;
            const sel = result.legSelections[idx];
            return sel ? buildInferredLegData(sel) : leg;
          }));
        }
        return;
      }

      // ========== HANDICAP (2-leg: Team A -X → Team B +X) ==========
      case "HANDICAP": {
        const opposite = inferHandicapOpposite(sourceLine, mandanteVal || null, visitanteVal || null);
        if (opposite) {
          console.log(`[SurebetPrintInfer] HANDICAP: "${sourceLine}" → "${opposite}"`);
          fillOtherLegs(opposite);
        }
        return;
      }

      // ========== DNB (2-leg: Team A → Team B) ==========
      case "DNB": {
        const opposite = inferDnbOpposite(sourceLine, mandanteVal || null, visitanteVal || null);
        if (opposite) {
          console.log(`[SurebetPrintInfer] DNB: "${sourceLine}" → "${opposite}"`);
          fillOtherLegs(opposite);
        }
        return;
      }

      // ========== MONEYLINE / MATCH_WINNER (2-leg: Team A → Team B, no draw) ==========
      case "MONEYLINE":
      // ========== RACE_TO (2-leg: Team A → Team B) ==========
      case "RACE_TO": {
        const opposite = inferDnbOpposite(sourceLine, mandanteVal || null, visitanteVal || null);
        if (opposite) {
          console.log(`[SurebetPrintInfer] ${family}: "${sourceLine}" → "${opposite}"`);
          fillOtherLegs(opposite);
        }
        return;
      }

      // ========== TOTALS / TEAM_TOTALS / PLAYER_TOTALS / YES_NO / BINARY ==========
      case "TOTALS":
      case "TEAM_TOTALS":
      case "PLAYER_TOTALS":
      case "YES_NO":
      case "BINARY": {
        const inferredLine = getInferredLine(sourceLine);
        if (inferredLine) {
          console.log(`[SurebetPrintInfer] ${family}: "${sourceLine}" → "${inferredLine}"`);
          fillOtherLegs(inferredLine);
        }
        return;
      }

      default: {
        // Fallback: try binary inference anyway
        if (canInferLine(mercado)) {
          const inferredLine = getInferredLine(sourceLine);
          if (inferredLine) {
            console.log(`[SurebetPrintInfer] FALLBACK binary: "${sourceLine}" → "${inferredLine}"`);
            fillOtherLegs(inferredLine);
          }
        }
      }
    }
  }, [canInferLine, getInferredLine]);

  const processLegImage = useCallback(async (legIndex: number, file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida.");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Imagem muito grande. Máximo: 10MB");
      return;
    }

    // Set processing state
    setLegPrints(prev => {
      const updated = [...prev];
      if (updated[legIndex]) {
        updated[legIndex] = { 
          ...updated[legIndex], 
          isProcessing: true,
          isInferred: false,
          inferredFrom: null,
        };
      }
      return updated;
    });

    try {
      // Convert to base64
      const base64 = await fileToBase64(file);

      // Call the edge function (same as simple bet)
      const { data, error } = await supabase.functions.invoke("parse-betting-slip", {
        body: { imageBase64: base64 }
      });

      if (error) {
        console.error("Edge function error:", error);
        // Provide user-friendly error message instead of technical SDK message
        const userMessage = error.message?.includes("Failed to send")
          ? "Erro de conexão ao processar imagem. Verifique sua internet e tente novamente."
          : error.message || "Erro ao processar imagem";
        throw new Error(userMessage);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        const rawData = data.data;
        
        // ★ APLICAR PIPELINE DE NORMALIZAÇÃO (igual ao fluxo de aposta simples)
        const normalizationResult = normalizeOcrData(rawData);
        const normalizedData = normalizationResult.data as unknown as ParsedBetSlip;
        const pendingData = normalizationResult.pendingData;
        
        // ★ INTELIGÊNCIA DE ODD REAL: Calcular odd baseada no ganho liquidado
        const oddCalcResult = calcularOddReal(
          normalizedData.retorno?.value,  // Ganho total (mais confiável)
          normalizedData.stake?.value,    // Valor apostado
          normalizedData.odd?.value       // Odd exibida (apenas referência)
        );
        
        // Se a odd foi derivada do ganho, usar a odd real calculada
        if (oddCalcResult.metodo === "ODD_DERIVADA_DO_GANHO" && oddCalcResult.oddReal > 0) {
          const oddRealFormatted = formatOddDisplay(oddCalcResult.oddReal);
          normalizedData.odd = {
            value: oddRealFormatted,
            confidence: oddCalcResult.confianca
          };
          
          if (oddCalcResult.temDecimalOculta) {
            console.log(`[useSurebetPrintImport] ★ Perna ${legIndex + 1}: Odd real derivada do ganho:`, {
              oddExibida: oddCalcResult.oddExibida,
              oddReal: oddCalcResult.oddReal,
              diferenca: oddCalcResult.diferenca
            });
          }
        }
        
        // Update leg data with normalized data
        setLegPrints(prev => {
          const updated = [...prev];
          if (updated[legIndex]) {
            updated[legIndex] = {
              parsedData: normalizedData,
              imagePreview: base64,
              isProcessing: false,
              isInferred: false,
              inferredFrom: null,
              pendingData,
              oddCalculation: oddCalcResult,
            };
          }
          return updated;
        });

        // Update shared context - first valid print defines the global event
        // Regardless of which leg it comes from
        setSharedContext(prev => {
          const newContext = { ...prev };
          
          // Esporte: atualiza se não definido
          if (!prev.esporte && rawData.esporte?.value) {
            newContext.esporte = rawData.esporte.value;
          }
          
          // Evento: PRIMEIRO PRINT VÁLIDO define o evento global
          // O evento vem de mandante x visitante
          if (!prev.evento) {
            const mandante = rawData.mandante?.value;
            const visitante = rawData.visitante?.value;
            if (mandante && visitante) {
              newContext.evento = `${mandante} x ${visitante}`;
            } else if (mandante) {
              newContext.evento = mandante;
            } else if (visitante) {
              newContext.evento = visitante;
            }
          }
          
          // Mercado: atualiza se não definido
          if (!prev.mercado && rawData.mercado?.value) {
            newContext.mercado = rawData.mercado.value;
          }
          
          return newContext;
        });

        // Try to infer lines for other legs
        tryInferOtherLegs(legIndex, rawData, sharedContext.mercado);

        toast.success(`Perna ${legIndex + 1}: Print analisado com sucesso!`);
      } else {
        throw new Error("Resposta inválida do servidor");
      }
    } catch (error: any) {
      console.error("Error processing image:", error);
      toast.error(error.message || "Erro ao processar o print");
      
      // Reset processing state
      setLegPrints(prev => {
        const updated = [...prev];
        if (updated[legIndex]) {
          updated[legIndex] = { ...updated[legIndex], isProcessing: false };
        }
        return updated;
      });
    }
  }, [sharedContext.mercado, tryInferOtherLegs]);

  const processLegFromClipboard = useCallback(async (legIndex: number, event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          await processLegImage(legIndex, file);
          break;
        }
      }
    }
  }, [processLegImage]);

  const clearLegPrint = useCallback((legIndex: number) => {
    setLegPrints(prev => {
      const updated = [...prev];
      if (updated[legIndex]) {
        updated[legIndex] = createEmptyLegPrint();
      }
      return updated;
    });
  }, []);

  const clearAllPrints = useCallback(() => {
    setLegPrints(prev => prev.map(createEmptyLegPrint));
    setSharedContext({ esporte: null, evento: null, mercado: null });
  }, []);

  // Accept an inferred line (remove inference indicator)
  const acceptInference = useCallback((legIndex: number) => {
    setLegPrints(prev => {
      const updated = [...prev];
      if (updated[legIndex]) {
        updated[legIndex] = {
          ...updated[legIndex],
          isInferred: false,
          inferredFrom: null,
        };
      }
      return updated;
    });
  }, []);

  // Reject an inferred line (clear the leg data)
  const rejectInference = useCallback((legIndex: number) => {
    setLegPrints(prev => {
      const updated = [...prev];
      if (updated[legIndex]) {
        updated[legIndex] = createEmptyLegPrint();
      }
      return updated;
    });
  }, []);

  // Apply parsed data from a leg
  const applyLegData = useCallback((legIndex: number) => {
    const legPrint = legPrints[legIndex];
    if (!legPrint?.parsedData) {
      return { odd: "", stake: "", selecaoLivre: "" };
    }

    const parsedData = legPrint.parsedData;
    return {
      odd: parsedData.odd?.value || "",
      stake: parsedData.stake?.value || "",
      selecaoLivre: (parsedData.selecao?.value || "").toUpperCase(),
    };
  }, [legPrints]);

  // ★ NOVA FUNÇÃO: Resolver mercado para opções do dropdown (igual ao fluxo simples)
  const resolveMarketForSport = useCallback((legIndex: number, sport: string, availableOptions: string[]): string => {
    const legPrint = legPrints[legIndex];
    if (!legPrint?.pendingData?.mercadoIntencao && !legPrint?.pendingData?.mercadoRaw) {
      return "";
    }
    
    return resolveMarketFn(
      legPrint.pendingData,
      legPrint.parsedData?.selecao?.value,
      sport,
      availableOptions
    );
  }, [legPrints]);

  const isProcessingAny = legPrints.some(leg => leg.isProcessing);

  // ★ FUNÇÕES DE DETECÇÃO DE ANOMALIA TEMPORAL
  const getLegDateAnomaly = useCallback((legIndex: number): DateAnomalyResult | null => {
    const legPrint = legPrints[legIndex];
    if (!legPrint?.parsedData?.dataHora?.value) return null;
    const result = detectDateAnomaly(legPrint.parsedData.dataHora.value);
    return result.isAnomalous ? result : null;
  }, [legPrints]);

  const isLegDateAnomalyConfirmed = useCallback((legIndex: number): boolean => {
    return dateAnomalyConfirmed.has(legIndex);
  }, [dateAnomalyConfirmed]);

  const confirmLegDateAnomaly = useCallback((legIndex: number) => {
    setDateAnomalyConfirmed(prev => new Set([...prev, legIndex]));
    console.log(`[useSurebetPrintImport] Date anomaly confirmed for leg ${legIndex}`);
  }, []);

  const getLegOddCalculation = useCallback((legIndex: number): OddCalculationResult | null => {
    return legPrints[legIndex]?.oddCalculation ?? null;
  }, [legPrints]);

  return {
    legPrints,
    isProcessingAny,
    sharedContext,
    processLegImage,
    processLegFromClipboard,
    clearLegPrint,
    clearAllPrints,
    initializeLegPrints,
    applyLegData,
    canInferLine,
    getInferredLine,
    acceptInference,
    rejectInference,
    resolveMarketForSport,
    getLegDateAnomaly,
    isLegDateAnomalyConfirmed,
    confirmLegDateAnomaly,
    getLegOddCalculation,
  };
}
