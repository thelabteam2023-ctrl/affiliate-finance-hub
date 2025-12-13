// Utility functions for calculating project tripartite profit-sharing agreements

export interface ProjetoAcordo {
  id: string;
  projeto_id: string;
  investidor_id: string | null;
  base_calculo: 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO';
  percentual_investidor: number;
  percentual_empresa: number;
  deduzir_custos_operador: boolean;
  observacoes: string | null;
  ativo: boolean;
}

export interface DivisaoResult {
  lucroBruto: number;
  custoOperador: number;
  lucroBase: number; // Bruto ou Líquido conforme config
  lucroInvestidor: number;
  lucroEmpresa: number;
  percentualInvestidor: number;
  percentualEmpresa: number;
  baseCalculo: 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO';
  deduzirCustosOperador: boolean;
}

/**
 * Calculates the profit division between Investor and Company for a project
 * based on the configured agreement (projeto_acordos).
 * 
 * Scenarios:
 * 
 * A) deduzir_custos_operador = TRUE (Default - Líquido)
 *    1. Start with Lucro Bruto
 *    2. Subtract Custo Operador
 *    3. Divide remainder between Investidor and Empresa by percentages
 * 
 * B) deduzir_custos_operador = FALSE (Bruto - Empresa absorve operador)
 *    1. Start with Lucro Bruto
 *    2. Divide directly between Investidor and Empresa
 *    3. Empresa pays operator from their share
 */
export function calcularDivisaoProjeto(
  lucroBruto: number,
  custoOperador: number,
  acordo: Pick<ProjetoAcordo, 'base_calculo' | 'percentual_investidor' | 'percentual_empresa' | 'deduzir_custos_operador'>
): DivisaoResult {
  const { 
    base_calculo, 
    percentual_investidor, 
    percentual_empresa, 
    deduzir_custos_operador 
  } = acordo;

  // Determine the base for division
  let lucroBase: number;

  if (deduzir_custos_operador) {
    // First pay operator, then divide the rest
    lucroBase = Math.max(0, lucroBruto - custoOperador);
  } else {
    // Divide gross profit, empresa pays operator from their share
    lucroBase = lucroBruto;
  }

  // Calculate shares
  const lucroInvestidor = lucroBase * (percentual_investidor / 100);
  const lucroEmpresa = lucroBase * (percentual_empresa / 100);

  return {
    lucroBruto,
    custoOperador,
    lucroBase,
    lucroInvestidor,
    lucroEmpresa,
    percentualInvestidor: percentual_investidor,
    percentualEmpresa: percentual_empresa,
    baseCalculo: base_calculo,
    deduzirCustosOperador: deduzir_custos_operador,
  };
}

/**
 * Formats the agreement description for display
 */
export function formatAcordoLabel(acordo: Pick<ProjetoAcordo, 'base_calculo' | 'percentual_investidor' | 'percentual_empresa' | 'deduzir_custos_operador'>): string {
  const base = acordo.deduzir_custos_operador ? 'Líquido' : 'Bruto';
  return `${base} ${acordo.percentual_investidor}/${acordo.percentual_empresa}`;
}

/**
 * Formats currency in BRL
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}
