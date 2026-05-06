## Diagnóstico — Causa raiz

Aposta `345a8420…` (SIMPLES, USD, RED, stake 100) no banco:
- `lucro_prejuizo = 0.0000`
- `pl_consolidado = 0.0000`
- `valor_retorno = 0`
- `status = LIQUIDADA`, `resultado = RED`

Esperado: `lucro_prejuizo = -100`, `pl_consolidado = -100`.

### O que está quebrado

A migração `20260506155756_eaf8a75f…` reescreveu `fn_recalc_aposta_consolidado()` (BEFORE INSERT/UPDATE em `apostas_unificada`). A nova função calcula `pl_consolidado` somando:

1. **Caminho moderno**: linhas de `apostas_perna_entradas`
2. **Caminho legado**: linhas de `apostas_pernas`

**Bug**: para apostas SIMPLES (não-arbitragem), normalmente NÃO existem `apostas_pernas` nem `apostas_perna_entradas` — o stake/odd/resultado vivem na própria `apostas_unificada`. Como o loop legado não encontra nada, `v_total_consolidado` permanece em 0 e a função grava `NEW.pl_consolidado = 0`.

A UI (SurebetCard, ApostaCard, KPIs) segue a hierarquia canônica documentada em memória:
`pl_consolidado ?? lucro_prejuizo_brl_referencia ?? lucro_prejuizo` → encontra `0` e exibe **$0,00**.

Adicionalmente, para apostas pendentes a função força `v_entry_lucro := 0` no caminho moderno, o que também é incorreto (PENDENTE deve manter o stake como custo provisório, não zerar). Isso explica porque os usuários antes viram “lucros sumindo” em pendentes multicurrency.

Quanto a `lucro_prejuizo = 0`: o `liquidar_aposta_v4` deveria ter gravado -100 (vem do `p_lucro_prejuizo` enviado pelo frontend e reforçado por `fn_sync_aposta_simples_resultado_financeiro`). Como o `pl_consolidado=0` é o que a UI lê, o sintoma principal é o card e os KPIs zerados; o `lucro_prejuizo` divergente é secundário e investigado no Passo 4.

### Camadas envolvidas

- ✅ Ledger (`financial_events`): correto — STAKE -100 USD presente, sem PAYOUT (RED).
- ✅ `bookmakers.saldo_atual`: 0.00 USD (sincronizado com ledger via `sync_bookmaker_balance_from_ledger`).
- ❌ `apostas_unificada.pl_consolidado`: 0 (deveria ser -100).
- ❌ `apostas_unificada.lucro_prejuizo`: 0 (deveria ser -100).
- ❌ UI (lendo `pl_consolidado` primeiro): mostra $0,00.

---

## Plano de correção

### 1. Corrigir `fn_recalc_aposta_consolidado`

Adicionar **terceiro caminho** (fallback para SIMPLES sem pernas/entradas) que usa os campos da própria `apostas_unificada`:

```text
IF NOT v_has_entries AND NOT EXISTS pernas THEN
   -- Usar NEW.stake / NEW.odd / NEW.resultado / NEW.fonte_saldo / NEW.moeda_operacao
   -- Calcular lucro idêntico ao do caminho moderno
   -- Aplicar conversão NEW.moeda_operacao → moeda_consolidacao
   -- Multi se NEW.moeda_operacao != moeda_consolidacao
END IF;
```

E remover o "PENDENTE → 0" indevido: para PENDENTE consolidado deve refletir o `lucro_prejuizo` corrente (NULL/0) sem zerar o resto.

### 2. Reforçar gravação de `lucro_prejuizo`

Em `liquidar_aposta_v4` (passo 3), garantir que para apostas SIMPLES sem pernas o `lucro_prejuizo` é calculado deterministicamente quando `p_lucro_prejuizo` for NULL, em vez de depender de `COALESCE(p_lp, lucro_prejuizo)` (que pode pegar 0 setado por reset do `reliquidar_aposta_v6`).

### 3. Backfill controlado

Reprocessar SOMENTE apostas SIMPLES afetadas (status = LIQUIDADA, sem pernas, `pl_consolidado = 0` mas `lucro_prejuizo ≠ 0` ou divergente do esperado), via `UPDATE apostas_unificada SET updated_at = now() WHERE …` (dispara o trigger corrigido). Sem deletar/duplicar eventos do ledger.

### 4. Auditoria pós-fix

Query de verificação: para cada aposta SIMPLES LIQUIDADA, comparar `pl_consolidado` recalculado vs `lucro_prejuizo` convertido pela cotação de trabalho. Listar divergências > 0,01.

### 5. Teste de regressão

- Resolver SIMPLES GREEN em moeda nativa (BRL): pl_consolidado = lucro positivo.
- Resolver SIMPLES GREEN em moeda diferente da consolidação (USD em projeto BRL): pl_consolidado convertido corretamente, `is_multicurrency=true`.
- Resolver SIMPLES RED: pl_consolidado = -stake_real.
- Reliquidar GREEN→RED→GREEN: idempotente, sem stake duplicado.
- Surebet (ARBITRAGEM): comportamento atual preservado (caminho moderno/legado por pernas).

---

## Restrições respeitadas

- **Sem alterar dados financeiros do ledger** — apenas projeção em `apostas_unificada` é recalculada via trigger.
- **Sem mass-fix retroativo no ledger** — backfill apenas dispara trigger BEFORE UPDATE.
- **Sem mexer em schemas reservados** (`auth`, `storage`, …).
- **Histórico imutável preservado**.

Aprovando este plano, implemento via uma migração única (função + backfill controlado + comentários de documentação).