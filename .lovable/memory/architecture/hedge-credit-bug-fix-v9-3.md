# Memory: architecture/hedge-credit-bug-fix-v9-3
Updated: 2026-01-28

## Correção Crítica: Hedge Creditando ao Invés de Debitar

### Problema Identificado
Apostas de hedge (e todas as apostas com STAKE via eventos) estavam **creditando** o saldo ao invés de **debitar**.

Exemplo: Hedge de R$ 1.200 → saldo AUMENTOU R$ 1.200 (deveria DIMINUIR)

### Causa Raiz
O trigger `fn_financial_events_sync_balance` tinha inversão de sinal:

```sql
-- ANTES (ERRADO):
WHEN 'STAKE' THEN
  v_delta := -NEW.valor;  -- -(-1200) = +1200 = CRÉDITO

-- O evento STAKE já vem com valor NEGATIVO (-1200)
-- O trigger negava novamente, transformando em crédito
```

### Convenções Conflitantes
| Componente | Convenção |
|------------|-----------|
| RPC `liquidar_aposta_v4` | STAKE = valor NEGATIVO (-stake) |
| Trigger antigo | Esperava POSITIVO e fazia `-valor` |

### Impacto Calculado
Para APOSTAGANHA (João Rocha):
- Stake do hedge: R$ 1.200
- Efeito esperado: -R$ 1.200 (débito)
- Efeito real (bug): +R$ 1.200 (crédito)
- Inflação total: R$ 2.400 (2× stake)

### Correção Aplicada (v9.3)
Trigger corrigido para usar valor **DIRETAMENTE**:

```sql
-- DEPOIS (CORRETO):
WHEN 'STAKE', 'FREEBET_STAKE', 'SAQUE' THEN
  v_delta := NEW.valor;  -- -1200 = -1200 = DÉBITO

WHEN 'PAYOUT', 'VOID_REFUND', 'DEPOSITO', 'BONUS', 'CASHBACK' THEN
  v_delta := NEW.valor;  -- +2364 = +2364 = CRÉDITO
```

### Convenção Unificada de Sinais (v9.3)
| Tipo de Evento | Valor no Evento | Efeito no Saldo |
|----------------|-----------------|-----------------|
| STAKE | NEGATIVO (-1200) | DÉBITO (-1200) |
| SAQUE | NEGATIVO (-500) | DÉBITO (-500) |
| PAYOUT | POSITIVO (+2364) | CRÉDITO (+2364) |
| DEPOSITO | POSITIVO (+1000) | CRÉDITO (+1000) |
| REVERSAL | OPOSTO do original | Cancela original |

### Regra de Ouro
**O trigger NUNCA inverte sinais** - usa o valor do evento DIRETAMENTE.

### Bookmakers Corrigidos
- APOSTAGANHA: R$ 6.077,70 → R$ 3.677,70
- BETVIP: Já corrigido anteriormente (R$ 3.202,16)

### Arquivos Modificados
- Migration: Recriou `fn_financial_events_sync_balance` com lógica correta
