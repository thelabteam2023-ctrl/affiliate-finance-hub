
# Otimização do Travamento na Calculadora de Edge Probabilístico

## Diagnóstico — onde está o travamento

Tracei o ciclo de render disparado ao digitar **Freebet** ou **Banca da Exchange**. Encontrei quatro `useMemo` pesados que recomputam em cada tecla:

| useMemo | Custo | Reage a Freebet? | Reage a Banca? |
|---|---|---|---|
| `optimalConfig` (linha 396) | **10.001 chamadas** de `calculateMetrics` por render | ✅ | ✅ |
| `monteCarloSim` (linha 418) | **100.000 trajetórias × até 1.000 passos** (até 100 M iterações) | ✅ (via `metrics`) | ✅ |
| `longTermSim` (linha 506) | **100.000 ciclos** simulados | ✅ (via `metrics`) | ✅ |
| `heatmapData` (linha 541) | 30 cálculos | ✅ | ✅ |

Cada `calculateMetrics` ainda gera sub-cenários `O(2^N)` para visualização (lin. 153). Multiplicando, uma única tecla no campo Freebet dispara **dezenas de milhões de operações síncronas** que bloqueiam a main thread → o "computador trava" que você descreveu.

`goldenCombinationsByExtraction` não depende de freebet/banca (já está OK).

## Plano de correção (4 frentes, sem mudar a matemática)

### 1. Debounce dos inputs pesados
Criar `useDebouncedValue` (250 ms) e usar os **valores debounçados** apenas como dependência dos cálculos pesados (`optimalConfig`, `monteCarloSim`, `longTermSim`, `heatmapData`). A UI continua atualizando o campo imediatamente — só os cálculos esperam você parar de digitar.

```ts
const debouncedFreebet  = useDebouncedValue(freebet, 250);
const debouncedBankroll = useDebouncedValue(bankroll, 250);
```

### 2. Reduzir iterações para níveis razoáveis sem perder precisão estatística
- `optimalConfig`: **10.001 → 200 passos** (resolução de 0,175 % no alvo de extração — imperceptível). Adicionalmente, remover `freebet` das deps: a escolha do alvo ótimo depende apenas do **ratio `bankroll/freebet`**, não dos valores absolutos. Reduz ~98 % do custo.
- `monteCarloSim`: **100.000 trajetórias → 5.000**. Erro estatístico do "risk of ruin" cai de ~0,1 pp para ~0,7 pp — aceitável para um KPI mostrado com 1 casa decimal. Mantém a CDF pré-calculada (já está boa).
- `longTermSim`: **100.000 → 2.000 ciclos** (gráfico só plota até `cycle ≤ 1000` mesmo — 100k é desperdício puro).
- `heatmapData`: já é pequeno; só passa a usar valores debounçados.

### 3. Cache do `calculateMetrics` no escopo do `useMemo`
Dentro de `optimalConfig` e `heatmapData`, memoizar por chave `legs|target|comm|freebet` num `Map` local — evita recomputar para combinações repetidas no mesmo loop.

### 4. Sinalização visual de "calculando"
Adicionar `useTransition` (React 18) ou um pequeno spinner no card de cada KPI pesado, para que o usuário entenda que o número está sendo recalculado em background.

## Validação

- Antes: digitar "1100" no campo Freebet (4 teclas) → ~4 × 100 M ops ≈ trava de vários segundos.
- Depois: cada tecla atualiza só o input (< 1 ms); 250 ms após parar, os pesados rodam **uma vez** com ~5 k trajetórias + 200 calcs de target → < 100 ms total.

Rodar `bunx vitest run src/lib/__tests__/hedge-probabilistico-engine.test.ts` para garantir que nada matemático mudou (não vou tocar no engine).

## Escopo protegido (não muda)
- `src/lib/hedge-probabilistico-engine.ts` (matemática intacta).
- `src/lib/extracao-engine.ts`.
- Toggle ROI Máx / Equilíbrio de Perdas já entregue.
- Biblioteca de Ouro Dinâmica (já estava OK).

## Arquivos editados
- `src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx` (debounce + reduções + cache).
- `src/hooks/useDebouncedValue.ts` (novo, ~10 linhas).

Posso aplicar?
