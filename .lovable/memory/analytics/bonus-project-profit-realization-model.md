# Memory: analytics/bonus-project-profit-realization-model
Updated: 2026-03-04

O sistema distingue rigorosamente entre Performance de Bônus (Extração) e Lucro Real (Realizado) em projetos operacionais de bônus.

## Separação Operacional × Financeiro (IMPLEMENTADA 2026-03-04)

### Camada Operacional (Aba Bônus)
- **Performance de Bônus**: Indicador de eficiência na conversão de bônus em saldo, calculado como `Bônus creditado + ajustes - juice - cancelamentos`.
- **Volume Operado**: Soma das stakes das apostas.
- **ROI Operacional**: Eficiência por stake.
- Bônus creditados **NÃO** entram no cálculo de P&L do dashboard (removidos de `fetchExtrasLucroFn`).

### Camada Financeira (ProjetoFinancialMetricsCard)
- **Lucro Total**: `Patrimônio Total - Depósitos = (Saldo Casas + Saques Recebidos) - Depósitos`
- **Lucro Realizado**: `Σ Saques Confirmados - Σ Depósitos Confirmados` (dinheiro que voltou ao caixa)
- **Lucro Potencial**: `Saldo nas Casas - Depósitos` (lucro se todo saldo fosse sacado)
- **Saques Pendentes**: Capital em trânsito (solicitado mas não pago)
- **Patrimônio Total**: `Saldo Casas + Saques Recebidos`

### Regra Fundamental
- `bônus ≠ lucro` — bônus aumenta capital de giro, não é receita
- `saldo na casa ≠ lucro realizado` — precisa ser sacado para virar lucro
- Apenas `saques recebidos - depósitos` = lucro financeiro real
- O P&L das apostas (juice) já captura o resultado econômico da exploração do bônus
