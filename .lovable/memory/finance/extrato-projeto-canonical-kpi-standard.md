---
name: Extrato Projeto KPIs Canônicos
description: ExtratoProjetoTab usa fórmula canônica de origem_tipo (DV BASELINE/NULL excluídos, MIGRACAO contado), conversão obrigatória via convertToConsolidation (Cotação de Trabalho), e renomeia "Lucro Consolidado" para "Resultado de Caixa" (não é Lucro Operacional)
type: feature
---

## Regras canônicas aplicadas em ExtratoProjetoTab.tsx

### Classificação de movimento efetivo (filtro origem_tipo)

```
Depósitos = DEPOSITO real + DEPOSITO_VIRTUAL onde origem_tipo = 'MIGRACAO'
Saques    = SAQUE real    + SAQUE_VIRTUAL    onde origem_tipo = 'MIGRACAO'
EXCLUI: DEPOSITO_VIRTUAL com origem_tipo IN ('BASELINE', NULL)
```

DV antigos com `origem_tipo = NULL` (rebaselines manuais pré-classificação) são tratados FUNCIONALMENTE como BASELINE — excluídos do KPI mas exibidos no histórico. Não há retrofix em banco (política anti-retrofix do incidente-0904); a normalização vive no frontend.

### Conversão obrigatória para moeda de consolidação

- Hook `useProjetoCurrency(projetoId)` fornece `convertToConsolidation` (sempre Cotação de Trabalho).
- Cada `CurrencyMetrics.{depositos|saques|ajustes}` é convertido via `convertToConsolidation(c.valor, c.moeda)` antes de somar nos totais globais.
- `saldo_atual` das bookmakers ativas também é convertido por moeda antes de somar em `saldoCasasTotal`.
- `formatConsolidated` (do hook) renderiza com símbolo correto (USD, BRL, etc.).

### "Resultado de Caixa" (não é Lucro Operacional)

```
resultadoCaixa = saquesTotal + saldoCasasTotal + ajustesTotal − depositosTotal
```

Card renomeado de "Lucro Consolidado" → "Resultado de Caixa". O Lucro Operacional canônico vive em Visão Geral / Indicadores Financeiros via `fetchProjetosLucroCanonico`.

### Tooltip informativo de baseline excluído

Card Depósitos exibe `+N baseline(s) virtual(is) excluído(s) (valor convertido)` quando `baselineExcluidoCount > 0`.

### Sinal/direção dos extras

`AJUSTE_*`/Cashback respeitam `ajuste_direcao`: ENTRADA/CREDITO soma, SAIDA/DEBITO subtrai, NULL soma (legado).