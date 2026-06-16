## Objetivo

Limpar visualmente os 4 KPIs do Financeiro removendo as linhas secundárias ruidosas (`Lucro Op. teórico` e `Custos`) e oferecendo, em seu lugar, **detalhamentos sob demanda** acessíveis por clique no próprio card. Manter a estética minimalista atual sem adicionar peso visual.

## Diretrizes de design

- O card continua sendo uma "foto" simples: label + valor + tone.
- Affordance discreta: rodapé com link textual `Ver detalhamento →` em `text-[11px] text-muted-foreground hover:text-foreground`, alinhado à direita. Sem ícone novo, sem botão sólido.
- Clique no link (ou em qualquer ponto do card) abre um `Dialog` (shadcn) com a comparação/breakdown.
- Cards sem detalhamento (Patrimônio, Margem Operacional) continuam estáticos — sem affordance.
- Remover toda referência ao termo abreviado "Lucro Op. teórico" → usar "Lucro Operacional Teórico" por extenso em qualquer lugar visível.

## Mudanças funcionais

### 1. `src/components/financeiro/HeaderKpiCard.tsx`
- Adicionar prop opcional `onDetailClick?: () => void`.
- Quando presente, renderizar um rodapé `<button>` discreto com o texto `Ver detalhamento →` (sem alterar `min-h`, encaixado abaixo da divisória já existente).
- Quando ausente, o slot fica vazio (compatível com cards estáticos).
- Hover do card inteiro fica clicável (cursor-pointer) só quando `onDetailClick` existe.

### 2. Novo componente `src/components/financeiro/FluxoLiquidoDetalheDialog.tsx`
Dialog que compara, lado a lado em duas colunas:

| Coluna esquerda — "Caixa Real" | Coluna direita — "Resultado Teórico" |
| ------------------------------ | ------------------------------------ |
| **Fluxo Líquido** (valor)      | **Lucro Operacional Teórico** (valor)|
| Caixa que de fato saiu dos projetos | Lucro contábil das apostas liquidadas |

Abaixo, bloco curto: **Diferença = Lucro Teórico − Fluxo Líquido**, com leitura explicativa:
- Se positivo: "Há R$ X já produzidos pela operação que ainda não foram realizados em caixa. Esse valor está represado em saldos de bookmakers, parceiros e wallets."
- Se negativo/zero: "Você já realizou em caixa todo o lucro teórico do período (e mais)."

Props: `open`, `onOpenChange`, `fluxoLiquido`, `lucroOperacionalTeorico`, `formatCurrency`, `periodLabel`.

### 3. Novo componente `src/components/financeiro/CustosDetalheDialog.tsx`
Dialog que reaproveita a quebra de categorias **já calculada** em `calc.costs` (passada hoje para `ComposicaoCustosCard`).

Layout:
- Header com total: `Custos do período · R$ XXX`.
- Lista compacta (uma linha por categoria): Operadores · Comissões · Bônus · Infra · Aquisição, cada uma com valor + barra fina de proporção (`bg-muted` + fill `bg-primary/70`).
- Rodapé pequeno: link `Ver detalhamento completo` que rola/foca o `ComposicaoCustosCard` já existente na parte inferior (via `scrollIntoView` + outline temporário).

Props: `open`, `onOpenChange`, `totalCustos`, `categorias` (extraídas de `calc.costs.*` — usar a mesma forma que `ComposicaoCustosCard` consome).

### 4. `src/pages/Financeiro.tsx`
- Adicionar dois estados locais: `fluxoDetalheOpen`, `custosDetalheOpen`.
- Remover as `SecondaryRow` de Fluxo Líquido e Resultado Líquido.
- Passar `onDetailClick={() => setFluxoDetalheOpen(true)}` no card de Fluxo Líquido.
- Passar `onDetailClick={() => setCustosDetalheOpen(true)}` no card de Resultado Líquido.
- Montar os dois `Dialog`s no fim do bloco (irmãos do grid).
- A `SecondaryRow` interna ao IIFE pode ser removida (não tem mais uso) — fica o `cn` import.

### 5. Limpeza textual
- Procurar e ajustar quaisquer rótulos `"Lucro Op."` / `"Lucro Op. teórico"` ainda visíveis (grep no `src/pages/Financeiro.tsx` e em `src/components/financeiro/`). Substituir por `"Lucro Operacional"` ou `"Lucro Operacional Teórico"` quando o termo aparecer em UI.

## O que NÃO muda

- Fórmulas, hooks, RPCs, threshold de cor, layout do grid (4 colunas).
- O `ComposicaoCustosCard` na parte inferior continua sendo a visão "longa" — o dialog é o atalho rápido.
- Card de Patrimônio e Margem Operacional permanecem sem detalhamento (não há comparação útil a fazer).

## Validação

- `bunx vitest run` (sem novos testes — UI puramente apresentacional).
- Conferir manualmente:
  - Card Fluxo Líquido: hover muda cursor, clique abre dialog com 2 colunas.
  - Card Resultado Líquido: clique abre breakdown de custos.
  - Cards Patrimônio / Margem: continuam sem affordance.

## Fora de escopo

- Refatorar `ComposicaoCustosCard` (continua sendo a fonte rica).
- Adicionar gráficos novos.
- Modificar a barra de período ou o badge global.
