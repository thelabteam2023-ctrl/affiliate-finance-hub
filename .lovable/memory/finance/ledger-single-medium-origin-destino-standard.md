---
name: Ledger Single Medium (Origem/Destino)
description: Cada ponta de um lançamento do cash_ledger tem UM único meio — conta bancária (FIAT) ou wallet (CRYPTO) — nunca ambos
type: feature
---

Uma ponta (origem/destino) do `cash_ledger` NUNCA pode referenciar
`*_conta_bancaria_id` e `*_wallet_id` ao mesmo tempo. O trigger
`trg_cash_ledger_enforce_single_medium` remove o meio incompatível:
`tipo_moeda = 'CRYPTO'` → mantém wallet; FIAT → mantém conta bancária.

Escrita (`CaixaTransacaoDialog`): ao amarrar o Caixa Operacional como origem ou
destino, gravar `caixaContaId` apenas quando `tipoMoeda !== 'CRYPTO'` e
`caixaWalletId` apenas quando `tipoMoeda === 'CRYPTO'`.

Leitura (`getCaixaInfo` em `src/pages/Caixa.tsx`): a resolução recebe
`isCryptoTx(tx)` (`tipo_moeda === 'CRYPTO' || !!coin`) e prioriza a wallet em
operações cripto. Foi a regressão que mostrava uma transferência de 750 USDT
saindo do "Itaú Unibanco" no Histórico do Caixa enquanto a Gestão de Parceiros
mostrava corretamente a Trust Wallet.
