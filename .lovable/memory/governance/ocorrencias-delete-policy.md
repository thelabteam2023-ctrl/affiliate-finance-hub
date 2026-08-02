---
name: Política de Exclusão de Ocorrências
description: Exclusão de ocorrências é soft delete auditável restrito a owner/admin, bloqueada com vínculo financeiro
type: constraint
---
- Exclusão física de `ocorrencias` é PROIBIDA (policies de DELETE removidas; DELETE revogado de authenticated).
- Exclusão = soft delete via RPC `soft_delete_ocorrencia(p_id, p_motivo)`: só owner/admin, motivo obrigatório (>=10 chars), grava `deleted_at/deleted_by/delete_reason`, evento na timeline com snapshot JSON e `create_audit_log`.
- Bloqueio `VINCULO_FINANCEIRO`: não arquivar quando `perda_registrada_ledger` ou `perda_ledger_id`. Nesse caso usar cancelamento (que estorna a perda) com `cancel_reason`.
- Restauração via `restore_ocorrencia(p_id)` (owner/admin).
- Todas as leituras operacionais filtram `deleted_at is null`; aba "Arquivadas" só para owner/admin.
