---
name: Lucro se sacar tudo - Fórmula Canônica
description: Fórmula do indicador "Lucro se sacar tudo" NÃO soma saquesPendentes (PENDENTE não debita saldo_atual, seria contagem dupla). Ponto de equilíbrio = recuperação 100% do capital investido.
type: finance
---

## Fórmula canônica

```
patrimonio      = saldoCasas + saquesRecebidos
lucroFinanceiro = patrimonio − depositosEfetivos
```

## Por que NÃO somar `saquesPendentes`

Saques com `status='PENDENTE'` **não debitam** `saldo_atual` da bookmaker — apenas
`status='CONFIRMADO'` dispara o trigger `atualizar_saldo_bookmaker_v6`. Portanto o
dinheiro de um saque pendente **ainda está fisicamente dentro de `saldoCasas`**.
Somar `saquesPendentes` por cima causa **contagem dupla** e infla o "Lucro se
sacar tudo" pelo valor exato dos pendentes.

`saquesPendentes` continua exibido na UI como **decomposição informativa** de
`saldoCasas` ("dos X no saldo, Y já solicitados para saque"), nunca como parcela
somada ao patrimônio.

## Ponto de equilíbrio

Lucro = 0 ⇔ `saldoCasas + saquesRecebidos = depósitos` ⇔ recuperação de capital = 100%.
Isso garante paridade conceitual com o card "Recuperação de Capital".

## Locais de aplicação

- `src/components/projeto-detalhe/FinancialMetricsPopover.tsx` (patrimonio/lucroFinanceiro)
- `src/components/projeto-detalhe/ExtratoProjetoTab.tsx` (resultadoCaixa)

## Anti-double-counting adicional

Não somar `ajustesTotal` (bônus, cashback, AJUSTE_SALDO, variação cambial) — já
refletidos em `saldo_atual` via triggers do ledger.