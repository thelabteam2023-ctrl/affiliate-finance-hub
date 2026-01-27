# Memory: architecture/financial-engine-v8-ledger-source-of-truth
Updated: 2026-01-27

## Arquitetura Financeira v8 - Ledger como Fonte Única de Verdade

O sistema financeiro foi totalmente reconstruído com a arquitetura v8, onde o `cash_ledger` é a **única fonte de verdade absoluta**.

### Fluxo Obrigatório

```
UI / API
   ↓
cash_ledger (registro jurídico-financeiro)
   ↓
financial_events (efeitos contábeis - gerado por trigger)
   ↓
saldos (materialização automática)
```

### Triggers Implementados

1. **tr_cash_ledger_generate_financial_events** (BEFORE INSERT OR UPDATE)
   - Dispara quando `status = 'CONFIRMADO'`
   - Gera `financial_events` com idempotency_key
   - Atualiza `bookmakers.saldo_atual` e `saldo_freebet`
   - Marca `financial_events_generated = TRUE`

2. **tr_cash_ledger_handle_pending** (AFTER UPDATE)
   - Libera `balance_locked` de wallets quando transação muda de PENDENTE para CONFIRMADO/CANCELADO/FAILED

3. **tr_cash_ledger_lock_pending** (AFTER INSERT)
   - Trava saldo em wallets quando transação é inserida como PENDENTE

### Tipos de Evento Suportados

| tipo_transacao (ledger) | tipo_evento (financial_events) | Efeito no Saldo |
|-------------------------|-------------------------------|-----------------|
| DEPOSITO                | DEPOSITO                      | +saldo_atual    |
| SAQUE                   | SAQUE                         | -saldo_atual    |
| BONUS_CREDITADO         | BONUS / FREEBET_CREDIT        | +saldo_atual ou +saldo_freebet |
| GIRO_GRATIS             | PAYOUT                        | +saldo_atual    |
| CASHBACK_MANUAL         | CASHBACK                      | +saldo_atual    |
| AJUSTE_MANUAL           | AJUSTE                        | ±saldo_atual    |

### Modelo de Saldo

- **saldo_total**: Soma de todos os créditos - débitos confirmados
- **saldo_travado**: Soma de transações PENDENTE na origem
- **saldo_disponivel**: saldo_total - saldo_travado

### Views de Auditoria

- `v_bookmaker_saldo_audit`: Compara saldo materializado vs calculado por eventos
- `v_saldo_contas_bancarias`: Saldo de contas bancárias via ledger
- `v_saldo_wallets_crypto`: Saldo de wallets crypto com balance_locked

### RPC de Reprocessamento

```sql
SELECT reprocessar_ledger_workspace('workspace-uuid');
```

Zera todos os saldos, limpa financial_events, e reprocessa todo o ledger cronologicamente.

### Regras Críticas

1. **NUNCA** atualizar saldo direto em tabelas
2. **NUNCA** criar financial_events manualmente
3. **SEMPRE** usar cash_ledger para qualquer movimentação
4. **status = PENDENTE** trava saldo na origem
5. **Conciliação** apenas muda status (PENDENTE → CONFIRMADO/FAILED)
