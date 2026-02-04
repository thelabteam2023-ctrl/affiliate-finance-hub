
# Auditoria Crítica: Duplicação de Saldo em Saques

## Diagnóstico Confirmado

### Causa Raiz Identificada

O bug está localizado na função **`fn_cash_ledger_generate_financial_events`** (trigger do cash_ledger).

**Problema específico:**
```sql
-- Linha atual (INCORRETA):
v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);  -- Valor POSITIVO (3202.16)
INSERT INTO financial_events (..., valor, ...) VALUES (..., v_valor_efetivo, ...);
```

O trigger insere o evento SAQUE com valor **POSITIVO**, mas o trigger `fn_financial_events_sync_balance` espera valor **NEGATIVO** para débitos.

### Prova de Auditoria (BETVIP - Alex Alves)

| Timestamp | Evento | Valor no Evento | Saldo Anterior | Saldo Novo | Erro |
|-----------|--------|-----------------|----------------|------------|------|
| 02/02 13:07 | DEPOSITO | +4000.00 | 0.00 | 4000.00 | OK |
| 02/02 14:45 | SAQUE | +3202.16 | 3202.16 | 6404.32 | BUG! |

**Esperado:** Saque de R$ 3.202,16 deveria resultar em saldo R$ 0,00 (3202.16 - 3202.16)
**Real:** Saldo duplicou para R$ 6.404,32 (3202.16 + 3202.16)

---

## Mapeamento Completo do Fluxo de Saque

### Fluxo Atual (com bug)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. UI: ConfirmarSaqueDialog                                             │
│    → UPDATE cash_ledger SET status = 'CONFIRMADO'                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. TRIGGER: tr_cash_ledger_generate_financial_events                    │
│    → fn_cash_ledger_generate_financial_events()                         │
│    → INSERT financial_events (tipo_evento='SAQUE', valor=+3202.16)      │
│                                                      ↑                  │
│                                               BUG: Valor POSITIVO!      │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. TRIGGER: tr_financial_events_sync_balance                            │
│    → fn_financial_events_sync_balance()                                 │
│    → CASE 'SAQUE': v_delta := NEW.valor (usa +3202.16 direto)           │
│    → UPDATE bookmakers SET saldo_atual = saldo_atual + 3202.16          │
│                                                      ↑                  │
│                                        Resultado: CRÉDITO ao invés de   │
│                                                   DÉBITO!               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Arquitetura v9.5 (Convenção de Sinais)

| Tipo de Evento | Valor Esperado | Responsável |
|----------------|----------------|-------------|
| STAKE | NEGATIVO (-valor) | RPC deve enviar negativo |
| SAQUE | NEGATIVO (-valor) | Trigger Ledger deve enviar negativo |
| PAYOUT | POSITIVO (+valor) | RPC envia positivo |
| DEPOSITO | POSITIVO (+valor) | Trigger Ledger envia positivo |

---

## Pontos que Alteram Saldo (Auditados)

### 1. Trigger Principal (SST - Single Source of Truth)
- **Função:** `fn_financial_events_sync_balance`
- **Localização:** Dispara após INSERT em `financial_events`
- **Status:** Correto (v9.4) - usa valor direto

### 2. Gerador de Eventos do Ledger
- **Função:** `fn_cash_ledger_generate_financial_events`
- **Status:** **BUG** - insere SAQUE com valor positivo

### 3. Engine de Frontend (Alternativo)
- **Arquivo:** `src/lib/financialEngine.ts`
- **Função:** `registrarSaque()`
- **Linha 365:** `valor: -Math.abs(params.valor)` 
- **Status:** Correto - nega o valor

---

## Validação de Idempotência

| Componente | Mecanismo | Status |
|------------|-----------|--------|
| Ledger Trigger | `idempotency_key = 'ledger_withdraw_' + id` | OK |
| Financial Trigger | Não reprocessa se `processed_at` existe | OK |
| UI Dialog | `.eq("status", "PENDENTE")` no UPDATE | OK |

A idempotência está implementada corretamente. O problema não é execução dupla, é **inversão de sinal**.

---

## Solução Técnica

### Correção na Função `fn_cash_ledger_generate_financial_events`

```sql
-- ANTES (BUG):
IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
    v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
    INSERT INTO financial_events (..., valor, ...) 
    VALUES (..., v_valor_efetivo, ...);  -- POSITIVO!
END IF;

-- DEPOIS (CORREÇÃO):
IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
    v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
    INSERT INTO financial_events (..., valor, ...) 
    VALUES (..., -v_valor_efetivo, ...);  -- NEGATIVO!
END IF;
```

### Impacto da Correção

Apenas o bloco de SAQUE precisa ser alterado. Outros tipos (DEPOSITO, BONUS, etc.) já funcionam corretamente com valores positivos.

---

## Correção do Saldo da BETVIP

Após aplicar a correção, será necessário ajustar o saldo corrompido:

```sql
-- 1. Identificar o saldo correto
-- Saldo atual incorreto: R$ 6.404,32
-- Valor duplicado: R$ 3.202,16
-- Saldo correto: R$ 3.202,16 (deveria ser ~0 após saque completo)

-- 2. Verificar se há saldo real esperado
SELECT 
  (SELECT COALESCE(SUM(valor), 0) FROM financial_events 
   WHERE bookmaker_id = 'ID_BETVIP' AND tipo_evento = 'DEPOSITO') -
  (SELECT COALESCE(SUM(ABS(valor)), 0) FROM financial_events 
   WHERE bookmaker_id = 'ID_BETVIP' AND tipo_evento = 'SAQUE') AS saldo_correto;

-- 3. Opção A: Reverter evento corrompido e recriar
-- Opção B: Criar evento de ajuste REVERSAL
```

---

## Testes de Validação

### Teste 1: Novo Saque
1. Criar bookmaker com saldo fixo (ex: R$ 5.000)
2. Executar saque de R$ 2.000
3. Validar: saldo final = R$ 3.000
4. Validar: `financial_events` tem valor = -2000

### Teste 2: Idempotência
1. Tentar confirmar mesmo saque duas vezes
2. Resultado esperado: Segunda tentativa ignorada
3. Saldo não deve mudar

### Teste 3: Concorrência
1. Abrir duas sessões simultâneas
2. Confirmar mesmo saque em ambas
3. Apenas uma deve processar

---

## Checklist de Implementação

1. [ ] Criar migration SQL corrigindo `fn_cash_ledger_generate_financial_events`
2. [ ] Negar valor do SAQUE: `-v_valor_efetivo`
3. [ ] Corrigir saldo da BETVIP (workspace Labbet)
4. [ ] Validar outros saques recentes por inconsistências
5. [ ] Executar testes de regressão
6. [ ] Atualizar memory file com nova convenção

---

## Seção Técnica: Migration SQL

```sql
-- CORREÇÃO: Bug de duplicação de saldo em SAQUE
-- Causa: fn_cash_ledger_generate_financial_events inseria SAQUE com valor POSITIVO
-- O trigger fn_financial_events_sync_balance espera valor NEGATIVO para débitos

CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
BEGIN
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;

    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- DEPOSITO (valor POSITIVO - crédito)
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'DEPOSITO', 'NORMAL', 'DEPOSITO',
                v_valor_efetivo,  -- POSITIVO (crédito)
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Depósito via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- SAQUE (valor NEGATIVO - débito) - CORREÇÃO!
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id,
                'SAQUE', 'NORMAL', NULL,
                -v_valor_efetivo,  -- NEGATIVO (débito) - CORREÇÃO APLICADA!
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Saque via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- [Restante da função mantido igual...]
    
    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$function$;

-- CORREÇÃO DO SALDO BETVIP
-- Reverter o evento corrompido criando um REVERSAL
DO $$
DECLARE
    v_evento_corrompido RECORD;
    v_bookmaker_id UUID;
BEGIN
    -- Identificar o evento de saque corrompido
    SELECT fe.* INTO v_evento_corrompido
    FROM financial_events fe
    JOIN bookmakers b ON b.id = fe.bookmaker_id
    WHERE b.nome ILIKE '%betvip%'
      AND fe.tipo_evento = 'SAQUE'
      AND fe.valor > 0  -- Valor positivo (erro)
      AND fe.created_at >= '2026-02-02'
    ORDER BY fe.created_at DESC
    LIMIT 1;
    
    IF v_evento_corrompido IS NOT NULL THEN
        -- Criar evento de reversão para anular o crédito indevido
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, 
            reversed_event_id, processed_at, created_by
        ) VALUES (
            v_evento_corrompido.bookmaker_id,
            v_evento_corrompido.workspace_id,
            'REVERSAL', 'NORMAL',
            -v_evento_corrompido.valor,  -- Negar para reverter o crédito
            v_evento_corrompido.moeda,
            'reversal_fix_' || v_evento_corrompido.id::TEXT,
            'Correção: Reversão de saque com sinal incorreto',
            v_evento_corrompido.id,
            NOW(),
            v_evento_corrompido.created_by
        );
        
        -- Criar o evento correto de saque (negativo)
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
            v_evento_corrompido.bookmaker_id,
            v_evento_corrompido.workspace_id,
            'SAQUE', 'NORMAL',
            -v_evento_corrompido.valor,  -- Valor correto (negativo)
            v_evento_corrompido.moeda,
            'corrected_withdraw_' || v_evento_corrompido.id::TEXT,
            'Correção: Saque com sinal correto',
            NOW(),
            v_evento_corrompido.created_by
        );
    END IF;
END $$;
```
