# Motor Financeiro v6 - Arquitetura Baseada em Eventos

**Atualizado:** 2026-01-27

## Visão Geral

O sistema financeiro foi completamente refatorado para usar uma **única fonte de verdade**: a tabela `financial_events`.

## Princípios Fundamentais

1. **Uma única fonte de verdade**: Todos os saldos derivam de `SUM(financial_events.valor)`
2. **Um único caminho de dinheiro**: Apenas `INSERT` em `financial_events` move dinheiro
3. **Zero UPDATE direto em saldos**: Nenhum código pode alterar `bookmakers.saldo_*` diretamente
4. **Idempotência garantida**: Chave `idempotency_key` previne duplicação
5. **Auditoria total**: Todo evento é rastreável e reversível

## Tabela: financial_events

```sql
CREATE TABLE financial_events (
  id UUID PRIMARY KEY,
  bookmaker_id UUID NOT NULL,
  aposta_id UUID,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tipo_evento TEXT NOT NULL,     -- STAKE_DEBIT, PAYOUT_GREEN, REVERSAL, etc.
  tipo_uso TEXT DEFAULT 'NORMAL', -- NORMAL | FREEBET
  origem TEXT,                    -- DEPOSITO, BONUS, LUCRO, CASHBACK, etc.
  valor NUMERIC(15,2) NOT NULL,   -- Positivo = crédito, Negativo = débito
  moeda TEXT DEFAULT 'BRL',
  idempotency_key TEXT UNIQUE NOT NULL,
  reversed_event_id UUID,
  processed_at TIMESTAMPTZ,
  descricao TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Trigger: tr_financial_event_sync

Único trigger que sincroniza saldos. Executa em `BEFORE INSERT`:

1. Verifica se já foi processado (idempotência)
2. Calcula `saldo_atual = SUM(valor) WHERE tipo_uso = 'NORMAL'`
3. Calcula `saldo_freebet = SUM(valor) WHERE tipo_uso = 'FREEBET'`
4. Atualiza `bookmakers`
5. Marca `processed_at = now()`

## RPCs Disponíveis

### process_financial_event
Processa um evento financeiro genérico com validações.

### liquidar_aposta_v3
Liquida uma aposta:
- GREEN: Emite `PAYOUT_GREEN` (stake + lucro) ou `FREEBET_PAYOUT` (só lucro)
- RED: Não emite evento (stake já debitado)
- VOID: Emite `PAYOUT_VOID` (devolve stake)

### reverter_liquidacao_v3
Reverte liquidação criando eventos `REVERSAL` com valor oposto.

### criar_aposta_com_debito_v3
Cria aposta e emite `STAKE_DEBIT` atomicamente.

## Tipos de Evento

| Tipo | Descrição | Valor |
|------|-----------|-------|
| STAKE_DEBIT | Débito de stake ao apostar | Negativo |
| PAYOUT_GREEN | Retorno de aposta ganha (stake + lucro) | Positivo |
| PAYOUT_VOID | Devolução de stake em VOID | Positivo |
| REVERSAL | Reversão de evento anterior | Oposto do original |
| FREEBET_DEBIT | Consumo de freebet | Negativo (FREEBET) |
| FREEBET_PAYOUT | Lucro de freebet (sem stake) | Positivo (NORMAL) |
| DEPOSITO | Depósito | Positivo |
| SAQUE | Saque | Negativo |
| CASHBACK | Cashback | Positivo |
| BONUS_CREDIT | Crédito de bônus | Positivo |
| AJUSTE_MANUAL | Ajuste manual | Positivo ou Negativo |

## View de Auditoria: v_financial_audit

Compara saldo registrado vs soma dos eventos. Diferença deve ser sempre zero.

```sql
SELECT * FROM v_financial_audit WHERE status_auditoria = 'DIVERGENTE';
```

## Fluxo de Apostas

### Criar Aposta
1. Frontend chama `criarApostaComDebito()` ou `ApostaService.criarAposta()`
2. RPC `criar_aposta_com_debito_v3` insere aposta e pernas
3. Para cada perna: `INSERT financial_events (STAKE_DEBIT, valor: -stake)`
4. Trigger recalcula saldo automaticamente

### Liquidar (GREEN)
1. Frontend chama `liquidarAposta({ resultado: 'GREEN' })`
2. RPC `liquidar_aposta_v3` calcula payout = stake × odd
3. `INSERT financial_events (PAYOUT_GREEN, valor: +payout)`
4. Trigger recalcula saldo automaticamente

### Liquidar (RED)
1. Não emite evento (stake já foi debitado na criação)
2. Apenas atualiza status da aposta

### Reverter
1. `reverter_liquidacao_v3` busca todos eventos da aposta
2. Para cada: `INSERT financial_events (REVERSAL, valor: -evento.valor)`
3. Aposta volta para PENDENTE

### Deletar
1. Se liquidada: reverter primeiro
2. Se não refundada: liquidar como VOID
3. Deletar pernas e aposta

## Migração de Dados Legados

Os saldos atuais em `bookmakers` foram preservados. À medida que novas operações são feitas via `financial_events`, o sistema gradualmente sincroniza.

Para reconciliar bookmakers existentes, pode-se criar eventos `AJUSTE_MANUAL` iniciais.

## Triggers e Funções Removidos

- `atualizar_saldo_bookmaker_v2/v3/v4/v5`
- `protect_bookmaker_balance`
- `update_bookmaker_saldo_on_transaction`

## Frontend

Use `src/lib/financialEngine.ts` para todas as operações financeiras:

```typescript
import { 
  processFinancialEvent,
  liquidarAposta,
  reverterLiquidacao,
  criarApostaComDebito,
  registrarDeposito,
  registrarSaque,
} from '@/lib/financialEngine';
```
