# Memory: ux/filtros-data-padrao-contabil-oficial
Updated: 2026-02-05

## Padrão Oficial de Filtros de Data (Contábil)

O sistema adota **exclusivamente** os seguintes filtros de período para todas as abas e módulos:

### Filtros Disponíveis

| Filtro | Valor | Definição Exata |
|--------|-------|-----------------|
| **1 dia** | `1dia` | `data_operacional = hoje` (timezone operacional) |
| **7 dias** | `7dias` | `hoje - 6 dias até hoje` (7 dias incluindo hoje) |
| **Mês atual** | `mes_atual` | `primeiro dia do mês atual até hoje` |
| **Mês anterior** | `mes_anterior` | `primeiro dia do mês anterior até último dia do mês anterior` |
| **Período** | `custom` | `data_inicio selecionada até data_fim selecionada` |

### Filtros Removidos

- ❌ `30dias` - Removido por não representar conceito contábil claro
- ❌ `ano` - Removido para simplificação

### Tipo TypeScript

```typescript
export type StandardPeriodFilter = "1dia" | "7dias" | "mes_atual" | "mes_anterior" | "custom";
```

### Função de Conversão

```typescript
export function getDateRangeFromPeriod(
  period: StandardPeriodFilter,
  customRange?: DateRange
): DateRangeResult | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (period) {
    case "1dia":
      return { start: today, end: endOfDay(now) };
    
    case "7dias":
      return { start: subDays(today, 6), end: endOfDay(now) };
    
    case "mes_atual":
      return { start: startOfMonth(now), end: endOfDay(now) };
    
    case "mes_anterior":
      const prevMonth = subMonths(now, 1);
      return { 
        start: startOfMonth(prevMonth), 
        end: endOfDay(endOfMonth(prevMonth)) 
      };
    
    case "custom":
      if (customRange?.from) {
        return {
          start: startOfDay(customRange.from),
          end: endOfDay(customRange.to || customRange.from),
        };
      }
      return null;
    
    default:
      return null;
  }
}
```

### Regra-Mãe

> **TODAS AS DATAS RESPEITAM TIMEZONE OPERACIONAL (America/Sao_Paulo)**

### Arquivos Afetados

- `src/hooks/useTabFilters.ts` - Hook principal de filtros por aba
- `src/components/projeto-detalhe/StandardTimeFilter.tsx` - Componente de filtro
- `src/components/projeto-detalhe/TabFiltersBar.tsx` - Barra de filtros por aba
- `src/components/projeto-detalhe/OperationalFiltersBar.tsx` - Barra operacional
- `src/contexts/OperationalFiltersContext.tsx` - Contexto operacional

### Default

O período padrão para todas as abas é **`mes_atual`** (Mês atual), garantindo visão contábil consistente.
