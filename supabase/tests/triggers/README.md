# Test Harness — Triggers Financeiros

Suíte de testes determinísticos para os triggers e RPCs que tocam
`apostas_unificada`, `apostas_pernas`, `cash_ledger` e `financial_events`.

Cada arquivo `.sql` desta pasta é **autocontido** e roda dentro de
`BEGIN; ... ROLLBACK;` — nenhum efeito persiste no banco.

## Convenções

- Cada teste declara fixtures locais (workspace, projeto, bookmaker, user) com IDs `gen_random_uuid()`.
- A validação é feita via `RAISE EXCEPTION` quando uma asserção falha — o teste passa quando o `ROLLBACK` é alcançado sem exceção.
- Convenção de nome: `NN_categoria_caso.sql` (ordenação alfabética = ordem de execução).

## Casos atuais

| Arquivo | O que valida |
| --- | --- |
| `01_lay_results_pl.sql` | `fn_recalc_aposta_consolidado` calcula corretamente GREEN/RED/MEIO/VOID para perna LAY. |
| `02_surebet_back_lay_parity.sql` | Surebet BACK+LAY: `pl_consolidado` do pai = Σ `lucro_prejuizo` das pernas. |
| `03_edit_liquidada_ledger_parity.sql` | Invariante: `bookmakers.saldo_atual` = Σ `cash_ledger.valor`. |

## Rodar manualmente

```bash
psql -f supabase/tests/triggers/01_lay_results_pl.sql
```

O runner programático (`scripts/run-db-tests.ts`) está planejado para o Sprint 4.