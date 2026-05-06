## Restauração de saldo — BET365 / kelly1a2 (Broker TIAGO PASSOS)

### Diagnóstico (regressão por ledger)
Marco: última aposta criada nesta conta = `27b9941e…` em **2026-05-05 19:31 UTC**. Até esse instante o saldo REAL era **−R$ 961,24** (consistente com o histórico de stakes pendentes da semana).

Hoje (06/05) às **05:35 UTC**, a migração de "Reparo" inseriu **47 eventos `Reparo: Débito retroativo de stake` totalizando −R$ 11.360,83** nesta conta. Esses 47 débitos são os indevidos — a regressão mostra que o saldo "natural" antes da migração era −R$ 961,24 e os payouts legítimos do dia (+R$ 7.310,97) levariam o saldo para **+R$ 6.349,73**, em vez dos atuais −R$ 5.011,10.

```text
Saldo até última aposta (05/05 19:31)        −     961,24
+ Reparos indevidos (06/05 05:35, 47 eventos)  −  11.360,83
+ PAYOUTs legítimos hoje (17 eventos)        +   7.310,97
= Saldo atual (sistema)                       −   5.011,10
Delta para corrigir                          + 11.360,83
Saldo alvo                                   +   6.349,73
```

### Correção proposta
Registrar **um único `AJUSTE_SALDO` de +R$ 11.360,83** via `registrarAjusteViaLedger`, com motivo auditável apontando para o lote de Reparos. Não tocar no ledger histórico (política anti-retrofix), não deletar eventos, não fazer UPDATE em `saldo_atual`.

**Parâmetros do ajuste**
- bookmaker_id: `b493a681-3265-4383-afa3-06cffab9dbf7`
- workspace_id: `feee9758-a7f4-474c-b2b1-679b66ec1cd9`
- moeda: `BRL`
- delta: `+11360.83`
- descricao: `Reversão dos 47 reparos retroativos de stake (migração 06/05 05:35) — Broker TIAGO / BET365 kelly1a2`
- motivo: referência aos 47 `idempotency_key = repair_stake_*` aplicados nesta conta

### Execução
1. Abrir o diálogo **Ajuste de Saldo** desta conta no projeto correspondente (ou via util `registrarAjusteViaLedger` a partir de um trigger administrativo).
2. Informar saldo real `R$ 6.349,73` (ou direto delta `+11.360,83`) com a observação obrigatória acima.
3. Confirmar — o trigger sincroniza `bookmakers.saldo_atual` automaticamente.

### Validação pós-ajuste
- `SELECT saldo_atual FROM bookmakers WHERE id='b493a681…'` → deve retornar **6349.73**.
- `SELECT SUM(valor) FROM financial_events WHERE bookmaker_id='b493a681…' AND event_scope='REAL'` → deve igualar `saldo_atual`.
- Verificar que o card BET365/kelly1a2 mostra `R$ 6.349,73 BRL` e o uso da extensão volta a funcionar.

### Próximo passo (não incluso nesta execução)
Levantar a lista completa de bookmakers no workspace que receberam eventos `idempotency_key LIKE 'repair_stake_%'` e propor um plano de correção em lote, conta por conta, com o mesmo padrão `AJUSTE_SALDO` rastreável.

### Restrições respeitadas
- Sem UPDATE direto em `saldo_atual` / `saldo_freebet`.
- Sem DELETE de eventos do ledger (histórico imutável preservado).
- Workspace isolado.
- Política anti-retrofix mantida — uso exclusivo de `AJUSTE_SALDO`.
