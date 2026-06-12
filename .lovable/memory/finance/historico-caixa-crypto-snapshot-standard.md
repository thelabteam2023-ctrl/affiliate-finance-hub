---
name: Histórico Caixa Crypto Snapshot
description: Resumo do Histórico do Caixa Operacional soma cripto pelo snapshot valor_usd do ledger, nunca pelo preço live
type: feature
---

No cabeçalho de `HistoricoMovimentacoes` o bloco "Cripto (em USD)" agrega
SEMPRE pelo snapshot `cash_ledger.valor_usd` (fallback `valor_usd_referencia`),
não pelo preço live. Classificação Fiat vs Cripto usa `tipo_moeda === 'CRYPTO'`
(não `getMoedaEfetiva`). Linhas legadas sem `valor_usd` são marcadas com `~`
e timestamp `cotacao_snapshot_at` aparece no tooltip por coin. Conversão live
(`convertToBRL`) só entra na agregação visual multi-fiat (BRL+EUR+USD).
Proibido reintroduzir `getCryptoUSDValue` no caminho de soma.