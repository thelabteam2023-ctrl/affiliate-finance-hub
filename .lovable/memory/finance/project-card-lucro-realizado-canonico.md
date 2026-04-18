---
name: project-card-lucro-realizado-canonico
description: O Lucro Realizado do card kanban de projetos lê direto do cash_ledger com mesmos filtros do FinancialMetricsCard (status=CONFIRMADO, projeto_id_snapshot)
type: feature
---

# Memory: finance/project-card-lucro-realizado-canonico

## Fonte Única do Lucro Realizado nos Cards de Projeto

O campo `lucro_realizado` exibido no card kanban de cada projeto (em `GestaoProjetos.tsx`) vem de `fetchProjetosLucroCanonico().lucroRealizado`, que lê **DIRETO** do `cash_ledger` com EXATAMENTE os mesmos filtros do `ProjetoFinancialMetricsCard.tsx`:

```sql
status = 'CONFIRMADO'
projeto_id_snapshot = <projeto>
tipo_transacao IN ('DEPOSITO','DEPOSITO_VIRTUAL') -- depósitos
tipo_transacao IN ('SAQUE','SAQUE_VIRTUAL')      -- saques (usa valor_confirmado ?? valor)
```

Fórmula: `LUCRO_REALIZADO = Σ(saques) - Σ(depositos)`, todos convertidos com `convertOficial` (mesma cross-rate via USD pivot do `useProjetoCurrency.convertToConsolidationOficial`).

## Histórico
- **2026-04-18 (v1)**: Antes, `GestaoProjetos.tsx` calculava localmente via cotação live do `useCotacoes`, gerando drift.
- **2026-04-18 (v2)**: O serviço lia do RPC `get_projeto_dashboard_data` (sem filtro de status), divergindo do `FinancialMetricsCard` que filtra `status=CONFIRMADO`. Corrigido para ler direto do `cash_ledger` com os mesmos filtros, garantindo paridade absoluta de centavos.

## Arquivos
- `src/services/fetchProjetosLucroCanonico.ts` — query no `cash_ledger` em batch para todos os projetos
- `src/pages/GestaoProjetos.tsx` — consome direto, sem refazer a conta
- `src/components/projeto-detalhe/ProjetoFinancialMetricsCard.tsx` — fonte de referência (`fluxoLiquidoAjustado`)
