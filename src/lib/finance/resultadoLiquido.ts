/**
 * Resultado Líquido do período = Fluxo Líquido − Custo de Sustentação.
 *
 * Indica quanto efetivamente sobrou da operação após pagar TODOS os custos
 * (aquisição, comissões, bônus, despesas administrativas/infra e operadores)
 * no recorte de período selecionado.
 *
 * Difere de:
 *   - Lucro Operacional (teórico das apostas, não-realizado)
 *   - Lucro Real / Fluxo Líquido (Saques − Depósitos, sem dedução de custos)
 */
export function calcResultadoLiquido(
  fluxoLiquido: number,
  custoSustentacao: number,
): number {
  return (fluxoLiquido ?? 0) - (custoSustentacao ?? 0);
}