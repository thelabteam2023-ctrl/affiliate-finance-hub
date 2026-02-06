# Memory: architecture/timezone-operacional-consolidado-v3
Updated: 2026-02-06

## Correção Definitiva de Timezone - Consolidação Final

### Problema Raiz Identificado
O sistema usava `toISOString()` ou comparações diretas de data local para filtrar dados do banco (UTC), causando:
1. **Bug da Meia-Noite**: Lucro só aparecia após 00:00 UTC (21:00 BRT)
2. **Divergência Mensal**: Calendário ≠ Surebet para o mesmo período
3. **Apostas Deslocadas**: Operações feitas às 22:00 BRT caíam no dia seguinte

### Solução Implementada

#### 1. Função Canônica de Conversão
```typescript
// src/utils/dateUtils.ts
export const getOperationalDateRangeForQuery = (startDate: Date, endDate: Date) => {
  // 00:00 São Paulo = 03:00 UTC do mesmo dia
  const startUTC = new Date(Date.UTC(year, month, day, 3, 0, 0, 0));
  // 23:59:59 São Paulo = 02:59:59 UTC do dia SEGUINTE
  const endUTC = new Date(Date.UTC(year, month, day + 1, 2, 59, 59, 999));
  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() };
};
```

#### 2. Agrupamento Diário
```typescript
// src/utils/dateUtils.ts
export const extractLocalDateKey = (dateString: string) => {
  // UTC → America/Sao_Paulo → YYYY-MM-DD
  const zonedDate = toZonedTime(utcDate, 'America/Sao_Paulo');
  return formatTz(zonedDate, 'yyyy-MM-dd', { timeZone: 'America/Sao_Paulo' });
};
```

### Arquivos Corrigidos

#### Hooks de Dados (Filtragem UTC)
- `src/hooks/useApostasUnificada.ts` ✅
- `src/hooks/useKpiBreakdowns.ts` ✅
- `src/hooks/useProjetoResultado.ts` ✅
- `src/hooks/useWorkspaceLucroOperacional.ts` ✅

#### Componentes de Visualização (Agrupamento)
- `src/components/projeto-detalhe/CalendarioLucros.tsx` ✅
- `src/components/projeto-detalhe/VisaoGeralCharts.tsx` ✅
- `src/components/projeto-detalhe/UnifiedStatisticsCard.tsx` ✅
- `src/components/projeto-detalhe/SurebetStatisticsCard.tsx` ✅

#### Abas de Projeto (Filtragem)
- `src/components/projeto-detalhe/ProjetoDashboardTab.tsx` ✅
- `src/components/projeto-detalhe/ProjetoSurebetTab.tsx` ✅
- `src/components/projeto-detalhe/ProjetoApostasTab.tsx` ✅
- `src/components/projeto-detalhe/ProjetoDuploGreenTab.tsx` ✅
- `src/components/projeto-detalhe/ProjetoValueBetTab.tsx` ✅

### Regras Absolutas (Proibições)

❌ **NUNCA** usar `date.toISOString()` para filtrar `data_aposta`
❌ **NUNCA** usar `DATE(data_aposta)` sem `AT TIME ZONE` em SQL
❌ **NUNCA** agrupar dados por UTC diretamente
❌ **NUNCA** esperar meia-noite para refletir lucro

✅ **SEMPRE** usar `getOperationalDateRangeForQuery()` para queries
✅ **SEMPRE** usar `extractLocalDateKey()` para agrupamento diário
✅ **SEMPRE** considerar America/Sao_Paulo como timezone operacional

### Validação SQL (Auditoria)
```sql
-- Lucro por dia operacional (CORRETO)
SELECT 
  DATE(data_aposta AT TIME ZONE 'America/Sao_Paulo') as data_operacional,
  SUM(lucro_prejuizo) as lucro
FROM apostas_unificada 
WHERE resultado IS NOT NULL
GROUP BY DATE(data_aposta AT TIME ZONE 'America/Sao_Paulo')
ORDER BY data_operacional DESC;
```

### Dependência
- `date-fns-tz` para conversão de timezone precisa
