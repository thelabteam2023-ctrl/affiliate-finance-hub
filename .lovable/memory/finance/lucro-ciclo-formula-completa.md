# Memory: finance/lucro-ciclo-formula-completa
Updated: 2026-02-06

## Fórmula Canônica do Lucro do Ciclo

O **Lucro Real do Ciclo** deve incluir TODAS as fontes de receita que geraram caixa no período:

```
LUCRO_CICLO = LUCRO_APOSTAS + CASHBACK + GIROS_GRATIS - PERDAS_CONFIRMADAS
```

### Componentes:

1. **LUCRO_APOSTAS**: Soma de `lucro_prejuizo` de `apostas_unificada` onde `status = 'LIQUIDADA'`
2. **CASHBACK**: Soma de `valor` de `cashback_manual` no período (sempre >= 0)
3. **GIROS_GRATIS**: Soma de `valor_retorno` de `giros_gratis` onde `status = 'confirmado'` (sempre >= 0)
4. **PERDAS_CONFIRMADAS**: Soma de `valor` de `projeto_perdas` onde `status = 'CONFIRMADA'`

### CRÍTICO: Timezone Operacional

Todas as queries de ciclo DEVEM usar `getOperationalDateRangeForQuery()` para converter datas do ciclo para UTC:

```typescript
const dataInicioCiclo = parseISO(ciclo.data_inicio);
const dataFimCiclo = parseISO(ciclo.data_fim_prevista);
const { startUTC, endUTC } = getOperationalDateRangeForQuery(dataInicioCiclo, dataFimCiclo);

// Usar startUTC e endUTC nas queries
query.gte("data_aposta", startUTC).lte("data_aposta", endUTC)
```

**PROIBIDO**: Usar comparação direta de strings de data (ex: `.gte("data_aposta", ciclo.data_inicio)`)

### Arquivos que implementam esta fórmula:

- `src/hooks/useProjetoResultado.ts` - Hook principal de resultado do projeto ✅
- `src/hooks/useCicloAlertas.ts` - Alertas de ciclo (meta/tempo) ✅
- `src/components/projeto-detalhe/ProjetoCiclosTab.tsx` - Métricas de ciclos ativos ✅
- `src/components/projeto-detalhe/ComparativoCiclosTab.tsx` - Comparativo entre ciclos ✅

### Regra de Negócio (Inviolável)

> **Se uma entrada financeira impacta o saldo operável e não é passivo, é lucro real.**

Cashback recebido, por exemplo, é dinheiro que entrou na operação e deve obrigatoriamente ser contabilizado no lucro do ciclo, garantindo consistência entre:
- Calendário de Lucros
- Visão Geral
- Aba Surebet/Apostas
- KPIs do Ciclo
