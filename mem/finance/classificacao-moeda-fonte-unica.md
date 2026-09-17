---
name: Classificação FIAT x CRYPTO — fonte única
description: Proibição de listas fixas de moedas em fluxos financeiros; classificação vem de CURRENCY_TYPES
type: constraint
---

PROIBIDO escrever listas fixas de moedas (`FIAT_SET`, `CRYPTO_SET`, arrays inline) para decidir
comportamento financeiro. A classificação canônica vive em `src/types/currency.ts`:

- `getCurrencyKind(moeda)` → "FIAT" | "CRYPTO"
- `isFiatCurrency(moeda)` — moeda desconhecida cai em FIAT (exige cotação explícita)
- `isUsdEquivalent(moeda)` — apenas USD, USDT, USDC
- `violatesSnapshotUmParaUm({...})` — espelho client-side da trava
  `cash_ledger.chk_snapshot_1_para_1_nao_stable`

**Why:** em 17/09/2026 o saque cripto de 2.000 MYR (12BET → wallet USDC) foi recusado pelo banco.
`CaixaTransacaoDialog` tinha `FIAT_SET` escrito à mão sem MYR; a moeda caía no caminho cripto puro,
gravando `cotacao_origem_usd = 1` e `valor_usd_referencia = 2000` em vez de ~US$ 488,83.
A trava do banco agiu corretamente e nenhum dado foi corrompido.

**How to apply:** antes de gravar em `cash_ledger`, rodar `violatesSnapshotUmParaUm`; se verdadeiro,
bloquear na tela com "Cotação indisponível para <MOEDA>". O erro `chk_snapshot_1_para_1_nao_stable`
vindo do banco deve ser traduzido para português no handler. Listas que são apenas opções de
formulário devem ser alinhadas ao conjunto suportado (BRL, USD, EUR, GBP, MYR, MXN, ARS, COP).
