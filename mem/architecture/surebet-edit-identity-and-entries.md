---
name: Surebet Edit Identity & Multi-Entradas
description: Edição de surebet pendente deve preservar ids reais de perna/entrada e origem do saldo; ids exibidos podem ser sintéticos
type: feature
---

Ao editar uma surebet PENDENTE:

- O payload enviado a `editar_surebet_completa_v1` DEVE conter `id` real da perna (`apostas_pernas.id`), `fonte_saldo` real (REAL/FREEBET) e, quando houver múltiplas entradas, o array `entradas` com `id` real (`apostas_perna_entradas.id`). Sem o `id`, a perna é apagada e recriada, gerando débito duplicado de stake.
- Ids exibidos na UI podem ser sintéticos no formato `<perna_id>__entrada_<entrada_id>` (ver `ProjetoSurebetTab` + `groupPernasBySelecao`). Sempre resolver com `parseSurebetLegId` em `SurebetDialog.tsx` antes de enviar ao banco.
- Sub-entradas podem existir em dois modelos: várias linhas em `apostas_perna_entradas` da mesma perna, ou pernas irmãs com a mesma `selecao`. O serializador de edição distingue os dois casos.
- `editar_perna_surebet_v2` calcula deltas por `(bookmaker_id, tipo_uso, moeda)`, credita reversões antes de debitar e valida saldo real/freebet fail-closed.
- Regressão A–H: `supabase/tests/triggers/10_edit_surebet_multi_entradas.sql` (rollback-only).
