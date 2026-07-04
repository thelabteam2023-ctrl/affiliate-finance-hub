---
name: Capital Aportado/Recuperado Snapshot Parity
description: useProjetoRecuperacaoCapital usa snapshot congelado (valor_usd_referencia) e exclui BASELINE — paridade absoluta com Depósitos/Saques do Extrato. Nunca PTAX live.
type: constraint
---
`useProjetoRecuperacaoCapital` DEVE usar hierarquia snapshot→Trabalho e filtrar BASELINE/NULL em DEPOSITO_VIRTUAL. PROIBIDO usar `convertToConsolidationOficial` (PTAX live) — faz o Capital Aportado flutuar diariamente sem transações novas. Extrato "Depósitos" e Recuperação "Aportado" devem sempre bater.

`ExtratoProjetoTab.resultadoCaixa` inclui `saquesPendentesTotal` para paridade com `FinancialMetricsPopover.lucroFinanceiro` (Visão Geral). Bookmakers do Extrato NÃO filtram status — todas as contas com saldo entram, alinhado com Visão Geral.

**Why:** Capital aportado é fato histórico. Deve ser valorado ao câmbio do dia do aporte, não ao câmbio de hoje.