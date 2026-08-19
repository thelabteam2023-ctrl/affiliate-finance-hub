# Swap Interno agrupado em uma linha no Histórico do Caixa

## Objetivo
Hoje cada swap aparece como duas linhas (SWAP_OUT e SWAP_IN). Passarão a aparecer como **um único registro expansível**, mostrando o swap como uma operação só, com as duas pernas detalhadas ao expandir.

## Como ficará

Linha colapsada (uma por swap):

```text
[icone swap]  Swap Interno                                   -0,00 USDT →
              Tiago • Carteira Binance (USDT)  →  Tiago • Ledger (SOL)     R$ 1.234,56
              10.000 USDT  →  52,3 SOL                              19/08/2026  [v]
```

Ao clicar em [v], expande mostrando as duas pernas originais com o detalhe atual (proprietário, carteira, endereço com botão de copiar, rede, valor, cotação, id, status).

Regras:
- Se o swap estiver revertido, a linha agrupada aparece com status "Revertida" (as duas pernas sempre estão no mesmo estado, por serem atômicas).
- Ações (reverter, ver detalhes) ficam na linha agrupada e atuam sobre a operação inteira.
- Swaps legados sem par carregado na página continuam exibidos como linha única normal (fallback seguro).
- Filtros, busca, métricas e exportação continuam operando sobre as transações individuais; só a renderização é agrupada, evitando qualquer mudança de valores/KPIs.

## Detalhes técnicos

- `src/components/caixa/HistoricoMovimentacoes.tsx`
  - Novo passo de agrupamento aplicado **após** filtros/busca e **antes** da paginação: reduzir `transacoesComBusca` em "itens de exibição", agrupando por `swap_operation_id` (fallback: `referencia_transacao_id` para swaps antigos). Cada grupo vira `{ kind: 'swap-group', id, out, in, transacoes: [...] }`; demais transações viram `{ kind: 'single', tx }`.
  - `usePagination` passa a receber a lista agrupada (paginação conta o swap como 1 item).
  - No `map` de renderização, tratar os dois `kind`: `single` mantém o markup atual; `swap-group` renderiza o resumo (origem da perna OUT → destino da perna IN, quantidade/coin de cada lado, valor consolidado, data) com estado local de expansão (`Set<string>` de ids abertos) e chevron.
  - Ao expandir, renderizar as duas pernas reutilizando o mesmo bloco de linha existente (extraído para um subcomponente/função interna `TransacaoLinha`) com recuo visual e rótulo "Enviado" / "Recebido".
  - Somatórios/métricas (`metricas`) continuam usando `transacoesComBusca` (não agrupado).

- `src/pages/Caixa.tsx`: sem mudança de dados; `getOrigemInfo`/`getDestinoInfo` já resolvem a perna irmã e serão reutilizados no resumo.

- Sem alterações de banco, RPC ou ledger.
