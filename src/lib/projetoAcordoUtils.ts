// Utility functions for operator cost calculations

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
 * Formats currency in BRL
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}
