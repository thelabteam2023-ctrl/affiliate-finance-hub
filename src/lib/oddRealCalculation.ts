/**
 * Inteligência de Cálculo de Odd Real
 * 
 * Calcula a odd verdadeira baseada no ganho liquidado, não na cotação exibida.
 * Casas de apostas frequentemente ocultam casas decimais (ex: 1.86 vs 1.8696).
 * 
 * A verdade vem do ganho liquidado, não do marketing visual.
 */

export interface OddCalculationResult {
  /** Odd real calculada (até 4 casas decimais) */
  oddReal: number;
  /** Odd exibida/detectada pelo OCR (informativa) */
  oddExibida: number | null;
  /** Diferença entre odd real e exibida */
  diferenca: number;
  /** Indica se há decimal oculta significativa (>0.005) */
  temDecimalOculta: boolean;
  /** Método de cálculo usado */
  metodo: "ODD_DERIVADA_DO_GANHO" | "ODD_EXIBIDA_DIRETA" | "NENHUM";
  /** Confiança no cálculo */
  confianca: "high" | "medium" | "low";
}

// Threshold para considerar que há decimal oculta
const DECIMAL_OCULTA_THRESHOLD = 0.005;

/**
 * Parseia um valor monetário de string para número
 * Suporta formatos: R$1.000,00 / 1000.00 / 1,000.00 / etc
 */
export function parseMonetaryValue(value: string | null | undefined): number | null {
  if (!value) return null;
  
  // Remove currency symbols and spaces
  let cleaned = value.replace(/[R$€£¥\s]/gi, "").trim();
  
  if (!cleaned) return null;
  
  // Detect format: Brazilian (1.000,00) vs American (1,000.00)
  const hasCommaDecimal = /\d,\d{2}$/.test(cleaned);
  const hasDotDecimal = /\d\.\d{2}$/.test(cleaned);
  
  if (hasCommaDecimal) {
    // Brazilian format: 1.000,00 → 1000.00
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasDotDecimal && cleaned.includes(",")) {
    // American format: 1,000.00 → 1000.00
    cleaned = cleaned.replace(/,/g, "");
  }
  // else: simple format like 1000.00 or 1000
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parseia um valor de odd de string para número
 * Suporta formatos: 1.86 / 1,86 / @1.86 / etc
 */
export function parseOddValue(value: string | null | undefined): number | null {
  if (!value) return null;
  
  // Remove @ symbol and spaces
  let cleaned = value.replace(/@/g, "").trim();
  
  if (!cleaned) return null;
  
  // Normalize comma to dot
  cleaned = cleaned.replace(",", ".");
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

/**
 * Calcula a odd real baseada no ganho liquidado
 * 
 * @param ganhoTotal - Ganho total do print (já liquidado)
 * @param valorAposta - Valor total apostado
 * @param oddExibida - Odd exibida no print (opcional, para comparação)
 * @returns Resultado do cálculo com odd real e metadados
 */
export function calcularOddReal(
  ganhoTotal: string | number | null | undefined,
  valorAposta: string | number | null | undefined,
  oddExibida?: string | number | null | undefined
): OddCalculationResult {
  // Parse valores
  const ganho = typeof ganhoTotal === "number" ? ganhoTotal : parseMonetaryValue(ganhoTotal as string);
  const stake = typeof valorAposta === "number" ? valorAposta : parseMonetaryValue(valorAposta as string);
  const oddVisual = typeof oddExibida === "number" ? oddExibida : parseOddValue(oddExibida as string);
  
  // Caso 1: Temos ganho e stake - calcular odd real
  if (ganho !== null && stake !== null && stake > 0) {
    const oddReal = ganho / stake;
    
    // Limitar a 4 casas decimais
    const oddRealFormatted = Math.round(oddReal * 10000) / 10000;
    
    // Calcular diferença se temos odd exibida
    const diferenca = oddVisual !== null ? Math.abs(oddRealFormatted - oddVisual) : 0;
    const temDecimalOculta = diferenca > DECIMAL_OCULTA_THRESHOLD;
    
    // Determinar confiança
    let confianca: "high" | "medium" | "low" = "high";
    if (oddRealFormatted < 1 || oddRealFormatted > 100) {
      // Odds muito altas ou menores que 1 são suspeitas
      confianca = "low";
    } else if (temDecimalOculta && diferenca > 0.1) {
      // Diferença muito grande pode indicar erro no OCR
      confianca = "medium";
    }
    
    console.log("[oddRealCalculation] Calculada via ganho:", {
      ganho,
      stake,
      oddRealFormatted,
      oddVisual,
      diferenca,
      temDecimalOculta
    });
    
    return {
      oddReal: oddRealFormatted,
      oddExibida: oddVisual,
      diferenca,
      temDecimalOculta,
      metodo: "ODD_DERIVADA_DO_GANHO",
      confianca
    };
  }
  
  // Caso 2: Não temos ganho, usar odd exibida diretamente
  if (oddVisual !== null) {
    console.log("[oddRealCalculation] Usando odd exibida direta:", oddVisual);
    
    return {
      oddReal: oddVisual,
      oddExibida: oddVisual,
      diferenca: 0,
      temDecimalOculta: false,
      metodo: "ODD_EXIBIDA_DIRETA",
      confianca: "medium" // Menor confiança pois pode ter decimal oculta
    };
  }
  
  // Caso 3: Sem dados suficientes
  return {
    oddReal: 0,
    oddExibida: null,
    diferenca: 0,
    temDecimalOculta: false,
    metodo: "NENHUM",
    confianca: "low"
  };
}

/**
 * Formata odd para exibição com precisão adequada
 */
export function formatOddDisplay(odd: number): string {
  if (odd === 0) return "";
  
  // Se tem decimais significativas, mostrar até 4 casas
  const formatted = odd.toFixed(4);
  
  // Remover zeros à direita desnecessários
  return formatted.replace(/\.?0+$/, "") || formatted;
}

/**
 * Verifica se dois valores de odd são equivalentes (tolerância de 0.001)
 */
export function oddsAreEquivalent(odd1: number, odd2: number): boolean {
  return Math.abs(odd1 - odd2) < 0.001;
}
