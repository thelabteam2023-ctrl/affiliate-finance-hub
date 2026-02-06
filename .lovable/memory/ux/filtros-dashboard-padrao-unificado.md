# Memory: ux/filtros-dashboard-padrao-unificado
Updated: 2026-02-06

## Padrão Oficial de Filtros de Dashboard (Unificado)

O sistema adota **exclusivamente** os seguintes filtros de período para **TODOS** os dashboards:

### Regra-Mãe (INEGOCIÁVEL)

> **TODO DASHBOARD DO SISTEMA DEVE COMPARTILHAR O MESMO MODELO DE FILTRO TEMPORAL**

### Filtros Disponíveis

| Filtro | Valor | Definição Exata |
|--------|-------|-----------------|
| **Anterior** | `anterior` | `Mês anterior completo (01 até último dia)` |
| **Atual** | `mes` | `01 do mês corrente até hoje` (timezone operacional) |
| **Ano** | `ano` | `01/01 do ano corrente até hoje` |
| **Tudo** | `tudo` | `Todo o histórico disponível` |
| **Período** | `custom` | `Seleção manual via calendário` |

### Tipo TypeScript

```typescript
export type DashboardPeriodFilter = "anterior" | "mes" | "ano" | "tudo" | "custom";
```

### Arquivos de Implementação

- `src/types/dashboardFilters.ts` - Tipos e funções de cálculo de período
- `src/components/shared/DashboardPeriodFilterBar.tsx` - Componente unificado de UI
- `src/components/projetos/PeriodoSelector.tsx` - Wrapper para projetos (usa o componente unificado)
- `src/pages/Financeiro.tsx` - Dashboard Financeiro (usa o componente unificado)

### Timezone

> **TODAS AS DATAS RESPEITAM TIMEZONE OPERACIONAL (America/Sao_Paulo)**

### Default

O período padrão para todos os dashboards é **`mes`** (Mês atual).
