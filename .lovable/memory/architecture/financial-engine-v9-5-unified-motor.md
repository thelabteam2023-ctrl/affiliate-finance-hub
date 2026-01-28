# Memory: architecture/financial-engine-v9-5-unified-motor
Updated: 2026-01-28

## Motor Financeiro v9.5 - Arquitetura Unificada Event-Driven

### Correções Aplicadas

#### 1. Double-Write Eliminado em `criar_aposta_atomica_v3`
A RPC fazia INSERT em `financial_events` (que dispara trigger de saldo) **E** depois fazia UPDATE manual em `bookmakers.saldo_*`. Resultado: stake era debitado 2x.

**Correção**: Removido o UPDATE manual. O trigger `fn_financial_events_sync_balance` é a única fonte de verdade.

#### 2. Código Morto Removido do `ApostaDialog`
A função `atualizarSaldoBookmaker()` (linhas 2566-2740) era código morto que chamava `updateBookmakerBalance()` mas nunca era invocada. Removida junto com o import.

### Arquitetura Final

```
┌─────────────────────────────────────────────────────────────┐
│                    CAMADAS DO SISTEMA                       │
├─────────────────────────────────────────────────────────────┤
│  FRONTEND                                                   │
│  ├─ ApostaDialog        → ApostaService                     │
│  ├─ ApostaMultiplaDialog → ApostaService                    │
│  ├─ SurebetDialog       → ⚠️ Ainda usa updateBookmakerBalance│
│  └─ CaixaTransacaoDialog → cash_ledger                      │
├─────────────────────────────────────────────────────────────┤
│  SERVIÇOS                                                   │
│  ├─ ApostaService       → RPCs v3/v4                        │
│  └─ LedgerService       → cash_ledger                       │
├─────────────────────────────────────────────────────────────┤
│  RPCs (Supabase)                                            │
│  ├─ criar_aposta_atomica_v3  ─┐                             │
│  ├─ liquidar_aposta_v4       ├─→ INSERT financial_events    │
│  ├─ reverter_liquidacao_v4   │                              │
│  ├─ deletar_aposta_v4        │                              │
│  └─ reliquidar_aposta_v5     ┘                              │
├─────────────────────────────────────────────────────────────┤
│  TRIGGER: fn_financial_events_sync_balance (SST)            │
│  └─→ UPDATE bookmakers.saldo_atual / saldo_freebet          │
├─────────────────────────────────────────────────────────────┤
│  TRIGGER: fn_cash_ledger_generate_financial_events          │
│  └─→ INSERT financial_events (para operações de caixa)      │
└─────────────────────────────────────────────────────────────┘
```

### Pendências Identificadas

| Componente | Status | Problema |
|------------|--------|----------|
| `SurebetDialog` | ⚠️ LEGADO | Ainda usa `updateBookmakerBalance()` para liquidar pernas |

### Recomendação Futura

O `SurebetDialog` deveria ser refatorado para usar o mesmo fluxo do `ApostaService`:
- Liquidar via `liquidarSurebetSimples()` ou RPC `liquidar_aposta_v4`
- Isso eliminaria o último ponto de manipulação de saldo fora do motor

### Regras Críticas

1. **NUNCA** fazer UPDATE direto em `bookmakers.saldo_atual`
2. **SEMPRE** criar evento em `financial_events`
3. **O trigger** cuida da propagação para saldos
4. **Frontend** só deve chamar serviços/RPCs, nunca manipular saldo
