# Memory: architecture/financial-engine-v9.1-trigger-driven-validated
Updated: 2026-01-28

## Financial Engine v9 - Arquitetura Event-Driven com Trigger Universal

### Princípio Central
**Saldos são SEMPRE derivados de eventos.** Nenhum código faz UPDATE direto em `bookmakers.saldo_atual` ou `saldo_freebet`.

### Fluxo de Atualização de Saldo

```
┌─────────────────────────────────────────────────────────────────┐
│  RPC (criar_aposta_atomica, liquidar_aposta, deletar_aposta)   │
│                          ↓                                      │
│           INSERT INTO financial_events                          │
│                          ↓                                      │
│       tr_financial_events_sync_balance (AFTER INSERT)           │
│                          ↓                                      │
│      UPDATE bookmakers SET saldo_atual/saldo_freebet            │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes Implementados

#### 1. Trigger Universal: `fn_financial_events_sync_balance`
Dispara após cada INSERT em `financial_events` e calcula o delta baseado no tipo:

| tipo_evento | Efeito no Saldo |
|-------------|-----------------|
| STAKE | -valor (débito) |
| FREEBET_STAKE | -valor (débito freebet) |
| PAYOUT, VOID_REFUND, DEPOSITO, BONUS, CASHBACK, FREEBET_CREDIT | +valor (crédito) |
| REVERSAL | valor (já vem invertido) |
| SAQUE | valor (já vem negativo) |
| AJUSTE | valor (pode ser + ou -) |

#### 2. Função Auxiliar: `create_reversal_event(event_id, reason)`
Cria eventos de reversão padronizados:
- Verifica se evento original existe
- Verifica se já foi revertido (idempotência)
- Gera `idempotency_key` como `reversal_<original_id>`

#### 3. RPCs Refatoradas (sem UPDATE direto)

**`deletar_aposta_v4`**
- Remove UPDATE direto em bookmakers
- Apenas insere eventos REVERSAL
- Trigger cuida de atualizar saldo

**`reverter_liquidacao_v4`**
- Remove UPDATE direto em bookmakers
- Apenas insere eventos REVERSAL
- Trigger cuida de atualizar saldo

### Benefícios da Arquitetura

1. **Auditabilidade 100%**: Todo movimento de saldo tem evento correspondente
2. **Reconstrução**: Possível recalcular saldo a partir de eventos
3. **Manutenção**: Um único ponto de atualização (trigger)
4. **Consistência**: Impossível ter saldo "fantasma" sem evento

### Regras Críticas

1. **NUNCA** fazer UPDATE direto em `bookmakers.saldo_atual`
2. **SEMPRE** criar evento em `financial_events`
3. **O trigger** cuida da propagação para saldos
4. **Reversões** devem usar valor negativo do original

### Conformidade com Motor Financeiro v7

| Critério | Status |
|----------|--------|
| Remove inserções diretas | ✅ RPCs usam INSERT em events |
| Fluxo unificado | ✅ Trigger universal |
| Eventos órfãos | ✅ Busca por aposta_id OU idempotency_key |
| Consistência UI | ✅ ApostaDialog/Surebet usam ApostaService |
