# Refatoração Arquitetural do Ledger (Cash + Freebet) — Plano v1

**Data:** 2026-04-08

---

## 1. DIAGNÓSTICO ARQUITETURAL (ESTADO ATUAL)

### 1.1 Fluxo CASH (Saldo Real)

```
cash_ledger INSERT
  → trigger: fn_cash_ledger_generate_financial_events
    → INSERT financial_events (tipo_evento=DEPOSITO/SAQUE/etc, tipo_uso=NORMAL)
      → trigger: fn_financial_events_sync_balance
        → UPDATE bookmakers.saldo_atual
```

**Status:** ✅ Consistente. Caminho único, trigger-driven.

### 1.2 Fluxo FREEBET (DUAL PATH — PROBLEMA RAIZ)

**Caminho A — Via RPCs de aposta (majoritário: 35 eventos):**
```
criar_aposta_atomica_v3 / liquidar_perna_surebet_v1
  → INSERT financial_events (tipo_evento='STAKE', tipo_uso='FREEBET')
    → trigger: fn_financial_events_sync_balance
      → UPDATE bookmakers.saldo_freebet
```

**Caminho B — Via TypeScript/consumirFreebet (minoritário: 10 eventos):**
```
processFinancialEvent() / consumirFreebetViaLedger()
  → INSERT financial_events (tipo_evento='FREEBET_STAKE', tipo_uso='FREEBET')
    → trigger: fn_financial_events_sync_balance
      → UPDATE bookmakers.saldo_freebet
```

**🔴 PROBLEMA:** Mesma ação (consumir freebet), dois nomes de evento diferentes (`STAKE` vs `FREEBET_STAKE`). Qualquer query/view que filtre por apenas um nome perde dados.

### 1.3 Inventário de RPCs Financeiras (58 funções)

| Categoria | RPCs | Observação |
|-----------|-------|-----------|
| Criar aposta | `criar_aposta_atomica` (×2), `_v2`, `_v3` | 4 versões coexistindo |
| Liquidar | `liquidar_aposta_v4`, `liquidar_perna_surebet_v1` | 2 caminhos |
| Editar | `editar_aposta_liquidada_v4`, `editar_perna_surebet_atomica`, `editar_surebet_completa_v1` | 3 caminhos |
| Reverter | `reverter_liquidacao_v4` | OK |
| Deletar | `deletar_aposta_v4`, `deletar_perna_surebet_v1` | 2 caminhos |
| Reliquidar | `reliquidar_aposta_v5`, `_v6` | 2 versões |
| Freebet | `consumir_freebet`, `converter_freebet`, `creditar_freebet`, `estornar_freebet`, `expirar_freebet` | 5 RPCs separadas |
| Saldo | `get_bookmaker_saldos`, `_financeiro`, `get_saldo_disponivel_com_reservas`, `get_saldo_operavel_por_projeto` | 4 formas de consultar saldo |
| Reconciliação | `reconciliar_saldo_bookmaker`, `recalcular_saldo_por_apostas`, `recalcular_saldos_projeto`, `recalcular_saldos_workspace`, `reprocessar_ledger_workspace` | 5 funções de reparo |

### 1.4 Eventos no Ledger (Dados Reais de Produção)

| tipo_evento | tipo_uso | count | Observação |
|------------|----------|-------|-----------|
| STAKE | NORMAL | 3313 | ✅ Principal |
| PAYOUT | NORMAL | 1426 | ✅ OK |
| DEPOSITO | NORMAL | 337 | ✅ OK |
| AJUSTE | NORMAL | 158 | ✅ OK |
| SAQUE | NORMAL | 143 | ✅ OK |
| BONUS | NORMAL | 114 | ✅ OK |
| REVERSAL | NORMAL | 105 | ✅ OK |
| FREEBET_EXPIRE | FREEBET | 56 | ✅ OK |
| VOID_REFUND | NORMAL | 52 | ✅ OK |
| FREEBET_CREDIT | FREEBET | 48 | ✅ OK |
| **STAKE** | **FREEBET** | **35** | 🔴 Caminho A |
| AJUSTE | FREEBET | 29 | ✅ Reconciliação |
| CASHBACK | NORMAL | 28 | ✅ OK |
| **FREEBET_STAKE** | **FREEBET** | **10** | 🔴 Caminho B |
| REVERSAL | FREEBET | 3 | ✅ OK |
| PAYOUT | FREEBET | 1 | ✅ OK |

**🔴 Dual path confirmado:** 35 eventos via `STAKE/FREEBET` + 10 via `FREEBET_STAKE/FREEBET`.

### 1.5 Fontes de Verdade Duplas

| Campo | Localização | Tipo | Problema |
|-------|------------|------|---------|
| `utilizada` | freebets_recebidas | Flag manual | Dessincroniza do ledger |
| `usar_freebet` | apostas_unificada | Flag de intenção | Redundante com `fonte_saldo` |
| `fonte_saldo` | apostas_pernas | Persistido | ✅ Fonte correta |
| `tipo_uso` | financial_events | Derivado | ✅ Fonte correta |
| `saldo_freebet` | bookmakers | Materializado | Depende do trigger |

### 1.6 Triggers (14 total)

- **cash_ledger:** 12 triggers (incluindo geração de financial_events)
- **financial_events:** 2 triggers (sync balance + protect broker)

---

## 2. ARQUITETURA ALVO

### 2.1 Princípio: Unificação de Vocabulário

**ANTES (16 tipos de evento):**
```
STAKE, FREEBET_STAKE, PAYOUT, FREEBET_CREDIT, FREEBET_EXPIRE,
FREEBET_STAKE, VOID_REFUND, REVERSAL, DEPOSITO, SAQUE,
CASHBACK, BONUS, AJUSTE, PAYOUT (FREEBET)
```

**DEPOIS (7 tipos de evento):**
```
BET_PLACED      → Débito de stake (CASH ou FREEBET via tipo_uso)
BET_SETTLED     → Crédito de resultado (GREEN/VOID)
BET_REVERSED    → Reversão de evento anterior
CREDIT          → Entrada (depósito, bônus, cashback, freebet credit)
DEBIT           → Saída (saque, freebet expire)
ADJUSTMENT      → Ajuste manual/reconciliação
TRANSFER        → Movimentação entre pools (futuro)
```

### 2.2 Regras de Cálculo (Imutáveis)

```
CASH:
  GREEN      → valor = +(stake × odd)
  RED        → valor = 0 (stake já debitado)
  VOID       → valor = +stake (devolução)
  MEIO_GREEN → valor = +(stake × odd × 0.5) + (stake × 0.5)
  MEIO_RED   → valor = +(stake × 0.5)

FREEBET:
  GREEN      → valor = +(stake × (odd - 1))  ← SÓ LUCRO
  RED        → valor = 0                      ← ZERO PREJUÍZO
  VOID       → valor = +stake (devolve ao pool FREEBET)
  MEIO_GREEN → valor = +(stake × (odd - 1) × 0.5)
  MEIO_RED   → valor = 0
```

### 2.3 Invariantes

```
1. saldo_atual    = Σ financial_events.valor WHERE tipo_uso = 'NORMAL' AND event_scope = 'REAL'
2. saldo_freebet  = Σ financial_events.valor WHERE tipo_uso = 'FREEBET' AND event_scope = 'REAL'
3. Freebet RED    → NUNCA gera valor negativo em NORMAL
4. Preview calc   == Liquidação calc (mesma função)
5. Sem aposta_id  → BLOQUEIO de BET_PLACED
```

### 2.4 Detecção Unificada de Freebet

```
ÚNICA FORMA: apostas_pernas.fonte_saldo = 'FREEBET'

Eliminados:
  ❌ apostas_unificada.usar_freebet
  ❌ freebets_recebidas.utilizada
  ❌ COALESCE(p_fonte_saldo, v_perna.fonte_saldo, 'REAL')
```

---

## 3. ELIMINAÇÕES NECESSÁRIAS

### 3.1 Campos Redundantes
- `freebets_recebidas.utilizada` → substituído por `utilizada_derivada` na view
- `apostas_unificada.usar_freebet` → já existe `fonte_saldo` na perna

### 3.2 RPCs Duplicadas (Candidatas a Remoção)
- `criar_aposta_atomica` (sem versão) × 2 → manter apenas `_v3`
- `criar_aposta_atomica_v2` → deprecated
- `reliquidar_aposta_v5` → manter apenas `_v6`
- `atualizar_aposta_liquidada_atomica` / `_v2` → substituído por `editar_aposta_liquidada_v4`

### 3.3 Vocabulário de Eventos
- `FREEBET_STAKE` → normalizar para `STAKE` com `tipo_uso='FREEBET'` (ou vice-versa)
- `VOID_REFUND` → normalizar para `BET_SETTLED` com metadata `resultado=VOID`

---

## 4. CORREÇÕES IMEDIATAS (JÁ APLICADAS OU PRONTAS)

| # | Correção | Status |
|---|---------|--------|
| 1 | View `v_freebets_disponibilidade` incluir `STAKE+FREEBET` | ✅ Aplicada |
| 2 | RPC `liquidar_perna_surebet_v1` priorizar `fonte_saldo` da perna | ✅ Aplicada |
| 3 | Reconciliação de freebets duplicadas (Mariana) | ✅ Aplicada |
| 4 | Normalizar os 10 eventos `FREEBET_STAKE` → `STAKE` | 🟡 Pendente |
| 5 | Remover uso de `utilizada` flag em código TS | 🟡 Pendente |

---

## 5. PLANO DE MIGRAÇÃO (SEM DOWNTIME)

### Etapa 1 — Normalização de Eventos (Baixo Risco)
```sql
-- Unificar FREEBET_STAKE → STAKE (mantendo tipo_uso=FREEBET)
UPDATE financial_events 
SET tipo_evento = 'STAKE' 
WHERE tipo_evento = 'FREEBET_STAKE' AND tipo_uso = 'FREEBET';
```
**Impacto:** Nenhum — trigger de sync usa `tipo_uso`, não `tipo_evento`.

### Etapa 2 — Shadow Validation
- Criar view `v_freebet_audit_v2` que calcula saldo via ledger puro
- Comparar com `saldo_freebet` materializado
- Rodar por 1 semana em produção

### Etapa 3 — Deprecar RPCs Antigas
- Marcar `criar_aposta_atomica` (sem versão) como deprecated
- Redirecionar chamadas para `_v3`
- Monitorar logs por 2 semanas

### Etapa 4 — Unificar Vocabulário de Eventos
- Gradualmente renomear tipos de evento no código TS
- Manter backward compatibility via CASE no trigger

### Etapa 5 — Limpeza Final
- Remover RPCs deprecated
- Remover campo `utilizada` da tabela (após confirmar que nenhum código usa)
- Remover campo `usar_freebet` (após confirmar derivação via perna)

---

## 6. TESTES OBRIGATÓRIOS

| Teste | Cenário | Esperado |
|-------|---------|----------|
| T1 | Criar aposta com freebet | `STAKE/FREEBET` criado, saldo_freebet reduzido |
| T2 | GREEN com freebet | Lucro = `stake × (odd-1)`, sem retorno de stake |
| T3 | RED com freebet | Lucro = 0, sem débito adicional |
| T4 | VOID com freebet | Freebet devolvida ao pool |
| T5 | Edição parcial (R$100→R$60) | R$40 devolvido ao pool freebet |
| T6 | Deletar aposta com freebet | Freebet integralmente devolvida |
| T7 | Troca de casa em surebet | Stake freebet migra corretamente |
| T8 | Múltiplas edições sequenciais | Idempotência mantida |
| T9 | Preview == Liquidação | Valores idênticos |
| T10 | Aposta sem aposta_id | BLOQUEADO (constraint) |

---

## 7. ANÁLISE DE RISCO

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Normalização de eventos corromper dados | Baixa | Alto | Backup + transação |
| RPCs deprecated serem chamadas | Média | Médio | Logs + monitoramento |
| Remoção de `utilizada` quebrar UI | Média | Baixo | View já fornece `utilizada_derivada` |
| Inconsistência histórica | Baixa | Baixo | Eventos antigos mantidos, apenas novos normalizados |

---

## 8. REDUÇÃO ESTIMADA DE COMPLEXIDADE

| Métrica | Antes | Depois | Redução |
|---------|-------|--------|---------|
| Tipos de evento | 16 | 7 | -56% |
| RPCs financeiras | 58 | ~25 | -57% |
| Formas de detectar freebet | 3 | 1 | -67% |
| Fontes de verdade para saldo FB | 3 | 1 | -67% |
| Triggers em cash_ledger | 12 | 8 | -33% |

---

## 9. PRIORIDADE DE EXECUÇÃO

1. **AGORA:** ✅ View corrigida + RPC de liquidação corrigida
2. **SEMANA 1:** Normalizar os 10 eventos `FREEBET_STAKE` + criar audit view
3. **SEMANA 2:** Deprecar RPCs antigas + testes automatizados
4. **SEMANA 3-4:** Unificar vocabulário no código TS
5. **MÊS 2:** Limpeza final (remover campos, RPCs, triggers)
