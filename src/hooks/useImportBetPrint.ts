import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

export type FieldsNeedingReview = {
  mandante: boolean;
  visitante: boolean;
  dataHora: boolean;
  esporte: boolean;
  mercado: boolean;
  selecao: boolean;
};

interface UseImportBetPrintReturn {
  isProcessing: boolean;
  parsedData: ParsedBetSlip | null;
  imagePreview: string | null;
  fieldsNeedingReview: FieldsNeedingReview;
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
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useImportBetPrint(): UseImportBetPrintReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedBetSlip | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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
        setParsedData(data.data);
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
  }, []);

  const applyParsedData = useCallback(() => {
    if (!parsedData) {
      return {
        mandante: "",
        visitante: "",
        dataHora: "",
        esporte: "",
        mercado: "",
        selecao: ""
      };
    }

    return {
      mandante: parsedData.mandante?.confidence !== "none" && parsedData.mandante?.value 
        ? parsedData.mandante.value 
        : "",
      visitante: parsedData.visitante?.confidence !== "none" && parsedData.visitante?.value 
        ? parsedData.visitante.value 
        : "",
      dataHora: parsedData.dataHora?.confidence !== "none" && parsedData.dataHora?.value 
        ? parsedData.dataHora.value 
        : "",
      esporte: parsedData.esporte?.confidence !== "none" && parsedData.esporte?.value 
        ? parsedData.esporte.value 
        : "",
      mercado: parsedData.mercado?.confidence !== "none" && parsedData.mercado?.value 
        ? parsedData.mercado.value 
        : "",
      selecao: parsedData.selecao?.confidence !== "none" && parsedData.selecao?.value 
        ? parsedData.selecao.value 
        : ""
    };
  }, [parsedData]);

  // Calculate which fields need review (medium or low confidence)
  const fieldsNeedingReview: FieldsNeedingReview = {
    mandante: parsedData?.mandante?.confidence === "medium" || parsedData?.mandante?.confidence === "low",
    visitante: parsedData?.visitante?.confidence === "medium" || parsedData?.visitante?.confidence === "low",
    dataHora: parsedData?.dataHora?.confidence === "medium" || parsedData?.dataHora?.confidence === "low",
    esporte: parsedData?.esporte?.confidence === "medium" || parsedData?.esporte?.confidence === "low",
    mercado: parsedData?.mercado?.confidence === "medium" || parsedData?.mercado?.confidence === "low",
    selecao: parsedData?.selecao?.confidence === "medium" || parsedData?.selecao?.confidence === "low",
  };

  return {
    isProcessing,
    parsedData,
    imagePreview,
    fieldsNeedingReview,
    processImage,
    processFromClipboard,
    clearParsedData,
    applyParsedData
  };
}
