# Memory: finance/project-financial-scope-isolation
Updated: 2026-03-16

## Isolamento Financeiro entre Projetos

KPIs e métricas de lucro nos dashboards de projeto são obrigatoriamente filtrados pelo `projeto_id_snapshot` no `cash_ledger`.

### Transações Virtuais (SAQUE_VIRTUAL / DEPOSITO_VIRTUAL)

Para garantir resultado fidedigno quando uma bookmaker é transferida entre projetos:

1. **Ao desvincular** (Projeto A): Gera `SAQUE_VIRTUAL` com saldo efetivo (saldo_atual - saques_pendentes + depositos_pendentes), atribuído ao `projeto_id_snapshot = Projeto A`.
2. **Ao vincular** (Projeto B): Gera `DEPOSITO_VIRTUAL` com o `saldo_atual` da bookmaker, atribuído ao `projeto_id_snapshot = Projeto B`.

### Regra de Baseline (CORRIGIDO v3 - 2026-03-16)

**DEPOSITO_VIRTUAL é a ÚNICA fonte de baseline para o projeto.**

- ❌ **Adoção de órfãos REMOVIDA** dos triggers. Depósitos anteriores à vinculação NÃO são atribuídos ao projeto.
- ✅ `DEPOSITO_VIRTUAL = saldo_atual` (simples, sem cálculos de net flow).
- ✅ `data_transacao = CURRENT_DATE` (data da vinculação, não data do depósito original).
- Isso garante que o projeto reconhece a **data de vínculo** como marco financeiro, não a data de depósitos passados.

### Proteções contra Edge Cases

#### Idempotência
- Verificação de DV existente nos últimos 30 segundos antes de criar novo.

#### Race Condition
- `hasRecentVirtualTransaction()` verifica duplicatas por clique duplo ou operações simultâneas.

#### Atomicidade (CORRIGIDO - 2026-03-06)
- SAQUE_VIRTUAL é criado ANTES de desvincular. Se falhar, desvinculação é abortada.

### Serviço Centralizado

`src/lib/projetoTransitionService.ts` encapsula toda a lógica:
- `preCheckUnlink()` — verifica pendências, calcula saldo efetivo, gera warnings (inclui freebet)
- `executeUnlink()` — idempotência + trava snapshots + SAQUE_VIRTUAL + desvincula + histórico (nesta ordem)
- `executeLink()` — idempotência + DEPOSITO_VIRTUAL (obrigatório, sem exceções)
