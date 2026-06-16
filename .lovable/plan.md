## Objetivo

Criar um novo indicador que mostre **quanto sobrou da operação após pagar todos os custos** no período filtrado — complementando o "Fluxo Líquido" (caixa entrado/saído) e o "Lucro Operacional" (teórico das apostas).

## Nomenclatura escolhida

**"Resultado Líquido (período)"**

Racional rápido sobre as alternativas sugeridas:
- ❌ *Lucro Líquido* / *Lucro Real Líquido* — confunde com "Lucro Real" (que já existe e tem fórmula contábil específica: Saques − Depósitos).
- ❌ *Resultado Operacional Líquido* — sugere subtração só de custos operacionais, mas vamos descontar tudo (admin + RH + comissões + bônus + operadores).
- ❌ *Lucro Disponível* / *Pós-Despesas* — pouco padronizado.
- ✅ **Resultado Líquido** — termo neutro, casa com "Fluxo Líquido" já presente no card, e deixa claro que é "depois de todos os custos".

## Fórmula

```
Resultado Líquido = Fluxo Líquido (período) − Custo de Sustentação (período)

onde Custo de Sustentação =
    Custos de Aquisição
  + Comissões
  + Bônus
  + Despesas Administrativas / Infraestrutura
  + Pagamentos a Operadores (RH)
```

Ambos os termos já são calculados e filtrados pelo mesmo recorte de período em `useFinanceiroCalculations`:
- `lucroRealizado` (de `useWorkspaceLucroRealizado`) → minuendo
- `calc.costs.custoSustentacao` → subtraendo

Nada novo de backend, nenhuma migration.

## Mudanças

### 1. `src/pages/Financeiro.tsx`
- Calcular `resultadoLiquido = lucroRealizado - calc.costs.custoSustentacao` dentro do bloco IIFE da Linha 1 (logo após `custoSust`).
- Trocar o grid de KPIs do header de `md:grid-cols-3` para `md:grid-cols-2 xl:grid-cols-4` e inserir um novo `HeaderKpiCard`:
  - label: **"Resultado Líquido (período)"**
  - value: `calc.formatCurrency(resultadoLiquido)`
  - tone: `positive` se ≥ 0, senão `negative`
  - icon: `<Wallet />` ou `<TrendingUp />` (reutilizar já importado)
  - `periodBadge={periodBadge}`
  - `secondary`: linha "Custos do período" com `−${formatCurrency(custoSust)}` em vermelho discreto, para evidenciar a subtração.
  - hint/tooltip: "Fluxo Líquido do período menos todos os custos (aquisição, comissões, bônus, administrativos e operadores)."

### 2. Tooltip explicativo
Adicionar `Info` icon com `TooltipProvider/Tooltip` no card novo, deixando explícito que **não é** o mesmo que Lucro Operacional (teórico) nem Lucro Real (contábil), e sim o efeito caixa pós-custos no recorte filtrado.

### 3. Teste de regressão
Em `src/components/__tests__/` (ou novo arquivo `Financeiro.resultadoLiquido.test.tsx`), validar apenas a função pura:
```ts
expect(calcResultadoLiquido(10000, 5000)).toBe(5000);
expect(calcResultadoLiquido(-2000, 3000)).toBe(-5000);
```
Extrair `calcResultadoLiquido(fluxo, custos) = fluxo - custos` para um util em `src/lib/finance/resultadoLiquido.ts` e usar no Financeiro — garante reuso e facilita o teste.

## Fora de escopo
- Quebrar custo em "operacional vs administrativo vs imposto" no card (composição já existe no `ComposicaoCustosCard` abaixo).
- Adicionar coluna de impostos separada (não há modelo de impostos hoje no banco).
- Mudar `lucroRealizado`, `custoSustentacao` ou qualquer regra de período.
- Persistir snapshot do indicador (é derivado, sempre recalculável).

## Validação visual
1. Selecionar um mês com despesas conhecidas → conferir `Resultado Líquido = Fluxo Líquido − soma da Composição de Custos` exibida logo abaixo.
2. Período sem custos → `Resultado Líquido === Fluxo Líquido`.
3. Período só com custos (sem saque/aporte) → `Resultado Líquido` fica negativo igual a `−custoSustentacao`.

Posso aplicar?
