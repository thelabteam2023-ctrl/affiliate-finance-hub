---
name: surebet-edit-reversal-order-standard
description: editar_surebet_completa_v3 deve estornar eventos ANTES do DELETE de pernas/entradas e popular aposta_edit_audit_logs
type: feature
---
`editar_surebet_completa_v3` ordem obrigatória:
1. Snapshot BEFORE (pernas/entradas)
2. Coletar `v_input_perna_ids` + `v_input_entrada_ids` do payload
3. **REVERSAL unificado** de stake/payout/refund antes do DELETE (cobre keys `stake_perna_*`, `payout_perna_*`, `stake_entry_*`, `voidrefund_*`). Sem isso o CASCADE apaga as entradas e o REVERSAL nunca encontra `EXISTS` → double-debit.
4. DELETE pernas órfãs (cascade entradas)
5. UPSERT pernas → UPSERT entradas (preservando `cotacao_snapshot` via COALESCE no UPDATE/INSERT)
6. Reconsolidar pernas a partir das entradas
7. Re-liquidar pernas com resultado via `liquidar_perna_surebet_v1`
8. `fn_recalc_pai_surebet`
9. **INSERT em `aposta_edit_audit_logs`** com action='EDIT_SUREBET_COMPLETA' (auditoria oficial; debug_logs não substitui)

`liquidar_perna_surebet_v1` usa `clock_timestamp()` (não `NOW()`/transaction_timestamp) para `v_now` e `v_ts_suffix`, permitindo re-liquidações dentro da mesma transação.