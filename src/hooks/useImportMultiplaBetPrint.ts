import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ParsedField {
  value: string | null;
  confidence: "high" | "medium" | "low" | "none";
}

export interface ParsedSelecao {
  evento: ParsedField;
  selecao: ParsedField;
  odd: ParsedField;
}

export interface ParsedMultiplaBetSlip {
  tipo: ParsedField; // "dupla" or "tripla"
  stake: ParsedField;
  retornoPotencial: ParsedField;
  selecoes: ParsedSelecao[];
}

export interface MultiplaPrintFieldsNeedingReview {
  tipo: boolean;
  stake: boolean;
  selecoes: { evento: boolean; selecao: boolean; odd: boolean }[];
}

interface UseImportMultiplaBetPrintReturn {
  isProcessing: boolean;
  parsedData: ParsedMultiplaBetSlip | null;
  imagePreview: string | null;
  fieldsNeedingReview: MultiplaPrintFieldsNeedingReview;
  processImage: (file: File) => Promise<void>;
  processFromClipboard: (event: ClipboardEvent) => Promise<void>;
  clearParsedData: () => void;
  applyParsedData: () => {
    tipo: "DUPLA" | "TRIPLA";
    stake: string;
    selecoes: { descricao: string; odd: string }[];
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useImportMultiplaBetPrint(): UseImportMultiplaBetPrintReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedMultiplaBetSlip | null>(null);
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

      // Call the edge function with multipla mode
      const { data, error } = await supabase.functions.invoke("parse-betting-slip", {
        body: { imageBase64: base64, mode: "multipla" }
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
        const rawData = data.data as ParsedMultiplaBetSlip;
        
        // Ensure we have at least 2 selections
        if (!rawData.selecoes || rawData.selecoes.length < 2) {
          throw new Error("Não foi possível detectar seleções suficientes no print. Mínimo: 2 seleções.");
        }
        
        setParsedData(rawData);
        
        const numSelecoes = rawData.selecoes.length;
        const tipo = numSelecoes >= 3 ? "Tripla" : "Dupla";
        toast.success(`Print analisado! Detectado: ${tipo} (${numSelecoes} seleções)`);
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

  // Apply parsed data - ALWAYS fill fields, even with low confidence
  const applyParsedData = useCallback(() => {
    if (!parsedData) {
      return {
        tipo: "DUPLA" as const,
        stake: "",
        selecoes: [
          { descricao: "", odd: "" },
          { descricao: "", odd: "" }
        ]
      };
    }

    // Determine tipo based on number of selections
    const numSelecoes = parsedData.selecoes?.length || 0;
    const tipo: "DUPLA" | "TRIPLA" = numSelecoes >= 3 ? "TRIPLA" : "DUPLA";
    
    // Map selections to form format
    const selecoes = (parsedData.selecoes || []).slice(0, tipo === "TRIPLA" ? 3 : 2).map(sel => {
      // Combine evento + selecao for description
      const evento = sel.evento?.value || "";
      const selecaoTexto = sel.selecao?.value || "";
      
      // Create a descriptive text combining event and selection
      let descricao = "";
      if (evento && selecaoTexto) {
        descricao = `${evento} - ${selecaoTexto}`;
      } else if (selecaoTexto) {
        descricao = selecaoTexto;
      } else if (evento) {
        descricao = evento;
      }
      
      return {
        descricao,
        odd: sel.odd?.value || ""
      };
    });
    
    // Ensure minimum selections
    while (selecoes.length < 2) {
      selecoes.push({ descricao: "", odd: "" });
    }
    if (tipo === "TRIPLA" && selecoes.length < 3) {
      selecoes.push({ descricao: "", odd: "" });
    }

    return {
      tipo,
      stake: parsedData.stake?.value || "",
      selecoes
    };
  }, [parsedData]);

  // Calculate which fields need review (medium or low confidence, but still filled)
  const fieldsNeedingReview: MultiplaPrintFieldsNeedingReview = {
    tipo: (parsedData?.tipo?.confidence === "medium" || parsedData?.tipo?.confidence === "low") && !!parsedData?.tipo?.value,
    stake: (parsedData?.stake?.confidence === "medium" || parsedData?.stake?.confidence === "low") && !!parsedData?.stake?.value,
    selecoes: (parsedData?.selecoes || []).map(sel => ({
      evento: (sel.evento?.confidence === "medium" || sel.evento?.confidence === "low") && !!sel.evento?.value,
      selecao: (sel.selecao?.confidence === "medium" || sel.selecao?.confidence === "low") && !!sel.selecao?.value,
      odd: (sel.odd?.confidence === "medium" || sel.odd?.confidence === "low") && !!sel.odd?.value,
    }))
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
