
## Contexto

Hoje o dialog **Lucro × Custo · Visão Mensal** tem dois modos via `ToggleGroup`:

- `Custos × Fluxo` — barras de custo + linha de Fluxo Líquido + Resultado Líquido + Margem %
- `Lucro Op.` — linha de "Lucro Operacional teórico" (soma de `lucro_prejuizo` por mês)

Problemas identificados pelo usuário:
1. A métrica **Lucro Operacional teórico** não é útil — não bate com a canônica e gera confusão.
2. Os botões `ToggleGroup` estão visualmente datados. O usuário quer o padrão **pill button** usado em Parceiros (`TODAS / BRL / REGULAMENTADA / NÃO REGULAMENTADA`), onde o ativo fica preenchido em verde sólido.

## Objetivo

Refatorar a barra de modos do `GraficoMensalDialog` em **dois eixos**:

- **A) Reformular o conjunto de modos** para focar nas métricas que o usuário realmente acompanha.
- **B) Adotar o padrão visual "pill" de Parceiros** para esses botões.

---

## A) Novos modos do gráfico

Substituir os 2 modos atuais por **3 modos** alinhados ao que o usuário pediu:

| Modo (id) | Label | Conteúdo do gráfico |
|---|---|---|
| `custos` | **Custos × Fluxo** | Mantido: barras de custos + linha de Fluxo Líquido + Resultado Líquido + Margem % (linha tracejada eixo direito) |
| `resultado` | **Resultado Líquido** | Foco em `resultadoLiquido` (= Fluxo Líquido − Custo Total): linha sólida principal + barra leve de Custo Total para contexto + linha pontilhada de Margem % no eixo direito |
| `fluxo` | **Fluxo Líquido** | Foco em `fluxoLiquido` (Saques − Depósitos, padrão Lucro Real): linha sólida principal + área sombreada acumulada opcional |

**Remover** completamente o modo `lucro` (Lucro Operacional teórico) e suas séries (`Lucro Operacional`, `Acumulado`). Limpar:

- Entradas em `ALL_SERIES` com `modos: ["lucro"]`.
- Branch `if (modo === "lucro")` na renderização do `LineChart`.
- Defaults em `DEFAULT_VISIBLE.lucro`.
- Cores `lucroOp` / `lucroAcum` no objeto `COLORS` (se não usadas em outro lugar).
- Texto "Lucro Operacional" do label do Popover de séries.

**KPIs do topo (4 cards):** continuam baseados em `resultadoLiquido` (Resultado médio/mês, Melhor mês, Pior mês, Margem média). Já são corretos para os 3 modos.

## B) Estilo "pill" dos botões (padrão Parceiros)

Referência visual (imagem 2): grupo de pills compactos, fundo `bg-muted`, item ativo em verde sólido com texto branco, item inativo transparente com texto `muted-foreground`, hover sutil.

Trocar `ToggleGroup` por um componente local **`PillSwitch`** (sem nova lib) reutilizando `Button`:

```tsx
// padrão: bg-muted/40 p-1 rounded-lg flex gap-1
// item ativo:   bg-primary text-primary-foreground shadow-sm
// item inativo: text-muted-foreground hover:bg-muted hover:text-foreground
```

Aplicar o `PillSwitch` em **dois lugares** do header do dialog:

1. **Seletor de modo** (3 pills): `Custos × Fluxo` · `Resultado Líquido` · `Fluxo Líquido`
2. **Seletor de janela** (3 pills): `6m` · `12m` · `24m`

> Não alterar o toggle do "Mês de referência" (Switch faz sentido para boolean).

## Arquivos afetados

- `src/components/financeiro/GraficoMensalDialog.tsx` — único arquivo tocado.
  - Atualiza `type Modo = "custos" | "resultado" | "fluxo"`.
  - Atualiza `ALL_SERIES`, `DEFAULT_VISIBLE`, `chartData`, blocos de render do chart.
  - Adiciona componente local `PillSwitch` substituindo os 2 `ToggleGroup`.

## Fora de escopo

- Não mexer em `useFinanceiroMensal.ts` (os campos `resultadoLiquido` e `fluxoLiquido` já existem).
- Não mexer em outros dashboards/cards do Financeiro.
- Não introduzir nova dependência.
- Sem alteração de cores globais de design tokens.

## Validação

- Abrir o dialog, alternar os 3 pills, confirmar render correto + tooltip rica funcionando.
- Alternar `6m / 12m / 24m` no novo estilo.
- Conferir tabela mensal abaixo do gráfico (não muda).
- Conferir export PDF/XLSX (não muda — usa `meses` direto).

Posso aplicar?
