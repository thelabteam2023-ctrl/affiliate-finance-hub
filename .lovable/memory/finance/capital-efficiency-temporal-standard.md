# Memory: finance/capital-efficiency-temporal-standard
Updated: 2026-03-09

## Problema Resolvido

A métrica "Eficiência do Capital (ROI)" comparava lucro filtrado por período com capital atual (não filtrado), gerando distorção analítica.

## Arquitetura Implementada

### Tabela `capital_snapshots`
Armazena snapshots diários do capital em bookmakers por workspace:
- `capital_bookmakers_brl`, `_usd`, `_eur`
- `capital_bookmakers_total_brl` (consolidado com cotação do dia)
- `volume_apostado_periodo` (volume de stakes liquidadas no dia)
- `cotacao_usd`, `cotacao_eur` (câmbio usado na consolidação)

### Edge Function `snapshot-capital-diario`
Executada diariamente às 23h (São Paulo) via pg_cron. Para cada workspace ativo:
1. Busca saldos de bookmakers ativos
2. Busca cotação via `get-exchange-rates`
3. Upsert idempotente (unique workspace_id + snapshot_date)

### Hook `useCapitalMedioPeriodo`
Calcula capital médio do período usando snapshots:
- `capitalMedio = média(capital_bookmakers_total_brl)` dos dias no intervalo
- Fallback para capital atual quando não há snapshots
- Retorna `volumeApostado` para cálculo de Yield/Turnover

### Fórmulas no Card
```
ROI = Lucro Operacional / Capital Médio do Período
Yield = Lucro / Volume Apostado
Turnover = Volume Apostado / Capital Médio
ROI = Yield × Turnover
```

### Fallback
Enquanto não há snapshots suficientes, o card usa capital atual e exibe aviso visual (⚠️ "Usando capital atual").
