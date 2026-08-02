## Diagnóstico (verificado no código)

O `CalendarioLucros` recebe uma prop `initialMonth` e a usa como estado inicial (`useState(initialMonth ?? new Date())`), além de um `useEffect` que ressincroniza sempre que `initialMonth` muda.

Quem define esse valor:

- `src/components/projeto-detalhe/bonus/BonusResultadoLiquidoChart.tsx` (linhas 405-409): `calendarInitialMonth = dateRange?.start ?? new Date()`
- `src/components/projeto-detalhe/VisaoGeralCharts.tsx` (linha 542): `calendarInitialMonth = periodStart ?? new Date()`

**Causa raiz:** o mês inicial é sempre o **início do período filtrado**. Com o filtro "Ano", `dateRange.start` = 01/01 do ano corrente, então o calendário abre em janeiro. Não é limitação de biblioteca — o calendário é implementado à mão com `date-fns` (`addMonths`/`subMonths`), e a navegação é livre.

## Melhoria proposta

Criar um helper compartilhado `resolveCalendarInitialMonth(start, end)` que aplica a regra:

1. Se **hoje** está dentro do intervalo `[start, end]` → abrir no **mês de hoje**.
2. Senão, se hoje é posterior ao intervalo → abrir no mês de `end` (mês mais recente com dados no filtro; ex.: "Mês anterior" continua abrindo no mês anterior).
3. Senão (período totalmente futuro) → abrir no mês de `start`.
4. Sem intervalo definido → `new Date()`.

Toda a comparação usa o timezone operacional `America/Sao_Paulo`, coerente com `extractLocalDateKey`, para que a virada de dia/ano (31/12 → 01/01) seja correta independentemente do fuso do navegador.

Efeito por filtro:
- 1 dia / 7 dias / Mês atual → mês corrente (inalterado na prática)
- Mês anterior → mês anterior (regra 2, inalterado)
- **Ano → mês corrente** (correção pedida)
- Período custom → mês corrente se contiver hoje, senão o mês final do intervalo

## Detalhes técnicos

- Novo arquivo: `src/utils/calendarInitialMonth.ts` com a função pura + timezone São Paulo (`date-fns-tz`, já usado no projeto).
- `BonusResultadoLiquidoChart.tsx`: substituir o `useMemo` das linhas 405-409 por `resolveCalendarInitialMonth(dateRange?.start, dateRange?.end)`.
- `VisaoGeralCharts.tsx`: substituir a linha 542 por chamada equivalente com `periodStart`/`periodEnd`, sem alterar `calendarPeriodRange` (as estatísticas do período inteiro continuam funcionando como hoje).
- `CalendarioLucros.tsx` **não muda**: continua respeitando `initialMonth` e mantendo a navegação manual (o `useEffect` só reage a mudanças reais da prop, então navegar mês a mês não é revertido).

## Testes

Suíte unitária nova `src/utils/__tests__/calendarInitialMonth.test.ts` com data "hoje" fixada (fake timers), cobrindo:

- Ano com hoje em Janeiro, Junho, Julho, Novembro e Dezembro → abre no mês corrente
- Virada de ano: 31/12 23:30 BRT e 01/01 00:30 BRT → mês correto em ambos
- Filtro "Mês anterior" → continua abrindo no mês anterior
- Filtro "1 dia" e "7 dias" → mês corrente
- Período custom passado (ex.: mar-abr) → abre em abril
- Período futuro → abre no mês de início
- Sem range → mês corrente

Depois: rodar a suíte completa de testes para confirmar ausência de regressão, e validar visualmente na aba Bônus → Visão Geral que o gráfico permanece idêntico com o filtro Ano e o calendário abre no mês corrente.
