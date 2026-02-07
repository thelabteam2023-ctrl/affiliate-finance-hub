/**
 * OCR Inference Module v1.0
 * 
 * Regras de inferência pós-OCR para enriquecer dados extraídos de prints.
 * Aplica lógica de negócio para deduzir campos ausentes ou de baixa confiança.
 */

import type { ParsedField, NormalizedBetData } from "./ocrNormalization";

// ========================================================================
// HELPERS
// ========================================================================

function parseNumericValue(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,\-]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractTeams(evento: string | null): { mandante: string; visitante: string } | null {
  if (!evento) return null;
  // Matches "Team A x Team B", "Team A - Team B", "Team A vs Team B"
  const match = evento.match(/^(.+?)\s*(?:x|vs\.?|\-|–|—)\s*(.+)$/i);
  if (!match) return null;
  return { mandante: match[1].trim(), visitante: match[2].trim() };
}

function hasScoreLikeResult(resultado: string | null): boolean {
  if (!resultado) return false;
  // Matches patterns like "3:2", "3-2", "3 x 2", "3 - 2"
  return /\d+\s*[:\-xX]\s*\d+/.test(resultado);
}

// ========================================================================
// INFERENCE RULES
// ========================================================================

/**
 * Rule 1: If event is "Team A x Team B" and there's a final score → Sport = Futebol
 */
function inferSport(data: NormalizedBetData): void {
  if (data.esporte?.value && data.esporte.confidence !== "none" && data.esporte.confidence !== "low") {
    return; // Already has a confident sport
  }

  const teams = extractTeams(data.evento?.value ?? null);
  const hasScore = hasScoreLikeResult(data.resultado?.value ?? null);

  if (teams && hasScore) {
    data.esporte = { value: "Futebol", confidence: "medium" };
    console.log("[ocrInference] Inferred sport: Futebol (team format + score)");
  }
}

/**
 * Rule 2: If choice is one of the teams and no handicap/total keywords → Market = 1x2
 * Rule 3: If choice is "X" → Line = Empate
 * Rule 4: Line always represents the choice within the market
 */
function inferMarketAndLine(data: NormalizedBetData): void {
  const selecao = data.selecao?.value?.trim() ?? "";
  const mercado = data.mercado?.value?.trim() ?? "";
  const evento = data.evento?.value ?? "";

  if (!selecao) return;

  const teams = extractTeams(evento);
  const hasHandicapKeyword = /handicap|spread|hcap|hdp/i.test(mercado) || /handicap|spread|hcap|hdp/i.test(selecao);
  const hasTotalKeyword = /total|over|under|mais|menos|acima|abaixo|o\/u/i.test(mercado) || /total|over|under|mais|menos/i.test(selecao);

  // Check if selection is one of the teams
  const selecaoLower = selecao.toLowerCase();
  const isTeamSelection = teams && (
    teams.mandante.toLowerCase() === selecaoLower ||
    teams.visitante.toLowerCase() === selecaoLower ||
    teams.mandante.toLowerCase().includes(selecaoLower) ||
    teams.visitante.toLowerCase().includes(selecaoLower) ||
    selecaoLower.includes(teams.mandante.toLowerCase()) ||
    selecaoLower.includes(teams.visitante.toLowerCase())
  );

  // Rule 3: If choice is "X" or "Empate" → market = 1x2, line = Empate
  if (/^(x|empate|draw)$/i.test(selecao)) {
    if (!mercado || data.mercado?.confidence === "none" || data.mercado?.confidence === "low") {
      data.mercado = { value: "1x2", confidence: "medium" };
      console.log("[ocrInference] Inferred market: 1x2 (draw selection)");
    }
    data.selecao = { value: "Empate", confidence: "medium" };
    console.log("[ocrInference] Inferred line: Empate");
    return;
  }

  // Rule 2: Team selection without handicap/total → 1x2
  if (isTeamSelection && !hasHandicapKeyword && !hasTotalKeyword) {
    if (!mercado || data.mercado?.confidence === "none" || data.mercado?.confidence === "low") {
      data.mercado = { value: "1x2", confidence: "medium" };
      console.log("[ocrInference] Inferred market: 1x2 (team selection, no handicap/total)");
    }
  }
}

/**
 * Rules 5-8: Infer result from stake vs return comparison
 * - return > stake → Green
 * - return === 0 → Red
 * - 0 < return < stake → Half Red
 * - return === stake → Void
 * - stake < return < full_payout → Half Green (rare, handled via odd comparison)
 */
function inferResult(data: NormalizedBetData): void {
  // Only infer if result is missing or low confidence
  if (data.resultado?.value && data.resultado.confidence !== "none" && data.resultado.confidence !== "low") {
    return;
  }

  const stake = parseNumericValue(data.stake?.value ?? null);
  const retorno = parseNumericValue(data.retorno?.value ?? null);
  const odd = parseNumericValue(data.odd?.value ?? null);

  if (stake === null || retorno === null) return;
  if (stake <= 0) return;

  let resultado: string;
  let confidence: "high" | "medium" = "medium";

  if (retorno === 0) {
    resultado = "Red";
    confidence = "high";
  } else if (retorno === stake) {
    resultado = "Void";
    confidence = "high";
  } else if (retorno > stake) {
    // Check if it's a full win or half win
    if (odd !== null && odd > 1) {
      const expectedFullReturn = stake * odd;
      const ratio = retorno / expectedFullReturn;
      if (ratio >= 0.95) {
        resultado = "Green";
        confidence = "high";
      } else {
        resultado = "Half Green";
        confidence = "medium";
      }
    } else {
      resultado = "Green";
      confidence = "medium";
    }
  } else {
    // 0 < retorno < stake → Half Red
    resultado = "Half Red";
    confidence = "medium";
  }

  data.resultado = { value: resultado, confidence };
  console.log(`[ocrInference] Inferred result: ${resultado} (stake=${stake}, retorno=${retorno})`);
}

// ========================================================================
// MAIN INFERENCE PIPELINE
// ========================================================================

/**
 * Applies all inference rules to enrich OCR-extracted data.
 * Mutates the data object in place.
 */
export function applyInferenceRules(data: NormalizedBetData): void {
  console.log("[ocrInference] Applying inference rules...");
  
  inferSport(data);
  inferMarketAndLine(data);
  inferResult(data);
  
  console.log("[ocrInference] Inference complete:", {
    esporte: data.esporte?.value,
    mercado: data.mercado?.value,
    selecao: data.selecao?.value,
    resultado: data.resultado?.value,
  });
}
