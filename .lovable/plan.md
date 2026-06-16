## Diagnóstico dos KPIs atuais

Olhando o print:

1. **Títulos redundantes** — "(período)" repete a informação que já está no badge "Todo histórico / Mês atual". Polui o cabeçalho.
2. **Textos descritivos longos abaixo do valor** ("Saques − Depósitos efetivos confirmados dentro do período selecionado (data_transacao)", "Fluxo Líquido do período menos todos os custos da operação") — essa explicação técnica deveria viver em tooltip, não como subtítulo permanente. Quebra a hierarquia visual e parece "comentário de programador".
3. **Linha secundária inconsistente** — "Lucro Operacional (teórico) R$ 7.822,25" e "Custos do período −R$ 73.201,24" estão no mesmo nível visual da explicação, dificultando ler qual é dado e qual é texto.
4. **Badge "TODO HISTÓRICO"** ocupa muito espaço dentro do header do card, competindo com o título.
5. **Ícone genérico** (Wallet/TrendingUp/Coins/Percent) repetido com pouco peso visual — não ajuda a diferenciar os 4 cards rapidamente.
6. **Margem Operacional sem linha secundária** quebra a simetria do grid.
7. **Cor da label** em uppercase + tracking wide está bem, mas a fonte do valor monetário poderia ter mais peso tipográfico (tabular-nums já existe, falta hierarquia).

## Diretriz de redesign

Mais respiro, menos texto fixo, toda explicação no hover. Cada card vira: **rótulo curto → valor → 1 linha de contexto numérico** (não verbal). O badge de período some do card (já existe no filtro global no topo da página).

### Microcopy proposta

| Antes | Depois |
|---|---|
| "PATRIMÔNIO TOTAL" / "Soma consolidada (BRL) de todos os segmentos" | **"Patrimônio"** + tooltip *"Soma consolidada (BRL) de caixa, bookmakers, contas e wallets."* |
| "FLUXO LÍQUIDO (PERÍODO)" / "Saques − Depósitos efetivos confirmados…" | **"Fluxo Líquido"** + tooltip *"Saques − Depósitos efetivos no período filtrado."* Linha secundária mostra "Lucro Op. teórico · R$ 7.822" |
| "RESULTADO LÍQUIDO (PERÍODO)" / "Fluxo Líquido do período menos…" | **"Resultado Líquido"** + tooltip *"Fluxo Líquido − todos os custos (aquisição, comissões, bônus, admin, operadores)."* Linha secundária mostra "Custos · −R$ 73.201" |
| "MARGEM OPERACIONAL" / "Lucro Op. / (Lucro Op. + Custo de Sustentação)" | **"Margem Op."** + tooltip com a fórmula. Linha secundária mostra "Lucro Op. · R$ 7.822 · Custo · R$ 73.201" para não ficar vazia |

### Hierarquia visual nova de cada card

```text
┌──────────────────────────────────────┐
│ Patrimônio                    [ⓘ]   │  ← label sm + tooltip discreto
│                                       │
│ R$ 167.236,00                         │  ← valor: 2xl, tabular, tone
│                                       │
│ ─────────────────────────────────     │
│ Δ +R$ 12.430 (30d) ▲                  │  ← linha secundária só com NÚMERO,
└──────────────────────────────────────┘     ícone sutil, sem prosa
```

- Remover o badge "Todo histórico" de dentro do card (já fica no filtro de período do topo).
- Tooltip via `Info` 12px à direita do label — discreto, descobrível, não compete.
- Linha secundária sempre numérica + ícone de tendência, nunca frase descritiva.
- Valor com `font-variant-numeric: tabular-nums` (já existe) + tamanho `text-3xl` em desktop, `text-2xl` em mobile, para mais presença.
- Tone (cor) apenas no número principal e na variação; texto secundário permanece em `text-muted-foreground`.

## Mudanças concretas no código

### 1. `src/components/financeiro/HeaderKpiCard.tsx`
- Remover prop `hint` (a frase descritiva embaixo do valor) — substituir por **`tooltip?: ReactNode`** que será mostrado no `Info` icon.
- Aceitar `label: ReactNode` (já feito) e renderizar com `Info` discreto à direita.
- Remover prop `periodBadge` deste card (badge passa a viver apenas no header global da página).
- Aumentar `text-xl md:text-2xl` → `text-2xl md:text-3xl`.
- Padronizar `secondary` para um slot numérico de 1 linha com `justify-between` + ícone opcional de trend (`TrendingUp` / `TrendingDown`).

### 2. `src/pages/Financeiro.tsx` (bloco LINHA 1)
- Reescrever os 4 `HeaderKpiCard` com a microcopy nova.
- Mover `periodBadge` para fora do grid de KPIs — exibir uma única vez acima do grid, alinhado à direita, junto do filtro de período (ou remover totalmente se já existe acima).
- Patrimônio: adicionar `secondary` com variação 30d se já houver `capital_snapshots` disponível; senão, ocultar a linha secundária para esse card específico.
- Margem Operacional: adicionar `secondary` com "Lucro Op. · valor / Custo · valor" para simetria.

### 3. Tokens / estilo
- Não criar cores novas. Reaproveitar `text-emerald-600/400`, `text-red-600/400`, `text-muted-foreground`, `border-border/40`.
- Reduzir `min-h-[96px]` → `min-h-[120px]` para acomodar respiro novo sem squish.
- Aumentar `p-4` → `p-5` no card.

## Fora de escopo
- Adicionar mini-sparkline (precisaria de série temporal nova).
- Trocar fonte do projeto.
- Refatorar o badge global de período (só removemos do card).
- Mudar fórmulas / fonte de dados — apenas apresentação.

## Validação
1. Hover em cada `Info` → tooltip claro em linguagem de negócio (nunca menciona nome de coluna como `data_transacao`).
2. Cards alinhados em altura mesmo quando a linha secundária está ausente (Patrimônio sem variação).
3. Em mobile (`md` quebrado), grid vira 1 coluna sem texto secundário transbordando.
4. Sem badge "Todo histórico" duplicado dentro dos cards.

Posso aplicar?
