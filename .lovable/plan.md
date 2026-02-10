
# Correcao dos 9 Depositos Historicos (LIQUIDADO para CONFIRMADO)

## Contexto

Existem **9 depositos** do Sebasthian Diones no projeto Luiz Felipe que foram restaurados anteriormente com status `LIQUIDADO`, o que faz com que os triggers de saldo **nao os processem**. Esses registros ja existem no `cash_ledger` com os valores corretos, datas corretas e wallet de origem correta -- apenas o status esta errado.

## Depositos Afetados

| Casa | Valor (USD) | Data | Ledger ID |
|------|-------------|------|-----------|
| CLEOBETRA | $100.00 | 17/01/2026 | 994138b8 |
| LEGIANO | $100.00 | 18/01/2026 | d28e5727 |
| GRANSINO | $100.00 | 18/01/2026 | 61ea3a08 |
| PLAYIO | $100.00 | 19/01/2026 | dda63985 |
| LIZARO | $100.13 | 22/01/2026 | 13173fde |
| BANKONBET | $100.13 | 22/01/2026 | 414283cc |
| STONEVEGAS | $100.13 | 22/01/2026 | b836cb3e |
| LIBRABET | $99.98 | 23/01/2026 | 433fb5bc |
| SPINIT | $99.99 | 23/01/2026 | 9bc9eb1e |

**Total: $900.36 USD**

## Solucao

### Etapa unica: Migration SQL

Executar um UPDATE nos 9 registros existentes, mudando:
- `status`: de `LIQUIDADO` para `CONFIRMADO`
- `financial_events_generated`: para `true` (evitar duplicidade de eventos)
- `auditoria_metadata`: registrar a correcao com timestamp e motivo

Nao e necessario criar novos registros -- os dados ja estao corretos (valor, moeda, data, wallet de origem, bookmaker de destino). A mudanca de status para CONFIRMADO fara com que os triggers e views de saldo passem a contabilizar esses depositos corretamente.

**Importante**: Como essas casas ja tem saldo_atual = 0 (foram zeradas por apostas/saques), a correcao do status nao vai alterar o saldo atual delas -- apenas garante que os depositos aparecem corretamente nos totais e relatorios de conciliacao.

## Detalhes Tecnicos

- A migration usa um unico `UPDATE` com clausula `WHERE id IN (...)` nos 9 IDs conhecidos
- O campo `auditoria_metadata` recebe um JSON com `correcao_status`, `status_anterior`, `motivo` e `data_correcao`
- Nenhuma alteracao de codigo frontend e necessaria -- a correcao e puramente de dados
- Apos a migration, os totais de depositos no sistema refletirao os $900.36 USD que estavam faltando
