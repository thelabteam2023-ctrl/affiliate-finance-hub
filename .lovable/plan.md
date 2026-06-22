
# Posição de Capital no Dashboard Financeiro

## Problema

No Dashboard Financeiro (aba **Financeiro**) hoje não é possível visualizar, de forma rápida e por período:

- Quanto de **Aporte** foi feito (capital que entrou do investidor)
- Quanto de **Liquidação** foi devolvido ao investidor (capital que saiu para o investidor)
- Qual é o **capital próprio líquido investido** (Aportes − Liquidações)
- Como esse capital se compara ao **patrimônio atual** (saldo em casas + caixa + wallets), separando o que é capital próprio do que é resultado operacional, freebet ou bônus

Isso dificulta saber "quanto eu coloquei" vs "quanto o sistema gerou". Quando o saldo nas casas se mistura com freebets, bônus e lucros, perde-se a referência do investimento inicial.

## O que será entregue

Um novo bloco **"Posição de Capital"** no topo do Dashboard Financeiro, com:

### 1. Card principal — Capital Investido (Líquido)
```text
┌─────────────────────────────────────────────┐
│  CAPITAL PRÓPRIO INVESTIDO                  │
│  R$ 120.000,00                              │
│  ──────────────────────────────             │
│  Aportes no período        + R$ 150.000,00  │
│  Liquidações no período    −  R$  30.000,00 │
│  ──────────────────────────────             │
│  Patrimônio Atual            R$ 145.000,00  │
│  Resultado sobre capital     +20,8%         │
└─────────────────────────────────────────────┘
```

- **Aportes**: `cash_ledger.tipo_transacao IN ('APORTE','APORTE_FINANCEIRO','APORTE_DIRETO')` com `status = 'CONFIRMADO'` no período.
- **Liquidações**: `cash_ledger.tipo_transacao = 'LIQUIDACAO'` com `status = 'CONFIRMADO'` no período.
- **Capital Próprio Investido (líquido)** = Aportes − Liquidações.
- **Patrimônio Atual** = saldo bookmakers + saldo wallets + saldo contas bancárias (na moeda de consolidação do workspace, via Cotação de Trabalho).
- **Resultado sobre capital** = (Patrimônio Atual − Capital Próprio Investido Líquido Acumulado) / Capital Próprio Investido Líquido Acumulado.

Importante: o cálculo terá dois modos:
- **Acumulado** (default): considera todos os aportes/liquidações desde o início do workspace, independente do filtro de período. Esse é o número que responde "quanto de capital próprio eu tenho hoje no jogo".
- **No período**: usa o filtro de data ativo no Dashboard Financeiro (já existente — `useHistoryDimensionalFilter` / filtros padrão da aba).

Toggle no card alterna entre os dois.

### 2. Quebra do Patrimônio Atual (sub-card)
Para responder "o saldo está misturado com freebet/bônus":

```text
Patrimônio Atual    R$ 145.000,00
├─ Capital Próprio (líquido aportes-liquidações)   R$ 120.000,00
├─ Resultado Operacional acumulado                 R$  22.500,00
├─ Saldo Freebet (não é capital)                   R$   2.000,00
└─ Bônus pendente de extração                      R$     500,00
```

- **Saldo Freebet**: `SUM(bookmakers.saldo_freebet)` consolidado.
- **Bônus pendente**: saldo classificado como `origem = 'BONUS'` ainda não convertido (via `financial_events` / `cash_ledger` por origem), seguindo a memória `bonus-exclusion-from-lucro-kpi`.
- **Resultado Operacional acumulado**: já existe — usar `calcularLucroCanonicoFromRpc` / serviço canônico (memória `canonical-operational-profit-standard`), respeitando a Cotação de Trabalho.
- A soma das linhas deve bater com Patrimônio Atual (rodapé com check de paridade — se divergir > 0,01 mostra badge "Divergência").

### 3. Mini-gráfico de evolução (opcional, mesma faixa)
Sparkline com a curva de **Capital Próprio Acumulado** e **Patrimônio Total** ao longo do período, usando `capital_snapshots` (já existente — alimentado por `snapshot-capital-diario`). Linha de capital próprio fica reta enquanto não há aporte/liquidação; a divergência visual entre as duas curvas é o resultado operacional.

## Onde encaixa na UI

- Página: `src/pages/Financeiro.tsx`
- Posição: primeira linha do dashboard, acima de `KpiRail` / cards existentes (`MapaPatrimonioCard`, `MovimentacaoCapitalCard`, etc.), porque é a leitura "de mais alto nível" que o usuário pediu.
- Respeita o filtro de período global da aba e o seletor de moeda de consolidação (BRL/USD) já presente.

## Detalhes técnicos

### Novos arquivos
- `src/components/financeiro/PosicaoCapitalCard.tsx` — card principal + breakdown + toggle Acumulado/Período.
- `src/hooks/usePosicaoCapital.ts` — busca aportes, liquidações, patrimônio e quebra; aceita `{ workspaceId, periodo, modo: 'acumulado' | 'periodo' }`.
- `src/services/fetchPosicaoCapital.ts` — agrega:
  - `cash_ledger` filtrando por `tipo_transacao IN ('APORTE','APORTE_FINANCEIRO','APORTE_DIRETO','LIQUIDACAO')` e `status = 'CONFIRMADO'`, com `workspace_id` (regra de isolamento) e conversão para moeda de consolidação via `convertToConsolidation` (Cotação de Trabalho).
  - `bookmakers` para `saldo_atual` + `saldo_freebet` (não somar freebet no capital).
  - `wallets_crypto` e `contas_bancarias` para compor patrimônio.
  - Reuso de `calcularLucroCanonicoFromRpc` para resultado operacional acumulado.
  - Opcional: `capital_snapshots` para o sparkline (sem nova tabela).

### Regras obrigatórias respeitadas
- Filtro por `workspace_id` em todas as queries (memória `workspace-enforcement-standard`).
- Conversão multimoeda **somente** via Cotação de Trabalho (memórias `analytics-snapshot-conversion-hierarchy`, `volume-snapshot-cotacao-trabalho-standard`).
- Lucro Realizado / capital próprio segue `lucro-real-payment-standard`: usa `APORTE`/`LIQUIDACAO` para capital; **não** mistura com `DEPOSITO`/`SAQUE` (esses são movimentações para bookmakers, não capital do investidor).
- Freebet e bônus **não** contam como capital próprio (memórias `bonus-exclusion-from-lucro-kpi`, `freebet-ledger-derivation-standard`).
- Nenhuma escrita: card é 100% leitura/derivação. Sem migrations, sem nova tabela, sem triggers.

### Estados de UI
- Loading skeleton (mesma estética dos cards existentes).
- Tooltip "?" em cada linha explicando a fórmula (consistente com `KpiExplanationDialog`).
- Badge de moeda exibida (BRL/USD) reflete o seletor global.
- Quando Capital Próprio Líquido = 0 e há patrimônio: mostra aviso "Sem aportes registrados — patrimônio veio de bônus/freebets/operação".

## Fora do escopo (para alinhar)
- Não cria novos tipos de transação nem mexe em ledger.
- Não altera a aba Caixa, Projetos ou Investidores — só o Dashboard Financeiro.
- Não cria relatório exportável nesta etapa (pode vir depois se você pedir).

## Validação após implementar
1. Conferir em um workspace com aportes conhecidos se o valor bate com a soma manual no `cash_ledger`.
2. Conferir paridade do breakdown (Capital + Resultado + Freebet + Bônus = Patrimônio, tolerância 0,01).
3. Trocar moeda BRL ↔ USD e validar conversão pela Cotação de Trabalho.
4. Trocar período e confirmar que o modo "Acumulado" ignora o filtro e o "No período" respeita.

Confirma esse plano (em especial: card no topo do Financeiro, modos Acumulado/Período, e o breakdown do patrimônio nessas 4 linhas) que eu já implemento.
