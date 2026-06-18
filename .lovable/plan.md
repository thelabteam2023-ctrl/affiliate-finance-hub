# Paridade Total — Visão Financeira ⇄ Análise Temporal

## Diagnóstico

Hoje as duas telas usam **pipelines diferentes** para calcular as mesmas métricas, e por isso divergem:

| Métrica | Visão Financeira (dashboard) | Análise Temporal (gráfico) |
|---|---|---|
| Fluxo Líquido | `useWorkspaceLucroRealizado` → `fetchProjetosLucroCanonico` (por projeto, com ciclo, baseline neutralizado, PTAX snapshot, anti-double-count de `DEPOSITO_VIRTUAL MIGRACAO`) | `useFinanceiroMensal` lê `cash_ledger` cru, soma tudo, **cotação live**, sem ciclo, sem baseline, sem anti-double-count |
| Custo Total | `useFinanceiroCalculations` (despesas + admin + operadores+RH + participações) | `useFinanceiroMensal` (mesma fonte, mesma regra) ✅ **já bate** |
| Resultado Líquido | Fluxo (canônico) − Custo | Fluxo (cru) − Custo → **diverge** |
| Margem | derivada do Resultado canônico | derivada do Resultado cru |
| Posição de Capital | snapshots/realtime canônicos | n/a no gráfico |

Conclusão: o **Custo já está alinhado**. A divergência inteira está no **Fluxo Líquido** (e por consequência Resultado e Margem). A correção é mover `useFinanceiroMensal` para a **mesma engine canônica** que o dashboard.

## Princípio

> **Uma única fonte de verdade financeira por workspace: `fetchProjetosLucroCanonico`.**
> Toda tela que mostre Fluxo Líquido / Resultado Líquido / Margem / Posição de Capital consome essa engine — direto ou via hook que a encapsula. Nada lê `cash_ledger` cru para esses KPIs.

## Escopo

### Em escopo
- Refatorar `src/hooks/useFinanceiroMensal.ts` para derivar Fluxo Líquido **mês a mês** chamando `fetchProjetosLucroCanonico` com janela `[primeiroDia(mes), ultimoDia(mes)]` para cada mês da janela visível, somando `lucroRealizadoBRL` (que já é Fluxo Canônico) por projeto.
- Manter Custo Total como está (já está alinhado).
- Recalcular Resultado Líquido = Fluxo Canônico − Custo Total e Margem a partir dele.
- Adicionar cache memoizado (React Query) para as chamadas mensais — chave `["financeiro-mensal-canonico", workspaceId, janelaMeses, mesReferencia]`.
- Garantir que o gráfico, KPIs do topo do modal, e a tabela mensal consumam o mesmo dado refatorado.
- Validar paridade com `useWorkspaceLucroRealizado` em janelas equivalentes (mês corrente, mês anterior, YTD).

### Fora de escopo
- Nenhuma mudança visual no `GraficoMensalDialog` (chips, camadas, área condicional permanecem como estão).
- Nenhuma mudança em `useFinanceiroCalculations`, `fetchProjetosLucroCanonico`, RPCs, schema do banco, ledger.
- Nenhuma alteração em exports PDF/XLSX (eles continuarão recebendo os mesmos campos, agora com valores canônicos).
- Não tocar em Posição de Capital (já é canônica) — só auditar que os componentes que aparecem na Visão Financeira lêem das fontes canônicas existentes.

## Mudanças técnicas

### 1. `src/hooks/useFinanceiroMensal.ts` — refatoração

Substituir a leitura de `finData.cashLedger` por:

```ts
// Para cada mês na janela visível:
const meses = enumerarMeses(inicioKey, nowKey);
const promises = meses.map(mesKey => {
  const inicio = startOfMonth(parseISO(`${mesKey}-01`));
  const fim    = endOfMonth(parseISO(`${mesKey}-01`));
  return fetchProjetosLucroCanonico({
    workspaceId,
    dataInicio: inicio.toISOString(),
    dataFim:    fim.toISOString(),
    projetoIds: undefined, // todos do workspace
  }).then(rows => ({
    mesKey,
    fluxoLiquido: rows.reduce((s, r) => s + (r.lucroRealizadoBRL || 0), 0),
  }));
});
```

Custo Total continua sendo agregado a partir de `finData.despesas / despesasAdmin / pagamentosOperador / participacoesPagas` (já bate com o dashboard).

`useFinanceiroMensal` passa a ser `async` por baixo: encapsular num `useQuery` interno com chave `["financeiro-mensal-canonico", workspaceId, janelaMeses, mesReferencia, incluirBaseline]`, `staleTime: 30s`.

Assinatura externa preservada (retorna `MesFinanceiro[]`) — consumidores não mudam.

### 2. Auditoria de consumidores

Listar e validar que estes componentes usam exclusivamente a engine canônica (direto ou via `useFinanceiroMensal` / `useWorkspaceLucroRealizado`):

- `DashboardFinanceiro` (cards de KPI: Resultado Líquido, Fluxo, Custo, Margem)
- `GraficoMensalDialog` (chart + KPIs do topo + tabela mensal)
- `ComposicaoCustoCard` — já usa `useFinanceiroCalculations` (custos), sem fluxo → ok
- `PosicaoCapitalCard` — auditar; deve ler de `useWorkspaceCapital` / canonical sources, não `cash_ledger` cru
- Qualquer outro card na aba "Visão Financeira" que mostre Fluxo/Resultado

Para cada um, abrir, confirmar a fonte, e — se estiver lendo `cash_ledger` cru — migrar para `useWorkspaceLucroRealizado` ou hook canônico equivalente.

### 3. Teste de paridade

Criar checklist manual (não automated test) executado após a refatoração:

1. Abrir Visão Financeira → anotar Fluxo Líquido / Resultado / Margem do mês corrente.
2. Abrir Análise Temporal → mês corrente no gráfico deve mostrar **exatamente os mesmos valores** (até a última casa decimal).
3. Repetir para mês anterior, 3 meses atrás, e total YTD.
4. Caso de teste do incidente: Abril → ambos devem mostrar R$ 9.403,71 (não mais R$ 17.490,18 no gráfico).

### 4. Performance

N meses (até 24) × 1 RPC `fetchProjetosLucroCanonico` cada = até 24 chamadas paralelas. A engine canônica já é otimizada e cacheada por React Query (chave compartilhada com Visão Geral em janelas comuns). Aceitável; reavaliar se latência > 1.5s.

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| `fetchProjetosLucroCanonico` não aceita janela `[inicio,fim]` por mês isoladamente | Verificar assinatura antes de codar; se necessário, adicionar parâmetros opcionais `dataInicio/dataFim` (mudança aditiva, sem quebrar callers existentes) |
| Baseline visual do gráfico (`isBaseline`) precisa continuar zerado | Manter lógica de baseline no wrapper; só o cálculo de Fluxo muda |
| Latência acumulada de 24 chamadas | React Query em paralelo + staleTime de 30s; chaves estáveis para cache hit |
| Exports PDF/XLSX referenciam campos antigos | Nenhum nome de campo muda (`fluxoLiquido`, `resultadoLiquido`, `margemOperacional`); só os valores ficam canônicos |

## Workspace e segurança

`workspaceId` continua sendo obtido implicitamente via hooks atuais (`useFinanceiroData` → token). `fetchProjetosLucroCanonico` já filtra `.eq("workspace_id", workspaceId)` internamente. Nenhuma nova superfície exposta.

## Validação final

- [ ] Visão Financeira e Análise Temporal mostram os mesmos números em todos os meses.
- [ ] Caso Abril resolvido (paridade exata).
- [ ] Posição de Capital e Composição de Custo continuam idênticas ao que eram (só auditadas).
- [ ] Tempo de abertura do modal Análise Temporal ≤ 1.5s na primeira carga.
- [ ] Nenhum console error / nenhuma regressão em outros consumidores de `useFinanceiroMensal`.
