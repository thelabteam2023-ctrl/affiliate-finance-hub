---
name: liquidar-aposta-v4-pernas-propagation
description: liquidar_aposta_v4 deve propagar resultado/lucro_prejuizo/cotacao_snapshot para apostas_pernas em multi-entry, senão pl_consolidado fica zerado
type: feature
---

# liquidar_aposta_v4 — Propagação para apostas_pernas (multi-entry)

## Regra
Em apostas multi-entry (PUNTER/VALUEBET/DUPLO_GREEN multi-casa), `liquidar_aposta_v4` DEVE atualizar cada `apostas_pernas` com:
- `resultado` = resultado do pai
- `lucro_prejuizo` = cálculo em moeda nativa (stake×(odd-1) para GREEN, /2 para MEIO_GREEN, etc, respeitando freebet)
- `cotacao_snapshot` = `projetos.cotacao_trabalho` no momento da liquidação

## Justificativa
O trigger `fn_recalc_aposta_consolidado` calcula `pl_consolidado` somando `apostas_pernas.lucro_prejuizo × cotacao_perna / cotacao_consolidacao`. Se as pernas estão NULL, o consolidado vira 0 — UI mostra $0 mesmo com aposta ganha.

## Fluxo correto
1. `liquidar_aposta_v4` cria STAKE/PAYOUT em `financial_events` (moeda nativa por casa).
2. `liquidar_aposta_v4` propaga `resultado` + `lucro_prejuizo` para cada perna.
3. `UPDATE apostas_unificada SET status='LIQUIDADA'` dispara `fn_recalc_aposta_consolidado`.
4. Trigger lê pernas, converte com cotação de trabalho do projeto, grava `pl_consolidado` e `is_multicurrency`.

## Fórmula de lucro por perna (moeda nativa)
- GREEN: `stake × (odd - 1)` (real e freebet)
- MEIO_GREEN: `stake × (odd - 1) / 2`
- VOID: 0
- MEIO_RED: real `-(stake/2)`, freebet 0
- RED: real `-stake`, freebet 0
