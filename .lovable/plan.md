

## Plano: Mover indicador de Lucro Patrimonial para dentro do KPI "Lucro" da aba Surebet

### O que muda

O indicador de **Prejuízo/Lucro patrimonial** (que hoje aparece como um botão separado na barra de KPIs com o ícone `$`) será removido de sua posição atual e integrado como um **popover** acessível a partir do KPI "Lucro" da aba Surebet.

Na prática, ao clicar no valor de Lucro (ex: "R$ 79,01"), além do tooltip de breakdown por moeda que já existe, aparecerá o `FinancialMetricsPopover` com o detalhamento completo (fluxo de caixa, patrimônio, lucro realizado).

### Mudanças técnicas

1. **`ProjetoSurebetTab.tsx`** — No `leading` do `KpiSummaryBar`, remover o `<FinancialSummaryCompact>`. Manter apenas o `<SaldoOperavelCard>`.

2. **`ProjetoSurebetTab.tsx`** — No KPI "Lucro" (linhas ~1063-1078), trocar o `wrapper` de `LucroCurrencyTooltip` para um **Popover** que combine:
   - O breakdown por moeda (conteúdo atual do `LucroCurrencyTooltip`)
   - O `FinancialMetricsPopover` completo (conteúdo atual do botão `$`)
   
   O popover será ativado por clique no valor de Lucro, e mostrará as duas seções em sequência: primeiro o breakdown de moedas (se multi-moeda), depois o detalhamento financeiro do projeto.

3. **Escopo**: Apenas a aba Surebet será modificada neste momento. As demais abas (ValueBet, Duplo Green, Bônus) continuam com o layout atual até validação.

### Resultado esperado

- O KPI "Lucro R$ 79,01" passa a ser clicável
- Ao clicar, abre um popover com:
  - Breakdown por moeda (se houver múltiplas moedas)
  - Separador
  - Detalhamento financeiro completo (Fluxo de Caixa, Patrimônio, Lucro Realizado)
- O botão `$` com "Prejuízo R$ -1.274,47" desaparece da barra, liberando espaço

