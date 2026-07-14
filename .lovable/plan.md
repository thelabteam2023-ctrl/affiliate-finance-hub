
# Saldo Tri-Fásico: correção do "Disponível" e unificação entre módulos

## Diagnóstico

A view `v_saldo_parceiro_wallets` já expõe as 3 camadas corretas, **mas** o front consome de forma errada e desalinhada entre telas.

**O que a view devolve hoje (por wallet+coin):**

| Campo                       | Fórmula                                                                  |
|-----------------------------|--------------------------------------------------------------------------|
| `saldo_coin`                | Soma de tx **CONFIRMED** (entradas − saídas). = "on-chain confirmado".   |
| `saldo_em_transito_coin`    | Soma **líquida** de tx `PENDING/STUCK/WRONG_ADDRESS/MANUAL_REVIEW` (entradas − saídas). |
| `saldo_disponivel` (USD)    | `max(0, saldo_usd − balance_locked)` — depende do `lock_wallet_balance` ter sido chamado. |
| `saldo_total` (USD)         | `saldo_usd + transit_usd`.                                               |

**O bug prático (cenário do usuário):**
Wallet tem 121 USDT confirmados. Existe uma saída pendente de 45 USDT.
- `saldo_coin` = 121, `transit_coin` = **−45** (saída), `balance_locked` pode ou não estar setado.
- `CryptoWalletCard` mostra `saldo_coin` (121) como **Disponível** — errado.
- Chip "Em Trânsito" só renderiza se `emTransitoUsd > 0`, então o **−45 fica invisível**.
- Resultado: 121 exibido como disponível quando o real é 76.

Além disso a semântica "trânsito" mistura entradas (chegando, não usáveis) e saídas (saindo, também não usáveis) em um único número líquido, o que impede exibir corretamente cada caso.

**Divergência entre telas (mesma wallet, valores diferentes):**
- `ParceiroDialog / CryptoWalletCard` → `saldo_coin` como Disponível.
- `SaldosParceirosSheet`, `ExposicaoCryptoCard`, `Caixa.tsx` → usam revaluation live via `getCryptoUSDValue(saldo_coin)`, ignoram trânsito.
- `useSaldoOperavel`, `useValidacaoFinanceira`, `OrigemPagamentoSelect` (validação pré-envio) → usam `balance_available` do RPC `get_wallet_balances` (baseado em `balance_locked`), que só bate se o `lock_wallet_balance` foi chamado.
- `ConciliacaoSaldos` → mostra chip de status por transação, mas não reconcilia com o "Disponível" exibido nos cards.

## Modelo alvo (definição canônica)

Para toda wallet crypto, em toda tela, exibir/consumir estes 3 valores derivados **exclusivamente do `cash_ledger`** (sem depender de `balance_locked`):

```text
Saldo Total       = confirmados + entradas pendentes − saídas pendentes
                  = saldo_coin + transit_in_coin − transit_out_coin

Saldo Disponível  = confirmados − saídas pendentes
                  = saldo_coin − transit_out_coin
                    (nunca menor que 0)

Em Trânsito (⬆ saindo) = transit_out_coin   [reduz o disponível]
Em Trânsito (⬇ chegando) = transit_in_coin  [não aumenta o disponível; informativo]
```

Regras invioláveis (memory):
- Nunca tratar entrada pendente como disponível.
- Sempre respeitar `Floor(0)` no disponível.
- Sempre filtrar por `workspace_id`.
- Sem UPDATE direto em campos de saldo materializado — a verdade vem do ledger.

## Mudanças planejadas

### 1) Banco — recriar `v_saldo_parceiro_wallets` (schema)

Adicionar colunas explícitas para entradas e saídas pendentes, e recalcular `saldo_disponivel` a partir do ledger (não mais de `balance_locked`):

- `transit_in_coin`, `transit_in_usd` → soma de destino=wallet em `PENDING/STUCK/WRONG_ADDRESS/MANUAL_REVIEW`.
- `transit_out_coin`, `transit_out_usd` → soma de origem=wallet nos mesmos status.
- `saldo_em_transito_coin`/`saldo_em_transito` → mantidos, mas passam a valer `transit_in − transit_out` explicitamente (para retrocompatibilidade).
- `saldo_disponivel_coin` (novo) = `GREATEST(0, saldo_coin − transit_out_coin)`.
- `saldo_disponivel` (USD, redefinido) = `GREATEST(0, saldo_usd − transit_out_usd)`.
- `saldo_total_coin` (novo) e `saldo_total` (USD, redefinido) = `saldo_coin + transit_in − transit_out`.

Assinatura antiga preservada para não quebrar consumidores existentes.

### 2) Componente unificado `SaldoTrifasico` — expansão

Estender props para receber `transitInUsd` e `transitOutUsd` (em vez de um único `emTransitoUsd` líquido):

```text
Disponível (verde)     — sempre visível
⬆ Saindo   (âmbar)     — só quando > 0
⬇ Chegando (azul)      — só quando > 0
Total consolidado      — opcional, variante detailed
```

Tooltip explicativo: "Valores em envio ficam bloqueados até conciliação. Valores chegando não estão disponíveis para operar até serem confirmados."

Variantes existentes (`compact | stacked | detailed`) preservadas; sem breaking change para quem já usa `emTransitoUsd`.

### 3) Front — consumidores da view

Ajustar para hidratar `transit_in` e `transit_out` separadamente e passar para `SaldoTrifasico`:

- `src/components/parceiros/ParceiroDialog.tsx` — carregar as 4 novas colunas.
- `src/components/parceiros/CryptoWalletCard.tsx` — usar `saldo_disponivel_coin` para "Disponível" (não `saldo_coin`).
- `src/components/parceiros/tabs/CryptoWalletsTab.tsx` — propagar `transitIn/transitOut` no lugar do `walletTransito` único.
- `src/components/caixa/SaldosParceirosSheet.tsx` — trocar cálculo live por `saldo_disponivel` da view; expor colunas Total / Em Trânsito / Disponível.
- `src/components/caixa/ExposicaoCryptoCard.tsx` — idem.
- `src/pages/Caixa.tsx` — o card "Saldos por Parceiro" (Posição de Capital vs Saldos) passa a somar `saldo_disponivel` da view, garantindo paridade.

### 4) Validação de saldo pré-operação

Fonte única de verdade passa a ser `saldo_disponivel` da view (derivado do ledger), eliminando dependência de `balance_locked` materializado:

- `src/hooks/useWalletTransitBalance.ts` (`canSendAmount`, `getWalletBalances`) — ler `saldo_disponivel_coin` da view.
- `src/hooks/useSaldoOperavel.ts` — idem.
- `src/hooks/useValidacaoFinanceira.ts` — idem.
- `src/components/programa-indicacao/OrigemPagamentoSelect.tsx` — bloquear seleção quando `saldo_disponivel < valor`.

O `lock_wallet_balance` continua sendo chamado como reserva otimista de curto prazo (TTL), mas deixa de ser condição necessária para o "Em Trânsito" aparecer — a view sempre reflete o ledger.

### 5) Conciliação — alinhar UI

`ConciliacaoSaldos.tsx`: no cabeçalho de cada wallet mostrar a mesma linha tri-fásica (`SaldoTrifasico` variante compact), para que o total dos chips PENDING/STUCK/... bata visualmente com "⬆ Saindo" e "⬇ Chegando".

## Testes de aceitação

1. Wallet com 121 USDT confirmados + saída pendente 45 USDT:
   - Card mostra **Disponível 76,00 USDT**, chip **⬆ Saindo ≈ $45,00**, Total 121,00.
   - `OrigemPagamentoSelect` só permite enviar até 76.
2. Wallet com 100 USDC + entrada pendente 30 USDC:
   - Disponível **100,00 USDC**, chip **⬇ Chegando ≈ $30,00**, Total 130,00.
3. Wallet zerada com saída pendente 10 (cenário inconsistente):
   - Disponível **0,00** (Floor), chip **⬆ Saindo ≈ $10,00** em vermelho de alerta.
4. Paridade cross-módulo: mesma wallet exibe o mesmo Disponível em `ParceiroDialog`, `SaldosParceirosSheet`, `ExposicaoCryptoCard`, `Caixa`.

## Fora de escopo

- Correção retroativa de ledgers legados com `transit_status` incorreto (política anti-retrofix).
- Mudança do modelo de reserva TTL (`bookmaker_stake_reservations`) — permanece igual.
- Contas bancárias fiat (o modelo tri-fásico se aplica apenas a wallets crypto neste ciclo).
