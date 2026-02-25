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

// Binary markets that support smart line inference
const BINARY_MARKETS = [
  "Over/Under",
  "Ambas Marcam",
  "BTTS",
  "Sim/Não",
  "Yes/No",
  "Over",
  "Under",
  "Sim",
  "Não",
  "Yes",
  "No",
  "Total de Gols",
  "Total de Pontos",
  "Total de Games",
  "Total de Sets",
];

// Mapping of binary line pairs (both directions)
const BINARY_LINE_PAIRS: Record<string, string> = {
  // Over/Under
  "over": "under",
  "under": "over",
  "mais": "menos",
  "menos": "mais",
  // Sim/Não
  "sim": "não",
  "não": "sim",
  "yes": "no",
  "no": "yes",
  // BTTS
  "ambas marcam sim": "ambas marcam não",
  "ambas marcam não": "ambas marcam sim",
  "btts sim": "btts não",
  "btts não": "btts sim",
};

// MATCH_ODDS / 1X2 market detection pattern (same taxonomy as marketOcrParser.ts)
const MATCH_ODDS_MARKET_PATTERN = /(?:1\s*[x×X]\s*2|[1Il]\s*[xX×]\s*2|match\s*odds?|resultado\s*(?:da\s*)?(?:partida|final)|final\s*(?:da|de)\s*partida|full\s*time\s*result|ft\s*result|tres\s*vias|três\s*vias|three\s*way|vencedor\s*(?:da\s*)?(?:partida|match)|match\s*(?:winner|result)|main\s*line)/i;

/**
 * For a MATCH_ODDS market, determines which canonical position (0=Home, 1=Draw, 2=Away)
 * the scanned selection corresponds to, and returns the selections for ALL 3 legs.
 */
function inferMatchOddsLegs(
  scannedSelection: string,
  mandante: string | null,
  visitante: string | null
): { legSelections: (string | null)[]; scannedPosition: number } | null {
  if (!mandante || !visitante) return null;

  const sel = scannedSelection.toLowerCase().trim();

  // Determine which position was scanned
  let scannedPosition = -1;

  // Check for Draw
  if (/^(empate|draw|x)$/i.test(sel)) {
    scannedPosition = 1;
  }
  // Check for Home team
  else if (mandante.toLowerCase().includes(sel) || sel.includes(mandante.toLowerCase())) {
    scannedPosition = 0;
  }
  // Check for Away team
  else if (visitante.toLowerCase().includes(sel) || sel.includes(visitante.toLowerCase())) {
    scannedPosition = 2;
  }
  // Selection "1" = Home, "2" = Away
  else if (sel === "1") {
    scannedPosition = 0;
  } else if (sel === "2") {
    scannedPosition = 2;
  }

  if (scannedPosition === -1) return null;

  // Build the 3 canonical selections
  const legSelections: (string | null)[] = [mandante, "Empate", visitante];

  return { legSelections, scannedPosition };
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
  const getInferredLine = useCallback((sourceLine: string): string | null => {
    if (!sourceLine) return null;
    
    const lowerLine = sourceLine.toLowerCase().trim();
    
    // Check direct pairs
    for (const [source, target] of Object.entries(BINARY_LINE_PAIRS)) {
      if (lowerLine.includes(source)) {
        // Extract the numeric part (e.g., "2.5" from "Over 2.5")
        const numMatch = sourceLine.match(/[\d.,]+/);
        const numPart = numMatch ? ` ${numMatch[0]}` : "";
        
        // Capitalize first letter of target
        const capitalizedTarget = target.charAt(0).toUpperCase() + target.slice(1);
        return capitalizedTarget + numPart;
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

    // ========== MATCH_ODDS / 1X2 inference (3-leg) ==========
    if (MATCH_ODDS_MARKET_PATTERN.test(mercado)) {
      const result = inferMatchOddsLegs(sourceLine, mandanteVal || null, visitanteVal || null);
      if (result) {
        console.log(`[SurebetPrintInfer] MATCH_ODDS detected. Scanned position: ${result.scannedPosition}. Filling other legs.`);
        setLegPrints(prev => {
          return prev.map((leg, idx) => {
            // Skip the processed leg and legs that already have data
            if (idx === processedLegIndex || leg.parsedData || leg.imagePreview) {
              return leg;
            }
            // Only fill if we have a selection for this position
            const sel = result.legSelections[idx];
            if (sel) {
              return buildInferredLegData(sel);
            }
            return leg;
          });
        });
        return; // Done — don't fall through to binary inference
      }
    }

    // ========== Binary market inference (2-leg) ==========
    if (!canInferLine(mercado)) return;

    const inferredLine = getInferredLine(sourceLine);
    if (!inferredLine) return;

    // Update other legs that don't have a print yet
    setLegPrints(prev => {
      return prev.map((leg, idx) => {
        // Skip the processed leg and legs that already have data
        if (idx === processedLegIndex || leg.parsedData || leg.imagePreview) {
          return leg;
        }

        // For 2-leg model, infer the other leg
        if (prev.length === 2) {
          return buildInferredLegData(inferredLine);
        }

        return leg;
      });
    });
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
      selecaoLivre: parsedData.selecao?.value || "",
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
