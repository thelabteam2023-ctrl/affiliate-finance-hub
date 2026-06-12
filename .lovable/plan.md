# Resumo Financeiro Multi-Moeda — Histórico do Caixa Operacional

## Diagnóstico

`src/components/caixa/HistoricoMovimentacoes.tsx` (linhas 522-563) já agrega por moeda via `getMoedaEfetiva` / `getValorEfetivo`. A renderização (linha 599) faz `.slice(0, 1)` e mostra apenas a primeira moeda — por isso cripto desaparece do cabeçalho. Nenhuma mudança de schema/RPC é necessária.

Padrão já adotado no projeto (mem `crypto-valuation-and-consolidation-standard`): **todo criptoativo é avaliado em USD** (stablecoins 1:1; demais via `get-crypto-prices`). Vamos reaproveitar isso.

## Solução — Duas visões consolidadas no cabeçalho

O cabeçalho passa a exibir **dois blocos lado a lado** (ou empilhados em telas estreitas), sempre que houver mais de uma moeda no resultado filtrado:

```
Fiat                       Cripto (em USD)
R$ 5.829,87                $ 12.602,28
Creditado: R$ 5.829,87     Creditado: $ 12.450,00
```

- **Bloco Fiat**: total na moeda de consolidação do workspace/projeto (BRL ou USD). Múltiplas fiat (BRL, EUR, MXN…) são convertidas via `convertToConsolidation` (Cotação de Trabalho → fallback PTAX/FastForex). 1 só fiat → exibe na moeda original sem conversão.
- **Bloco Cripto (em USD)**: soma de todos os criptoativos avaliados em USD:
  - Stablecoins (`USDT`, `USDC`) → 1:1.
  - Demais cripto (`BTC`, `ETH`, `SOL`, `BNB`…) → preço USD via `get-crypto-prices` (já cacheado no contexto).
  - Sem cotação disponível → ativo é excluído da soma e marcado no detalhamento com `~` + tooltip "sem cotação".
- Cada bloco mostra **total** + linha "Creditado" (mesma lógica de status atual).

Quando só existir fiat OU só cripto no filtro, exibe apenas o bloco correspondente (sem placeholder vazio). Quando existir apenas 1 moeda, comportamento atual é preservado.

## Detalhamento por ativo (popover)

Um chip discreto `Detalhar moedas` ao lado dos blocos abre Popover com:
- **Fiat**: cada moeda em valor nativo (total + creditado).
- **Cripto**: cada ativo em quantidade nativa + equivalente USD usado na soma.
- Rodapé: fonte das cotações (Trabalho/PTAX para fiat; `get-crypto-prices` + timestamp para cripto) e aviso "Estimativa — não substitui valores nativos para fins contábeis".

## Anti-inconsistência contábil

- Conversão é **apenas visual no cabeçalho**. Nada é persistido, nada vai para ledger.
- Valores nativos dos cards (linhas do histórico) ficam inalterados.
- Cripto sempre consolidado em **USD** (nunca convertido para BRL no bloco cripto) — alinhado a `crypto-valuation-and-consolidation-standard`. Conversão cripto→BRL fica fora do escopo deste cabeçalho.

## Performance

- Agregação O(n) sobre `transacoesComBusca` já memoizada.
- Preços cripto vêm do contexto/cache existente — sem requests adicionais por render.
- Conversão fiat usa hooks já montados (`useExchangeRates`, `useProjetoCurrency`).

## Detalhes técnicos

Arquivos a editar:
- `src/components/caixa/HistoricoMovimentacoes.tsx`
  - Estender `metricas` para retornar `{ fiat: { porMoeda, totalConsolidado, creditadoConsolidado, moedaConsolidada }, crypto: { porAtivo, totalUSD, creditadoUSD, semCotacao[] } }`.
  - Substituir bloco do cabeçalho (linhas 595-611) pelos dois blocos + chip de detalhamento.
- Novo: `src/components/caixa/HistoricoResumoMultiMoeda.tsx` (renderiza Fiat | Cripto + Popover de detalhamento).
- Reutilizar: `useExchangeRates`, `useProjetoCurrency`, `formatCurrencyDynamic`, `isCryptoCurrency`, `isStablecoin`, hook/contexto de preços cripto já existente (mesmo que abastece `get-crypto-prices`).

Sem migração SQL. Sem alteração nos cards de transação.

## Critérios de aceite

- Filtro com aportes BRL + USDT + BTC → cabeçalho mostra `R$ X` (Fiat) e `$ Y` (Cripto em USD).
- Filtro só BRL → visual atual preservado.
- Filtro só cripto → exibe apenas bloco Cripto.
- Cripto sem cotação → não entra no total, aparece com `~` no popover.
- Nenhuma soma mistura ativos diferentes; cripto nunca soma com fiat.
