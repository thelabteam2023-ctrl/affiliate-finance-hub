# Memory: finance/bonus-exclusion-from-lucro-kpi
Updated: 2026-03-06

## KPI de Lucro: Baseado em Fluxo de Caixa (v2)

O KPI principal de "Lucro" na Visão Geral usa **fluxo de caixa real**, não juice de apostas:

```
LUCRO = (Saldo nas Casas + Saques Confirmados) - Depósitos Confirmados
```

### Vantagens
- **Agnóstico à estratégia**: Captura surebet, valuebet, bônus e qualquer operação automaticamente
- **Inclui ajustes de saldo**: Qualquer ajuste manual já altera `saldo_atual`, entrando no cálculo
- **Sem dupla contagem**: Não precisa decidir o que incluir/excluir por tipo de aposta
- **Reflete realidade financeira**: Patrimônio real menos capital investido

### Detalhes técnicos
- Depósitos: `cash_ledger.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL') AND status = 'CONFIRMADO' AND projeto_id_snapshot = projetoId`
- Saques: `cash_ledger.tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL') AND status = 'CONFIRMADO' AND projeto_id_snapshot = projetoId` (usa `valor_confirmado` quando disponível)
- Saldo: Via RPC `get_bookmaker_saldos` (saldo_operavel)
- ROI: `(Lucro / Depósitos) * 100`

### Métricas operacionais (secundárias)
O `grossProfitFromBets` (juice) permanece como métrica operacional secundária, ainda excluindo apostas de bônus (`bonus_id IS NOT NULL` ou `estrategia = 'EXTRACAO_BONUS'`).
