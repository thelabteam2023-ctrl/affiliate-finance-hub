# Memory: architecture/double-count-fix-v10-1
Updated: 2026-03-16

## Correção Crítica: Dupla Contagem de Stakes em saldo_disponivel

### Problema Identificado
O sistema estava **contando stakes duas vezes**, reduzindo artificialmente o saldo disponível:
1. Via `financial_events STAKE` → trigger debita `saldo_atual`
2. Via `get_bookmaker_saldos` → subtrai `saldo_em_aposta` de apostas PENDENTES

Exemplo SUPABET: saldo real = $133, sistema mostrava $51 (133 - 82 = 51).

### Causa Raiz
- `criar_surebet_atomica` cria eventos STAKE que debitam `saldo_atual` via trigger
- `get_bookmaker_saldos` também subtraía apostas PENDENTES do saldo
- Resultado: stake debitada 2×

### Correção Aplicada (v10.1)
1. **`get_bookmaker_saldos`**: Agora exclui do cálculo de `saldo_disponivel` apostas que JÁ possuem eventos STAKE em `financial_events`. O `saldo_em_aposta` continua retornado para exibição informativa.
2. **`criar_aposta_atomica`**: Validação agora usa `saldo_atual` diretamente sem subtrair apostas pendentes.

### Regra de Ouro
- `saldo_atual` JÁ reflete todas as stakes debitadas via eventos financeiros
- `saldo_disponivel` só deve subtrair stakes de apostas que NÃO geraram eventos STAKE
- `saldo_em_aposta` é apenas informativo — NÃO subtrair de apostas já debitadas
