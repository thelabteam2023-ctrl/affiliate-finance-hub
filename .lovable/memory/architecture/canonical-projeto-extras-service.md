# Memory: architecture/canonical-projeto-extras-service
Updated: 2026-04-20

## Serviço Canônico de Extras: `src/services/fetchProjetoExtras.ts`

**FONTE ÚNICA DE VERDADE** para todos os eventos que contribuem ao lucro operacional ALÉM das apostas liquidadas.

### Fórmula Canônica (atualizada 2026-04-20):
```
LUCRO_OPERACIONAL = 
  Σ apostas_liquidadas (P&L consolidado)
  + Σ cashback
  + Σ giros_gratis (valor_retorno)
  + Σ bônus_creditados (EXCETO FREEBET)
  + Σ eventos_promocionais
  - Σ perdas_cancelamento_bonus
  + Σ ajustes_saldo
  + Σ conciliações
  - Σ perdas_operacionais
```

### Regra FREEBET (CRÍTICA):
Bônus do tipo FREEBET são **EXCLUÍDOS**. O lucro SNR já está no P&L da aposta.

### Regra RESULTADO CAMBIAL (CRÍTICA — 2026-04-20):
`GANHO_CAMBIAL` e `PERDA_CAMBIAL` foram **REMOVIDOS** do Lucro Operacional.
Esses eventos representam variação cambial entre o pedido e a confirmação de saque/depósito (tesouraria), NÃO resultado de aposta.
Vivem exclusivamente em:
- Indicadores Financeiros (`FinancialMetricsPopover`, `ProjetoFinancialMetricsCard`)
- Caixa Operacional (`ConciliacaoSaldos`)
- Drill-down financeiro (`FinancialDrillDownModal`)

PROIBIDO somá-los novamente no Lucro Operacional, evolução do lucro, calendário ou cards de breakdown.

### Consumidores:
- `useKpiBreakdowns.ts` — KPI cards + Evolução do Lucro + Calendário ✅ (FX excluído)
- `ProjetoDashboardTab.tsx` — gráfico Evolução do Lucro ✅
- `VisaoGeralCharts.tsx` — consome via `ExtraLucroEntry` ✅

### Regra Absoluta:
**PROIBIDO** criar nova lógica de fetching de extras em qualquer componente.
Todo novo consumidor DEVE importar de `fetchProjetoExtras`.
