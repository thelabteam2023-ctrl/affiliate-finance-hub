---
name: Aposta simples multi-bookmaker — consolidação no parent
description: Apostas simples com mais de uma entrada (additionalEntries) em moedas diferentes consolidam o parent record na moeda do projeto e marcam moeda_operacao='MULTI'
type: feature
---
Quando o formulário de aposta simples (ApostaDialog) tem múltiplas entradas (`additionalEntries`):

1. Se TODAS as casas usam a mesma moeda → comportamento single-currency (parent guarda valor nominal somado).
2. Se há **moedas diferentes** (multi-currency):
   - `apostas_unificada.stake`, `stake_total`, `stake_real`, `stake_freebet`, `valor_retorno`, `lucro_prejuizo` são gravados **na moeda de consolidação** do projeto (BRL ou USD).
   - `moeda_operacao = 'MULTI'`
   - `is_multicurrency = true`
   - `consolidation_currency = moedaConsolidacao`
   - `stake_consolidado` e `pl_consolidado` são preenchidos.
   - Cada perna em `apostas_pernas` mantém sua moeda nativa.

**Re-liquidação (RPC `reliquidar_aposta_v6`)**: detecta presença de `apostas_pernas` e itera por cada perna, gerando evento `AJUSTE` na **moeda nativa** de cada casa, com `idempotency_key` único por perna (`reliq_perna_<perna_id>_...`).

**Liquidação inicial (`liquidar_aposta_v4`)**: já iterava por pernas (path multi-entry).

**Edição (`atualizar_aposta_liquidada_atomica_v2`)**: detecta multi-entry via `apostas_pernas`. Mudança apenas de resultado é delegada para `reliquidar_aposta_v6` (que itera pernas). Mudança estrutural (stake/odd/bookmaker/moeda) retorna erro `MULTI_ENTRY_STRUCT_EDIT_NOT_SUPPORTED` — UI deve orientar excluir + recadastrar.

**ApostaCard**: já prioriza `pl_consolidado` e `stake_consolidado` quando presentes (isMultiCurrency true).
