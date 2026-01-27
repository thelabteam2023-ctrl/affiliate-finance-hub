# Arquitetura Financeira: Ledger como Única Fonte de Verdade (v5)

**Atualizado:** 2026-01-27

## Resumo

Toda movimentação financeira de saldo de bookmaker agora flui exclusivamente pelo `cash_ledger`. O trigger `atualizar_saldo_bookmaker_v5` é o **ÚNICO** ponto que atualiza `bookmakers.saldo_*`.

## Arquitetura Anterior (Problemas)

```
┌─────────────────────────────────────────────────┐
│ PROBLEMA: Múltiplos pontos de UPDATE direto     │
├─────────────────────────────────────────────────┤
│ 1. liquidar_aposta_atomica_v2 → UPDATE direto   │
│ 2. reverter_liquidacao_para_pendente → UPDATE   │
│ 3. processar_debito_waterfall → UPDATE direto   │
│ 4. Trigger v3 → UPDATE                          │
│ 5. Trigger v4 → UPDATE                          │
│ 6. fn_giro_gratis → UPDATE + ledger             │
│ 7. fn_cashback → UPDATE + ledger                │
└─────────────────────────────────────────────────┘
         ↓ RESULTADO
   Duplicação de créditos/débitos
   Saldos inconsistentes
   Impossível auditar
```

## Nova Arquitetura (v5)

```
┌─────────────────────────────────────────────────┐
│ ÚNICO FLUXO: Tudo via cash_ledger               │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Operação]                                     │
│      ↓                                          │
│  INSERT INTO cash_ledger                        │
│      ↓                                          │
│  TRIGGER v5 (BEFORE INSERT)                     │
│      ↓                                          │
│  UPDATE bookmakers.saldo_*                      │
│      ↓                                          │
│  INSERT INTO bookmaker_balance_audit            │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Componentes Refatorados

### 1. Trigger Único: `atualizar_saldo_bookmaker_v5`

- **Tipo:** BEFORE INSERT on cash_ledger
- **Idempotência:** Verifica `balance_processed_at IS NULL`
- **Transações:** Só processa `status = 'CONFIRMADO'`
- **Cobertura:** Todos os tipos de transação (APOSTA_*, FREEBET_*, BONUS_*, DEPOSITO, SAQUE, etc.)

### 2. RPCs Refatoradas

| RPC | Antes | Depois |
|-----|-------|--------|
| `liquidar_aposta_atomica_v2` | UPDATE direto para VOID/MEIO_RED | INSERT no ledger apenas |
| `reverter_liquidacao_para_pendente` | UPDATE direto | INSERT APOSTA_REVERSAO no ledger |
| `processar_debito_waterfall` | UPDATE direto + ledger | INSERT APOSTA_STAKE no ledger apenas |

### 3. Triggers de Eventos

| Trigger | Antes | Depois |
|---------|-------|--------|
| `fn_giro_gratis_gerar_lancamento` | UPDATE + INSERT ledger | INSERT ledger apenas |
| `fn_cashback_gerar_lancamento` | UPDATE + INSERT ledger | INSERT ledger apenas |

## Tipos de Transação no Trigger v5

### Apostas
- `APOSTA_STAKE`: Débito waterfall (bonus, freebet, real)
- `APOSTA_GREEN`, `APOSTA_MEIO_GREEN`: Crédito (lucro + stake_real)
- `APOSTA_RED`: Nenhum movimento (stake já consumido)
- `APOSTA_MEIO_RED`: Crédito parcial (50% de cada fonte)
- `APOSTA_VOID`, `APOSTA_REEMBOLSO`: Crédito total (devolução)
- `APOSTA_REVERSAO`: Débito (desfaz crédito anterior)

### Freebet
- `FREEBET_CREDITADA`: Crédito saldo_freebet
- `FREEBET_CONSUMIDA`, `FREEBET_EXPIRADA`: Débito saldo_freebet
- `FREEBET_ESTORNO`: Crédito saldo_freebet
- `FREEBET_CONVERTIDA`: Débito freebet + Crédito real

### Bônus (tratado como Normal)
- `BONUS_CREDITADO`: Crédito saldo_atual (não saldo_bonus)
- `BONUS_ESTORNO`: Débito saldo_atual

### Outros
- `DEPOSITO`, `SAQUE`, `TRANSFERENCIA`, `CASHBACK_*`, `GIRO_GRATIS`, `AJUSTE_*`

## Verificação de Integridade

```sql
-- Comparar saldo atual vs. reconstruído do ledger
SELECT * FROM recalcular_saldo_bookmaker_v2(bookmaker_id);
```

## Regras de Ouro

1. **ZERO UPDATEs diretos** em `bookmakers.saldo_*` (exceto via trigger v5)
2. **Toda movimentação** = INSERT em `cash_ledger`
3. **Reversões** = novos registros de débito/crédito (não UPDATE)
4. **Saldo verificável** = SUM(ledger) sempre bate com saldo_atual

## Triggers Removidos

- `tr_cash_ledger_update_bookmaker_balance` (v1)
- `tr_cash_ledger_update_bookmaker_balance_v2`
- `tr_cash_ledger_update_bookmaker_balance_v3`
- `tr_cash_ledger_update_bookmaker_balance_v4`

## Funções Removidas

- `atualizar_saldo_bookmaker_v2()`
- `atualizar_saldo_bookmaker_v3()`
