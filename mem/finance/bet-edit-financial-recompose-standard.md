---
name: Bet Edit Financial Recompose Standard
description: Edição de aposta que troca casa/fonte/moeda deve estornar e reemitir o evento; gatilho de saldo trata mudança de identidade no UPDATE
type: feature
---
- `fn_financial_events_sync_balance`: em UPDATE, se `bookmaker_id`, `tipo_uso` ou `event_scope` mudarem, o gatilho estorna integralmente `OLD` (na casa/bucket antigo) e aplica integralmente `NEW`. Delta simples só quando a identidade é idêntica. Bug histórico: `delta = NEW.valor - OLD.valor` dava 0 na troca de casa, deixando o débito preso na casa errada.
- `fn_sync_stake_event_v1`: nunca muta identidade financeira. Ao detectar troca de casa/fonte/moeda, arquiva a chave do evento antigo (`_old_<ts>`), emite `REVERSAL` com `reversed_event_id` e insere um novo evento com a chave estável `stake_entry_<id>`.
- `editar_surebet_completa_v3`: mede `fn_bookmaker_parity_sum()` das casas envolvidas antes e depois; divergência > 0,01 gera `PARIDADE_SALDO_QUEBRADA` e ROLLBACK da edição.
- Divergências históricas entre `saldo_atual` e a soma dos eventos são resolvidas por **resync** (materialização = soma dos eventos) + registro em `ledger_parity_anomalies`, nunca por `AJUSTE_SALDO` (um ajuste move saldo e eventos juntos, não corrige paridade).
- Teste: `supabase/tests/triggers/07_edit_surebet_troca_casa.sql`.
