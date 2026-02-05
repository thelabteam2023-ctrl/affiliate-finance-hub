# Memory: architecture/calendario-timezone-fix-v2-saopaulo
Updated: 2026-02-05

## Correção Definitiva do Calendário (Timezone Operacional)

### Problema Raiz
O calendário exibia resultados diários incorretos porque o sistema estava agrupando datas usando UTC em vez do timezone operacional (America/Sao_Paulo). Timestamps como `2026-01-13T02:00:00+00` (02:00 UTC) correspondem a `2026-01-12T23:00:00` em São Paulo, mas eram incorretamente agrupados em 13/01.

### Solução Implementada

1. **Timezone Operacional Definido**: `America/Sao_Paulo` é o timezone canônico para agrupamento diário.

2. **Função `extractLocalDateKey` Corrigida**: 
   - Agora converte UTC → America/Sao_Paulo ANTES de extrair a data
   - Usa `date-fns-tz` para conversão precisa
   - Garante que apostas feitas às 23:00 BRT sejam agrupadas no dia correto

3. **Fluxo Correto**:
   ```
   timestamp_utc (DB) → toZonedTime(America/Sao_Paulo) → formatTz('yyyy-MM-dd') → agrupamento
   ```

4. **Validação SQL** (para auditoria):
   ```sql
   SELECT 
     DATE(data_aposta AT TIME ZONE 'America/Sao_Paulo') as data_operacional,
     SUM(lucro_prejuizo) as lucro
   FROM apostas_unificada 
   WHERE resultado IS NOT NULL
   GROUP BY DATE(data_aposta AT TIME ZONE 'America/Sao_Paulo')
   ```

### Arquivos Modificados
- `src/utils/dateUtils.ts`: Função `extractLocalDateKey` com conversão timezone
- `src/lib/dateUtils.ts`: Função `parseLocalDate` com suporte a timezone
- Dependência adicionada: `date-fns-tz`

### Proibições
- ❌ Nunca agrupar por UTC
- ❌ Nunca misturar timezones no mesmo cálculo
- ❌ Nunca compensar timezone com hacks visuais
- ❌ Nunca usar `DATE(data_aposta)` sem `AT TIME ZONE`

### Componentes Impactados
- CalendarioLucros.tsx
- VisaoGeralCharts.tsx
- UnifiedStatisticsCard.tsx
- SurebetStatisticsCard.tsx
- Qualquer componente que use `extractLocalDateKey`
