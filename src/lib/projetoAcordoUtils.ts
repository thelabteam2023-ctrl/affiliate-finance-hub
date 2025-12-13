// Utility functions for calculating project tripartite profit-sharing agreements

export interface ProjetoAcordo {
  id: string;
  projeto_id: string;
  investidor_id: string | null;
  base_calculo: 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO';
  percentual_investidor: number;
  percentual_empresa: number;
  deduzir_custos_operador: boolean;
  percentual_prejuizo_investidor: number;
  observacoes: string | null;
  ativo: boolean;
}

export interface OperadorVinculado {
  id: string;
  operador_id: string;
  nome: string;
  modelo_pagamento: string;
  percentual: number | null;
  valor_fixo: number | null;
  base_calculo: string | null;
  faixas_escalonadas: any | null;
}

export interface DivisaoResult {
  lucroBruto: number;
  custoOperador: number;
  lucroBase: number;
  lucroInvestidor: number;
  lucroEmpresa: number;
  prejuizoInvestidor: number;
  prejuizoEmpresa: number;
  isPrejuizo: boolean;
  percentualInvestidor: number;
  percentualEmpresa: number;
  baseCalculo: 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO';
  deduzirCustosOperador: boolean;
  percentualPrejuizoInvestidor: number;
}

/**
 * Calculates the profit/loss division between Investor and Company for a project
 * based on the configured agreement (projeto_acordos).
 * 
 * Profit: Divides by percentual_investidor / percentual_empresa
 * Loss: Divides by percentual_prejuizo_investidor / (100 - percentual_prejuizo_investidor)
 */
export function calcularDivisaoProjeto(
  lucroBruto: number,
  custoOperador: number,
  acordo: Pick<ProjetoAcordo, 'base_calculo' | 'percentual_investidor' | 'percentual_empresa' | 'deduzir_custos_operador' | 'percentual_prejuizo_investidor'>
): DivisaoResult {
  const { 
    base_calculo, 
    percentual_investidor, 
    percentual_empresa, 
    deduzir_custos_operador,
    percentual_prejuizo_investidor
  } = acordo;

  // Determine the base for division
  let lucroBase: number;

  if (deduzir_custos_operador) {
    // First pay operator, then divide the rest
    lucroBase = lucroBruto - custoOperador;
  } else {
    // Divide gross profit, empresa pays operator from their share
    lucroBase = lucroBruto;
  }

  const isPrejuizo = lucroBase < 0;

  let lucroInvestidor = 0;
  let lucroEmpresa = 0;
  let prejuizoInvestidor = 0;
  let prejuizoEmpresa = 0;

  if (isPrejuizo) {
    const prejuizoTotal = Math.abs(lucroBase);
    // Use the loss percentage slider value
    prejuizoInvestidor = prejuizoTotal * (percentual_prejuizo_investidor / 100);
    prejuizoEmpresa = prejuizoTotal * ((100 - percentual_prejuizo_investidor) / 100);
  } else {
    // Calculate profit shares
    lucroInvestidor = lucroBase * (percentual_investidor / 100);
    lucroEmpresa = lucroBase * (percentual_empresa / 100);
  }

  return {
    lucroBruto,
    custoOperador,
    lucroBase,
    lucroInvestidor,
    lucroEmpresa,
    prejuizoInvestidor,
    prejuizoEmpresa,
    isPrejuizo,
    percentualInvestidor: percentual_investidor,
    percentualEmpresa: percentual_empresa,
    baseCalculo: base_calculo,
    deduzirCustosOperador: deduzir_custos_operador,
    percentualPrejuizoInvestidor: percentual_prejuizo_investidor,
  };
}

/**
 * Calculate projected operator cost based on payment model
 */
export function calcularCustoOperadorProjetado(
  operadores: OperadorVinculado[],
  lucroProjeto: number
): number {
  let custoTotal = 0;

  for (const op of operadores) {
    switch (op.modelo_pagamento) {
      case 'FIXO_MENSAL':
        custoTotal += op.valor_fixo ?? 0;
        break;
      case 'PORCENTAGEM':
      case 'PROPORCIONAL_LUCRO':
        if (lucroProjeto > 0) {
          custoTotal += lucroProjeto * ((op.percentual ?? 0) / 100);
        }
        break;
      case 'HIBRIDO':
        custoTotal += op.valor_fixo ?? 0;
        if (lucroProjeto > 0) {
          custoTotal += lucroProjeto * ((op.percentual ?? 0) / 100);
        }
        break;
      case 'COMISSAO_ESCALONADA':
        if (lucroProjeto > 0 && op.faixas_escalonadas) {
          const faixas = op.faixas_escalonadas as Array<{ ate: number; percentual: number }>;
          let remainingLucro = lucroProjeto;
          let previousAte = 0;
          for (const faixa of faixas.sort((a, b) => a.ate - b.ate)) {
            const faixaValue = Math.min(remainingLucro, faixa.ate - previousAte);
            if (faixaValue > 0) {
              custoTotal += faixaValue * (faixa.percentual / 100);
              remainingLucro -= faixaValue;
            }
            previousAte = faixa.ate;
            if (remainingLucro <= 0) break;
          }
        }
        break;
      case 'POR_ENTREGA':
        // Por entrega is calculated separately based on delivery goals
        break;
    }
  }

  return custoTotal;
}

/**
 * Formats the agreement description for display
 */
export function formatAcordoLabel(acordo: Pick<ProjetoAcordo, 'base_calculo' | 'percentual_investidor' | 'percentual_empresa' | 'deduzir_custos_operador'>): string {
  const base = acordo.deduzir_custos_operador ? 'Líquido' : 'Bruto';
  return `${base} ${acordo.percentual_investidor}/${acordo.percentual_empresa}`;
}

/**
 * Formats the loss absorption description
 */
export function formatAbsorcaoPrejuizoLabel(
  percentualPrejuizoInvestidor: number
): string {
  if (percentualPrejuizoInvestidor === 0) {
    return 'Empresa assume 100%';
  }
  if (percentualPrejuizoInvestidor === 100) {
    return 'Investidor assume 100%';
  }
  return `Investidor ${percentualPrejuizoInvestidor}% / Empresa ${100 - percentualPrejuizoInvestidor}%`;
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
