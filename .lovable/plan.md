Plano de ajuste

A divergência foi confirmada: o valor “inflado” em Bookmakers vem das contas Broker. Hoje a Posição de Capital soma tudo dentro de “Bookmakers”, incluindo `is_broker_account = true`.

Valores encontrados no workspace principal:

```text
Bookmakers não-Broker BRL: R$ 65.690,72
Broker BRL:               R$ 51.042,62
Total atual BRL exibido:  R$ 116.733,34
```

Contas Broker que estão entrando no total atual:

```text
BET365 / BROKER TIAGO: R$ 43.244,00
BET365 / BROKER TIAGO: R$ 4.298,62
7GAMES / TESTE:        R$ 2.000,00
APOSTOU / TESTE:       R$ 1.500,00
```

Implementação proposta

1. Separar a agregação no Caixa
   - Em `src/pages/Caixa.tsx`, alterar a consulta de saldos das bookmakers para buscar também `is_broker_account` e/ou o vínculo com `projetos.is_broker`.
   - Agregar em dois grupos separados:
     - `saldosBookmakersPorMoeda`: somente contas não-Broker.
     - `saldosBrokerPorMoeda`: somente contas Broker.
   - Manter o filtro por `workspace_id` e a regra financeira existente de `Math.max(0, saldo_atual)`.

2. Criar nova sessão “Broker” na Posição de Capital
   - Em `src/components/caixa/PosicaoCapital.tsx`, adicionar uma nova categoria entre “Bookmakers” e “Contas Parceiros” ou após “Bookmakers”:

```text
Caixa Operacional
Bookmakers
Broker
Contas Parceiros
Wallets Parceiros
```

   - A nova categoria “Broker” terá cor própria e ícone próprio para não confundir com Bookmakers operacionais.

3. Ajustar totais e percentuais
   - O total geral da Posição de Capital continuará incluindo Broker, porque é capital existente.
   - O item “Bookmakers” passará a representar apenas casas operacionais/não-Broker.
   - O item “Broker” passará a representar o capital dos projetos Broker.
   - Percentuais do gráfico serão recalculados com as cinco categorias.

4. Ajustar detalhes exibidos
   - “Bookmakers” deverá mostrar algo como:

```text
R$ 65.691 + 2 moedas
```

   - “Broker” deverá mostrar:

```text
R$ 51.043
```

   - Se houver Broker em outras moedas no futuro, seguirá o mesmo padrão multimoeda já usado no componente.

5. Preservar compatibilidade
   - `saldoBookmakers` legado usado por `CaixaTabsContainer` será revisado para não carregar Broker indevidamente, se esse valor representar apenas bookmakers operacionais.
   - Não haverá alteração de dados no banco e nenhum ajuste direto de `saldo_atual`; será apenas correção de classificação na UI.

Resultado esperado

A Posição de Capital deixará de mostrar Bookmakers como se tivessem R$ 116 mil em BRL. Ela passará a separar claramente:

```text
Bookmakers: R$ 65.690,72
Broker:     R$ 51.042,62
```

Assim a comparação com “Saldos por Parceiro” ficará coerente, e os valores provenientes de Broker terão uma sessão própria dentro da distribuição de capital.