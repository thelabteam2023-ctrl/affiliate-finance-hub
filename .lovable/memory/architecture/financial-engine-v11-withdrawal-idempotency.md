# Memory: architecture/financial-engine-v11-withdrawal-idempotency
Updated: 2026-02-05

## Motor Financeiro v11 - Proteção contra Saques Duplicados

### Problema Resolvido

Um saque confirmado permaneceu visível na Central de Operações e foi reprocessado, causando:
- Duplicação de registros no `cash_ledger`
- Impacto financeiro duplicado via `financial_events`
- Saldo inflado no destinatário

### Arquitetura de Proteção Implementada

#### 1. Trigger de Detecção Automática (`fn_detect_duplicate_withdrawal`)

Antes de confirmar qualquer SAQUE, o sistema verifica duplicidade baseado em:
- `origem_bookmaker_id` (mesma casa)
- `valor` (tolerância < 0.01)
- `destino_parceiro_id` / `destino_conta_bancaria_id` / `destino_wallet_id`
- Intervalo ≤ 48 horas entre transações

Se duplicidade detectada:
```
status → 'DUPLICADO_BLOQUEADO'
financial_events_generated → TRUE (impede geração)
auditoria_metadata → { duplicidade_detectada: true, saque_similar_id: UUID }
```

#### 2. Status Expandidos no `cash_ledger`

| Status | Descrição |
|--------|-----------|
| `DUPLICADO_CORRIGIDO` | Saque duplicado identificado manualmente e corrigido |
| `DUPLICADO_BLOQUEADO` | Saque duplicado bloqueado automaticamente pelo trigger |

Ambos os status são ignorados pelo trigger de eventos financeiros.

#### 3. Guard no Trigger de Eventos (`fn_cash_ledger_generate_financial_events`)

```sql
IF NEW.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO', 'CANCELADO', 'FAILED') THEN
    RETURN NEW;
END IF;
```

### Regra da Central de Operações

A query de saques pendentes já filtra por `status = 'PENDENTE'`:
```typescript
.eq("tipo_transacao", "SAQUE")
.eq("status", "PENDENTE")
```

Saques com `CONFIRMADO`, `LIQUIDADO`, `DUPLICADO_*` ou `FAILED` **não aparecem** para ação.

### View de Auditoria

`v_saques_duplicidade_audit` permite monitoramento contínuo:
- Lista todos os saques com classificação (ORIGINAL/DUPLICADO)
- Mostra metadata de auditoria
- Identifica padrões de duplicidade

### Processo de Correção Manual

Para saques duplicados já processados:

1. **Corrigir evento com sinal errado** (se aplicável):
   ```sql
   UPDATE financial_events SET valor = -valor WHERE id = 'evento_com_sinal_errado';
   ```

2. **Criar REVERSAL para neutralizar duplicado**:
   ```sql
   INSERT INTO financial_events (tipo_evento, valor, ...) VALUES ('REVERSAL', valor_positivo, ...);
   ```

3. **Marcar ledger entry como duplicado**:
   ```sql
   UPDATE cash_ledger SET status = 'DUPLICADO_CORRIGIDO' WHERE id = 'saque_duplicado';
   ```

4. **Reconciliar saldo**:
   ```sql
   UPDATE bookmakers SET saldo_atual = (SELECT SUM(valor) FROM financial_events WHERE bookmaker_id = X);
   ```

### Garantias do Motor v11

- ✅ Nenhum saque pode impactar saldo mais de uma vez
- ✅ Detecção automática em tempo real (trigger BEFORE INSERT/UPDATE)
- ✅ Histórico preservado com auditoria completa
- ✅ Sistema imune a reprocessamentos manuais ou automáticos
- ✅ Alertas via `RAISE WARNING` para monitoramento
