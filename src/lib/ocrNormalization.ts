/**
 * OCR Normalization Module v1.0
 * 
 * Módulo centralizado para normalização de dados extraídos do OCR.
 * Este módulo é compartilhado por TODOS os hooks de importação de print:
 * - useImportBetPrint (apostas simples)
 * - useImportMultiplaBetPrint (apostas múltiplas)
 * - useSurebetPrintImport (surebets/arbitragem)
 * 
 * Garante consistência de resultados independente do formulário.
 */

import { 
  normalizeSport, 
  getMarketsForSport
} from "@/lib/marketNormalizer";
import { 
  parseOcrMarket, 
  resolveOcrResultToOption, 
  formatSelectionFromOcrResult,
  type OcrMarketResult 
} from "@/lib/marketOcrParser";

// ========================================================================
// INTERFACES
// ========================================================================

export interface ParsedField {
  value: string | null;
  confidence: "high" | "medium" | "low" | "none";
}

export interface NormalizedBetData {
  evento: ParsedField;
  mandante: ParsedField;
  visitante: ParsedField;
  dataHora: ParsedField;
  esporte: ParsedField;
  mercado: ParsedField;
  selecao: ParsedField;
  odd: ParsedField;
  stake: ParsedField;
  retorno: ParsedField;
  resultado: ParsedField;
  bookmakerNome: ParsedField;
}

export interface NormalizationPendingData {
  mercadoIntencao: string | null;
  mercadoRaw: string | null;
  esporteDetectado: string | null;
}

export interface NormalizationResult {
  data: NormalizedBetData;
  pendingData: NormalizationPendingData;
  ocrResult: OcrMarketResult | null;
}

// ========================================================================
// CORE NORMALIZATION FUNCTIONS
// ========================================================================

/**
 * Normaliza o esporte detectado pelo OCR
 */
export function normalizeDetectedSport(
  rawSport: string | null | undefined
): { normalized: string; confidence: "high" | "medium" | "low" | "none" } {
  if (!rawSport) {
    return { normalized: "", confidence: "none" };
  }
  
  const result = normalizeSport(rawSport);
  return {
    normalized: result.normalized,
    confidence: result.confidence as "high" | "medium" | "low" | "none"
  };
}

/**
 * Normaliza o mercado detectado pelo OCR usando o parser avançado
 */
export function normalizeDetectedMarket(
  rawMarket: string | null | undefined,
  rawSelection: string | null | undefined,
  sport: string
): {
  displayName: string;
  confidence: "exact" | "high" | "medium" | "low";
  ocrResult: OcrMarketResult;
} {
  const marketText = rawMarket || "";
  const selectionText = rawSelection || "";
  
  const ocrResult = parseOcrMarket(marketText, selectionText, sport);
  
  return {
    displayName: ocrResult.displayName,
    confidence: ocrResult.confidence,
    ocrResult
  };
}

/**
 * Formata a seleção baseada no resultado do OCR
 */
export function formatSelection(ocrResult: OcrMarketResult): string {
  return formatSelectionFromOcrResult(ocrResult);
}

/**
 * Resolve o mercado para uma opção disponível no dropdown
 */
export function resolveMarketToOption(
  ocrResult: OcrMarketResult,
  availableOptions: string[]
): string {
  return resolveOcrResultToOption(ocrResult, availableOptions);
}

/**
 * Constrói o campo evento unificado a partir de mandante/visitante
 */
export function buildEventoField(
  mandante: ParsedField | null | undefined,
  visitante: ParsedField | null | undefined
): ParsedField {
  const mandanteVal = mandante?.value || "";
  const visitanteVal = visitante?.value || "";
  const mandanteConf = mandante?.confidence || "none";
  const visitanteConf = visitante?.confidence || "none";
  
  let eventoValue = "";
  let eventoConfidence: "high" | "medium" | "low" | "none" = "none";
  
  if (mandanteVal && visitanteVal) {
    eventoValue = `${mandanteVal} x ${visitanteVal}`;
    const confOrder = { high: 3, medium: 2, low: 1, none: 0 };
    eventoConfidence = confOrder[mandanteConf] <= confOrder[visitanteConf] 
      ? mandanteConf 
      : visitanteConf;
  } else if (mandanteVal) {
    eventoValue = mandanteVal;
    eventoConfidence = mandanteConf;
  } else if (visitanteVal) {
    eventoValue = visitanteVal;
    eventoConfidence = visitanteConf;
  }
  
  return { value: eventoValue, confidence: eventoConfidence };
}

// ========================================================================
// PIPELINE PRINCIPAL
// ========================================================================

/**
 * Pipeline completo de normalização de dados OCR
 * Aplica todas as transformações de forma consistente
 */
export function normalizeOcrData(rawData: any): NormalizationResult {
  // Clonar dados para não mutar o original
  const data: NormalizedBetData = {
    mandante: rawData.mandante || { value: null, confidence: "none" },
    visitante: rawData.visitante || { value: null, confidence: "none" },
    evento: rawData.evento || { value: null, confidence: "none" },
    dataHora: rawData.dataHora || { value: null, confidence: "none" },
    esporte: rawData.esporte || { value: null, confidence: "none" },
    mercado: rawData.mercado || { value: null, confidence: "none" },
    selecao: rawData.selecao || { value: null, confidence: "none" },
    odd: rawData.odd || { value: null, confidence: "none" },
    stake: rawData.stake || { value: null, confidence: "none" },
    retorno: rawData.retorno || { value: null, confidence: "none" },
    resultado: rawData.resultado || { value: null, confidence: "none" },
    bookmakerNome: rawData.bookmakerNome || { value: null, confidence: "none" },
  };
  
  let pendingData: NormalizationPendingData = {
    mercadoIntencao: null,
    mercadoRaw: null,
    esporteDetectado: null
  };
  
  let ocrResult: OcrMarketResult | null = null;
  
  // 1. CONSTRUIR EVENTO UNIFICADO
  data.evento = buildEventoField(data.mandante, data.visitante);
  
  // 2. NORMALIZAR ESPORTE
  if (data.esporte?.value) {
    const sportNorm = normalizeDetectedSport(data.esporte.value);
    data.esporte.value = sportNorm.normalized;
    
    // Ajustar confiança se necessário
    if (sportNorm.confidence === "low" && data.esporte.confidence === "high") {
      data.esporte.confidence = "medium";
    }
  }
  
  // 3. NORMALIZAR MERCADO
  if (data.mercado?.value) {
    const marketRaw = data.mercado.value;
    const sportDetected = data.esporte?.value || "Outro";
    const selectionRaw = data.selecao?.value || "";
    
    const marketNorm = normalizeDetectedMarket(marketRaw, selectionRaw, sportDetected);
    ocrResult = marketNorm.ocrResult;
    
    // Atualizar pendingData
    pendingData = {
      mercadoIntencao: marketNorm.displayName,
      mercadoRaw: marketRaw,
      esporteDetectado: sportDetected
    };
    
    // Atualizar mercado
    data.mercado.value = marketNorm.displayName;
    
    // Ajustar confiança
    if (marketNorm.confidence === "low") {
      data.mercado.confidence = "low";
    } else if (marketNorm.confidence === "medium" && data.mercado.confidence === "high") {
      data.mercado.confidence = "medium";
    }
    
    // 4. FORMATAR SELEÇÃO SE APLICÁVEL
    if (
      ocrResult && 
      (ocrResult.type === "TOTAL" || ocrResult.type === "HANDICAP") && 
      ocrResult.side && 
      ocrResult.line !== undefined
    ) {
      const formattedSelection = formatSelection(ocrResult);
      if (formattedSelection && data.selecao) {
        data.selecao.value = formattedSelection;
        if (data.selecao.confidence === "low") {
          data.selecao.confidence = "medium";
        }
      }
    }
  }
  
  console.log("[ocrNormalization] Pipeline complete:", {
    evento: data.evento.value,
    esporte: data.esporte.value,
    mercado: data.mercado.value,
    selecao: data.selecao.value,
    pendingData
  });
  
  return { data, pendingData, ocrResult };
}

/**
 * Resolve mercado para opções disponíveis em um dropdown
 */
export function resolveMarketForSport(
  pendingData: NormalizationPendingData,
  parsedSelecao: string | null | undefined,
  sport: string,
  availableOptions: string[]
): string {
  if (!pendingData.mercadoIntencao && !pendingData.mercadoRaw) {
    return "";
  }
  
  const marketRaw = pendingData.mercadoRaw || pendingData.mercadoIntencao || "";
  const selectionValue = parsedSelecao || "";
  const ocrResult = parseOcrMarket(marketRaw, selectionValue, sport);
  
  const options = availableOptions.length > 0 
    ? availableOptions 
    : getMarketsForSport(sport);
  
  const resolved = resolveOcrResultToOption(ocrResult, options);
  
  console.log(`[resolveMarketForSport] "${marketRaw}" → "${resolved}" for ${sport}`);
  
  return resolved;
}
