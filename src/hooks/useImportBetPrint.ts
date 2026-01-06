import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  findCanonicalMarket, 
  normalizeSport, 
  resolveMarketToOptions,
  getMarketsForSport
} from "@/lib/marketNormalizer";

export interface ParsedField {
  value: string | null;
  confidence: "high" | "medium" | "low" | "none";
}

export interface ParsedBetSlip {
  mandante: ParsedField;
  visitante: ParsedField;
  dataHora: ParsedField;
  esporte: ParsedField;
  mercado: ParsedField;
  selecao: ParsedField;
  odd: ParsedField;
  stake: ParsedField;
}

export type FieldsNeedingReview = {
  mandante: boolean;
  visitante: boolean;
  dataHora: boolean;
  esporte: boolean;
  mercado: boolean;
  selecao: boolean;
  odd: boolean;
  stake: boolean;
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
    mandante: string;
    visitante: string;
    dataHora: string;
    esporte: string;
    mercado: string;
    selecao: string;
    odd: string;
    stake: string;
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
        throw new Error(error.message || "Erro ao processar imagem");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        const rawData = data.data as ParsedBetSlip;
        
        // Normalize sport
        if (rawData.esporte?.value) {
          const sportResult = normalizeSport(rawData.esporte.value);
          rawData.esporte.value = sportResult.normalized;
          // Downgrade confidence if normalization was uncertain
          if (sportResult.confidence === "low" && rawData.esporte.confidence === "high") {
            rawData.esporte.confidence = "medium";
          }
        }
        
        // Normalize market and store intention for later resolution
        if (rawData.mercado?.value) {
          const marketRaw = rawData.mercado.value;
          const canonicalResult = findCanonicalMarket(marketRaw);
          
          // Store the intention for later resolution
          setPendingData({
            mercadoIntencao: canonicalResult.normalized,
            mercadoRaw: marketRaw,
            esporteDetectado: rawData.esporte?.value || null
          });
          
          // Set the normalized value
          rawData.mercado.value = canonicalResult.normalized;
          
          // Adjust confidence based on normalization
          if (canonicalResult.confidence === "low") {
            rawData.mercado.confidence = "low";
          } else if (canonicalResult.confidence === "medium" && rawData.mercado.confidence === "high") {
            rawData.mercado.confidence = "medium";
          }
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

  // Resolve market for a specific sport and available options
  const resolveMarketForSport = useCallback((sport: string, availableOptions: string[]): string => {
    if (!pendingData.mercadoIntencao && !pendingData.mercadoRaw) {
      return "";
    }
    
    // Use the raw market if intention is not set
    const marketToResolve = pendingData.mercadoIntencao || pendingData.mercadoRaw || "";
    
    // If no available options provided, get them from sport
    const options = availableOptions.length > 0 
      ? availableOptions 
      : getMarketsForSport(sport);
    
    const resolved = resolveMarketToOptions(marketToResolve, options);
    return resolved.normalized;
  }, [pendingData]);

  // Apply parsed data - ALWAYS fill fields, even with low confidence
  const applyParsedData = useCallback(() => {
    if (!parsedData) {
      return {
        mandante: "",
        visitante: "",
        dataHora: "",
        esporte: "",
        mercado: "",
        selecao: "",
        odd: "",
        stake: ""
      };
    }

    // CRITICAL CHANGE: Always fill if there's a value, regardless of confidence
    // The "Revisar" indicator is now ONLY a visual warning, NOT a block
    return {
      mandante: parsedData.mandante?.value || "",
      visitante: parsedData.visitante?.value || "",
      dataHora: parsedData.dataHora?.value || "",
      esporte: parsedData.esporte?.value || "",
      mercado: parsedData.mercado?.value || "",
      selecao: parsedData.selecao?.value || "",
      odd: parsedData.odd?.value || "",
      stake: parsedData.stake?.value || ""
    };
  }, [parsedData]);

  // Calculate which fields need review (medium or low confidence, but still filled)
  const fieldsNeedingReview: FieldsNeedingReview = {
    mandante: (parsedData?.mandante?.confidence === "medium" || parsedData?.mandante?.confidence === "low") && !!parsedData?.mandante?.value,
    visitante: (parsedData?.visitante?.confidence === "medium" || parsedData?.visitante?.confidence === "low") && !!parsedData?.visitante?.value,
    dataHora: (parsedData?.dataHora?.confidence === "medium" || parsedData?.dataHora?.confidence === "low") && !!parsedData?.dataHora?.value,
    esporte: (parsedData?.esporte?.confidence === "medium" || parsedData?.esporte?.confidence === "low") && !!parsedData?.esporte?.value,
    mercado: (parsedData?.mercado?.confidence === "medium" || parsedData?.mercado?.confidence === "low") && !!parsedData?.mercado?.value,
    selecao: (parsedData?.selecao?.confidence === "medium" || parsedData?.selecao?.confidence === "low") && !!parsedData?.selecao?.value,
    odd: (parsedData?.odd?.confidence === "medium" || parsedData?.odd?.confidence === "low") && !!parsedData?.odd?.value,
    stake: (parsedData?.stake?.confidence === "medium" || parsedData?.stake?.confidence === "low") && !!parsedData?.stake?.value,
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
