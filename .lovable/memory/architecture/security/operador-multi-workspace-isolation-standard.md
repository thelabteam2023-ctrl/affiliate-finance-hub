---
name: Operador Multi-Workspace Isolation
description: Same auth_user_id may exist as operador in N workspaces; isolation rules and DB blindage
type: constraint
---

## Modelo
- `operadores` mantém **1 linha por (workspace_id, auth_user_id)**. UNIQUE índice `operadores_workspace_auth_user_unique` garante isso.
- `operador.id` é local ao workspace. NUNCA reusar `operador_id` entre workspaces.
- `auth_user_id` é apenas a identidade da pessoa; cada workspace tem seu próprio `operador_id`.

## Blindagem de banco (trigger `enforce_operador_workspace_match`)
Tabelas protegidas: `despesas_administrativas`, `pagamentos_operador`, `cash_ledger`, `operador_projetos`, `pagamentos_propostos`. Qualquer INSERT/UPDATE com `operador_id.workspace_id ≠ row.workspace_id` é bloqueado.

Toda nova tabela com `operador_id` + `workspace_id` deve receber o mesmo trigger.

## Frontend
- Todo SELECT em `operadores` por `auth_user_id` DEVE incluir `.eq("workspace_id", workspaceId)`. Sem isso, `.single()` quebra para usuários presentes em múltiplos workspaces.
- Auto-provisionamento: usar RPC `ensure_operador_for_user(_auth_user_id, _workspace_id, _fallback_nome)` em vez de inserts manuais.
- Fallback de nome em inserts: `display_name → email → "Operador"` (nunca literal puro como primeiro fallback).