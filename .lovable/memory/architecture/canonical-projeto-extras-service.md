# Memory: architecture/canonical-projeto-extras-service
Updated: 2026-03-08

## Serviço Canônico de Extras: `src/services/fetchProjetoExtras.ts`

**FONTE ÚNICA DE VERDADE** para todos os eventos que contribuem ao lucro operacional ALÉM das apostas liquidadas.

### Fórmula Canônica:
```
LUCRO_OPERACIONAL = 
  Σ apostas_liquidadas (P&L consolidado)
  + Σ cashback
  + Σ giros_gratis (valor_retorno)
  + Σ bônus_creditados (EXCETO FREEBET)
  + Σ eventos_promocionais
  - Σ perdas_cancelamento_bonus
  + Σ ajustes_pos_limitacao
  + Σ ajustes_saldo
  + Σ resultado_cambial
  + Σ conciliações
  - Σ perdas_operacionais
```

### Regra FREEBET (CRÍTICA):
Bônus do tipo FREEBET são **EXCLUÍDOS** de todos os cálculos de lucro.
O lucro SNR (Stake Not Returned) já está contabilizado no P&L da aposta.
Incluir `bonus_amount` geraria dupla contagem.

### Consumidores:
- `ProjetoDashboardTab.tsx` — gráfico Evolução do Lucro + calendário ✅
- `useKpiBreakdowns.ts` — KPI cards (aplica filtro FREEBET alinhado) ✅
- `VisaoGeralCharts.tsx` — consome via `ExtraLucroEntry` (re-export de `ProjetoExtraEntry`) ✅

### Regra Absoluta:
**PROIBIDO** criar nova lógica de fetching de extras em qualquer componente.
Todo novo consumidor DEVE importar de `fetchProjetoExtras`.
