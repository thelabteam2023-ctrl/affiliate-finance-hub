# Memory: ux/filtros-dashboard-padrao-unificado
Updated: 2026-02-06

## Padrão Oficial de Filtros de Dashboard (Unificado)

O sistema adota **exclusivamente** os seguintes filtros de período para **TODOS** os dashboards:

### Regra-Mãe (INEGOCIÁVEL)

> **TODO DASHBOARD DO SISTEMA DEVE COMPARTILHAR O MESMO MODELO DE FILTRO TEMPORAL**

### Filtros Disponíveis

| Filtro | Valor | Definição Exata |
|--------|-------|-----------------|
| **Mês** | `mes` | `01 do mês corrente até hoje` (timezone operacional) |
| **3M** | `3m` | `Últimos 3 meses fechados + mês corrente` |
| **6M** | `6m` | `Últimos 6 meses fechados + mês corrente` |
| **Ano** | `ano` | `01/01 do ano corrente até hoje` |
| **Tudo** | `tudo` | `Todo o histórico disponível` |

### O que foi REMOVIDO

- ❌ Seleção manual de datas (DatePicker)
- ❌ Inputs de calendário
- ❌ Campos "Data início / Data fim"
- ❌ Período customizado no Dashboard Financeiro
- ❌ Filtros antigos: `7dias`, `30dias`

### Tipo TypeScript

```typescript
export type DashboardPeriodFilter = "mes" | "3m" | "6m" | "ano" | "tudo";
```

### Arquivos de Implementação

- `src/types/dashboardFilters.ts` - Tipos e funções de cálculo de período
- `src/components/shared/DashboardPeriodFilterBar.tsx` - Componente unificado de UI
- `src/components/projetos/PeriodoSelector.tsx` - Wrapper para projetos (usa o componente unificado)
- `src/pages/Financeiro.tsx` - Dashboard Financeiro (usa o componente unificado)

### Timezone

> **TODAS AS DATAS RESPEITAM TIMEZONE OPERACIONAL (America/Sao_Paulo)**

### Justificativas da Padronização

1. **UX Consistente**: Usuário aprende um modelo e aplica em todo o sistema
2. **Menos Erro Humano**: Sem datas manuais = sem erros de digitação
3. **Código Reutilizável**: Um componente, múltiplos usos
4. **Previsibilidade Financeira**: Períodos sempre contábeis e fechados
5. **Manutenção Simplificada**: Alteração em um lugar afeta todos os dashboards

### Default

O período padrão para todos os dashboards é **`mes`** (Mês atual).
