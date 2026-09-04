# Liquidação por perna: aposta parcial indo para o Histórico

## Diagnóstico (confirmado no código e no banco)

Ao liquidar **uma** perna, a rotina do banco `liquidar_perna_surebet_v1` recalcula o pai
(`fn_recalc_pai_surebet` — que corretamente devolve `todas_liquidadas = false`) e então grava:

```text
status    = CASE WHEN todas_liquidadas THEN 'LIQUIDADA' ELSE 'PARCIAL'   END
resultado = CASE WHEN todas_liquidadas THEN <GREEN/RED/VOID> ELSE 'PENDENTE' END
```

Ou seja: com uma perna resolvida e outra em aberto, a aposta fica
`status = 'PARCIAL'` e `resultado = 'PENDENTE'` (texto, não vazio).

O separador Abertas/Histórico de cada aba não conhece o estado `PARCIAL`:

| Aba | Regra de "Aberto" | Regra de "Histórico" | Efeito com PARCIAL |
|---|---|---|---|
| Bônus (`BonusApostasTab`) | `status === 'PENDENTE' \|\| !resultado` | `status !== 'PENDENTE' && resultado` | **vai para o Histórico** (o caso do print) |
| Duplo Green | `status === 'PENDENTE'` | `status === 'LIQUIDADA'` | **some das duas listas** |
| Apostas | inclui `resultado === 'PENDENTE'` | exige os dois | fica em Aberto (correto) |
| Punter / ValueBet | `resultado === 'PENDENTE'` | idem | fica em Aberto (correto) |

Confirmações:
- Nenhum arquivo do front trata a palavra `PARCIAL` como estado de aposta — só o banco a produz.
- No banco, apenas `liquidar_perna_surebet_v1` grava `'PARCIAL'`; hoje não há nenhuma linha
  nesse estado (a operação do print já foi finalizada, as duas pernas estão RED).
- `fn_recalc_pai_surebet` já está correta: só declara resultado final quando todas as pernas
  têm resultado. O erro está na tradução desse booleano para `status`/`resultado` do pai.

Causa raiz: **um estado intermediário (`PARCIAL` + `resultado='PENDENTE'`) que nenhum consumidor
reconhece**, somado a três regras diferentes de "aberto x histórico" espalhadas pelas abas.

## Correção proposta

### 1. Banco — parcial é PENDENTE

Em `liquidar_perna_surebet_v1`, enquanto houver perna sem resultado, o pai passa a gravar
`status = 'PENDENTE'` e `resultado = NULL` (o mesmo formato já usado pelas apostas realmente
abertas: 13 linhas hoje com `PENDENTE` + `resultado` nulo). Nada muda quando todas as pernas
estão resolvidas.

O lucro parcial continua sendo recalculado e gravado (é usado na projeção do card), mas não
qualifica mais a aposta como concluída.

Faixa correlata: `deletar_perna_surebet_v1` e `recalcular_pai_surebet_multimoeda` usam o mesmo
recálculo — serão alinhados à mesma convenção.

### 2. Front — uma única regra de ciclo de vida

Criar um helper único (`src/utils/operacaoLifecycle.ts`) com
`isOperacaoAberta(op)` / `isOperacaoConcluida(op)`, definido como:

```text
aberta    = !resultado || resultado === 'PENDENTE' || status === 'PENDENTE' || status === 'PARCIAL'
concluída = !aberta
```

O `PARCIAL` entra no helper como rede de proteção para dados legados ou qualquer outro caminho
que ainda o produza. Substituir por esse helper as regras duplicadas em:
`BonusApostasTab`, `ProjetoDuploGreenTab`, `ProjetoApostasTab`, `ProjetoPunterTab`,
`ProjetoValueBetTab`, `ProjetoSurebetTab` e nos contadores das abas.

### 3. Sinalização visual

No card, quando houver pernas resolvidas e pernas pendentes, exibir o selo
**"Parcial (1/2)"** ao lado de "Pendente" — a aposta continua em Aberto, mas fica claro que
parte já foi conferida.

### 4. KPIs, relatórios e filtros

KPIs e relatórios consolidados já filtram por `status = 'LIQUIDADA'`, então a mudança os deixa
mais corretos (aposta parcial deixa de ter chance de entrar). Vou revisar os pontos que usam
`resultado !== 'PENDENTE'` isoladamente (`CalendarioLucros`, `PerformancePorCasaSection`,
`bookmakerUsageAnalytics`) para passarem pelo mesmo helper.

## Riscos de regressão

- Operações que hoje aparecem no Histórico por estarem parcialmente liquidadas voltarão para
  Aberto — é o comportamento pedido, mas muda a contagem das abas.
- Duplo Green: apostas parciais que hoje somem das duas listas voltarão a aparecer em Aberto.
- Nenhuma alteração em saldo, ledger ou lucro: os eventos financeiros por perna continuam
  exatamente como estão. Nenhuma correção em massa de dados históricos.

## Plano de testes

Por aba (Bônus, Surebet, Duplo Green, Punter, ValueBet, Apostas):

```text
2 pernas: 1 RED  + 1 pendente          -> Aberto, selo Parcial (1/2)
2 pernas: 1 GREEN+ 1 pendente          -> Aberto
2 pernas: RED + GREEN                  -> Histórico, resultado calculado
3 pernas: 2 resolvidas + 1 pendente    -> Aberto
3 pernas: todas resolvidas             -> Histórico
perna com múltiplas sub-entradas       -> mesma regra
reverter a última perna p/ PENDENTE    -> volta de Histórico para Aberto
excluir a perna pendente               -> pai fecha e vai para Histórico
```

Mais: contadores das abas, filtro de período (Abertas ignora período), KPIs de lucro antes e
depois de liquidar a última perna, e verificação de que os eventos financeiros por perna
permanecem idênticos.
