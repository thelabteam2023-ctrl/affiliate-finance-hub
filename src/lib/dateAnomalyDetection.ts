/**
 * Detecção de Anomalias Temporais para OCR/Auto-preenchimento
 * 
 * Este módulo detecta datas fora do padrão operacional vindas de:
 * - Leitura OCR de prints de apostas
 * - Sugestões automáticas da IA
 * - Auto-preenchimento de formulários
 * 
 * REGRA: A IA NÃO pode corrigir datas sozinha - apenas alertar.
 * Toda correção exige ação humana explícita.
 */

export interface DateAnomalyResult {
  isAnomalous: boolean;
  detectedDate: Date | null;
  baseDate: Date;
  differenceInDays: number;
  anomalyType: "past" | "future" | "none";
  severity: "warning" | "critical" | "none";
  message: string;
}

export interface DateAnomalyLogEntry {
  detectedDateString: string;
  differenceInDays: number;
  origin: "ocr" | "ai" | "manual";
  decision: "confirmed" | "corrected" | "pending";
  correctedTo?: string;
  timestamp: string;
}

// Configuração de thresholds (configurável)
export const ANOMALY_THRESHOLDS = {
  /** Dias de diferença para considerar anomalia de WARNING */
  WARNING_DAYS: 30,
  /** Dias de diferença para considerar anomalia CRÍTICA */
  CRITICAL_DAYS: 90,
  /** Ano mínimo operacional (não permite anos anteriores) */
  MIN_OPERATIONAL_YEAR: 2025,
} as const;

/**
 * Parseia uma string de data em múltiplos formatos comuns de OCR
 * Suporta: "DD/MM/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", etc.
 */
export function parseOcrDateString(dateString: string | null | undefined): Date | null {
  if (!dateString || typeof dateString !== "string") return null;
  
  const cleaned = dateString.trim();
  if (!cleaned) return null;
  
  // Tentar extrair apenas a parte da data (ignorar hora)
  // Formatos comuns: "13/01/2026 15:30", "2026-01-13T15:30:00"
  
  // Formato DD/MM/YYYY ou DD-MM-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(year, month - 1, day);
    }
  }
  
  // Formato YYYY-MM-DD (ISO)
  const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(year, month - 1, day);
    }
  }
  
  // Formato textual "13 Jan 2026", "Janeiro 13, 2026"
  const textMatch = cleaned.match(/(\d{1,2})\s*(?:de\s+)?(\w+)(?:\s*(?:de\s+)?(\d{4}))?/i);
  if (textMatch) {
    const monthNames: Record<string, number> = {
      jan: 0, janeiro: 0, january: 0,
      fev: 1, fevereiro: 1, february: 1,
      mar: 2, março: 2, marco: 2, march: 2,
      abr: 3, abril: 3, april: 3,
      mai: 4, maio: 4, may: 4,
      jun: 5, junho: 5, june: 5,
      jul: 6, julho: 6, july: 6,
      ago: 7, agosto: 7, august: 7,
      set: 8, setembro: 8, september: 8,
      out: 9, outubro: 9, october: 9,
      nov: 10, novembro: 10, november: 10,
      dez: 11, dezembro: 11, december: 11,
    };
    
    const day = parseInt(textMatch[1], 10);
    const monthKey = textMatch[2].toLowerCase().slice(0, 3);
    const year = textMatch[3] ? parseInt(textMatch[3], 10) : new Date().getFullYear();
    
    if (monthNames[monthKey] !== undefined && day >= 1 && day <= 31) {
      return new Date(year, monthNames[monthKey], day);
    }
  }
  
  return null;
}

/**
 * Detecta se uma data é anômala em relação à data base (atual)
 */
export function detectDateAnomaly(
  detectedDateString: string | null | undefined,
  baseDate: Date = new Date()
): DateAnomalyResult {
  const detectedDate = parseOcrDateString(detectedDateString);
  
  // Se não conseguiu parsear, não é anomalia - é campo vazio/inválido
  if (!detectedDate) {
    return {
      isAnomalous: false,
      detectedDate: null,
      baseDate,
      differenceInDays: 0,
      anomalyType: "none",
      severity: "none",
      message: "",
    };
  }
  
  // Calcular diferença em dias
  const diffMs = detectedDate.getTime() - baseDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const absDiffDays = Math.abs(diffDays);
  
  // Verificar ano mínimo operacional
  if (detectedDate.getFullYear() < ANOMALY_THRESHOLDS.MIN_OPERATIONAL_YEAR) {
    return {
      isAnomalous: true,
      detectedDate,
      baseDate,
      differenceInDays: diffDays,
      anomalyType: "past",
      severity: "critical",
      message: `Data detectada está em ${detectedDate.getFullYear()}, ano anterior ao operacional (${ANOMALY_THRESHOLDS.MIN_OPERATIONAL_YEAR}). Verifique se é o ano correto.`,
    };
  }
  
  // Verificar threshold de anomalia
  if (absDiffDays >= ANOMALY_THRESHOLDS.CRITICAL_DAYS) {
    return {
      isAnomalous: true,
      detectedDate,
      baseDate,
      differenceInDays: diffDays,
      anomalyType: diffDays < 0 ? "past" : "future",
      severity: "critical",
      message: `Data detectada está ${absDiffDays} dias ${diffDays < 0 ? "no passado" : "no futuro"}. Isto é incomum para uma aposta recente.`,
    };
  }
  
  if (absDiffDays >= ANOMALY_THRESHOLDS.WARNING_DAYS) {
    return {
      isAnomalous: true,
      detectedDate,
      baseDate,
      differenceInDays: diffDays,
      anomalyType: diffDays < 0 ? "past" : "future",
      severity: "warning",
      message: `Data detectada está ${absDiffDays} dias ${diffDays < 0 ? "no passado" : "no futuro"}. Confirme se está correta.`,
    };
  }
  
  // Data dentro do range normal
  return {
    isAnomalous: false,
    detectedDate,
    baseDate,
    differenceInDays: diffDays,
    anomalyType: "none",
    severity: "none",
    message: "",
  };
}

/**
 * Formata a data para exibição amigável
 */
export function formatDateForDisplay(date: Date | null): string {
  if (!date) return "—";
  
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Cria entrada de log para auditoria de decisões de data
 */
export function createAnomalyLogEntry(
  detectedDateString: string,
  differenceInDays: number,
  origin: "ocr" | "ai" | "manual",
  decision: "confirmed" | "corrected" | "pending",
  correctedTo?: string
): DateAnomalyLogEntry {
  return {
    detectedDateString,
    differenceInDays,
    origin,
    decision,
    correctedTo,
    timestamp: new Date().toISOString(),
  };
}
