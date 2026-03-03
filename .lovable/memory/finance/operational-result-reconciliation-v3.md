# Memory: finance/operational-result-reconciliation-v3
Updated: 2026-03-03

## Resultado Financeiro Real (Métrica Principal)

A gestão de parceiros agora usa **Resultado Financeiro Real** como métrica principal na tabela "Desempenho por Casa":

```
RESULTADO_FINANCEIRO_REAL = Saques Confirmados + Saldo Atual - Depósitos Confirmados
```

- **Depósitos**: `cash_ledger.tipo_transacao = 'DEPOSITO' AND status = 'CONFIRMADO'`
- **Saques**: `cash_ledger.tipo_transacao = 'SAQUE' AND status = 'CONFIRMADO'`
- **Saldo Atual**: `bookmakers.saldo_atual`

### Regras
- Bônus **NÃO** entra como depósito
- Cashback promocional **NÃO** entra como depósito
- Saldo atual é considerado integralmente como ativo

### View SQL
`v_bookmaker_resultado_financeiro` é a fonte da verdade para esta métrica.

## Performance Operacional (Métrica Secundária)

Mantida no tooltip como informação complementar via `v_bookmaker_resultado_operacional`:

```
RESULTADO_OPERACIONAL = Apostas + Giros Grátis + Cashback + Bônus Líquido
```

O campo `resultado_operacional` está disponível em `BookmakerFinanceiro` para exibição secundária.
