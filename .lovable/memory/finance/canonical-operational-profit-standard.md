# Memory: finance/canonical-operational-profit-standard
Updated: 2026-03-10

A métrica 'Lucro Operacional' segue uma fórmula canônica centralizada no serviço 'fetchProjetosLucroOperacionalKpi':

```
LUCRO_OPERACIONAL = 
  Apostas Liquidadas (status = LIQUIDADA, via getConsolidatedLucro)
  + Cashback Manual
  + Giros Grátis Confirmados
  + Bônus (exceto FREEBET)
  - Perdas Operacionais Confirmadas
  + Ajustes de Conciliação
  + Ajustes de Saldo (extras canônicos)
  + Resultado Cambial (extras canônicos)
```

## Fonte Única de Verdade — UNIFICAÇÃO COMPLETA

**TODOS** os consumidores de lucro operacional agora delegam para `fetchProjetosLucroOperacionalKpi`:

| Consumidor | Arquivo | Status |
|---|---|---|
| Dashboard Financeiro | `useWorkspaceLucroOperacional` | ✅ Delegado |
| Ciclos / Períodos | `calcularMetricasPeriodo.ts` | ✅ Delegado |
| **KPI Projeto (Visão Geral)** | **`useKpiBreakdowns.ts`** | **✅ Delegado (v2)** |

### Arquitetura do useKpiBreakdowns (v2)
- O **total de lucro** vem exclusivamente do `fetchProjetosLucroOperacionalKpi`
- Os módulos individuais (apostas, cashback, giros, etc.) são buscados separadamente apenas para **breakdown visual** (tooltip)
- Se houver delta entre a soma dos módulos e o total canônico, uma linha de **Reconciliação** é exibida
- O ROI usa o total canônico como numerador

### Divergência eliminada
Antes: useKpiBreakdowns tinha queries próprias com filtros divergentes (sem filtro de data em bônus/ajustes, campo `data_perda` vs `created_at`, sem conversão multimoeda em perdas).
Depois: Total vem da engine canônica, garantindo paridade exata com ciclos.

## Proteções
- Paginação automática para >1000 linhas (apostas)
- Timezone operacional (São Paulo) para filtros de data
- getConsolidatedLucro para conversão multimoeda consistente
- Exclusão de FREEBET para evitar dupla contagem com P&L de apostas SNR
