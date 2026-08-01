---
name: Crypto Ledger Fiat Leg Display
description: Movimentações CRYPTO exibem sempre o valor na moeda operacional (perna FIAT) como valor principal, com a quantidade da coin como linha secundária
type: feature
---

A cripto é apenas o MEIO de transferência; o impacto financeiro real é o valor
na moeda operacional da casa/conta.

`getCryptoLegs` (src/hooks/useMultiCurrencyFormat.ts) é a fonte canônica:
1. Perna FIAT: `moeda_origem` > `moeda_destino` > `moeda` (primeira não-cripto),
   com `valor_origem`/`valor_destino`/`valor` correspondente.
2. Fallback (cripto → cripto): USD via snapshot `valor_usd` / `valor_usd_referencia`
   (marcado com `≈`).
3. Quantidade: `qtd_coin` > perna cujo código == `coin`.
4. Cotação: `cotacao` do ledger, fallback |fiat| / |qtd|.

`getValorEfetivo`/`getMoedaEfetiva` delegam a esse helper. PROIBIDO voltar a
tratar `moeda_destino` cripto (ETH/BTC/…) como moeda efetiva — foi a regressão
que fazia um saque de 300 EUR aparecer como "Ξ 0,18".
