/**
 * Utilitário para exibição financeira consistente.
 * 
 * REGRAS FUNDAMENTAIS:
 * 1. O SINAL do valor SEMPRE determina a semântica (Lucro vs Prejuízo)
 * 2. O SINAL do valor SEMPRE determina a cor (verde vs vermelho)
 * 3. Math.abs() SÓ é usado para formatação textual, NUNCA para lógica
 * 4. Zero é neutro (cinza)
 */

export type FinancialType = 'lucro' | 'prejuizo' | 'neutro';

export interface FinancialDisplay {
  /** Tipo semântico baseado no sinal */
  type: FinancialType;
  /** Label correto (Lucro, Prejuízo, ou vazio para zero) */
  label: string;
  /** Valor formatado com símbolo de moeda (sempre positivo no texto) */
  formattedValue: string;
  /** Texto completo: "Lucro: R$ X" ou "Prejuízo: R$ X" */
  fullText: string;
  /** Classe CSS para cor do texto */
  colorClass: string;
  /** Cor hex para uso em gráficos */
  colorHex: string;
  /** Valor original com sinal (para cálculos) */
  rawValue: number;
  /** Valor absoluto (para exibição) */
  absoluteValue: number;
  /** Se o valor é positivo */
  isPositive: boolean;
  /** Se o valor é negativo */
  isNegative: boolean;
  /** Se o valor é zero */
  isZero: boolean;
}

const COLORS = {
  lucro: {
    hex: '#22C55E',
    class: 'text-emerald-500',
  },
  prejuizo: {
    hex: '#EF4444',
    class: 'text-red-500',
  },
  neutro: {
    hex: '#6B7280',
    class: 'text-gray-500',
  },
} as const;

/**
 * Formata um valor como moeda brasileira
 */
function formatAsCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Retorna todas as informações de exibição financeira para um valor.
 * 
 * @param value - Valor numérico (positivo, negativo ou zero)
 * @returns Objeto com todas as propriedades de exibição
 * 
 * @example
 * const display = getFinancialDisplay(-692.11);
 * // display.label === 'Prejuízo'
 * // display.formattedValue === 'R$ 692,11'
 * // display.fullText === 'Prejuízo: R$ 692,11'
 * // display.colorClass === 'text-red-500'
 * // display.colorHex === '#EF4444'
 */
export function getFinancialDisplay(value: number): FinancialDisplay {
  const isZero = value === 0;
  const isNegative = value < 0;
  const isPositive = value > 0;
  
  // Determinar tipo baseado EXCLUSIVAMENTE no sinal
  let type: FinancialType;
  if (isPositive) {
    type = 'lucro';
  } else if (isNegative) {
    type = 'prejuizo';
  } else {
    type = 'neutro';
  }
  
  // Labels baseados no tipo
  const labels: Record<FinancialType, string> = {
    lucro: 'Lucro',
    prejuizo: 'Prejuízo',
    neutro: '',
  };
  
  const label = labels[type];
  const absoluteValue = Math.abs(value);
  const formattedValue = formatAsCurrency(absoluteValue);
  const fullText = label ? `${label}: ${formattedValue}` : formattedValue;
  
  return {
    type,
    label,
    formattedValue,
    fullText,
    colorClass: COLORS[type].class,
    colorHex: COLORS[type].hex,
    rawValue: value,
    absoluteValue,
    isPositive,
    isNegative,
    isZero,
  };
}

/**
 * Retorna apenas a classe CSS de cor para um valor financeiro.
 * Útil para uso inline em componentes.
 */
export function getFinancialColorClass(value: number): string {
  return getFinancialDisplay(value).colorClass;
}

/**
 * Retorna apenas a cor hex para um valor financeiro.
 * Útil para uso em gráficos e SVGs.
 */
export function getFinancialColorHex(value: number): string {
  return getFinancialDisplay(value).colorHex;
}

/**
 * Formata valor financeiro como texto completo com label.
 * Ex: "Lucro: R$ 500,00" ou "Prejuízo: R$ 692,11"
 */
export function formatFinancialText(value: number): string {
  return getFinancialDisplay(value).fullText;
}

/**
 * Formata valor financeiro apenas como moeda (sem label).
 * Sempre retorna valor absoluto formatado.
 */
export function formatFinancialValue(value: number): string {
  return getFinancialDisplay(value).formattedValue;
}
