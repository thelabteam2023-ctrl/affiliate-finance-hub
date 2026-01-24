import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  findCanonicalMarket, 
  normalizeSport, 
  resolveMarketToOptions,
  getMarketsForSport,
  normalizeMarketSemantically
} from "@/lib/marketNormalizer";
import { parseOcrMarket, resolveOcrResultToOption, formatSelectionFromOcrResult } from "@/lib/marketOcrParser";

export interface ParsedField {
  value: string | null;
  confidence: "high" | "medium" | "low" | "none";
}

export interface ParsedBetSlip {
  mandante: ParsedField;
  visitante: ParsedField;
  evento: ParsedField; // Campo unificado (mandante x visitante ou valor livre)
  dataHora: ParsedField;
  esporte: ParsedField;
  mercado: ParsedField;
  selecao: ParsedField;
  odd: ParsedField;
  stake: ParsedField;
  retorno: ParsedField;      // NEW: Valor de retorno potencial
  resultado: ParsedField;    // NEW: GREEN/RED/VOID ou null se pendente
  bookmakerNome: ParsedField; // NEW: Nome da casa de apostas identificada
}

export type FieldsNeedingReview = {
  evento: boolean; // Campo unificado
  dataHora: boolean;
  esporte: boolean;
  mercado: boolean;
  selecao: boolean;
  odd: boolean;
  stake: boolean;
  retorno: boolean;
  resultado: boolean;
  bookmakerNome: boolean;
};

// Store intended market value that may need to be resolved later
export interface PendingPrintData {
  mercadoIntencao: string | null;
  mercadoRaw: string | null;
  esporteDetectado: string | null;
}

interface UseImportBetPrintReturn {
  isProcessing: boolean;
  parsedData: ParsedBetSlip | null;
  imagePreview: string | null;
  fieldsNeedingReview: FieldsNeedingReview;
  pendingData: PendingPrintData;
  processImage: (file: File) => Promise<void>;
  processFromClipboard: (event: ClipboardEvent) => Promise<void>;
  clearParsedData: () => void;
  applyParsedData: () => {
    evento: string; // Campo unificado
    dataHora: string;
    esporte: string;
    mercado: string;
    selecao: string;
    odd: string;
    stake: string;
    retorno: string;
    resultado: string;
    bookmakerNome: string;
  };
  resolveMarketForSport: (sport: string, availableOptions: string[]) => string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useImportBetPrint(): UseImportBetPrintReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedBetSlip | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<PendingPrintData>({
    mercadoIntencao: null,
    mercadoRaw: null,
    esporteDetectado: null
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const processImage = useCallback(async (file: File) => {
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

    setIsProcessing(true);
    setParsedData(null);
    setPendingData({ mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null });

    try {
      // Convert to base64
      const base64 = await fileToBase64(file);
      setImagePreview(base64);

      // Call the edge function
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
        const rawData = data.data as ParsedBetSlip;
        
        // Criar campo evento unificado a partir de mandante/visitante
        const mandanteVal = rawData.mandante?.value || "";
        const visitanteVal = rawData.visitante?.value || "";
        const mandanteConf = rawData.mandante?.confidence || "none";
        const visitanteConf = rawData.visitante?.confidence || "none";
        
        // Calcular evento e sua confiança
        let eventoValue = "";
        let eventoConfidence: "high" | "medium" | "low" | "none" = "none";
        
        if (mandanteVal && visitanteVal) {
          eventoValue = `${mandanteVal} x ${visitanteVal}`;
          // Confiança do evento é a menor entre mandante e visitante
          const confOrder = { high: 3, medium: 2, low: 1, none: 0 };
          eventoConfidence = confOrder[mandanteConf] <= confOrder[visitanteConf] ? mandanteConf : visitanteConf;
        } else if (mandanteVal) {
          eventoValue = mandanteVal;
          eventoConfidence = mandanteConf;
        } else if (visitanteVal) {
          eventoValue = visitanteVal;
          eventoConfidence = visitanteConf;
        }
        
        rawData.evento = {
          value: eventoValue,
          confidence: eventoConfidence
        };
        
        // Normalize sport
        if (rawData.esporte?.value) {
          const sportResult = normalizeSport(rawData.esporte.value);
          rawData.esporte.value = sportResult.normalized;
          // Downgrade confidence if normalization was uncertain
          if (sportResult.confidence === "low" && rawData.esporte.confidence === "high") {
            rawData.esporte.confidence = "medium";
          }
        }
        
        // Normalize market using the NEW OCR parser (v2.0)
        if (rawData.mercado?.value) {
          const marketRaw = rawData.mercado.value;
          const sportDetected = rawData.esporte?.value || "Outro";
          const selectionRaw = rawData.selecao?.value || "";
          
          // Use the new OCR parser that extracts domain, side, line separately
          const ocrResult = parseOcrMarket(marketRaw, selectionRaw, sportDetected);
          
          // Store the intention for later resolution
          setPendingData({
            mercadoIntencao: ocrResult.displayName,
            mercadoRaw: marketRaw,
            esporteDetectado: sportDetected
          });
          
          // Set the normalized value
          rawData.mercado.value = ocrResult.displayName;
          
          // Adjust confidence based on OCR result
          if (ocrResult.confidence === "low") {
            rawData.mercado.confidence = "low";
          } else if (ocrResult.confidence === "medium" && rawData.mercado.confidence === "high") {
            rawData.mercado.confidence = "medium";
          }
          
          // Format selection if TOTAL or HANDICAP detected
          if ((ocrResult.type === "TOTAL" || ocrResult.type === "HANDICAP") && ocrResult.side && ocrResult.line !== undefined) {
            const formattedSelection = formatSelectionFromOcrResult(ocrResult);
            if (formattedSelection && rawData.selecao) {
              rawData.selecao.value = formattedSelection;
              // Improve confidence since we formatted it intelligently
              if (rawData.selecao.confidence === "low") {
                rawData.selecao.confidence = "medium";
              }
            }
          }
          
          console.log(`[OCR Market v2.0] Raw: "${marketRaw}", Selection: "${selectionRaw}" → ${ocrResult.type} (${ocrResult.displayName}) for sport ${sportDetected}`);
        }
        
        setParsedData(rawData);
        toast.success("Print analisado com sucesso!");
      } else {
        throw new Error("Resposta inválida do servidor");
      }
    } catch (error: any) {
      console.error("Error processing image:", error);
      toast.error(error.message || "Erro ao processar o print");
      setImagePreview(null);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const processFromClipboard = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          await processImage(file);
          break;
        }
      }
    }
  }, [processImage]);

  const clearParsedData = useCallback(() => {
    setParsedData(null);
    setImagePreview(null);
    setPendingData({ mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null });
  }, []);

  // Resolve market for a specific sport and available options (using new OCR parser v2.0)
  const resolveMarketForSport = useCallback((sport: string, availableOptions: string[]): string => {
    if (!pendingData.mercadoIntencao && !pendingData.mercadoRaw) {
      return "";
    }
    
    // Use the raw market and selection for OCR analysis
    const marketRaw = pendingData.mercadoRaw || pendingData.mercadoIntencao || "";
    const selectionValue = parsedData?.selecao?.value || "";
    
    // Use the new OCR parser with sport context
    const ocrResult = parseOcrMarket(marketRaw, selectionValue, sport);
    
    // If no available options provided, get them from sport
    const options = availableOptions.length > 0 
      ? availableOptions 
      : getMarketsForSport(sport);
    
    // Resolve OCR result to an available option
    const resolved = resolveOcrResultToOption(ocrResult, options);
    
    console.log(`[resolveMarketForSport v2.0] Raw: "${marketRaw}" (sel: "${selectionValue}") → ${ocrResult.type} → "${resolved}" for ${sport}`);
    
    return resolved;
  }, [pendingData, parsedData]);

  // Apply parsed data - ALWAYS fill fields, even with low confidence
  const applyParsedData = useCallback(() => {
    if (!parsedData) {
      return {
        evento: "",
        dataHora: "",
        esporte: "",
        mercado: "",
        selecao: "",
        odd: "",
        stake: "",
        retorno: "",
        resultado: "",
        bookmakerNome: ""
      };
    }

    // CRITICAL CHANGE: Always fill if there's a value, regardless of confidence
    // The "Revisar" indicator is now ONLY a visual warning, NOT a block
    return {
      evento: parsedData.evento?.value || "",
      dataHora: parsedData.dataHora?.value || "",
      esporte: parsedData.esporte?.value || "",
      mercado: parsedData.mercado?.value || "",
      selecao: parsedData.selecao?.value || "",
      odd: parsedData.odd?.value || "",
      stake: parsedData.stake?.value || "",
      retorno: parsedData.retorno?.value || "",
      resultado: parsedData.resultado?.value || "",
      bookmakerNome: parsedData.bookmakerNome?.value || ""
    };
  }, [parsedData]);

  // Calculate which fields need review (medium or low confidence, but still filled)
  const fieldsNeedingReview: FieldsNeedingReview = {
    evento: (parsedData?.evento?.confidence === "medium" || parsedData?.evento?.confidence === "low") && !!parsedData?.evento?.value,
    dataHora: (parsedData?.dataHora?.confidence === "medium" || parsedData?.dataHora?.confidence === "low") && !!parsedData?.dataHora?.value,
    esporte: (parsedData?.esporte?.confidence === "medium" || parsedData?.esporte?.confidence === "low") && !!parsedData?.esporte?.value,
    mercado: (parsedData?.mercado?.confidence === "medium" || parsedData?.mercado?.confidence === "low") && !!parsedData?.mercado?.value,
    selecao: (parsedData?.selecao?.confidence === "medium" || parsedData?.selecao?.confidence === "low") && !!parsedData?.selecao?.value,
    odd: (parsedData?.odd?.confidence === "medium" || parsedData?.odd?.confidence === "low") && !!parsedData?.odd?.value,
    stake: (parsedData?.stake?.confidence === "medium" || parsedData?.stake?.confidence === "low") && !!parsedData?.stake?.value,
    retorno: (parsedData?.retorno?.confidence === "medium" || parsedData?.retorno?.confidence === "low") && !!parsedData?.retorno?.value,
    resultado: (parsedData?.resultado?.confidence === "medium" || parsedData?.resultado?.confidence === "low") && !!parsedData?.resultado?.value,
    bookmakerNome: (parsedData?.bookmakerNome?.confidence === "medium" || parsedData?.bookmakerNome?.confidence === "low") && !!parsedData?.bookmakerNome?.value,
  };

  return {
    isProcessing,
    parsedData,
    imagePreview,
    fieldsNeedingReview,
    pendingData,
    processImage,
    processFromClipboard,
    clearParsedData,
    applyParsedData,
    resolveMarketForSport
  };
}
