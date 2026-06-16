/**
 * Margem Operacional = Fluxo Líquido ÷ (Fluxo Líquido + Custo de Sustentação) × 100
 *
 * Usa caixa efetivamente sacado dos projetos (Fluxo Líquido), NÃO lucro teórico.
 * Retorna null quando não há base de comparação (denominador ≤ 0).
 */
export function calcMargemOperacional(
  fluxoLiquido: number | null | undefined,
  custoSustentacao: number | null | undefined,
): number | null {
  const fluxo = Number(fluxoLiquido ?? 0);
  const custo = Number(custoSustentacao ?? 0);
  const base = fluxo + custo;
  if (base <= 0) return null;
  return (fluxo / base) * 100;
}