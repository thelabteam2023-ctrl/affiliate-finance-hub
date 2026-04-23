# Memory: finance/bonus-migration-cross-project-standard
Updated: 2026-04-23

## Migração automática de bônus ativos no vínculo entre projetos

Quando uma bookmaker é vinculada a um novo projeto (UPDATE `bookmakers.projeto_id` com `MIGRACAO`), o trigger `fn_ensure_deposito_virtual_on_link` (v2 — `real_only_migracao_v2_with_bonus_migration`) executa em sequência:

1. **DEPOSITO_VIRTUAL** com a parte real (saldo_atual − bonus − freebet) no projeto destino.
2. **Cópia automática** de todos os registros em `project_bookmaker_link_bonuses` com `status='credited'` do projeto origem (`v_last_sv_projeto`) para o projeto destino, preservando: `bonus_amount`, `currency`, `credited_at`, `expires_at`, `rollover_*`, `deposit_amount`, `min_odds`, `tipo_bonus`, snapshots cambiais e `created_at` original.
3. **Marca os originais** no projeto origem como `status='finalized'` + `finalize_reason='migrated_to_other_project'`. SEM gerar novo `BONUS_CREDITADO`/`BONUS_ESTORNO` (não duplica ledger — histórico financeiro original é preservado).
4. **Log** em `financial_debug_log` com `event_type='BONUS_MIGRATED_ON_LINK'`.

## Por que sem mexer no ledger
O ledger original (`BONUS_CREDITADO` no projeto origem) já reflete o crédito no momento histórico correto. Recriar ledger no destino duplicaria o evento. A baseline financeira do destino é cobertura via `DEPOSITO_VIRTUAL` (parte real apenas).

## Índice de performance
`idx_pblb_bookmaker_status_credited` em `(bookmaker_id, status) WHERE status='credited'`.

## Remediação histórica
Casos pré-v2 podem ser recuperados por INSERT manual no `project_bookmaker_link_bonuses` (status `credited`, preservar `created_at` original do `BONUS_CREDITADO` no ledger). Se a tentativa anterior de exclusão gerou `BONUS_ESTORNO` indevido sem registro para deletar, marcar o estorno como `status='CANCELADO'` em `cash_ledger` com `auditoria_metadata.cancelled_reason='orphan_bonus_remediation_no_record_to_revert'`.
