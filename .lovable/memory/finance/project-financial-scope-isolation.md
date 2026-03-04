# Memory: finance/project-financial-scope-isolation
Updated: 2026-03-04

## Isolamento Financeiro entre Projetos

KPIs e métricas de lucro nos dashboards de projeto são obrigatoriamente filtrados pelo `projeto_id_snapshot` no `cash_ledger`.

### Transações Virtuais (SAQUE_VIRTUAL / DEPOSITO_VIRTUAL)

Para garantir resultado fidedigno quando uma bookmaker é transferida entre projetos:

1. **Ao desvincular** (Projeto A): Gera `SAQUE_VIRTUAL` com saldo efetivo (saldo_atual - saques_pendentes), atribuído ao `projeto_id_snapshot = Projeto A`.
2. **Ao vincular** (Projeto B): Gera `DEPOSITO_VIRTUAL` com o `saldo_atual` da bookmaker, atribuído ao `projeto_id_snapshot = Projeto B`.

### Proteções contra Edge Cases

#### Saques Pendentes (cenário 4)
- `SAQUE_VIRTUAL = saldo_atual - saques_pendentes` → evita dupla contagem quando o saque pendente for confirmado.

#### Depósitos Pendentes (cenário 5)
- Ao desvincular, todas as transações PENDENTES recebem `projeto_id_snapshot` explícito → confirmação futura mantém atribuição correta.

#### Apostas Pendentes (cenário 3)
- Sistema emite **warnings** ao operador informando quantas apostas pendentes existem.
- Resultado de apostas liquidadas após desvinculação ficará sem projeto (limitação aceita, operador avisado).

### Serviço Centralizado

`src/lib/projetoTransitionService.ts` encapsula toda a lógica:
- `preCheckUnlink()` — verifica pendências, calcula saldo efetivo, gera warnings
- `executeUnlink()` — trava snapshots + desvincula + SAQUE_VIRTUAL + histórico
- `executeLink()` — atribui órfãs + DEPOSITO_VIRTUAL

### Frontend

Queries em `ProjetoFinancialMetricsCard` e `HistoricoVinculosTab` usam `.in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])` e `.in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])`.
