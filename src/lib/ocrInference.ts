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
 * REGRA FINANCEIRA CRÍTICA: Normalização Won/Retorno
 * 
 * Muitas casas exibem "Won" como LUCRO LÍQUIDO (não retorno bruto).
 * Se o valor "Won" < stake, ele representa apenas o lucro.
 * 
 * Regra-mãe:
 *   Se won < stake → retorno_total = stake + won, odd_real = retorno_total / stake
 *   Se won >= stake → won É o retorno total
 * 
 * Adicionalmente, valida contra a odd exibida no print para confirmar.
 */
function normalizeRetornoAndOdd(data: NormalizedBetData): void {
  const stake = parseNumericValue(data.stake?.value ?? null);
  const retornoRaw = parseNumericValue(data.retorno?.value ?? null);
  const oddExibida = parseNumericValue(data.odd?.value ?? null);

  if (stake === null || retornoRaw === null || stake <= 0) return;

  let retornoReal = retornoRaw;
  let oddReal = oddExibida;

  if (retornoRaw < stake && retornoRaw > 0) {
    // "Won" is profit, not gross return
    retornoReal = stake + retornoRaw;
    oddReal = retornoReal / stake;
    
    console.log(`[ocrInference] Won→Lucro detected: won=${retornoRaw}, stake=${stake} → retorno_real=${retornoReal}, odd_real=${oddReal?.toFixed(4)}`);
    
    data.retorno = { value: retornoReal.toFixed(2), confidence: "high" };
    
    // Update odd if not already set or if calculated matches better
    if (oddReal) {
      // Cross-validate: if print shows odd and our calculation matches, high confidence
      if (oddExibida && Math.abs(oddReal - oddExibida) < 0.02) {
        console.log(`[ocrInference] Odd cross-validated: calculated=${oddReal.toFixed(4)}, print=${oddExibida}`);
      }
      data.odd = { value: oddReal.toFixed(2), confidence: "high" };
    }
  } else if (retornoRaw >= stake) {
    // "Won" is gross return — validate odd
    if (oddExibida && oddExibida > 1) {
      const expectedReturn = stake * oddExibida;
      if (Math.abs(retornoRaw - expectedReturn) < 1) {
        // Consistent: won = gross return matching odd * stake
        console.log(`[ocrInference] Won=Retorno bruto confirmed (matches odd)`);
      } else {
        // Won might still be profit even if > stake (rare high-odds case)
        const oddFromGross = retornoRaw / stake;
        const oddFromProfit = (stake + retornoRaw) / stake;
        
        // Pick whichever is closer to the displayed odd
        const diffGross = Math.abs(oddFromGross - oddExibida);
        const diffProfit = Math.abs(oddFromProfit - oddExibida);
        
        if (diffProfit < diffGross) {
          // Won is actually profit
          retornoReal = stake + retornoRaw;
          oddReal = retornoReal / stake;
          data.retorno = { value: retornoReal.toFixed(2), confidence: "high" };
          data.odd = { value: oddReal.toFixed(2), confidence: "high" };
          console.log(`[ocrInference] Won→Lucro (high odds): retorno_real=${retornoReal}, odd_real=${oddReal.toFixed(4)}`);
        }
      }
    }
  }
}

/**
 * Rules 5-8: Infer result from stake vs return comparison
 * - return > stake → Green
 * - return === 0 → Red
 * - 0 < return < stake → Half Red
 * - return === stake → Void
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
  } else if (Math.abs(retorno - stake) < 0.01) {
    resultado = "Void";
    confidence = "high";
  } else if (retorno > stake) {
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
  normalizeRetornoAndOdd(data);  // MUST run before inferResult
  inferResult(data);
  
  console.log("[ocrInference] Inference complete:", {
    esporte: data.esporte?.value,
    mercado: data.mercado?.value,
    selecao: data.selecao?.value,
    resultado: data.resultado?.value,
  });
}
