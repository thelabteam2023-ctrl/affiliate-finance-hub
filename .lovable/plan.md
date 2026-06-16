## Problema

A **Margem Operacional** hoje é calculada como:

```
Margem Op. = Lucro Operacional Teórico ÷ (Lucro Op. Teórico + Custo de Sustentação) × 100
```

Isso está conceitualmente errado por dois motivos:

1. **Numerador errado** — usa `lucroOperacionalApostas` (lucro teórico das apostas liquidadas), que é apenas uma projeção contábil. Esse valor *ainda não virou caixa*, está represado em saldos de bookmakers, contas parceiras e wallets — fora do nosso controle imediato.
2. **Denominador errado** — usa `Lucro Op. + Custo`, o que infla artificialmente a base e não tem leitura econômica clara (não é receita, não é faturamento, não é capital empregado).

O usuário quer que a margem reflita o **caixa que efetivamente saiu dos projetos no período** (Fluxo Líquido) em relação aos custos pagos para gerá-lo. O lucro teórico continua sendo informação útil, mas como **referência secundária**, não como base do KPI.

## Fórmula nova

```
Margem Op. = Fluxo Líquido ÷ (Fluxo Líquido + Custo de Sustentação) × 100
```

Equivalente a `Resultado Líquido ÷ (Fluxo Líquido + Custos)`, lendo: *"de cada R$ 1 movimentado para fora dos projetos + custos pagos, quanto sobrou de fato".*

Regras de borda:
- Se `Fluxo Líquido + Custo ≤ 0` → exibir `—` (sem base de comparação).
- Se `Fluxo Líquido < 0` (saídas líquidas negativas, ou seja, depositamos mais do que sacamos) → margem fica negativa, com tone `negative`.
- Threshold de cor: `≥ 30%` positivo, `> 0%` warning, `≤ 0%` negative (50% era irreal para a fórmula nova).

## Mudanças no card

**Arquivo:** `src/pages/Financeiro.tsx` (bloco IIFE da linha 261–368)

1. Trocar a expressão `margemOp` para usar `lucroRealizado` (Fluxo Líquido) no lugar de `lucroOperacionalApostas`.
2. Atualizar `tooltip` da Margem Op.:
   > *"Fluxo Líquido ÷ (Fluxo Líquido + Custo de Sustentação). Mede quanto do caixa efetivamente sacado dos projetos sobrou após pagar todos os custos do período. Não usa lucro teórico — só dinheiro que de fato saiu da operação."*
3. Trocar a linha secundária `Lucro Op. / Custo` por `Fluxo / Custo` exibindo `lucroRealizado / custoSust`.
4. Ajustar thresholds de `tone` (`≥30` / `>0` / resto).
5. Atualizar o tooltip do **Fluxo Líquido** acrescentando uma frase curta: *"É a base da Margem Operacional."* — para amarrar a relação entre os dois cards.

## O que NÃO muda

- `lucroOperacionalApostas` continua sendo calculado e exibido como linha secundária do card **Fluxo Líquido** (Lucro Op. teórico), preservando a visão de "produzimos no período, ainda não colhemos".
- `Resultado Líquido` e `Patrimônio` permanecem intactos.
- Nenhuma alteração em RPC, ledger ou cálculos de backend — só re-leitura no front.

## Testes

Atualizar `src/components/financeiro/__tests__/ExposicaoFinanceiraCard.test.tsx` (ou criar `MargemOperacional.test.ts` em `src/lib/finance/__tests__/`) cobrindo:

- Fluxo positivo + custo positivo → margem entre 0 e 100.
- Fluxo negativo → margem negativa.
- Fluxo + custo = 0 → retorna `null`/sentinela para renderizar `—`.
- Fluxo > 0, custo = 0 → margem = 100%.

## Resumo da mudança visível

| Campo            | Antes                             | Depois                              |
|------------------|-----------------------------------|-------------------------------------|
| Numerador        | Lucro Op. Teórico                 | Fluxo Líquido (saques líquidos)     |
| Linha secundária | `Lucro Op. / Custo`               | `Fluxo / Custo`                     |
| Tooltip          | "eficiência teórica"              | "caixa efetivamente realizado"      |
| Thresholds       | 50 / 0                            | 30 / 0                              |
