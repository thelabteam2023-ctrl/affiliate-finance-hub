# Snapshot de Cripto no Resumo do Histórico — Auditoria + Ajuste

## Status atual (já existe snapshot)

O `cash_ledger` **já persiste o snapshot** no momento da movimentação:

| Coluna | Função |
|---|---|
| `coin` | ativo nativo (BTC, ETH, USDT…) |
| `qtd_coin` | quantidade nativa |
| `valor_usd` | **valor congelado em USD na hora da transação** |
| `valor_usd_referencia` | mesmo valor (usado por relatórios) |
| `cotacao_origem_usd` | preço USD/coin no momento (snapshot) |
| `cotacao_snapshot_at` | timestamp do snapshot |

Amostra confirma: aportes em BTC, USDT, USDC já gravam `valor_usd` ≠ recalculado por cotação live. **O snapshot está garantido em backend.**

## Problema na implementação que acabei de fazer

`getValorEfetivo` / `getMoedaEfetiva` (em `useMultiCurrencyFormat.ts`) já entregam, para CRYPTO:
- `valor = valor_usd` (snapshot)
- `moeda = "USD"` (ou `moeda_destino` em cross-currency)

Consequência: o bucket "Cripto (em USD)" que adicionei **fica vazio** — cripto cai no bucket Fiat já convertida via snapshot. Pior: para o pouco que cairia no bucket Cripto, eu chamava `getCryptoUSDValue(moeda, total)` com **preço live**, o que faria o aporte flutuar — exatamente o que você quer evitar.

Ou seja: o snapshot existe, mas o resumo ainda não respeita a separação Fiat vs Cripto que você pediu, e parte do código usaria preço live em vez do snapshot.

## Ajuste proposto (frontend apenas)

Reescrever `metricas` em `src/components/caixa/HistoricoMovimentacoes.tsx` para **classificar pela transação original**, não pela moeda efetiva:

1. **Classificação**: `t.tipo_moeda === "CRYPTO"` → bucket Cripto. Caso contrário → bucket Fiat.
2. **Bucket Cripto (em USD, snapshot)**:
   - Soma usa **sempre** `valor_usd ?? valor_usd_referencia ?? 0` (snapshot do ledger).
   - Detalhamento por `coin` (BTC, ETH, USDT…) com:
     - quantidade nativa (`qtd_coin` ou `valor` quando `coin` confere)
     - equivalente em USD via snapshot (`valor_usd`)
     - `cotacao_snapshot_at` no tooltip (para auditoria)
   - **Nunca** chamar `getCryptoUSDValue` (live) no cálculo do total — apenas como fallback informativo quando uma linha legada não tenha `valor_usd` (e marcada com `~` "valor estimado, sem snapshot").
3. **Bucket Fiat**:
   - Agrega por `moeda` real da transação (BRL, USD, EUR…), ignorando `valor_usd` quando `tipo_moeda='FIAT'`.
   - Display: 1 moeda → nativa; múltiplas → convertidas para BRL via `convertToBRL` (cotações vivas) **apenas para visualização**.
4. **Status**: lógica de "Creditado" inalterada (status `CONFIRMADO`).
5. Remover do componente o uso de `getCryptoUSDValue` no caminho de soma.

## Política de snapshot (consolidação)

- **Cripto sempre lê o snapshot do ledger** (`valor_usd`) — aporte nunca flutua.
- Conversão live só entra na **agregação multi-fiat** (BRL+EUR+USD) que é estritamente visual.
- Tooltip "Detalhar moedas" passa a mostrar `Snapshot @ DD/MM HH:mm · cotação X` por ativo cripto, deixando explícito ao auditor que aquele USD veio do momento da transação.
- Linhas legadas sem `valor_usd` (raras) são listadas separadamente com aviso "sem snapshot — estimativa live".

## Anti-inconsistência contábil

- Zero mudança em ledger, RPC ou schema.
- Valores nativos das movimentações continuam intocados.
- Resumo passa a refletir exatamente o valor que o sistema registrou na hora do aporte, alinhado a `crypto-valuation-and-consolidation-standard` e ao padrão de `cotacao-snapshot-per-operation-standard`.

## Arquivos a editar

- `src/components/caixa/HistoricoMovimentacoes.tsx`
  - Reescrever bloco `metricas` (classificação por `tipo_moeda`, soma cripto pelo snapshot `valor_usd`).
  - Atualizar tooltip do bloco Cripto para exibir `coin`, quantidade nativa, USD do snapshot e `cotacao_snapshot_at`.
  - Manter import de `useExchangeRates` apenas para `convertToBRL` (multi-fiat). Remover `getCryptoUSDValue` do caminho de soma.

Sem migration. Sem alteração em outros componentes.

## Critérios de aceite

- Aporte de 0.0345 BTC feito quando BTC=$63.696 mantém `$ 2.196,52` no resumo mesmo que o preço de BTC mude amanhã.
- Aporte USDT/USDC continua 1:1.
- Filtro com BRL + BTC + USDT mostra Fiat (R$ X) e Cripto em USD (snapshot) lado a lado.
- Tooltip expõe `cotacao_snapshot_at` por ativo.
- Linha legada sem `valor_usd` aparece com `~` no detalhamento e não polui o total principal.
