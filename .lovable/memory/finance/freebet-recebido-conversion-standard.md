---
name: freebet-recebido-conversion-standard
description: KPI "Recebido" e "valor_total_recebido" das freebets devem somar valores convertidos via convertToConsolidation(fb.valor, fb.moeda); fb.moeda vem do join bookmakers.moeda no fetch de freebets_recebidas
type: finance
---

# Conversão consolidada de Freebets

## Regra
Toda agregação de valor recebido em freebets (`ProjetoFreebetsTab`: `metricas.totalRecebido`, `statsPorCasa.valor_total_recebido`, e qualquer derivado como `taxa_extracao`) DEVE somar `convertToConsolidation(fb.valor, fb.moeda)` — não `fb.valor` puro.

Sem conversão, freebets em MXN/USD/EUR são somadas como se fossem BRL e inflam KPIs.

## Implementação
1. `FreebetRecebida` tem campo `moeda: string` (ver `freebets/types.ts`).
2. `fetchFreebets` em `ProjetoFreebetsTab.tsx` joinIA `bookmakers.moeda` e popula `fb.moeda`.
3. Componente usa `useProjetoCurrency(projetoId).convertToConsolidation` (Cotação de Trabalho).
4. `convertToConsolidation` é dependency dos `useMemo` que agregam.

## Memórias relacionadas
- `finance/promotional-modules-conversion-standard` — padrão geral de módulos promocionais.
- `architecture/multi-currency-and-exchange-rate-system` — motor multimoeda.
