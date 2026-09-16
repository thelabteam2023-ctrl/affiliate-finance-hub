---
name: Reconciliação do Lucro Realizado (operacional × cambial × financeiro)
description: Regras de conversão multimoeda na apresentação e decomposição do Lucro Realizado em operacional, cambial e outros resultados financeiros
type: feature
---

## Regra de ouro multimoeda

Valor já expresso na moeda de consolidação NUNCA passa por conversão intermediária
(proibido BRL → USD → BRL). `src/lib/ledger/resolveValorConsolidado.ts` é a fonte
única: 1º moeda igual → nativo; 2º `valor_usd_referencia`; 3º Cotação de Trabalho.

## Classificação de diferenças de conciliação

`src/lib/ledger/classificarDiferencaConciliacao.ts`. O ledger grava
`GANHO_CAMBIAL`/`PERDA_CAMBIAL` mesmo quando não houve troca de moeda.
Mesma moeda (USD/USDT/USDC são paritários) → `DIFERENCA_RECEBIMENTO`
(crédito/taxa de trânsito, resultado financeiro). Moedas diferentes →
`RESULTADO_CAMBIAL`. A reclassificação é só de apresentação; o ledger não é alterado.

## Decomposição do Lucro Realizado

`src/lib/ledger/reconciliacaoResultado.ts` + `useProjetoReconciliacaoResultado`:

```
Lucro Operacional (cotacao_snapshot, imune à cotação de hoje)
+ Resultado Cambial (realizado + não realizado)
+ Outros Resultados Financeiros (diferenças de recebimento)
= Lucro Realizado (fluxo: recuperado − aportado)
```

Modelo cambial adotado: **C** — marcação não realizada enquanto a posição está em
moeda estrangeira; vira realizada na proporção já sacada. Resíduo é exibido, nunca
absorvido silenciosamente.
