
## Objetivo

1. Permitir que o Resumo Operacional (IA) use um **período personalizado** escolhido pelo usuário, e não apenas a janela fixa de 12 meses da Análise Temporal.
2. Incluir no resumo os **valores em disputa** (capital em risco, ainda não perdido, mas potencialmente irrecuperável), para que a IA explique também a exposição pendente.

---

## 1. Período personalizável

### UX
No `ResumoOperacionalDialog`, adicionar no topo (acima dos cards) um seletor de período com 5 presets + range custom:

- **Janela da Análise Temporal** (atual — default; mantém 12m/24m/baseline)
- **Mês atual**
- **Mês anterior**
- **Ano atual**
- **Todo histórico**
- **Período personalizado** → dois `DatePicker` (início/fim)

Botão **"Gerar resumo"** dispara o cálculo. Trocar período não dispara automaticamente (evita gastar créditos da Lovable AI a cada clique).

### Fluxo
1. Usuário abre o diálogo → vê seletor + estado vazio com CTA "Gerar resumo".
2. Escolhe período → clica em "Gerar".
3. Hook recalcula janela → busca métricas/exposição → chama edge function.
4. Texto + cards exibidos. Pode trocar período e regenerar (botão muda para "Regenerar").

### Métricas por período arbitrário
Hoje `useResumoOperacional` deriva `dataInicio/dataFim` de `mesesFinanceiro` (janela da Análise Temporal). Mudança:

- O hook passa a receber `{ dataInicio, dataFim }` como parâmetro (controlado pelo diálogo).
- A agregação de Fluxo/Custos/Resultado deixa de somar `mesesFinanceiro` diretamente. Em vez disso:
  - Filtra `mesesFinanceiro` pelos meses que caem dentro da janela escolhida (quando a janela é múltipla de meses do array já carregado), **ou**
  - Para janelas fora do array carregado (ex.: "Todo histórico" extrapola 24m), recarrega `useFinanceiroMensal` com `meses` suficiente OU usa um caminho dedicado de agregação direta sobre `finData` filtrado pelo intervalo.

Para minimizar mudança: estender `useFinanceiroMensal` para aceitar opcionalmente um `intervalo = { inicio, fim }` que sobrescreve a janela de N meses, retornando apenas os meses cobertos. Isso preserva paridade (mesma engine canônica).

### Edge function (`resumo-operacional`)
- Aceita novo campo `periodo.tipo` ("janela_temporal" | "mes_atual" | "mes_anterior" | "ano_atual" | "todo_historico" | "customizado") para contextualizar o prompt.
- Texto do prompt passa a citar o intervalo escolhido explicitamente ("entre DD/MM/AAAA e DD/MM/AAAA").

---

## 2. Capital em Disputa no resumo

### Fonte canônica
Reusar `useExposicaoFinanceira` (já integrado no fix anterior). Ele já entrega:

- `totalEmDisputa` (BRL)
- `bySegmentDisputa` (bookmakers, caixa-op, wallets, contas-parc)
- `detalhes.disputaBookmakers/Wallets/ContasParceiros/Caixa` (listas com valor + label)
- `totalIrrecuperavel` (estoque atual de saldo irrecuperável em casas)

Importante: **disputa não tem recorte temporal** (são ocorrências em aberto = snapshot atual). Vamos comunicar isso explicitamente no diálogo: "valores em disputa refletem o snapshot atual, independente do período selecionado".

### UI — cards adicionais
Adicionar no `ResumoOperacionalDialog` uma segunda linha de cards "Exposição Pendente":

```
[ EM DISPUTA  ]   [ IRRECUPERÁVEL ]   [ EXPOSIÇÃO TOTAL ]
 R$ 18.358,89      R$ X.XXX           R$ X.XXX
 5 ocorrências     2 casas             (soma dos 2)
```

Cada card mostra também a quebra por segmento principal (texto pequeno: "Casas R$ 18,3k · Wallets R$ 0").

### Lucro Real Ajustado
Manter `Lucro Real = Resultado Líquido − Perdas Confirmadas`.

Adicionar um **6º card opcional**: **"Lucro Real (worst-case)"** = `Lucro Real − Em Disputa − Irrecuperável`. Tooltip: "Cenário onde 100% das disputas viram perda. Apenas referência de risco — não é resultado contábil."

### Prompt da IA
Estender o payload enviado à edge function:

```ts
exposicaoPendente: {
  emDisputa: number,
  irrecuperavel: number,
  bySegment: { bookmakers, caixa-op, wallets, contas-parc },
  topOcorrencias: [{ label, valor, segmento }] // top 5 por valor
}
```

Atualizar o system prompt para incluir um parágrafo dedicado:
- Quantos R$ estão em disputa e em quais segmentos.
- Quantos R$ já são considerados irrecuperáveis (saldo travado em casas).
- Frase explícita: "Estes valores ainda não impactaram o Lucro Real, mas representam risco de baixa adicional caso as disputas sejam perdidas."
- Caso zero: dizer explicitamente que não há disputas/irrecuperáveis no momento.

---

## 3. Detalhes Técnicos

**Arquivos editados:**
- `src/hooks/useResumoOperacional.ts`
  - Recebe `{ dataInicio, dataFim, periodoTipo, periodoLabel }` como parâmetros controlados.
  - Recebe `exposicao: ExposicaoFinanceira` (já tem) — adiciona payload `exposicaoPendente`.
  - `run()` deixa de derivar janela de `mesesFinanceiro`; usa params.
  - Agregação de Fluxo/Custo/Resultado: filtrar `mesesFinanceiro` pelos `mesKey` que caem no intervalo (helper `mesKeyEmIntervalo`).
- `src/hooks/useFinanceiroMensal.ts` (mínimo)
  - Sem mudança estrutural. Janela continua sendo `meses=N`. Para períodos > janela atual, o diálogo emite `setJanelaMeses` temporariamente (ou usa um cálculo independente via `finData`).
  - **Alternativa preferida**: o diálogo, para presets que extrapolam a janela carregada, pede ao usuário "Aumentar janela para X meses" antes de gerar (evita refetch oculto).
- `src/components/financeiro/ResumoOperacionalDialog.tsx`
  - Adiciona `<PeriodoSelector>` (5 presets + custom range com `react-day-picker`).
  - Adiciona linha de cards "Exposição Pendente".
  - Botão "Gerar/Regenerar resumo" que chama `result.run({ dataInicio, dataFim, tipo })`.
  - Estado vazio inicial (antes da primeira geração).
- `src/pages/Financeiro.tsx`
  - `useExposicaoFinanceira` chamado uma vez sem janela específica para Em Disputa (que é snapshot), e outra com janela para Perdas. Ou: separar `disputa` (snapshot) de `perdas` (janela) e passar os dois ao hook do resumo.
- `supabase/functions/resumo-operacional/index.ts`
  - Aceita campos novos: `exposicaoPendente`, `periodoTipo`.
  - Prompt atualizado com seção dedicada a Capital em Disputa e Irrecuperável.
  - Mantém Gemini 3 Flash Preview.

**Sem migrações de banco.** Sem novas tabelas. Sem novas RLS.

---

## 4. Critérios de aceite

- [ ] Diálogo abre vazio com seletor de período visível.
- [ ] Presets "Mês atual", "Mês anterior", "Ano atual", "Todo histórico", "Customizado" funcionam.
- [ ] Período "Customizado" valida `inicio <= fim`.
- [ ] Cards de métricas refletem exatamente o período escolhido (paridade com Visão Financeira filtrada pelo mesmo período).
- [ ] Card "Em Disputa" sempre mostra snapshot atual, com nota explícita.
- [ ] Card "Irrecuperável" mostra estoque atual.
- [ ] Card opcional "Lucro Real (worst-case)" calcula `Lucro Real − EmDisputa − Irrecuperável`.
- [ ] Texto da IA cita explicitamente: período escolhido, perdas do período (SCAN+ocorrências), capital em disputa por segmento, irrecuperável, e o impacto potencial.
- [ ] Caso de zero disputas → IA reconhece explicitamente.
- [ ] Botão "Regenerar" disponível após primeira geração; troca de período não dispara IA automaticamente.
- [ ] Nenhum recálculo client-side novo de perdas — tudo vem de `useExposicaoFinanceira`.
