# Memory: finance/project-baseline-reset-marco-zero
Updated: 2026-03-07

## Marco Zero (Baseline Reset)

O sistema implementa o conceito de 'Marco Zero' para reiniciar indicadores financeiros (Lucro, ROI) de um projeto a partir de uma data específica, sem apagar o histórico.

### Arquitetura

1. **Coluna `projetos.marco_zero_at`** — timestamp que marca o início do novo período contábil
2. **RPC `executar_marco_zero`** — função atômica que:
   - Define `marco_zero_at` no projeto
   - Cria um `DEPOSITO_BASELINE` para cada bookmaker vinculada (capturando `saldo_atual` como capital inicial)
3. **Tipo `DEPOSITO_BASELINE`** — registrado no `cash_ledger` constraint, tratado como depósito nos cálculos

### Fórmula pós-Marco Zero

```
LUCRO = (Saldo Atual + Saques pós-marco) - (Baselines + Depósitos pós-marco)
ROI = LUCRO / (Baselines + Depósitos pós-marco)
```

### Arquivos que respeitam marco_zero_at

- `src/hooks/useProjetoResultado.ts` — `fetchCapitalData()` filtra por `created_at >= marco_zero_at` ✅
- `src/components/projeto-detalhe/FinancialMetricsPopover.tsx` — filtra depositos/saques/timeline ✅
- `src/components/projeto-detalhe/FinancialSummaryCompact.tsx` — filtra depositos/saques ✅

### UI

- `src/components/projeto-detalhe/MarcoZeroDialog.tsx` — Card + AlertDialog na aba Gestão
- `src/components/projeto-detalhe/ProjetoGestaoTab.tsx` — integra o MarcoZeroCard

### Regras

- Pode ser reaplicado (sobrescreve o anterior, gerando novos baselines)
- Depósitos órfãos (sem snapshot) são ignorados quando marco zero está ativo
- O histórico completo permanece no ledger para auditoria
