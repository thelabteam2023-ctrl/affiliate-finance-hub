
# Equilíbrio de Perdas (Loss-Balanced Hedge)

## Contexto

Hoje, no modo **ROI Max**, a calculadora maximiza o lucro no cenário em que todas as backs vencem (won → won → ...), mas concentra todo o prejuízo no pior cenário (geralmente "todas back vencem" quando a freebet é pequena e as odds altas, como o `-R$ 3.328,09` do seu print).

A pergunta é: **dá pra distribuir essa perda?** Sim. É matematicamente possível recalibrar as lay stakes para que **todos os cenários de fracasso (ou todos os cenários, inclusive o "all-win") tenham o mesmo resultado financeiro** — trocando lucro máximo por previsibilidade.

## O que vou construir

Um **novo modo de cálculo** na Biblioteca de Ouro / Detalhamento da Proteção, selecionável via toggle:

```text
[ ROI Max ]  [ Equilíbrio Total ]  [ Mín. Perda ]
```

### 1. ROI Max (atual — mantido)
Comportamento atual: meta de extração fixa por perna, lucro grande se todas back vencem, prejuízo grande no cenário "tudo back".

### 2. Equilíbrio Total (novo — flat outcome)
Resolve o sistema linear onde **todos os N+1 cenários retornam o mesmo valor X**:
- Cenário 1 (lost na perna 1) = X
- Cenário 2 (won → lost) = X
- ...
- Cenário N+1 (all won) = X

Resultado: **operação 100% determinística**, mesmo resultado independente do que acontecer. X pode ser positivo (lucro garantido pequeno) ou negativo (perda controlada), dependendo das odds e comissão. É o equivalente a uma surebet sintética usando a freebet.

### 3. Mín. Perda (novo — minimax)
Maximiza o **pior cenário** (minimax). Diferente do Equilíbrio Total, permite que cenários bons fiquem acima do piso, mas garante que o pior caso seja o melhor possível. Usado quando o Equilíbrio Total dá EV muito negativo e o usuário aceita variância nos cenários bons em troca de menos perda no pior.

## UX

No modal `Detalhamento da Proteção`:

1. Adicionar **toggle de 3 opções** no topo (ROI Max / Equilíbrio / Mín. Perda).
2. Recalcular tabelas "Distribuição por Perna" e "Retorno por Cenário" ao trocar modo.
3. Mostrar badge no card de Biblioteca de Ouro indicando o modo ativo.
4. No rodapé "Impacto da Taxa de Extração", trocar `META LÍQUIDA POR PERNA` por `RESULTADO GARANTIDO` quando em modo Equilíbrio.

## Detalhes técnicos

**Arquivo principal:** `src/lib/hedge-probabilistico-engine.ts`

Adicionar dois métodos novos ao `HedgeProbabilisticoEngine`:

- `calculateBalancedMetrics(legs, freebet, commission)` — resolve sistema linear N+1 equações / N incógnitas (lay stakes) para igualar todos os cenários. Sistema é triangular: cenário "lost na perna k" depende apenas de lay₁..lay_k. Resolve iterativamente:
  1. Defina X (incógnita). 
  2. lay₁ tal que cenário "lost@1" = X.
  3. lay₂ tal que cenário "won@1, lost@2" = X (usa lay₁ já resolvido).
  4. ...
  5. lay_N tal que cenário "all-won" = X. Isto fixa X.
  
  Forma fechada: cada perna k tem `layStake_k = (X + Σ_{i<k} resp_i) / (1 - comm)` e responsabilidade `resp_k = layStake_k * (layOdd_k - 1)`. A equação final "all-won" fecha o sistema: `freebet * Π(backOdd) - Σ resp_k = X`. Resolver para X.

- `calculateMinLossMetrics(legs, freebet, commission)` — minimax via busca binária no valor do piso (ou LP simplificado), respeitando que lay_k ≥ 0.

**Arquivo UI:** `src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx`

- Adicionar `useState<'roi-max' | 'balanced' | 'min-loss'>('roi-max')` no modal de detalhamento.
- Trocar a chamada de `calculateMetrics` por um dispatcher conforme o modo.
- Toggle visual usando `Tabs` ou `ToggleGroup` do shadcn (já no projeto).

**Testes:** estender `src/lib/__tests__/hedge-probabilistico-engine.test.ts`:
- Equilíbrio: verificar que `scenarios.every(s => s.result ≈ X)`.
- Min-Loss: verificar que `min(scenarios.result)` ≥ resultado do ROI Max no pior cenário.

## Escopo protegido (não muda)
- Engine de Extração Determinística (`extracao-engine.ts`).
- Lógica de ROI Max atual e seus testes.
- Surebet engine, ledger, RPCs, banco.

## Estimativa
~120 linhas no engine + ~40 linhas no modal + 2 testes novos. Sem migrações, sem mudanças de schema.

Posso prosseguir?
