# Auditoria: "Período anterior" na Composição de Custos (Dashboard Financeiro)

## 1. Regra atual (confirmada em código)

`src/hooks/useFinanceiroCalculations.ts` → `totalCustosAnterior`:

```text
start     = dataInicio do filtro ativo
end       = dataFim do filtro ativo
duração   = dias(end - start) + 1
prevEnd   = start - 1 dia
prevStart = prevEnd - (duração - 1)
```

Ou seja: **janela móvel com a mesma quantidade de dias do período atual**, terminando na véspera do início do período atual. Não é o mês calendário anterior.

## 2. Reprodução do caso de agosto (hoje 19/08/2026)

- Filtro "Mês atual" → `01/08 → 19/08` (19 dias).
- Janela anterior calculada pelo código → `13/07 → 31/07` (19 dias).
- Consulta ao banco confirma:
  - Despesas administrativas 13/07–31/07 = **R$ 506,55**
  - Despesas administrativas 01/07–31/07 = **R$ 7.844,06**
  - Somando as demais famílias (custos de aquisição etc.), fecha exatamente em **R$ 706,55** (janela móvel) vs **R$ 8.244,06** (julho completo).

Origem dos R$ 706,55: recorte 13/07–31/07 das mesmas 5 famílias de custo.
Origem dos R$ 8.244,06: recorte 01/07–31/07 (mês calendário) — o que o usuário obtém ao selecionar "Mês anterior".

Não há divergência de fonte de dados, filtro, workspace, moeda ou agregação: as duas somas usam os mesmos arrays (`despesas`, `despesasAdmin`, `pagamentosOperador`), buscados sem filtro de data. **A única diferença é a janela temporal.**

## 3. Causa raiz

O KPI usa comparação de janela móvel enquanto o rótulo diz "vs anterior" e o filtro ativo é um **mês calendário parcial**. Como o mês corrente é truncado em "hoje", a janela espelhada invade o meio do mês anterior e descarta a maior parte dos custos (pagamentos concentrados no início do mês).

## 4. Fórmula percentual atual

```ts
variacaoTotal = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : 0
```

Problemas: com base minúscula (706,55) o resultado explode (+712,8% / +7989,5%); anterior = 0 devolve 0% silenciosamente (indistinguível de "sem variação"); não há tratamento de "sem dados".

## 5. Regra correta proposta

O período anterior passa a ser derivado do **preset do dashboard**, espelhando exatamente o que o usuário obteria selecionando o período anterior manualmente:

| Preset atual | Período anterior |
|---|---|
| Mês atual (01→hoje) | Mês calendário anterior completo (01→último dia) |
| Mês anterior | Mês retrasado completo |
| Ano | Ano calendário anterior completo |
| Tudo | Sem comparação (badge neutro) |
| Personalizado | Janela móvel de mesma duração imediatamente anterior (explícito no tooltip) |

Isso satisfaz o critério de consistência: o valor do KPI é reproduzível selecionando o período no próprio filtro.

## 6. Implementação

**`src/types/dashboardFilters.ts`**
- Nova função `getPreviousDashboardDateRange(filter, customRange)` retornando `{ start, end, label, mode: 'CALENDAR' | 'ROLLING' | 'NONE' }`, no mesmo timezone operacional já usado (`America/Sao_Paulo`), com virada de ano coberta por `subMonths`/`subYears`.

**`src/pages/Financeiro.tsx`**
- Calcular `prevRange` a partir de `periodoPreset` + `customRange` e repassar ao hook de cálculos.

**`src/hooks/useFinanceiroCalculations.ts`**
- `totalCustosAnterior` deixa de derivar a janela de `dataInicio/dataFim` e passa a receber `prevRange`.
- Expor `prevRangeLabel` e `prevRangeMode` para a UI.
- Manter a soma das mesmas 5 famílias (paridade garantida com o período atual).

**`src/components/financeiro/ComposicaoCustosCard.tsx`**
- Novas props `periodoAnteriorLabel` / `comparisonMode`.
- Badge passa a exibir o período comparado (ex.: "-30,3% vs julho de 2026") e o tooltip mostra o intervalo exato.
- Casos-limite: anterior = 0 e atual > 0 → badge "novo" (sem percentual); ambos 0 → "sem variação"; preset "Tudo" → badge oculto.

## 7. Impacto em outros KPIs

A lógica de janela móvel (`differenceInCalendarDays` + `subDays`) hoje existe **apenas** em `useFinanceiroCalculations.ts` (`totalCustosAnterior`); nenhum outro KPI compartilha essa função, então a correção fica contida. Durante a implementação, revisar os demais cards do Financeiro com rótulo "vs anterior" e migrar qualquer janela montada inline para `getPreviousDashboardDateRange`.

## 8. Plano de testes

1. Agosto (hoje 19/08): atual R$ 5.742,63, anterior deve virar **R$ 8.244,06**, variação ≈ -30,3%.
2. Selecionar "Mês anterior" no filtro → total exibido deve bater com o valor usado como anterior no passo 1.
3. Janeiro: anterior = dezembro do ano anterior (virada de ano).
4. Dia 01 do mês: atual quase zerado, anterior = mês completo, sem divisão por zero.
5. Preset "Ano": anterior = ano anterior completo.
6. Preset "Tudo": badge de comparação oculto.
7. Personalizado: janela móvel de mesma duração, com rótulo explícito.
8. Anterior = 0 → badge "novo", sem `Infinity`/`NaN`.
9. Trocar de workspace e confirmar que ambos os lados da comparação respeitam o mesmo `workspace_id`.
