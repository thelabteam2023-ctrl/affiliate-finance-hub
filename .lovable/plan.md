# Rascunho de Arbitragem: sub-entradas perdidas ao reabrir

## Causa raiz (confirmada por leitura de código)

O problema **não é de renderização** e **não é do banco**: rascunhos vivem em `localStorage` (`useApostaRascunho`), nunca tocam o Supabase. A inconsistência é entre o **modelo do formulário** e o **modelo de persistência do rascunho**.

- O formulário representa uma perna como `OddEntry`, que contém `additionalEntries: OddFormEntry[]` (as casas adicionais da mesma perna), além de `tipo` (back/lay), `comissao`, `fonteSaldo`, `isReference`.
- O modelo de rascunho `RascunhoPernaData` (`src/hooks/useApostaRascunho.ts`) só tem: `bookmaker_id`, `bookmaker_nome`, `selecao`, `selecao_livre`, `odd`, `stake`, `moeda`. **Não existe campo para sub-entradas.**

Consequências, nos dois pontos da cadeia:

1. **Gravação** (`SurebetModalRoot.tsx`, `handleSalvarRascunho`): o `odds.map(...)` monta só os campos escalares da entrada principal. As `additionalEntries` são descartadas no momento do save — a segunda casa nunca chega ao `localStorage`.
2. **Leitura** (`SurebetModalRoot.tsx`, efeito de abertura, ramo `else if (rascunho)`): a reconstrução faz `additionalEntries: []` **hardcoded**, além de não restaurar `tipo`, `comissao`, `fonteSaldo` nem data/hora.

O mesmo par de defeitos existe em `SurebetDialogTable.tsx` (ramo `else if (rascunho)` da hidratação), que é a outra visão do formulário.

Isso responde às perguntas da investigação: as sub-entradas **não são persistidas** (falha na gravação) e **também não seriam reconstruídas** (falha na leitura); o problema é independente da quantidade (2, 3 ou N entradas na mesma perna) e é **exclusivo do fluxo de rascunho** — o fluxo de edição de operação registrada usa `fetchLinkedPernas`/`hydratePernasIntoForm`, que já monta `additionalEntries` a partir de `apostas_perna_entradas`.

## O que será feito

### 1. Modelo de rascunho (`src/hooks/useApostaRascunho.ts`)
- Adicionar `entradas_adicionais?: RascunhoEntradaData[]` em `RascunhoPernaData`, com `bookmaker_id`, `bookmaker_nome`, `odd`, `stake`, `moeda`, `selecao_livre`, `fonte_saldo`, `tipo`, `comissao`.
- Adicionar em `RascunhoPernaData` os campos hoje perdidos: `fonte_saldo`, `tipo`, `comissao`.
- Adicionar `data_aposta?: string` no rascunho (hoje a data/hora também se perde).
- Atualizar `isPernaCompleta`/`calcularEstado` para contar sub-entradas válidas como parte da perna (uma perna com principal incompleta mas sub-entrada válida não deve ser tratada como vazia).
- Compatibilidade: rascunhos antigos sem `entradas_adicionais` continuam carregando normalmente (campo opcional).

### 2. Gravação (`SurebetModalRoot.tsx` → `handleSalvarRascunho`)
- Mapear `entry.additionalEntries` para `entradas_adicionais`, filtrando entradas totalmente vazias mas **preservando** parciais (rascunho aceita incompleto).
- Persistir `tipo`, `comissao`, `fonte_saldo` da perna e `data_aposta`.

### 3. Reconstrução (`SurebetModalRoot.tsx`, ramo `rascunho`)
- Substituir `additionalEntries: []` pela reconstrução real a partir de `perna.entradas_adicionais` (N entradas suportadas), restaurando `tipo`, `comissao`, `fonteSaldo` e `data_aposta`.
- Marcar as sub-entradas na `HydrationAudit` como origem `draft`, igual às principais.

### 4. Paridade na segunda visão (`SurebetDialogTable.tsx`)
- Aplicar exatamente a mesma gravação/reconstrução para que alternar entre tabela e modal não perca dados.

### 5. Testes de regressão
Novo arquivo `src/components/surebet/__tests__/SurebetRascunhoRoundtrip.test.ts` cobrindo o ciclo completo em funções puras extraídas (serialize/deserialize de rascunho):
- 3 pernas, perna 1 com 2 entradas → salvar → reabrir → estrutura idêntica.
- Perna com 3+ entradas na mesma perna.
- Perna LAY com comissão e `fonte_saldo = FREEBET`.
- Rascunho legado (sem `entradas_adicionais`) carrega sem quebrar.
- Reabrir → editar (adicionar/remover sub-entrada) → salvar de novo → reabrir: sem duplicação e sem perda.

## Detalhes técnicos

Para tornar o roundtrip testável e impedir a divergência voltar, a conversão será centralizada em um módulo único (`src/utils/surebetRascunhoMapper.ts`) com duas funções puras — `oddsToRascunhoPernas(odds)` e `rascunhoPernasToOdds(pernas, defaultSelecoes)` — consumidas por `SurebetModalRoot` e `SurebetDialogTable`. Nenhuma alteração de banco, RPC ou lógica financeira: rascunhos permanecem 100% locais e sem efeito em saldo/ledger.
