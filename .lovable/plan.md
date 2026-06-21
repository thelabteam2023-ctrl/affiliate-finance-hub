# Plano: Simulação BACK+LAY com resolução e edição pós-liquidação

## Objetivo
Rodar uma simulação determinística em SQL que reproduza, no mesmo caminho do formulário de Arbitragem:
1. **Criação** de uma aposta de 2 pernas (BACK odd 2 R$100 + LAY odd 2 R$100, comissão 0%).
2. **Resolução** quick-resolve (cenário a definir: BACK GREEN/LAY RED, BACK RED/LAY GREEN, ou VOID).
3. **Edição pós-liquidação** alterando stake/odd e observando ledger, `pl_consolidado`, `saldo_atual` e snapshot da perna.

Tudo executado dentro de `BEGIN; ... ROLLBACK;` (zero resíduo no banco), espelhando o que o front faz via `criar_surebet_atomica_v3`, `liquidar_perna_surebet_v1` e `editar_surebet_completa_v3`.

## Decisões de cenário (precisam de confirmação)

### A) Qual resultado simular na resolução?
Para um BACK 2.0 / LAY 2.0 comissão 0% com stakes iguais, os cenários canônicos são:
- **BACK GREEN + LAY RED** → BACK paga +100, LAY perde liability 100 → P&L = 0.
- **BACK RED + LAY GREEN** → BACK perde 100, LAY ganha 100 (×(1−comissão)) → P&L = 0.
- **VOID/VOID** → ambas devolvem stake/liability → P&L = 0.

Default sugerido: **BACK GREEN + LAY RED** (mais comum em hedge real).

### B) Que edição aplicar DEPOIS de liquidada?
Opções (escolha uma, ou múltiplas em sequência):
1. **Alterar stake** da perna BACK de 100 → 120 (mantendo resultado).
2. **Alterar odd** da perna BACK de 2.0 → 2.10 (mantendo resultado).
3. **Alterar resultado** da perna BACK de GREEN → RED (reliquidação real).
4. **Trocar tipo** BACK ↔ LAY (caso de borda; raramente usado).

Default sugerido: **(1) + (2) juntos** — é o caso clássico "errei o valor digitado" pós-fechamento. A (3) já está coberta pelo teste `03_edit_liquidada_ledger_parity.sql`.

### C) Aba de origem da simulação
Como `criar_surebet_atomica_v3` é a mesma RPC em todas as abas, qualquer aba (Surebet/Bonus/DuploGreen/ValueBet/Punter) produz o mesmo resultado financeiro — só muda `estrategia`/`contexto_operacional`. Default: **aba Surebet** (estrategia=SUREBET, contexto=NORMAL). Se quiser, replico nas 6 abas (como o `04_arbitragem_form_e2e_all_tabs.sql` já faz).

## Entregável

Arquivo novo: `supabase/tests/triggers/05_back_lay_edit_pos_liquidacao.sql`

Estrutura:
```text
BEGIN;
  -- params: workspace, user, projeto, bk1 (BACK), bk2 (LAY)
  -- snapshot saldos pré

  -- FASE 1: CRIAÇÃO
  criar_surebet_atomica_v3(
    pernas:    [{ordem:1, casa:bk1, tipo:'back'},
                {ordem:2, casa:bk2, tipo:'lay'}],
    entradas:  [{perna_ordem:1, stake:100, odd:2.00, moeda:BRL, fonte:REAL},
                {perna_ordem:2, stake:100, odd:2.00, moeda:BRL, fonte:REAL, comissao:0}]
  )
  ASSERT:
    - bk1.saldo  = pre_bk1 − 100              (stake BACK debitado)
    - bk2.saldo  = pre_bk2 − 100              (liability LAY = stake×(odd−1) = 100)
    - status = PENDENTE
    - apostas_perna_entradas com cotacao_snapshot=1

  -- FASE 2: RESOLUÇÃO (cenário escolhido: BACK GREEN, LAY RED)
  liquidar_perna_surebet_v1(perna1, 'GREEN', ws)
  liquidar_perna_surebet_v1(perna2, 'RED',   ws)
  ASSERT:
    - status = LIQUIDADA
    - pl_perna1 = +100 ; pl_perna2 = −100   (já refletido na criação para LAY)
    - pl_consolidado pai = Σ pernas = 0
    - bk1.saldo = pre_bk1 + 100              (stake devolvido + lucro = +100 líquido)
    - bk2.saldo = pre_bk2 − 100              (liability consumida)
    - ledger: PAYOUT em bk1 (+200), nenhum payout em bk2 (RED LAY)

  -- FASE 3: EDIÇÃO PÓS-LIQUIDAÇÃO (stake 100→120, odd 2.00→2.10 na BACK)
  editar_surebet_completa_v3(
    aposta_id,
    nova_perna1: { stake:120, odd:2.10, resultado:'GREEN' },
    nova_perna2: { inalterada }
  )
  ASSERT:
    - reversão completa do PAYOUT anterior em bk1
    - novo débito de stake (−120) e novo PAYOUT (+120×2.10 = +252)
    - bk1.saldo final = pre_bk1 + 132        (lucro novo = 120)
    - bk2.saldo inalterada vs FASE 2
    - pl_perna1 = +120 ; pl_perna2 = −100 ; pl_consolidado = +20
    - aposta_edit_audit_logs ganhou 1 linha com diff de stake/odd
    - cotacao_snapshot da perna preservada (não recotada)

ROLLBACK;
```

## Como rodar
```bash
psql -v ws=<uuid> -v uid=<uuid> -v proj=<uuid> \
     -v bk1=<uuid> -v bk2=<uuid> \
     -v ON_ERROR_STOP=1 \
     -f supabase/tests/triggers/05_back_lay_edit_pos_liquidacao.sql
```
Saída: `RAISE NOTICE` por fase com saldos antes/depois e deltas; qualquer divergência aborta com `RAISE EXCEPTION` (e o `ROLLBACK` garante limpeza).

## Fora de escopo
- Não toca frontend.
- Não cria migration (só arquivo de teste).
- Não altera nenhum dado real (transação revertida).
- Não cobre multimoeda, freebet ou multi-entry (cenários já cobertos por testes existentes — posso adicionar depois se quiser).

## Perguntas para confirmar antes de implementar
1. Cenário de resolução: **BACK GREEN + LAY RED** (default) ou outro?
2. Edição pós-liquidação: **stake 100→120 + odd 2.00→2.10** (default) ou outra mudança?
3. Replicar nas 6 abas ou só **Surebet**?
