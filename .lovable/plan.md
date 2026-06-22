# Plano P0 — “Nada aparece” em Todas Apostas / Histórico

## Leitura do problema atual

O problema agora não é apenas “arbitragem não aparece na aba Surebet”. Pela captura, a tela está em:

- Aba: `Todas Apostas`
- Subaba: `Histórico`
- Período: `Mês atual`
- Filtros visíveis: Casas, Parceiros, Estratégia, Resultado
- Resultado visível: apenas 1 aposta simples liquidada

Isso indica que a lista final está sendo reduzida em algum ponto depois do carregamento, possivelmente por:

1. filtro de período;
2. filtro de subaba Abertas/Histórico;
3. filtro persistido em localStorage;
4. filtro de estratégia/resultado/casa/parceiro;
5. busca textual;
6. transformação `surebets -> apostasUnificadasBase -> apostasHistoricoList -> apostasUnificadas`;
7. divergência entre dados carregados no KPI e dados renderizados na lista.

## Do I know what the issue is?

Parcialmente.

Já foi confirmada uma causa raiz anterior: filtros por `estrategia = SUREBET` omitiam operações `forma_registro = ARBITRAGEM` com estratégia analítica diferente. Porém a captura mostra a aba `Todas Apostas`, e ali ainda há outros pontos capazes de ocultar tudo mesmo quando os dados existem.

O plano abaixo isola exatamente onde a operação desaparece.

## Objetivo

Criar uma auditoria controlada, sem alterar dados reais, para responder:

- quantas apostas existem no banco para o projeto e período selecionado;
- quantas chegam ao frontend em cada fetch;
- quantas sobrevivem aos filtros locais;
- quantas entram em Abertas e Histórico;
- quantas chegam ao render final;
- qual filtro ou transformação está removendo as operações.

## Escopo protegido

Durante esta investigação:

- não alterar saldos;
- não atualizar `saldo_atual` nem `saldo_freebet`;
- não executar UPDATE/DELETE em apostas reais;
- não fazer correção retroativa em massa;
- não alterar RPC financeira;
- não recalcular P&L de Surebet no client;
- não mudar ledger;
- não inserir dados no banco real para teste.

## Fase 1 — Coleta automática do estado real da tela

### 1.1 Reproduzir com Playwright

Abrir a preview autenticada e capturar:

- URL atual;
- projeto aberto;
- período selecionado;
- subaba selecionada: Abertas/Histórico;
- filtros ativos;
- texto da busca;
- número exibido nos badges;
- cards renderizados;
- erros de console;
- requests falhando.

### 1.2 Capturar localStorage de filtros

Verificar chaves como:

```text
tab-filters-<projetoId>-apostas
tab-filters-<projetoId>-surebet
```

Confirmar se há filtros persistidos invisíveis ou antigos, por exemplo:

- `bookmakerIds` antigo;
- `parceiroIds` antigo;
- `sortOrder`;
- período salvo;
- estado que não aparece visualmente, mas ainda filtra.

### 1.3 Conferir console/runtime probes

Ler:

```text
window.__SUREBET_LIFECYCLE__
window.__TAB_DIFF__
window.__INTEGRITY_LOG__
```

Objetivo: identificar se as apostas chegam na query bruta e somem no mapper/filtro/render.

## Fase 2 — Consulta read-only no banco

Para o projeto da tela, executar apenas SELECTs:

### 2.1 Contagem por forma, estratégia e status

```sql
SELECT forma_registro, estrategia, status, resultado, COUNT(*)
FROM apostas_unificada
WHERE projeto_id = :projeto_id
  AND cancelled_at IS NULL
GROUP BY forma_registro, estrategia, status, resultado;
```

### 2.2 Comparar período do filtro atual

Contar apostas dentro e fora do `Mês atual`:

```sql
SELECT
  COUNT(*) FILTER (WHERE data_aposta BETWEEN :inicio AND :fim) AS dentro_periodo,
  COUNT(*) FILTER (WHERE status = 'PENDENTE') AS pendentes_total,
  COUNT(*) FILTER (WHERE status <> 'PENDENTE' AND data_aposta BETWEEN :inicio AND :fim) AS historico_periodo
FROM apostas_unificada
WHERE projeto_id = :projeto_id
  AND cancelled_at IS NULL;
```

### 2.3 Conferir arbitragens com pernas e entries

```sql
SELECT
  au.id,
  au.evento,
  au.forma_registro,
  au.estrategia,
  au.status,
  au.resultado,
  au.data_aposta,
  COUNT(DISTINCT ap.id) AS pernas,
  COUNT(ape.id) AS entries
FROM apostas_unificada au
LEFT JOIN apostas_pernas ap ON ap.aposta_id = au.id
LEFT JOIN apostas_perna_entradas ape ON ape.perna_id = ap.id
WHERE au.projeto_id = :projeto_id
  AND au.forma_registro = 'ARBITRAGEM'
  AND au.cancelled_at IS NULL
GROUP BY au.id
ORDER BY au.data_aposta DESC;
```

## Fase 3 — Ambiente virtual controlado sem dados reais

Criar fixtures locais em testes Vitest, sem banco real:

### 3.1 Fixture A — histórico com arbitragem bônus

Simular:

```text
forma_registro = ARBITRAGEM
estrategia = EXTRACAO_BONUS
status = LIQUIDADA
resultado = GREEN/RED
pernas = 3
entries = 3 ou 4
```

Resultado esperado:

- deve aparecer em `Todas Apostas > Histórico` quando período bate;
- deve aparecer se filtro Estratégia = Todas;
- deve aparecer se filtro Estratégia = Surebet, por ser operação criada pelo formulário de Arbitragem;
- deve preservar entries.

### 3.2 Fixture B — aberta fora do período

Simular:

```text
forma_registro = ARBITRAGEM
status = PENDENTE
data_aposta fora do mês atual
```

Resultado esperado:

- deve aparecer em `Abertas` mesmo fora do período, se a regra do sistema for “pendentes sempre aparecem”.

### 3.3 Fixture C — filtros persistidos

Simular filtros locais:

- casa selecionada que não pertence à aposta;
- parceiro selecionado que não pertence à aposta;
- resultado selecionado incompatível;
- busca textual não compatível.

Resultado esperado:

- teste deve apontar qual filtro removeu a aposta;
- filtro oculto/persistido não pode deixar a tela aparentemente vazia sem diagnóstico.

## Fase 4 — Instrumentação cirúrgica de visibilidade

Adicionar uma função interna sem UI invasiva:

```text
src/utils/apostasVisibilityProbe.ts
```

Ela deve registrar contagens por etapa:

```text
FETCH_SIMPLES_RETURNED
FETCH_MULTIPLAS_RETURNED
FETCH_ARBITRAGENS_RETURNED
UNIFIED_BASE_BUILT
FILTER_BOOKMAKER_APPLIED
FILTER_PARCEIRO_APPLIED
FILTER_ESTRATEGIA_APPLIED
FILTER_RESULTADO_APPLIED
FILTER_CONTEXTO_APPLIED
SPLIT_ABERTAS_HISTORICO
SEARCH_FILTER_APPLIED
RENDER_READY
```

E expor no navegador:

```text
window.__APOSTAS_VISIBILITY__.summary()
window.__APOSTAS_VISIBILITY__.byId(apostaId)
window.__APOSTAS_VISIBILITY__.export()
```

Sem bloquear renderização e sem gravar dados sensíveis.

## Fase 5 — Correções prováveis após diagnóstico

Só aplicar depois de confirmar a etapa exata.

### Possível correção 1 — Filtro de casa em surebets

Hoje o trecho de `Todas Apostas` ainda usa:

```ts
sb.pernas?.some(p => selectedBookmakerIds.includes(p.bookmaker_id))
```

Isso ignora `entries[]`. Deve usar o helper canônico:

```ts
apostaMatchesBookmakerFilter(sb, selectedBookmakerIds)
```

### Possível correção 2 — Preservar entries no render final

No render de `SurebetCard` dentro de `Todas Apostas`, o mapper recria as pernas e pode não passar `entries` para `groupPernasBySelecao`.

Deve garantir:

```ts
entries: p.entries
```

para não transformar uma arbitragem multi-entry em linha vazia/incompleta.

### Possível correção 3 — Diagnóstico de filtros ativos

Se `apostasUnificadasBase` tem dados mas `apostasUnificadas` fica vazio, exibir ou registrar internamente o motivo:

```text
removida_por: RESULTADO | CASA | PARCEIRO | ESTRATEGIA | BUSCA | SUBABA | PERIODO
```

### Possível correção 4 — Estado persistido inválido

Se o problema for localStorage antigo, ajustar `useTabFilters` para:

- validar IDs salvos contra casas/parceiros atuais;
- descartar filtros persistidos que não existem mais;
- permitir reset automático quando todos os dados são ocultados por filtro inválido.

## Fase 6 — Validação final

Validar em três camadas:

### 6.1 Banco

Confirmar que as operações existem e têm pernas/entries.

### 6.2 Teste virtual

Rodar testes com fixtures controladas:

```text
surebetVisibility.test.ts
apostasVisibilityPipeline.test.ts
groupPernasBySelecao.test.ts
```

### 6.3 Preview

No navegador:

- abrir `Todas Apostas`;
- alternar `Abertas` e `Histórico`;
- mudar período;
- limpar filtros;
- filtrar por Surebet;
- filtrar por Bônus;
- buscar por evento/casa;
- confirmar que a operação esperada aparece.

## Resultado esperado

Ao final, teremos uma resposta objetiva:

```text
A aposta existe no banco? Sim/Não
Chega no fetch? Sim/Não
Sobrevive ao mapper? Sim/Não
É removida por qual filtro? <motivo>
Chega ao render? Sim/Não
Correção aplicada: <arquivo/linha>
Teste que impede regressão: <teste>
```

## Critério de conclusão

O problema só será considerado resolvido quando:

- a contagem do banco bater com a contagem carregada;
- a diferença entre carregado e renderizado tiver motivo explícito;
- arbitragens abertas aparecerem em `Abertas`;
- arbitragens liquidadas aparecerem em `Histórico`;
- multi-entry preservar todas as casas;
- filtros de casa/parceiro/estratégia não ocultarem indevidamente operações válidas;
- testes isolados passarem sem tocar nos dados reais.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>