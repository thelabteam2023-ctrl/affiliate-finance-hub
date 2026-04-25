Plano para criar uma fonte canônica de “Casas Mais Utilizadas” e eliminar divergências entre abas.

## Diagnóstico

Hoje existem cálculos duplicados em vários pontos:

- `VisaoGeralCharts.tsx` tem sua própria agregação de casas.
- `SurebetStatisticsCard.tsx` calcula “Top Casas por Uso” internamente.
- `ProjetoDuploGreenTab.tsx` também monta `porCasa`/`casaData` localmente.
- `PerformancePorCasaCard.tsx` tem outra regra para casa consolidada e casa + parceiro.
- Punter e ValueBet carregam `apostas_pernas` como `_sub_entries`, mas nem todo card estatístico usa isso de forma padronizada.

O bug da Surebet provavelmente vem da combinação de dois pontos:

1. Em apostas simples multi-entry, as entradas ficam em `apostas_pernas` e depois são agrupadas por `selecao` em `entries[]`.
2. O card estatístico atual olha principalmente `pernas[]` como se cada item fosse uma casa. Quando há `entries[]` dentro da mesma perna/linha, ele pode acabar contabilizando apenas a entrada principal, ignorando as demais casas.

## Regra canônica proposta

Criar um utilitário único para transformar qualquer operação em “participações por bookmaker”.

Cada participação representa uma casa envolvida na operação, independentemente de a origem ser:

- aposta simples normal: `bookmaker_id` do parent;
- aposta simples multi-entry: cada item em `_sub_entries` ou `pernas[].entries[]`;
- surebet/múltipla/arbitragem: cada perna em `apostas_pernas`;
- duplo green/valuebet/punter com múltiplas entradas: cada entrada real da operação.

Fluxo canônico:

```text
Operação
  -> extrair participações reais por bookmaker
  -> normalizar casa base + vínculo/parceiro
  -> consolidar volume/lucro com hierarquia correta
  -> gerar ranking por casa e detalhe por vínculo
```

## Implementação

### 1. Criar utilitário canônico

Adicionar um novo utilitário, por exemplo `src/utils/bookmakerUsageAnalytics.ts`, com funções como:

- `extractBookmakerParticipations(aposta)`
- `aggregateBookmakerUsage(apostas, options)`
- `extractCasaVinculo(...)`

Ele deve suportar estes formatos de entrada:

- `bookmaker_id`, `bookmaker_nome`, `parceiro_nome`, `instance_identifier` no parent;
- `pernas[]` flat;
- `pernas[].entries[]` agrupado por seleção;
- `_sub_entries[]` usado em Punter/ValueBet;
- campos de moeda/snapshot para stake e lucro.

### 2. Padronizar moeda e valores

Usar a hierarquia financeira já existente:

- volume: `stake_consolidado` quando existir;
- pernas: `stake_brl_referencia`/snapshot quando disponível, senão `convertPernaToConsolidacao`;
- lucro: `pl_consolidado`/`lucro_prejuizo_brl_referencia`/snapshot quando disponível;
- fallback final: `getConsolidatedStake` e `getConsolidatedLucro`.

Isso evita que cada aba converta de um jeito diferente.

### 3. Corrigir SurebetStatisticsCard

Trocar o cálculo local de `casaStats` para usar o agregador canônico.

Critério esperado: se uma operação tem duas casas na mesma linha/seleção, as duas aparecem no ranking e no tooltip, cada uma com sua participação de stake/lucro.

### 4. Corrigir VisaoGeralCharts

Substituir o bloco local “Casas mais utilizadas” pelo agregador canônico, mantendo o mesmo layout visual atual.

Isso garante que a visão geral, Surebet e demais módulos contem casas da mesma forma.

### 5. Corrigir Punter e ValueBet

Hoje essas abas carregam `_sub_entries`, mas o `UnifiedStatisticsCard` não considera casas. Mesmo assim, os gráficos/visões que usam “Casas Mais Utilizadas” devem receber dados compatíveis.

Ajustes previstos:

- garantir que `_sub_entries` carregue também `bookmaker_nome`, `parceiro_nome`, `logo_url`, `moeda` e valores necessários;
- quando essas apostas forem exibidas em cards/gráficos por casa, usar o extrator canônico.

### 6. Corrigir Duplo Green

Substituir os cálculos locais `porCasa` e `casaData` em `ProjetoDuploGreenTab.tsx` pelo agregador canônico.

Isso evita divergência entre Duplo Green e Surebet quando ambos usam pernas/entradas múltiplas.

### 7. Corrigir PerformancePorCasaCard

Refatorar as visões:

- `casa_consolidada`
- `casa_parceiro`

para reutilizarem a mesma extração canônica de participações, em vez de regras locais específicas.

### 8. Preservar diferenças conceituais

A padronização será na extração e agregação das casas, mas mantendo diferenças legítimas de cada tela:

- ranking por volume continuará ordenando por volume;
- ranking por uso pode ordenar por quantidade de participações;
- lucro/ROI continuam respeitando liquidadas vs pendentes conforme cada KPI;
- “Casa” agrupa por bookmaker base;
- “Casa + Parceiro” separa contas/vínculos.

## Validação

Após implementar:

1. Criar/usar cenário com aposta simples multi-entry contendo duas casas na mesma linha.
2. Confirmar que a aba Surebet mostra as duas casas em “Top Casas por Uso”.
3. Confirmar que Punter, ValueBet e Duplo Green não ignoram `_sub_entries` ou `entries[]`.
4. Rodar typecheck e testes existentes.
5. Adicionar teste unitário para o novo agregador cobrindo:
   - parent simples;
   - `pernas[]` flat;
   - `pernas[].entries[]`;
   - `_sub_entries[]`;
   - agrupamento casa consolidada vs casa + parceiro.

## Resultado esperado

A visualização de “Casas Mais Utilizadas” passa a ter uma única regra de verdade. Quando uma operação envolver duas casas, ambas serão contabilizadas em todas as abas que usam esse tipo de ranking, reduzindo retrabalho e evitando divergências futuras.