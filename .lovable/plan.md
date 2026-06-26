
# Plano: Correção Cirúrgica — Causas A e B (saldos negativos)

Escopo restrito conforme instruções. **Causa C (freebet negativo) e Causa D (BET365 desvinculados) não serão tocadas.** Nenhuma observabilidade nova (sem `bookmaker_negative_balance_log`), nenhum guard genérico em `financial_events`.

---

## 1. Diagnóstico de causa confirmado

### Causa A — Drift de precisão no PAYOUT

**Onde o stake é validado hoje:**
- `src/services/aposta/invariants.ts` (linha 137–148) — `INVARIANT_006: STAKE_WITHIN_BALANCE`.
  Compara `perna.stake > saldo.saldo_operavel` **sem normalizar precisão** (NUMERIC vs float JS).
- `src/hooks/useSafeApostaSave.ts` (linha 225) — fallback client-side, mesma comparação sem `round`.
- `src/utils/surebetBalanceValidation.ts` (linha 119) — validador de surebet.
- Backend: `get_bookmaker_saldos` (RPC) devolve `saldo_operavel` como NUMERIC. Não há tolerância.

**Onde o PAYOUT é gravado sem normalização:**
- `liquidar_aposta_v4` (RPC):
  - Fallback BACK (linha ~115): `v_payout_total := v_aposta.stake * v_effective_odd;` — produto NUMERIC × NUMERIC com `odd_final` podendo ter até 5 casas (`step=0.00001`). Gravado direto em `financial_events.valor` sem `ROUND`.
  - Fallback LAY (linha ~85): `stake * (1 - lay_comissao)` — sem `ROUND`.
  - `MEIO_GREEN`: `stake + (stake * (odd-1)/2)` — sem `ROUND`.
- `liquidar_perna_surebet_v1` (surebet) — mesma característica para pernas individuais.

**Sintoma**: PAYOUT armazenado com 3+ casas decimais; STAKE_DEBIT foi armazenado com 2. Soma final fica em −0,01/−0,33 etc. → bookmakers `RICH ROYAL` e `MILLIONER`.

### Causa B — Re-liquidação sem guarda de saldo

**Fluxo atual de `reliquidar_aposta_v6` (passo-a-passo):**
1. `SELECT FOR UPDATE` na aposta.
2. Snapshot dos eventos antigos (`PAYOUT/FREEBET_RETURN/VOID_REFUND/AJUSTE/REVERSAL`) → grava em `audit_logs`.
3. `DELETE` desses eventos (preserva STAKE).
4. `UPDATE` aposta para `status=PENDENTE`, zera resultado/lucro.
5. Chama `liquidar_aposta_v4(p_aposta_id, p_novo_resultado, p_lucro_prejuizo)` — insere o novo PAYOUT.
6. `sync_bookmaker_balance_from_ledger`.

**Falha**: entre 3 e 5 não há checagem se o saldo resultante absorve a diferença. Ex.: PAYOUT antigo era +R$ 100 já consumido em outra aposta; ao deletá-lo e gravar novo +R$ 50, saldo fica negativo. Caso real: BORA JOGAR (−3,07 BRL).

---

## 2. Plano de implementação — Causa A

### A.1 Normalização do PAYOUT no banco (cirúrgico)

Editar **apenas** os pontos de `INSERT INTO financial_events` dentro de `liquidar_aposta_v4` e `liquidar_perna_surebet_v1`, envolvendo o `valor` em `ROUND(..., precisao)` onde:

```sql
v_precisao := CASE WHEN UPPER(COALESCE(v_aposta.moeda_operacao, v_moeda_casa, 'BRL'))
                   IN ('BTC','ETH','USDT','USDC') THEN 8 ELSE 2 END;
...
ROUND(v_payout_total::numeric, v_precisao)
```

Mesmo tratamento para `v_lucro_calc` que vai para `apostas_unificada.lucro_prejuizo`.

**Pontos exatos a alterar** (somente esses):
- `liquidar_aposta_v4` — 3 inserts: ramo LAY, ramo BACK fallback, e o `UPDATE apostas_unificada SET lucro_prejuizo/valor_retorno`.
- `liquidar_perna_surebet_v1` — insert do PAYOUT da perna.

**Não tocar:**
- `STAKE_DEBIT` (já é gravado com 2 casas pela UI).
- `DEPOSITO`, `SAQUE`, `AJUSTE`, `CASHBACK`, `BONUS_CREDIT`, `FREEBET_*` — fluxos saudáveis.
- Triggers de sincronização (`sync_bookmaker_balance_from_ledger`).

### A.2 Tolerância de precisão na validação de stake (front + service)

Adicionar helper único `roundForCurrency(valor, moeda)` em `src/utils/formatCurrency.ts` (ou usar o existente se houver) e aplicar em **3 locais somente**:

1. `src/services/aposta/invariants.ts` linha 138:
   ```ts
   const stakeR = roundForCurrency(perna.stake, moeda);
   const saldoR = roundForCurrency(saldoOperavel, moeda);
   if (stakeR > saldoR + EPSILON) { ... }   // EPSILON = 0.005 para FIAT
   ```
2. `src/hooks/useSafeApostaSave.ts` linha 225 — mesma comparação com EPSILON.
3. `src/utils/surebetBalanceValidation.ts` linha 119 — idem.

**Não tocar** nenhuma outra checagem de saldo (depósito, ajuste manual, transferências de caixa).

### A.3 Verificação de não-regressão (Causa A)
- Aposta simples com odd 2.00, stake 100,00 → PAYOUT 200,00 (idêntico antes/depois).
- Aposta com odd 1.23456, stake 50,00 → antes: 61,728; depois: 61,73. Diferença ≤ 0,005 — dentro do tolerável e elimina o drift.
- Depósito/saque/ajuste/freebet: nenhum ponto alterado → comportamento idêntico.

---

## 3. Plano de implementação — Causa B

### B.1 Guard transacional em `reliquidar_aposta_v6`

Inserir, **entre os passos 4 e 5** atuais, um bloco que:

1. Calcula `saldo_pos_reversal := SUM(valor) FROM financial_events WHERE bookmaker_id = v_aposta.bookmaker_id AND tipo_uso='NORMAL'` (após o DELETE já executado).
2. Simula o novo payout chamando uma função pura `calcular_payout_previsto(p_aposta_id, p_novo_resultado, p_lucro_prejuizo)` — refatoração mínima: extrai a fórmula CASE já existente em `liquidar_aposta_v4` para uma função `STABLE` reutilizável, **sem alterar a fórmula**.
3. Lê `allow_negative` do bookmaker.
4. Se `allow_negative = false` AND `saldo_pos_reversal + novo_payout_previsto < 0`:
   ```sql
   RAISE EXCEPTION 'Saldo insuficiente para re-liquidar — ajuste manual requerido. Saldo após reversal: %, payout previsto: %, déficit: %',
     saldo_pos_reversal, novo_payout_previsto, (saldo_pos_reversal + novo_payout_previsto)
     USING ERRCODE = 'P0001';
   ```
   A transação inteira é revertida automaticamente (incluindo o DELETE e o UPDATE de status), portanto **não há liquidação parcial**.
5. Se passar: segue para o passo 5 atual (`liquidar_aposta_v4`).

### B.2 Surface do erro na UI
- `ApostaService.reliquidarAposta` já propaga erro de RPC via `throw`. Adicionar parse para detectar mensagem `'Saldo insuficiente para re-liquidar'` e exibir `toast.error("Saldo insuficiente para re-liquidar — ajuste manual requerido.")` no chamador (uma alteração em `src/services/aposta/ApostaService.ts` no `catch` do `reliquidarAposta`). Nada além disso.

### B.3 Verificação de não-regressão (Causa B)
- Re-liquidação GREEN→RED em bookmaker com saldo positivo após reversal: `saldo + 0 ≥ 0` → passa.
- Re-liquidação RED→GREEN com saldo cobrindo o novo payout: passa.
- Re-liquidação que hoje deixaria negativo: aborta com mensagem clara, dado fica inalterado.
- Apostas com `allow_negative = true`: guard bypassa (preservando casas que legitimamente operam negativas).

---

## 4. Conciliação de dados (somente após código aplicado)

Inserção única de eventos `AJUSTE` com `ajuste_natureza='CORRECAO_PRECISION'`, exclusivamente para:

| Bookmaker | ID | Ajuste |
|---|---|---|
| BORA JOGAR (Andréa) | `497b9853-6064-4f79-a78b-4e1bd33926d1` | +3,07 BRL |
| RICH ROYAL (Wallyson) | `c75ba748-9cdf-404c-be42-40315d92a5db` | +0,33 USD |
| MILLIONER (Andréa) | `fa8802aa-f4c7-46e2-b3c5-9ee375040303` | +0,01 USD |

`idempotency_key = 'correcao_precision_<bookmaker_id>'`, descrição auditável, `metadata` com motivo e link para este plano. **Não tocar** nos dois BET365 (−2.834,52 / −701,38 BRL) nem em nenhum bookmaker com `saldo_freebet` negativo.

---

## 5. Confirmação de escopo

- ❌ Causa C (freebet inventory) — **não tratada**, nenhuma função/tabela tocada.
- ❌ Causa D (BET365 desvinculados) — **não tratada**, registros intocados.
- ❌ `bookmaker_negative_balance_log` — **não criado**.
- ❌ Trigger genérico `BEFORE INSERT` em `financial_events` — **não criado**.
- ✅ Apenas: `liquidar_aposta_v4`, `liquidar_perna_surebet_v1`, `reliquidar_aposta_v6` (cirúrgico), 3 validações de stake no front, 1 toast no service, 3 inserts de AJUSTE.

---

**Aguardo sua confirmação explícita** para implementar nesta ordem: (1) Causa A backend + frontend, (2) Causa B backend + toast, (3) conciliação dos 3 bookmakers.
