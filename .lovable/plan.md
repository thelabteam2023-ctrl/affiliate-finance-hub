## Objetivo

Quando o filtro de **Tags** estiver ativo no Histórico do Caixa Operacional, exibir um bloco dedicado de **"Total da Tag"** no cabeçalho, ao lado dos blocos Fiat/Cripto já existentes, mostrando o somatório das movimentações que carregam aquela(s) tag(s).

Hoje os blocos Fiat e Cripto já refletem o filtro (porque consomem `transacoesComBusca`), mas o usuário não tem leitura imediata de "quanto soma a tag X". Em casos como o print (uma transferência USD $550 + um depósito R$500 com a mesma tag), não há um número único que represente o aporte total da tag.

## Mudanças (apenas frontend — `src/components/caixa/HistoricoMovimentacoes.tsx`)

### 1. Detectar filtro de tags ativo
Ler o estado do filtro de tags já existente (`filtroTags` / `tagsSelecionadas` — confirmar nome ao abrir o arquivo). Considerar ativo quando `length > 0`.

### 2. Novo bloco no cabeçalho: "Tag: NOME"
Renderizado **somente** quando há tag(s) selecionada(s). Posicionado à esquerda dos blocos Fiat/Cripto, com separador vertical sutil.

Estrutura:
- **Label superior:** `TAG: <NOME>` (ou `TAGS (n)` se múltiplas, com tooltip listando)
- **Valor principal:** total consolidado em BRL (regra abaixo)
- **Linha secundária:** `Cripto (USD): $ X` quando houver movimentações cripto na seleção
- **Tooltip:** breakdown por moeda nativa + por coin cripto (snapshot USD), reaproveitando a lógica já existente

### 3. Regra de cálculo (reaproveita `metricas`)
A agregação reaproveita as estruturas já calculadas em `metricas` (fiat por moeda + cripto por coin com snapshot USD). Como `transacoesComBusca` já inclui o filtro de tags, o `metricas` atual já é o conjunto correto. Apenas precisamos:

- **Fiat consolidado em BRL:** soma `convertToBRL(valor, moeda)` para cada bucket fiat. Conversão live é aceitável aqui porque é leitura informativa de "aporte total" — o valor nativo de cada lançamento permanece preservado no card.
- **Cripto consolidado em USD:** soma `usdTotal` (snapshot) de cada `CryptoAgg`. **Nunca** recalcular com preço live (segue a regra `historico-caixa-crypto-snapshot-standard`).
- Os dois totais ficam separados (BRL e USD), porque misturar exigiria mais uma conversão FX e ofuscaria a leitura.

### 4. Comportamento sem tag selecionada
Bloco oculto. Cabeçalho continua idêntico ao atual (Fiat + Cripto).

### 5. Múltiplas tags
- 1 tag: `TAG: PRIMEIRO INVESTIMENTO ITALO`
- N tags: `TAGS (N): <primeira>, +N-1` com tooltip completo
- Lógica AND ou OR segue exatamente a já implementada no filtro (não muda regra de filtragem)

## Layout sugerido (cabeçalho)

```text
┌───────────────────────────┬──────────────────┬───────────────────────┐
│ TAG: PRIMEIRO INVEST ITALO│ FIAT (em BRL)    │ CRIPTO (em USD)       │
│ R$ 3.235,00               │ R$ 500,00        │ $ 0,00                │
│ + Cripto: $ 0,00          │ Creditado: ...   │ Creditado: ...        │
│ Creditado: ...            │                  │                       │
└───────────────────────────┴──────────────────┴───────────────────────┘
```
(USD 550 convertido a ~R$5,00 + R$500 = R$3.235 ilustrativo)

## Fora de escopo
- Nenhuma alteração de schema, RPC, migração ou outros componentes.
- Sem mudança na lógica de filtragem por tag — apenas exibição agregada.
- Sem persistência de "valor da tag" no banco (continua derivado).

## Critérios de aceite
1. Selecionar 1 tag → aparece bloco "TAG: NOME" com total consolidado em BRL + linha cripto em USD se aplicável.
2. Tag com lançamentos USD + BRL exibe um valor BRL único (FX live) e mantém valores nativos nos cards.
3. Tag com lançamento cripto exibe USD via snapshot (`cash_ledger.valor_usd`) — não flutua com preço live.
4. Limpar a tag → bloco some, cabeçalho volta ao estado Fiat+Cripto.
5. Múltiplas tags → label compacto + tooltip listando todas; somatório respeita o modo (AND/OR) já vigente no filtro.
