# Memory: finance/canonical-operational-profit-standard
Updated: 2026-04-18

A métrica 'Lucro Operacional' segue uma fórmula canônica centralizada na RPC `get_projetos_lucro_operacional`:

```
LUCRO_OPERACIONAL = 
  Apostas Liquidadas (status = LIQUIDADA, com suporte multicurrency via pernas)
  + Cashback Manual
  + Giros Grátis Confirmados
  + Bônus (exceto FREEBET)
  - Perdas Operacionais Confirmadas
  + Ajustes de Conciliação
  + Ajustes de Saldo (cash_ledger)
  + Resultado Cambial (cash_ledger)
  + Promocionais (cash_ledger)
  - Perdas de Cancelamento de Bônus
```

## Conversão server-side (a partir de 2026-04-18)

A RPC `get_projetos_lucro_operacional` agora calcula o consolidado **dentro do banco** usando a Cotação de Trabalho de cada projeto:
- Busca automática de `cotacao_trabalho`, `cotacao_trabalho_eur`, `cotacao_trabalho_gbp`, `cotacao_trabalho_myr`, `cotacao_trabalho_mxn`, `cotacao_trabalho_ars`, `cotacao_trabalho_cop` da tabela `projetos`.
- Parâmetro opcional `p_cotacoes jsonb` permite override por projeto: `{ "<projeto_id>": { "USD": 5.30, "EUR": 6.10 } }`.
- Retorna campos auxiliares: `__consolidado` (já em moeda do projeto), `__porMoeda` (com sinais), `__moedaConsolidacao`.

## Fonte Única de Verdade — UNIFICAÇÃO COMPLETA

| Consumidor | Arquivo | Status |
|---|---|---|
| Listagem de Projetos (cards) | `fetchProjetosLucroOperacionalKpi` → usa `__consolidado` server-side | ✅ Unificado |
| Visão Geral (calendário diário) | `useCanonicalCalendarDaily` (RPC daily com cotações por projeto) | ✅ Unificado |
| Dashboard Financeiro | `useWorkspaceLucroOperacional` → delega para fetchProjetosLucroOperacionalKpi | ✅ Delegado |
| Ciclos / Períodos | `calcularMetricasPeriodo.ts` | ✅ Delegado |
| KPI Projeto (Visão Geral) | `useKpiBreakdowns.ts` (v2) | ✅ Delegado |

### Paridade absoluta garantida
A conversão server-side com Cotação de Trabalho por projeto elimina divergências entre a tela de listagem (`/projetos`) e a Visão Geral interna do projeto. Não há mais conversão client-side com cotações globais do workspace para esta métrica.

## Proteções
- Paginação automática agregada em SQL (sem limite de 1000 linhas)
- Timezone operacional (São Paulo) para filtros de data
- Cotação por projeto (não global), com fallback identidade (1) se cotação ausente
- Exclusão de FREEBET para evitar dupla contagem com P&L de apostas SNR
