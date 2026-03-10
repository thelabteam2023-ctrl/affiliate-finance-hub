# Memory: architecture/civil-vs-operational-date-filtering
Updated: 2026-03-10

## Padrão Dual de Filtragem Temporal

O sistema possui DOIS tipos de campos temporais com semânticas distintas que exigem funções de filtragem diferentes.

### 1. Timestamps Reais (Horário Significativo)
- **Campos**: `data_aposta`, `created_at`, `updated_at`, `data_registro`
- **Armazenamento**: Timestamp com horário real (ex: `2026-03-10T15:30:00-03:00`)
- **Filtro**: `getOperationalDateRangeForQuery()` — converte para timezone São Paulo (03:00Z → 02:59Z)
- **Justificativa**: Uma aposta feita às 23:00 BRT pertence ao dia operacional de São Paulo

### 2. Datas Civis (Meia-noite UTC)
- **Campos**: `cash_ledger.data_transacao`, `project_bookmaker_link_bonuses.credited_at`, `cash_ledger.data_confirmacao`
- **Armazenamento**: Data pura como meia-noite UTC (ex: `2026-03-10T00:00:00Z`)
- **Filtro**: `getCivilDateRangeForQuery()` — usa UTC puro (`T00:00:00.000Z` → `T23:59:59.999Z`)
- **Justificativa**: Usar offset de 3h EXCLUI registros do dia de início (00:00Z < 03:00Z)

### 3. Obter "Hoje" como Data Civil — REGRA CRÍTICA
**PROIBIDO** usar `new Date().toISOString().split('T')[0]` para obter a data de hoje.
Após 21:00 BRT (00:00 UTC), isso retorna o dia SEGUINTE.

**SEMPRE** usar:
```typescript
import { getTodayCivilDate, dateToCivilDateString } from "@/utils/dateUtils";
const hoje = getTodayCivilDate(); // "2026-03-10" (São Paulo)
const futuro = dateToCivilDateString(addMonths(new Date(), 1)); // Para Date objects
```

### Regra Absoluta
**PROIBIDO** usar `getOperationalDateRangeForQuery` ou `.toISOString()` de Date objects locais para filtrar campos de data civil. Sempre usar:
```typescript
import { getCivilDateRangeForQuery } from "@/utils/dateUtils";
const { startUTC, endUTC } = getCivilDateRangeForQuery("2026-03-10", "2026-05-05");
```

### Arquivos Padronizados ✅
- `calcularMetricasPeriodo.ts` — usa getCivilDateRangeForQuery para cash_ledger
- `FinancialMetricsPopover.tsx` — applyDateFilter com range UTC puro
- `useProjetoPerformance.ts` — format() + T00:00:00Z
- `ProjetoMovimentacoesTab.tsx` — format() + T00:00:00Z
- `InvestidorFinanceiroTab.tsx` — format() + T00:00:00Z
- `InvestidorExtratoDialog.tsx` — format() + T00:00:00Z
- `RelatorioROI.tsx` — format() + T00:00:00Z
- `Caixa.tsx` — YYYY-MM-DD + T00:00:00Z / T23:59:59.999Z
- `CaixaTransacaoDialog.tsx` — getTodayCivilDate()
- `ledgerService.ts` — getTodayCivilDate()
- `ReconciliacaoDialog.tsx` — getTodayCivilDate()
- `ConfirmarSaqueDialog.tsx` — getTodayCivilDate()
- `AjusteManualDialog.tsx` — getTodayCivilDate()
- `BrokerReceberContasDialog.tsx` — getTodayCivilDate()
- `useProjectBonuses.ts` — getTodayCivilDate()
- `useCashbackManual.ts` — getTodayCivilDate()
- `CicloDialog.tsx` — getTodayCivilDate() + dateToCivilDateString()
- `ProjectPostCreateWizard.tsx` — getTodayCivilDate() + dateToCivilDateString()
- `PagamentoOperadorDialog.tsx` — getTodayCivilDate()
- `VincularProjetoDialog.tsx` — getTodayCivilDate()
- `PropostasPagamentoCard.tsx` — getTodayCivilDate()
- `EntregaConciliacaoDialog.tsx` — getTodayCivilDate()
- `PagamentoParticipacaoDialog.tsx` — getTodayCivilDate()
- `FinanceiroTab.tsx` — getTodayCivilDate()
- `CentralOperacoes.tsx` — getTodayCivilDate()
- `ProjetoDetalhe.tsx` — getTodayCivilDate()
