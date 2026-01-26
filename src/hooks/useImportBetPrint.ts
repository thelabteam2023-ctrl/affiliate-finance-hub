import { useState, useCallback, useRef } from "react";
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
  evento: ParsedField;
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

export type FieldsNeedingReview = {
  evento: boolean;
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

export interface PendingPrintData {
  mercadoIntencao: string | null;
  mercadoRaw: string | null;
  esporteDetectado: string | null;
}

// Processing phase for UI feedback
export type ProcessingPhase = "idle" | "analyzing" | "backup" | "error";

interface UseImportBetPrintReturn {
  isProcessing: boolean;
  processingPhase: ProcessingPhase;
  parsedData: ParsedBetSlip | null;
  imagePreview: string | null;
  fieldsNeedingReview: FieldsNeedingReview;
  pendingData: PendingPrintData;
  processImage: (file: File) => Promise<void>;
  processFromClipboard: (event: ClipboardEvent) => Promise<void>;
  clearParsedData: () => void;
  applyParsedData: () => {
    evento: string;
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
const PRIMARY_TIMEOUT_MS = 8000; // 8 seconds for primary AI
const BACKUP_TIMEOUT_MS = 8000; // 8 seconds for backup AI
const DEBOUNCE_MS = 500; // 500ms debounce for rapid pastes

// Queue system for multiple prints
interface QueuedImage {
  file: File;
  resolve: () => void;
}

export function useImportBetPrint(): UseImportBetPrintReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>("idle");
  const [parsedData, setParsedData] = useState<ParsedBetSlip | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<PendingPrintData>({
    mercadoIntencao: null,
    mercadoRaw: null,
    esporteDetectado: null
  });

  // Refs for concurrency control
  const processingLockRef = useRef<boolean>(false);
  const lastPasteTimeRef = useRef<number>(0);
  const processingIdRef = useRef<number>(0);
  const queueRef = useRef<QueuedImage[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Validate AI response has usable data
  const isValidResponse = (data: any): boolean => {
    if (!data?.success || !data?.data) return false;
    
    const result = data.data;
    // Check if at least ODD or STAKE or EVENTO was detected with some value
    const hasOdd = result.odd?.value && result.odd.confidence !== "none";
    const hasStake = result.stake?.value && result.stake.confidence !== "none";
    const hasTeams = (result.mandante?.value || result.visitante?.value);
    const hasSelection = result.selecao?.value;
    
    return hasOdd || hasStake || hasTeams || hasSelection;
  };

  // Call AI with timeout
  const callAIWithTimeout = async (
    base64: string, 
    model: "primary" | "backup",
    timeoutMs: number
  ): Promise<{ data: any; error: any; timedOut: boolean }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[useImportBetPrint] Calling ${model} AI (timeout: ${timeoutMs}ms)`);
      console.log("[🔍 DEBUG] Enviando para edge function:", {
        model: model,
        base64Length: base64.length,
        base64Prefix: base64.substring(0, 50)
      });
      
      const result = await Promise.race([
        supabase.functions.invoke("parse-betting-slip", {
          body: { 
            imageBase64: base64,
            model: model === "backup" ? "backup" : undefined 
          }
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('TIMEOUT'));
          });
        })
      ]);

      clearTimeout(timeoutId);
      console.log("[🔍 DEBUG] Resposta recebida do backend:", {
        model: model,
        hasData: !!result.data,
        hasError: !!result.error,
        data: result.data,
        error: result.error
      });
      return { data: result.data, error: result.error, timedOut: false };
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.log("[🔍 DEBUG] Exceção capturada:", {
        model: model,
        errorMessage: error.message,
        errorType: error.constructor.name
      });
      if (error.message === 'TIMEOUT') {
        console.log(`[useImportBetPrint] ${model} AI timed out after ${timeoutMs}ms`);
        return { data: null, error: null, timedOut: true };
      }
      return { data: null, error, timedOut: false };
    }
  };

  // Process single image with primary + backup fallback
  const processImageInternal = async (file: File, currentProcessingId: number): Promise<void> => {
    console.log("[🔍 DEBUG] ========== processImageInternal ==========");
    console.log("[🔍 DEBUG] ProcessingID:", currentProcessingId);

    setProcessingPhase("analyzing");
    setParsedData(null);
    setPendingData({ mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null });

    try {
      // Convert to base64
      console.log("[🔍 DEBUG] Convertendo para base64...");
      const base64 = await fileToBase64(file);
      console.log("[🔍 DEBUG] Base64 gerado:", {
        length: base64.length,
        startsWithDataImage: base64.startsWith("data:image/"),
        prefix: base64.substring(0, 50)
      });
      
      // Check if superseded
      if (processingIdRef.current !== currentProcessingId) {
        console.log("[useImportBetPrint] Processing superseded");
        return;
      }
      
      // Validate base64
      if (!base64 || !base64.startsWith("data:image/")) {
        throw new Error("Falha ao processar imagem. Formato inválido.");
      }
      
      setImagePreview(base64);
      
      console.log("[🔍 DEBUG] 🚀 Iniciando IA...");
      console.log("[useImportBetPrint] Processing image:", {
        fileType: file.type,
        fileSize: file.size,
        processingId: currentProcessingId
      });

      // ========== PRIMARY AI (8 seconds) ==========
      console.log("[🔍 DEBUG] ━━━ CHAMANDO IA PRIMÁRIA ━━━");
      const primaryResult = await callAIWithTimeout(base64, "primary", PRIMARY_TIMEOUT_MS);
      console.log("[🔍 DEBUG] 📥 Resultado IA PRIMÁRIA:", {
        timedOut: primaryResult.timedOut,
        hasError: !!primaryResult.error,
        hasData: !!primaryResult.data,
        errorMsg: primaryResult.error?.message || "N/A",
        isValid: primaryResult.data ? isValidResponse(primaryResult.data) : false
      });
      
      // Check if superseded
      if (processingIdRef.current !== currentProcessingId) return;
      
      // Check if primary succeeded
      if (!primaryResult.timedOut && !primaryResult.error && isValidResponse(primaryResult.data)) {
        console.log("[🔍 DEBUG] ✅✅✅ IA PRIMÁRIA SUCESSO ✅✅✅");
        await processSuccessfulResponse(primaryResult.data.data, currentProcessingId);
        return;
      }
      
      // Primary failed - try backup
      console.log("[🔍 DEBUG] ⚠️ IA PRIMÁRIA FALHOU", {
        timedOut: primaryResult.timedOut,
        hasError: !!primaryResult.error,
        errorDetails: primaryResult.error,
        validResponse: primaryResult.data ? isValidResponse(primaryResult.data) : false
      });
      
      // ========== BACKUP AI (8 seconds) ==========
      setProcessingPhase("backup");
      toast.info("Tentando leitura alternativa...", { duration: 2000 });
      
      console.log("[🔍 DEBUG] ━━━ CHAMANDO IA BACKUP ━━━");
      const backupResult = await callAIWithTimeout(base64, "backup", BACKUP_TIMEOUT_MS);
      console.log("[🔍 DEBUG] 📥 Resultado IA BACKUP:", {
        timedOut: backupResult.timedOut,
        hasError: !!backupResult.error,
        hasData: !!backupResult.data,
        errorMsg: backupResult.error?.message || "N/A",
        isValid: backupResult.data ? isValidResponse(backupResult.data) : false
      });
      
      // Check if superseded
      if (processingIdRef.current !== currentProcessingId) return;
      
      // Check if backup succeeded
      if (!backupResult.timedOut && !backupResult.error && isValidResponse(backupResult.data)) {
        console.log("[🔍 DEBUG] ✅✅✅ IA BACKUP SUCESSO ✅✅✅");
        await processSuccessfulResponse(backupResult.data.data, currentProcessingId);
        return;
      }
      
      // Both failed
      console.log("[🔍 DEBUG] ❌❌❌ AMBAS IAs FALHARAM ❌❌❌");
      console.log("[🔍 DEBUG] Detalhes da falha:", {
        primaryTimedOut: primaryResult.timedOut,
        backupTimedOut: backupResult.timedOut,
        primaryError: primaryResult.error,
        backupError: backupResult.error
      });
      
      // Determine best error message
      let errorMessage = "Não foi possível ler o print. Tente novamente.";
      
      if (primaryResult.timedOut && backupResult.timedOut) {
        errorMessage = "Tempo limite excedido. O servidor está lento. Tente novamente.";
      } else if (primaryResult.error?.message?.includes("429") || backupResult.error?.message?.includes("429")) {
        errorMessage = "Limite de requisições atingido. Aguarde alguns segundos.";
      } else if (primaryResult.error?.message?.includes("402") || backupResult.error?.message?.includes("402")) {
        errorMessage = "Créditos de IA insuficientes.";
      }
      
      setProcessingPhase("error");
      throw new Error(errorMessage);
      
    } catch (error: any) {
      if (processingIdRef.current === currentProcessingId) {
        console.error("[useImportBetPrint] Error:", error);
        toast.error(error.message || "Erro ao processar o print");
        setImagePreview(null);
        setProcessingPhase("error");
      }
    }
  };

  // Process successful AI response
  const processSuccessfulResponse = async (rawData: ParsedBetSlip, currentProcessingId: number) => {
    if (processingIdRef.current !== currentProcessingId) return;
    
    // Build unified evento field
    const mandanteVal = rawData.mandante?.value || "";
    const visitanteVal = rawData.visitante?.value || "";
    const mandanteConf = rawData.mandante?.confidence || "none";
    const visitanteConf = rawData.visitante?.confidence || "none";
    
    let eventoValue = "";
    let eventoConfidence: "high" | "medium" | "low" | "none" = "none";
    
    if (mandanteVal && visitanteVal) {
      eventoValue = `${mandanteVal} x ${visitanteVal}`;
      const confOrder = { high: 3, medium: 2, low: 1, none: 0 };
      eventoConfidence = confOrder[mandanteConf] <= confOrder[visitanteConf] ? mandanteConf : visitanteConf;
    } else if (mandanteVal) {
      eventoValue = mandanteVal;
      eventoConfidence = mandanteConf;
    } else if (visitanteVal) {
      eventoValue = visitanteVal;
      eventoConfidence = visitanteConf;
    }
    
    rawData.evento = { value: eventoValue, confidence: eventoConfidence };
    
    // Normalize sport
    if (rawData.esporte?.value) {
      const sportResult = normalizeSport(rawData.esporte.value);
      rawData.esporte.value = sportResult.normalized;
      if (sportResult.confidence === "low" && rawData.esporte.confidence === "high") {
        rawData.esporte.confidence = "medium";
      }
    }
    
    // Normalize market using OCR parser
    if (rawData.mercado?.value) {
      const marketRaw = rawData.mercado.value;
      const sportDetected = rawData.esporte?.value || "Outro";
      const selectionRaw = rawData.selecao?.value || "";
      
      const ocrResult = parseOcrMarket(marketRaw, selectionRaw, sportDetected);
      
      setPendingData({
        mercadoIntencao: ocrResult.displayName,
        mercadoRaw: marketRaw,
        esporteDetectado: sportDetected
      });
      
      // PRESERVAR O TEXTO ORIGINAL DO OCR (não substituir pelo displayName normalizado)
      // rawData.mercado.value = ocrResult.displayName; // <- REMOVIDO: manter texto exato do OCR
      
      if (ocrResult.confidence === "low") {
        rawData.mercado.confidence = "low";
      } else if (ocrResult.confidence === "medium" && rawData.mercado.confidence === "high") {
        rawData.mercado.confidence = "medium";
      }
      
      if ((ocrResult.type === "TOTAL" || ocrResult.type === "HANDICAP") && ocrResult.side && ocrResult.line !== undefined) {
        const formattedSelection = formatSelectionFromOcrResult(ocrResult);
        if (formattedSelection && rawData.selecao) {
          rawData.selecao.value = formattedSelection;
          if (rawData.selecao.confidence === "low") {
            rawData.selecao.confidence = "medium";
          }
        }
      }
    }
    
    setParsedData(rawData);
    setProcessingPhase("idle");
    toast.success("Print analisado com sucesso!");
  };

  // Process queue
  const processQueue = async () => {
    if (isProcessingQueueRef.current) return;
    if (queueRef.current.length === 0) return;
    
    isProcessingQueueRef.current = true;
    
    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift();
      if (!item) continue;
      
      processingLockRef.current = true;
      setIsProcessing(true);
      
      const currentProcessingId = ++processingIdRef.current;
      
      try {
        await processImageInternal(item.file, currentProcessingId);
      } finally {
        processingLockRef.current = false;
        setIsProcessing(false);
        item.resolve();
      }
    }
    
    isProcessingQueueRef.current = false;
  };

  // Main processImage - adds to queue
  const processImage = useCallback(async (file: File) => {
    console.log("[🔍 DEBUG] ========== processImage CHAMADO ==========");
    console.log("[🔍 DEBUG] File:", {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Validate file
    if (!file.type.startsWith("image/")) {
      console.log("[🔍 DEBUG] ❌ Tipo inválido");
      toast.error("Por favor, selecione uma imagem válida.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      console.log("[🔍 DEBUG] ❌ Muito grande");
      toast.error("Imagem muito grande. Máximo: 10MB");
      return;
    }
    
    if (file.size < 100) {
      console.log("[🔍 DEBUG] ❌ Muito pequeno");
      toast.error("Imagem muito pequena ou corrompida.");
      return;
    }

    // If already processing, add to queue
    if (processingLockRef.current) {
      console.log("[🔍 DEBUG] ⏳ Adicionando à fila");
      console.log("[useImportBetPrint] Adding to queue");
      toast.info("Print adicionado à fila de processamento");
      
      return new Promise<void>((resolve) => {
        queueRef.current.push({ file, resolve });
      });
    }

    // Process immediately
    processingLockRef.current = true;
    setIsProcessing(true);
    
    const currentProcessingId = ++processingIdRef.current;
    
    try {
      await processImageInternal(file, currentProcessingId);
    } finally {
      processingLockRef.current = false;
      setIsProcessing(false);
      
      // Process any queued items
      processQueue();
    }
  }, []);

  const processFromClipboard = useCallback(async (event: ClipboardEvent) => {
   console.error("🚨🚨🚨 [useImportBetPrint] ========== PROCESSANDO PASTE ==========");
    // Debounce rapid pastes
    const now = Date.now();
    if (now - lastPasteTimeRef.current < DEBOUNCE_MS) {
     console.error("🚨🚨🚨 [useImportBetPrint] ⏱️ DEBOUNCE - colou muito rápido");
      return;
    }
    lastPasteTimeRef.current = now;

    const items = event.clipboardData?.items;
    if (!items) {
     console.error("🚨🚨🚨 [useImportBetPrint] ❌ Clipboard VAZIO (sem items)");
      return;
    }
    
   console.error("🚨🚨🚨 [useImportBetPrint] 📋 Clipboard tem", items.length, "items");
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
     console.error("🚨🚨🚨 [useImportBetPrint] Item[" + i + "] tipo:", item.type);
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
       console.error("🚨🚨🚨 [useImportBetPrint] ✅ IMAGEM ENCONTRADA!", {
          name: file?.name || "N/A",
          size: file?.size || 0,
          type: file?.type || "N/A"
        });
        if (file) {
          event.preventDefault();
         console.error("🚨🚨🚨 [useImportBetPrint] 🚀 Chamando processImage...");
          await processImage(file);
          break;
        }
      }
    }
   console.error("🚨🚨🚨 [useImportBetPrint] ========== FIM PASTE ==========");
  }, [processImage]);

  const clearParsedData = useCallback(() => {
    setParsedData(null);
    setImagePreview(null);
    setPendingData({ mercadoIntencao: null, mercadoRaw: null, esporteDetectado: null });
    setProcessingPhase("idle");
  }, []);

  const resolveMarketForSport = useCallback((sport: string, availableOptions: string[]): string => {
    if (!pendingData.mercadoIntencao && !pendingData.mercadoRaw) {
      return "";
    }
    
    const marketRaw = pendingData.mercadoRaw || pendingData.mercadoIntencao || "";
    const selectionValue = parsedData?.selecao?.value || "";
    const ocrResult = parseOcrMarket(marketRaw, selectionValue, sport);
    
    const options = availableOptions.length > 0 
      ? availableOptions 
      : getMarketsForSport(sport);
    
    const resolved = resolveOcrResultToOption(ocrResult, options);
    
    console.log(`[resolveMarketForSport] "${marketRaw}" → "${resolved}" for ${sport}`);
    
    return resolved;
  }, [pendingData, parsedData]);

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
    processingPhase,
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
