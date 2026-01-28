# Memory: architecture/double-write-fix-v9-2
Updated: 2026-01-28

## Correção Crítica: Double Write em Saldos de Bookmakers

### Problema Identificado
O sistema estava duplicando saldos (2×) devido a **dois triggers** atualizando `bookmakers.saldo_*` para o mesmo evento.

### Causa Raiz
1. **`fn_cash_ledger_generate_financial_events`** (BEFORE INSERT no cash_ledger)
   - Inseria em `financial_events`
   - ❌ Também fazia `UPDATE bookmakers SET saldo_atual += valor`

2. **`fn_financial_events_sync_balance`** (AFTER INSERT em financial_events)
   - ❌ Também fazia `UPDATE bookmakers SET saldo_atual += valor`

### Fluxo Errado (Duplicação)
```
INSERT cash_ledger (DEPÓSITO R$ 5.000)
    ↓
tr_cash_ledger_generate_financial_events
    → INSERT financial_events
    → UPDATE bookmakers.saldo_atual += 5000 [1º CRÉDITO]
    ↓
INSERT financial_events executa
    ↓
tr_financial_events_sync_balance
    → UPDATE bookmakers.saldo_atual += 5000 [2º CRÉDITO DUPLICADO]
    ↓
Saldo final: R$ 10.000 (errado!)
```

### Correção Aplicada
Removido **todos** os `UPDATE bookmakers` de `fn_cash_ledger_generate_financial_events`.

### Fluxo Correto (v9.2)
```
cash_ledger (INSERT)
    ↓
fn_cash_ledger_generate_financial_events
    → APENAS INSERT em financial_events
    → Marca financial_events_generated = TRUE
    ↓
financial_events (INSERT executa)
    ↓
fn_financial_events_sync_balance (ÚNICO ponto de UPDATE)
    → UPDATE bookmakers.saldo_atual/saldo_freebet
    ↓
Saldo correto!
```

### Arquitetura Final
| Trigger | Responsabilidade |
|---------|------------------|
| `fn_cash_ledger_generate_financial_events` | Gerar eventos financeiros a partir do ledger |
| `fn_financial_events_sync_balance` | **ÚNICO** ponto de atualização de saldos |

### Regra de Ouro
**NUNCA** fazer `UPDATE bookmakers.saldo_*` fora de `fn_financial_events_sync_balance`.

Toda movimentação financeira deve passar por: `cash_ledger → financial_events → trigger → saldo`.
