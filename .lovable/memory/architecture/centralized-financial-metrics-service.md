# Memory: architecture/centralized-financial-metrics-service
Updated: 2026-03-04

## Serviço Canônico de Métricas: `src/services/calcularMetricasPeriodo.ts`

Este é a **FONTE ÚNICA DE VERDADE** para cálculos financeiros por período (ciclos, meses, custom).

### Fórmula:
```
LUCRO_BRUTO = LUCRO_APOSTAS + CASHBACK + GIROS_GRATIS
LUCRO_LIQUIDO = LUCRO_BRUTO - PERDAS_CONFIRMADAS
```

### Conversão Multimoeda (CRÍTICO):
O serviço aceita `convertToConsolidation` e `moedaConsolidacao` para conversão correta em projetos multimoedas.
- Se `pl_consolidado` existe e `consolidation_currency === moedaConsolidacao`, usa o valor consolidado
- Caso contrário, aplica `convertToConsolidation(lucro_prejuizo, moeda_operacao)` para converter
- Mesma lógica para volume (stake_consolidado → fallback com conversão)
- **SEM a função de conversão**, valores não-consolidados são usados nominalmente (POSSÍVEL DIVERGÊNCIA)

### Consumidores atuais:
- `ProjetoCiclosTab.tsx` — métricas do ciclo ativo ✅ (recebe convertToConsolidation via props)
- `ComparativoCiclosTab.tsx` — tabela comparativa de ciclos ✅ (recebe convertToConsolidation via props)
- `useCicloAlertas.ts` — alertas de ciclo ✅ (sem conversão, alertas são indicativos)

### Regra Absoluta:
**PROIBIDO** reimplementar a lógica de cálculo de lucro/volume/ROI manualmente em qualquer componente. Todo novo consumidor DEVE usar `calcularMetricasPeriodo()` e passar `convertToConsolidation` quando disponível.

### Próximos candidatos à migração:
- `ProjetoDashboardTab.tsx` (calendário)
- `GestaoProjetos.tsx` (listagem de projetos)
- `useProjetoResultado.ts` (pode delegar para este serviço)
