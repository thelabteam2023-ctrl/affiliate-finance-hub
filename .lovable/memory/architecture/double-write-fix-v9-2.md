# Memory: architecture/double-write-fix-v9-2
Updated: 2026-01-28

## Correção Crítica: Double Write em Saldos de Bookmakers

### Problema Identificado
O sistema estava duplicando saldos (2×) devido a **múltiplos pontos** atualizando `bookmakers.saldo_*` para o mesmo evento.

### Causa Raiz - 3 Fontes de Double Write

#### 1. Trigger `fn_cash_ledger_generate_financial_events` (CORRIGIDO)
- Inseria em `financial_events`
- ❌ Também fazia `UPDATE bookmakers SET saldo_atual += valor`

#### 2. RPC `liquidar_aposta_v4` (CORRIGIDO)
- Inseria STAKE/PAYOUT em `financial_events`
- ❌ Também fazia `UPDATE bookmakers SET saldo_atual += valor`

#### 3. RPC `criar_aposta_atomica_v3` (CORRIGIDO)
- Inseria STAKE em `financial_events`
- ❌ Também fazia `UPDATE bookmakers SET saldo_atual -= stake`

### Fluxo Errado (Duplicação)
```
RPC criar/liquidar aposta
    ↓
INSERT financial_events
    + UPDATE bookmakers.saldo_atual [1º UPDATE]
    ↓
tr_financial_events_sync_balance
    → UPDATE bookmakers.saldo_atual [2º UPDATE DUPLICADO]
    ↓
Saldo final: 2× valor!
```

### Correção Aplicada (v9.2)
Removido **todos** os `UPDATE bookmakers` de:
- `fn_cash_ledger_generate_financial_events`
- `liquidar_aposta_v4`
- `criar_aposta_atomica_v3`
- `reliquidar_aposta_v5`

### Fluxo Correto (v9.2)
```
RPC ou Ledger
    ↓
APENAS INSERT em financial_events
    ↓
tr_financial_events_sync_balance (ÚNICO ponto de UPDATE)
    → UPDATE bookmakers.saldo_atual/saldo_freebet
    ↓
Saldo correto!
```

### Arquitetura Final
| Componente | Responsabilidade |
|------------|------------------|
| `fn_cash_ledger_generate_financial_events` | Gerar eventos financeiros a partir do ledger |
| `criar_aposta_atomica_v3` | Criar aposta + INSERT evento STAKE |
| `liquidar_aposta_v4` | Liquidar aposta + INSERT evento PAYOUT |
| `reliquidar_aposta_v5` | Re-liquidar aposta + INSERT eventos REVERSAL/PAYOUT |
| `fn_financial_events_sync_balance` | **ÚNICO** ponto de atualização de saldos |

### Regra de Ouro
**NUNCA** fazer `UPDATE bookmakers.saldo_*` fora de `fn_financial_events_sync_balance`.

Toda movimentação financeira deve passar por: `financial_events → trigger → saldo`.
