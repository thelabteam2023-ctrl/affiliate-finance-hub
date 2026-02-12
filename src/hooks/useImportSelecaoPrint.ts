import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ParsedSelecaoResult {
  descricao: string;
  odd: string;
  resultado?: string;
}

interface UseImportSelecaoPrintReturn {
  isProcessing: boolean;
  processingIndex: number | null;
  processImageForSelecao: (file: File, index: number) => Promise<ParsedSelecaoResult | null>;
  processClipboardForSelecao: (event: ClipboardEvent, index: number) => Promise<ParsedSelecaoResult | null>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Hook para importar um print de aposta individual (uma seleção) via OCR.
 * Usa o modo "simples" do edge function para extrair dados de UMA aposta.
 */
export function useImportSelecaoPrint(): UseImportSelecaoPrintReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);

  const processImageForSelecao = useCallback(async (file: File, index: number): Promise<ParsedSelecaoResult | null> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida.");
      return null;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Imagem muito grande. Máximo: 10MB");
      return null;
    }

    setIsProcessing(true);
    setProcessingIndex(index);

    try {
      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("parse-betting-slip", {
        body: { imageBase64: base64, mode: "simples" }
      });

      if (error) {
        const msg = error.message?.includes("Failed to send")
          ? "Erro de conexão. Verifique sua internet."
          : error.message || "Erro ao processar imagem";
        throw new Error(msg);
      }

      if (data?.error) throw new Error(data.error);

      if (data?.success && data?.data) {
        const raw = data.data;

        // Build description from mandante/visitante + selecao
        const mandante = raw.mandante?.value || "";
        const visitante = raw.visitante?.value || "";
        const selecao = raw.selecao?.value || "";
        const evento = mandante && visitante ? `${mandante} x ${visitante}` : "";

        let descricao = "";
        if (evento && selecao) {
          descricao = `${evento} - ${selecao}`;
        } else if (selecao) {
          descricao = selecao;
        } else if (evento) {
          descricao = evento;
        }

        const odd = raw.odd?.value || "";
        const resultado = raw.resultado?.value || undefined;

        toast.success(`Seleção ${index + 1} preenchida via OCR!`);

        return { descricao, odd, resultado };
      }

      throw new Error("Resposta inválida do servidor");
    } catch (err: any) {
      console.error("[useImportSelecaoPrint] Error:", err);
      toast.error(err.message || "Erro ao processar print");
      return null;
    } finally {
      setIsProcessing(false);
      setProcessingIndex(null);
    }
  }, []);

  const processClipboardForSelecao = useCallback(async (event: ClipboardEvent, index: number): Promise<ParsedSelecaoResult | null> => {
    const items = event.clipboardData?.items;
    if (!items) return null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          return processImageForSelecao(file, index);
        }
      }
    }
    return null;
  }, [processImageForSelecao]);

  return {
    isProcessing,
    processingIndex,
    processImageForSelecao,
    processClipboardForSelecao,
  };
}
