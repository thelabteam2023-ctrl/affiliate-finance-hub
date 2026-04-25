Plano para prosseguir com a correção definitiva da contagem de “Casas Mais Utilizadas”.

## Diagnóstico confirmado

O problema não é a ausência de dados na operação. A falha acontece na transformação para a UI.

Fluxo atual problemático:

```text
apostas_pernas
  -> groupPernasBySelecao agrupa por seleção
  -> Surebet/VisaoGeralCharts recebe pernas resumidas
  -> entries[] não é preservado no mapping
  -> aggregateBookmakerUsage só enxerga a primeira casa
```

Exemplo do bug em Surebet:

- A operação tem duas pernas/entradas reais em `apostas_pernas`.
- `groupPernasBySelecao` junta entradas da mesma seleção em uma perna principal + `entries[]`.
- Ao montar os dados para o card “Casas Mais Utilizadas”, `ProjetoSurebetTab.tsx` faz `s.pernas?.map(p => ({ bookmaker_nome, stake, ... }))`.
- Esse mapping copia apenas os campos principais de `p`, mas descarta `p.entries`.
- Resultado: a estatística vê só a casa principal da linha agrupada.

Além disso, `groupPernasBySelecao` ainda não preserva campos analíticos importantes dentro de `entries[]`, como `resultado`, `lucro_prejuizo`, `parceiro_nome`, `instance_identifier`, `stake_brl_referencia`, `lucro_prejuizo_brl_referencia` e `cotacao_snapshot`.

## O que vou corrigir

### 1. Blindar `groupPernasBySelecao`

Preservar, em cada item de `entries[]`, todos os campos necessários para análise:

- `bookmaker_id`
- `bookmaker_nome`
- `parceiro_nome`
- `instance_identifier`
- `logo_url`
- `resultado`
- `lucro_prejuizo`
- `moeda`
- `stake`
- `odd`
- `stake_brl_referencia`
- `lucro_prejuizo_brl_referencia`
- `cotacao_snapshot`
- `fonte_saldo`

Assim, qualquer aba que agrupe por seleção não perderá granularidade de casa.

### 2. Corrigir o mapping da Surebet para `VisaoGeralCharts`

Em `ProjetoSurebetTab.tsx`, substituir os mappings duplicados de `surebets.map(...)` por uma função local única, por exemplo `mapSurebetForCharts(s)`.

Essa função vai:

- passar `pernas[]` completas para o agregador;
- preservar `entries[]` dentro de cada perna;
- preservar IDs, nomes, parceiro, instância, stake/lucro por perna e snapshots de conversão;
- evitar cair no fallback de “primeira casa” quando a operação tiver pernas agrupadas.

Isso deve corrigir imediatamente a visão da coluna direita “Casas Mais Utilizadas” em Surebet.

### 3. Reforçar o agregador canônico

Ajustar `src/utils/bookmakerUsageAnalytics.ts` para tratar todos os formatos como participação real por casa:

```text
operação simples parent
_sub_entries[]
pernas[] flat
pernas[].entries[] agrupado por seleção
```

Também vou reforçar fallback de lucro quando `entries[]` não tiver lucro individual:

- se houver lucro individual: usa o valor individual;
- se faltar lucro em algumas entries: distribui o lucro restante proporcionalmente por stake, não por contagem simples;
- pendentes continuam com lucro 0;
- ROI continua usando volume liquidado, conforme padrão do projeto.

### 4. Revisar Punter, ValueBet e Duplo Green

Aplicar a mesma blindagem nos pontos onde essas abas enriquecem `apostas_pernas` como `_sub_entries` ou `pernas`.

Pontos a confirmar/corrigir:

- incluir parceiro, instância, logo e snapshots nas sub-entries carregadas;
- garantir que `_sub_entries[]` tenham `bookmaker_nome`, `parceiro_nome`, `instance_identifier`, `logo_url`, `resultado`, `lucro_prejuizo`, `moeda` e referências de conversão;
- garantir que filtros por Casa/Parceiro também considerem `pernas[].entries[]`, não só `_sub_entries` e `pernas` diretas.

### 5. Corrigir filtros dimensionais quando houver entries agrupadas

Atualizar `apostaFilterHelpers.ts` para coletar bookmaker IDs também dentro de:

```text
pernas[].entries[].bookmaker_id
```

Hoje ele considera parent, `_sub_entries` e `pernas`, mas não percorre `entries[]` aninhado. Isso pode afetar filtros por casa/parceiro em operações agrupadas.

### 6. Expandir simulações e testes unitários

Adicionar/ajustar testes do agregador canônico com cenários sintéticos:

1. Surebet com duas pernas em casas diferentes.
2. Surebet com duas entries dentro da mesma seleção.
3. Punter/ValueBet com `_sub_entries` multi-entry.
4. Duplo Green com `pernas[]` e `_sub_entries`.
5. Filtro por bookmaker encontrando `pernas[].entries[]`.
6. Lucro faltante em entries sendo distribuído proporcionalmente por stake.
7. ROI usando apenas volume liquidado.

### 7. Validação final

Depois da implementação, vou rodar:

- testes unitários do agregador;
- teste dos filtros auxiliares;
- typecheck.

Resultado esperado:

- se uma operação envolver duas casas, as duas aparecem em “Casas Mais Utilizadas”;
- Surebet, Punter, ValueBet, Duplo Green, Visão Geral e Performance passam a usar a mesma regra;
- futuras entradas multi-entry não voltam a perder casas por transformação intermediária.