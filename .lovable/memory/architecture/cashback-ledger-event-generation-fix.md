# Memory: architecture/cashback-ledger-event-generation-fix
Updated: 2026-02-05

## Correção Crítica: Cashback no Motor Financeiro

### Problema Identificado
O trigger `fn_cash_ledger_generate_financial_events` não processava os tipos:
- `CASHBACK_MANUAL` (crédito ao criar cashback)
- `CASHBACK_ESTORNO` (débito ao remover cashback)

Isso causava:
1. Cashback criado → lucro calculado corretamente, mas saldo operável NÃO atualizado
2. Cashback removido → lucro recalculado, mas saldo operável mantinha o valor "fantasma"

### Arquitetura Corrigida

```
┌─────────────────────────────────────────────────────────────────┐
│  useCashbackManual.criarCashback()                              │
│                          ↓                                      │
│  registrarCashbackViaLedger() → cash_ledger (CASHBACK_MANUAL)   │
│                          ↓                                      │
│  fn_cash_ledger_generate_financial_events (BEFORE INSERT)       │
│                          ↓                                      │
│  INSERT INTO financial_events (tipo_evento: 'CASHBACK')         │
│                          ↓                                      │
│  fn_financial_events_sync_balance (AFTER INSERT)                │
│                          ↓                                      │
│  UPDATE bookmakers SET saldo_atual += valor                     │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│  useCashbackManual.deletarCashback()                            │
│                          ↓                                      │
│  estornarCashbackViaLedger() → cash_ledger (CASHBACK_ESTORNO)   │
│                          ↓                                      │
│  fn_cash_ledger_generate_financial_events (BEFORE INSERT)       │
│                          ↓                                      │
│  INSERT INTO financial_events (tipo_evento: 'REVERSAL', -valor) │
│                          ↓                                      │
│  fn_financial_events_sync_balance (AFTER INSERT)                │
│                          ↓                                      │
│  UPDATE bookmakers SET saldo_atual -= valor                     │
└─────────────────────────────────────────────────────────────────┘
```

### Tipos de Evento Adicionados ao Trigger

| tipo_transacao (ledger) | tipo_evento (financial_events) | Efeito |
|-------------------------|-------------------------------|--------|
| CASHBACK_MANUAL | CASHBACK | +saldo_atual (crédito) |
| CASHBACK_ESTORNO | REVERSAL | -saldo_atual (débito) |
| BONUS_ESTORNO | REVERSAL | -saldo_atual (débito) |
| GIRO_GRATIS_ESTORNO | REVERSAL | -saldo_atual (débito) |

### Idempotência

Cada evento usa `idempotency_key` único:
- CASHBACK: `ledger_cashback_{ledger_id}`
- ESTORNO: `ledger_cashback_estorno_{ledger_id}`

### Regras de Negócio

1. **Criação**: `saldo += valor_cashback`, `lucro += valor_cashback`
2. **Edição**: `delta = novo - antigo`, aplicar delta em ambos
3. **Remoção**: `saldo -= valor_original`, `lucro -= valor_original`

### Correções Retrospectivas

Registros antigos sem financial_events foram corrigidos manualmente com:
- metadata: `{correcao_retroativa: true}`
- Identificáveis via consulta para auditoria futura
