// Utility functions for calculating project tripartite profit-sharing agreements

export type AbsorcaoPrejuizo = 'PROPORCIONAL' | 'INVESTIDOR_100' | 'EMPRESA_100' | 'LIMITE_INVESTIDOR';

export interface ProjetoAcordo {
  id: string;
  projeto_id: string;
  investidor_id: string | null;
  base_calculo: 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO';
  percentual_investidor: number;
  percentual_empresa: number;
  deduzir_custos_operador: boolean;
  absorcao_prejuizo: AbsorcaoPrejuizo;
  limite_prejuizo_investidor: number | null;
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
  absorcaoPrejuizo: AbsorcaoPrejuizo;
}

/**
 * Calculates the profit/loss division between Investor and Company for a project
 * based on the configured agreement (projeto_acordos).
 * 
 * Profit Scenarios:
 * A) deduzir_custos_operador = TRUE (Default - Líquido)
 *    1. Start with Lucro Bruto
 *    2. Subtract Custo Operador
 *    3. Divide remainder between Investidor and Empresa by percentages
 * 
 * B) deduzir_custos_operador = FALSE (Bruto - Empresa absorve operador)
 *    1. Start with Lucro Bruto
 *    2. Divide directly between Investidor and Empresa
 *    3. Empresa pays operator from their share
 * 
 * Loss Scenarios:
 * - PROPORCIONAL: Divide loss by same percentages as profit
 * - INVESTIDOR_100: Investor absorbs 100% of loss
 * - EMPRESA_100: Company absorbs 100% of loss
 * - LIMITE_INVESTIDOR: Investor absorbs up to X%, company absorbs the rest
 */
export function calcularDivisaoProjeto(
  lucroBruto: number,
  custoOperador: number,
  acordo: Pick<ProjetoAcordo, 'base_calculo' | 'percentual_investidor' | 'percentual_empresa' | 'deduzir_custos_operador' | 'absorcao_prejuizo' | 'limite_prejuizo_investidor'>
): DivisaoResult {
  const { 
    base_calculo, 
    percentual_investidor, 
    percentual_empresa, 
    deduzir_custos_operador,
    absorcao_prejuizo,
    limite_prejuizo_investidor
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

    switch (absorcao_prejuizo) {
      case 'PROPORCIONAL':
        prejuizoInvestidor = prejuizoTotal * (percentual_investidor / 100);
        prejuizoEmpresa = prejuizoTotal * (percentual_empresa / 100);
        break;
      
      case 'INVESTIDOR_100':
        prejuizoInvestidor = prejuizoTotal;
        prejuizoEmpresa = 0;
        break;
      
      case 'EMPRESA_100':
        prejuizoInvestidor = 0;
        prejuizoEmpresa = prejuizoTotal;
        break;
      
      case 'LIMITE_INVESTIDOR':
        const limitePercentual = limite_prejuizo_investidor ?? 50;
        const limiteValor = prejuizoTotal * (limitePercentual / 100);
        prejuizoInvestidor = Math.min(prejuizoTotal, limiteValor);
        prejuizoEmpresa = prejuizoTotal - prejuizoInvestidor;
        break;
    }
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
    absorcaoPrejuizo: absorcao_prejuizo,
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
  absorcao: AbsorcaoPrejuizo,
  limite?: number | null
): string {
  switch (absorcao) {
    case 'PROPORCIONAL':
      return 'Proporcional à divisão de lucros';
    case 'INVESTIDOR_100':
      return 'Investidor assume 100%';
    case 'EMPRESA_100':
      return 'Empresa assume 100%';
    case 'LIMITE_INVESTIDOR':
      return `Investidor até ${limite ?? 50}%, resto empresa`;
    default:
      return 'Proporcional';
  }
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
