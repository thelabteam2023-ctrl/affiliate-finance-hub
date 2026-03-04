# Memory: architecture/centralized-financial-metrics-service
Updated: 2026-03-04

## Serviço Canônico de Métricas: `src/services/calcularMetricasPeriodo.ts`

Este é a **FONTE ÚNICA DE VERDADE** para cálculos financeiros por período (ciclos, meses, custom).

### Fórmula:
```
LUCRO_BRUTO = LUCRO_APOSTAS + CASHBACK + GIROS_GRATIS
LUCRO_LIQUIDO = LUCRO_BRUTO - PERDAS_CONFIRMADAS
```

### Hierarquia de campos consolidados:
- Lucro: `pl_consolidado ?? lucro_prejuizo_brl_referencia ?? lucro_prejuizo`
- Volume: `stake_consolidado ?? stake/stake_total`

### Consumidores atuais:
- `ProjetoCiclosTab.tsx` — métricas do ciclo ativo ✅
- `ComparativoCiclosTab.tsx` — tabela comparativa de ciclos ✅
- `useCicloAlertas.ts` — alertas de ciclo ✅

### Regra Absoluta:
**PROIBIDO** reimplementar a lógica de cálculo de lucro/volume/ROI manualmente em qualquer componente. Todo novo consumidor DEVE usar `calcularMetricasPeriodo()`.

### Próximos candidatos à migração:
- `ProjetoDashboardTab.tsx` (calendário)
- `GestaoProjetos.tsx` (listagem de projetos)
- `useProjetoResultado.ts` (pode delegar para este serviço)
