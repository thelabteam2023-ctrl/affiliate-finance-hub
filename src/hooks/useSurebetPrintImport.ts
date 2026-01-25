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

export interface LegPrintData {
  parsedData: ParsedBetSlip | null;
  imagePreview: string | null;
  isProcessing: boolean;
  isInferred: boolean;
  inferredFrom: number | null; // Index of the leg from which line was inferred
  pendingData: NormalizationPendingData;
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
}

const createEmptyLegPrint = (): LegPrintData => ({
  parsedData: null,
  imagePreview: null,
  isProcessing: false,
  isInferred: false,
  inferredFrom: null,
  pendingData: { mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null },
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

  const initializeLegPrints = useCallback((numLegs: number) => {
    setLegPrints(Array.from({ length: numLegs }, createEmptyLegPrint));
    setSharedContext({ esporte: null, evento: null, mercado: null });
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
    // Only infer for binary markets
    const mercado = currentMercado || parsedData.mercado?.value;
    if (!mercado || !canInferLine(mercado)) return;

    const sourceLine = parsedData.selecao?.value;
    if (!sourceLine) return;

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
        // For 3-leg model, only infer if there's a clear binary relationship
        if (prev.length === 2) {
          // Construir evento a partir de mandante/visitante se disponível
          const mandanteVal = parsedData.mandante?.value || "";
          const visitanteVal = parsedData.visitante?.value || "";
          const eventoVal = mandanteVal && visitanteVal ? `${mandanteVal} x ${visitanteVal}` : (mandanteVal || visitanteVal || "");
          const eventoConf = parsedData.mandante?.confidence || parsedData.visitante?.confidence || "none";
          
          return {
            ...leg,
            parsedData: {
              mandante: parsedData.mandante,
              visitante: parsedData.visitante,
              evento: { value: eventoVal, confidence: eventoConf as "high" | "medium" | "low" | "none" },
              dataHora: parsedData.dataHora,
              esporte: parsedData.esporte,
              mercado: parsedData.mercado,
              selecao: { value: inferredLine, confidence: "medium" as const },
              odd: { value: null, confidence: "none" as const },
              stake: { value: null, confidence: "none" as const },
              retorno: { value: null, confidence: "none" as const },
              resultado: { value: null, confidence: "none" as const },
              bookmakerNome: { value: null, confidence: "none" as const },
            },
            isInferred: true,
            inferredFrom: processedLegIndex,
            pendingData: { mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null },
          };
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
            };
          }
          return updated;
        });

        // Update shared context from first print if not set
        setSharedContext(prev => {
          const newContext = { ...prev };
          if (!prev.esporte && rawData.esporte?.value) {
            newContext.esporte = rawData.esporte.value;
          }
          if (!prev.evento && rawData.mandante?.value && rawData.visitante?.value) {
            newContext.evento = `${rawData.mandante.value} x ${rawData.visitante.value}`;
          }
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
  };
}
