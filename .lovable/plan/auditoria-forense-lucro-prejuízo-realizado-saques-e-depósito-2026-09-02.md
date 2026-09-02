# Auditoria Forense — Lucro/Prejuízo Realizado (saques e depósitos)

## O que já foi verificado nos dados reais

Consultas de leitura no banco atual (sem criar nem alterar registros) já apontam três divergências concretas entre o que foi movimentado e o que chega ao indicador.

### Achado 1 (crítico) — saques cripto contabilizados pela quantidade da moeda, não pelo valor

O cálculo canônico do Lucro Realizado (`src/services/fetchProjetosLucroCanonico.ts`, linha 302) usa `valor_confirmado ?? valor` para todo saque. Em saques cripto, `valor_confirmado` guarda a **quantidade recebida do ativo** (ex.: 0,345 ETH), não o valor financeiro. Resultado: um saque de R$ 6.142 entra no KPI como 0,345.

Evidência (saques CONFIRMADO, não revertidos, com `valor_confirmado` divergente de `valor`):

```text
tipo_moeda  moeda  qtd   soma(valor)   soma(valor_confirmado)
CRYPTO      USD     99    42.256,71     32.606,05
CRYPTO      USDT    26    19.014,51     11.252,91
CRYPTO      EUR     18     7.350,28      8.435,01
CRYPTO      USDC     7     3.458,06      3.777,87
CRYPTO      BRL      2     4.812,66        964,76
CRYPTO      ETH      2     6.142,61          0,35
CRYPTO      MYR      1     1.736,00        437,41
CRYPTO      LTC      1       324,00          5,87
FIAT        BRL      5    30.898,88     31.118,62
```

O popover "Indicadores Financeiros" (`FinancialMetricsPopover.tsx`, linhas ~703-706) **já trata** esse caso excluindo saques cripto do ajuste. O serviço canônico (card do projeto, Financeiro do workspace, fluxo mensal) **não trata**. Ou seja: duas telas mostram números diferentes para a mesma operação.

### Achado 2 — movimentações confirmadas sem `projeto_id_snapshot`

O KPI filtra por `projeto_id_snapshot`. Existem, confirmadas e não revertidas: 55 DEPOSITO, 25 DEPOSITO_VIRTUAL, 30 SAQUE e 28 SAQUE_VIRTUAL sem esse campo — invisíveis para qualquer projeto. Concentram-se em meses anteriores (agosto e setembro/2026 estão zerados), o que indica lacuna histórica, não regressão nova.

### Achado 3 — assimetria virtual e conversão por cotação oficial

- `DEPOSITO_VIRTUAL` só entra quando `origem_tipo = 'MIGRACAO'` (correto), mas todo `SAQUE_VIRTUAL` entra sem filtro equivalente; há 4 `DEPOSITO_VIRTUAL` confirmados com `origem_tipo` nulo (R$ 4.000), hoje simplesmente ignorados.
- O KPI converte por cotação **oficial** do dia, enquanto o restante do sistema usa Cotação de Trabalho/snapshot. Em projetos multimoeda isso produz drift permanente.

Não há vínculo direto entre `financial_events` e `cash_ledger` por coluna de ligação: o Lucro Realizado é calculado exclusivamente a partir do `cash_ledger`. Portanto o problema não está na sincronização de saldo, e sim na leitura contábil.

## Fase 1 — Relatório forense completo (sem alterar nada)

Entregar `docs/AUDITORIA_LUCRO_REALIZADO.md` com:

1. Reconciliação por projeto: depósitos, saques, valores, moeda, casa, data, status, origem, saldo da casa, Lucro Realizado esperado × exibido, diferença.
2. Lista nominal de todas as operações afetadas por cada achado (crypto, sem snapshot, virtual sem origem), com IDs, valores e projeto.
3. Comparação lado a lado dos dois cálculos concorrentes (popover × serviço canônico) para cada projeto com histórico real.
4. Verificação de dupla contagem: operação com mais de um registro efetivo (original + espelho de reversão não filtrado, duplicidade de importação, evento repetido).
5. Datação da regressão: quando o uso de `valor_confirmado` passou a alcançar saques cripto.
6. Totais: valor não contabilizado, valor contabilizado a menor/maior, projetos e workspaces impactados.

Nada é alterado nesta fase.

## Fase 2 — Correção estrutural (somente após validação do relatório)

1. Criar um único helper de valor efetivo de movimentação (`valorEfetivoLedger`) que decide entre `valor` e `valor_confirmado` considerando `tipo_moeda`: em cripto o valor financeiro é sempre `valor`; a diferença cripto vira resultado cambial, não saque.
2. Passar todos os consumidores a usar esse helper: serviço canônico, popover, métricas por período, financeiro do workspace, fluxo mensal, relatórios.
3. Tornar simétrico o tratamento virtual (mesma regra de `origem_tipo` para depósito e saque) e definir o que fazer com `origem_tipo` nulo.
4. Unificar a base de conversão do KPI com a regra de Cotação de Trabalho/snapshot já adotada no restante do sistema.
5. Backfill de `projeto_id_snapshot` apenas para registros comprovadamente atribuíveis, um por um, sem retrofit em massa e sem tocar em saldo.

## Fase 3 — Validação

Testes cobrindo: novo saque e novo depósito refletidos no KPI; múltiplas operações; saque cripto (quantidade ≠ valor); moedas diferentes; casas diferentes; projetos e workspaces diferentes; operação revertida não contabilizada; ausência de dupla contagem; e reconciliação matemática entre ledger, saldos e Lucro Realizado.

## Fora de escopo

Motor de liquidação de apostas, triggers de saldo, correções em massa de dados históricos.
