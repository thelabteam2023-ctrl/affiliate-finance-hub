---
name: Aposta simples multi-bookmaker — consolidação no parent
description: Apostas simples com mais de uma entrada (additionalEntries) em moedas diferentes consolidam o parent record na moeda do projeto e marcam moeda_operacao='MULTI'
type: feature
---
Quando o formulário de aposta simples (ApostaDialog) tem múltiplas entradas (`additionalEntries`):

**REGRA CANÔNICA (multi-bookmaker):** Toda aposta com `additionalEntries.length > 0` grava `bookmaker_id = NULL` no pai, idêntico a Surebet/Múltipla. Isso permite que `get_bookmaker_saldos` distribua o "em jogo" pelas pernas reais em `apostas_pernas` (cada casa mostra exatamente seu stake nativo). Quando há apenas 1 entrada (sem multi-entry), o pai mantém `bookmaker_id` da casa.

1. Se TODAS as casas usam a mesma moeda → parent guarda valor nominal somado, `bookmaker_id=NULL`, `moeda_operacao` = moeda nativa.
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

**SurebetCard (renderiza multi-entry simples)**: detecta multi-currency olhando `entries[]` dentro de cada `SurebetPerna` (não apenas `perna.moeda`). Soma `stakeConsolidadoFallback` por entry com `convertToConsolidation`. Suporta badges PUNTER e FREEBET além de SUREBET/SIMPLES/DG/VB/BÔNUS — quando aposta simples multi-entry tem estratégia ≠ SUREBET, exibe a estratégia correta.
