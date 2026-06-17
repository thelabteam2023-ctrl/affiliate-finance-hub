# Redesign do Gráfico "Lucro × Custo · Visão Mensal" — Fase 2

Três melhorias coordenadas em `src/components/financeiro/GraficoMensalDialog.tsx`:

## 1. Legenda explícita (resolve "o que é cada item / o que é o tracejado")

Adicionar um bloco de legenda customizado **logo abaixo do header do gráfico**, substituindo a `<Legend />` padrão do Recharts (que hoje não diferencia visualmente linha sólida vs. tracejada nem explica a semântica das cores).

Cada item: `swatch` (quadrado/linha mini) + nome + tooltip de ajuda (`?` discreto).

```text
┌─ Legenda ────────────────────────────────────────────────────────┐
│ ▪ CAC  ▪ Comissões  ▪ Bônus  ▪ Infra  ▪ Operadores  ▪ Particip. │
│ ▬ Fluxo Líquido (Saques−Depósitos)   ┄ Margem % (eixo direito)  │
└──────────────────────────────────────────────────────────────────┘
```

- Barras empilhadas (custos) → swatch quadrado 10px com cor do token.
- Fluxo Líquido → swatch barra sólida (cor dinâmica = neutra na legenda, com nota "verde se ≥0, vermelho se <0").
- Margem % → swatch linha **tracejada** explícita (`border-dashed`) + label "(eixo direito, %)".
- Lucro Operacional (novo, ver §2) → swatch linha sólida emerald.

## 2. Novo gráfico "Lucro Operacional" (toggle de visualização)

Adicionar **toggle de modo** no header do dialog, com 2 visões nas mesmas posições do canvas:

| Modo | O que mostra |
|---|---|
| **Custos × Fluxo** (atual) | Barras empilhadas de custos + Fluxo Líquido + Margem % |
| **Lucro Operacional** (novo) | Linha de `lucroOperacional` acumulado/mensal + linha de `resultadoLiquido` + área sutil de referência |

Dados já existem em `useFinanceiroMensal` (`lucroOperacional`, `resultadoLiquido`) — **zero mudança no hook**.

UI do toggle: `ToggleGroup` shadcn (2 botões), canto superior direito do header do gráfico.

```text
┌─ Lucro × Custo · Visão Mensal ──────────[Custos×Fluxo|Lucro Op.]┐
```

Modo "Lucro Operacional":
- Linha sólida emerald: **Lucro Operacional Mensal** (`lucroOperacional`)
- Linha sólida cyan: **Resultado Líquido** (`resultadoLiquido = fluxoLiquido − custoTotal`)
- Linha tracejada cinza opcional: **Acumulado no período** (soma running de `lucroOperacional`) — controlável via §3
- `ReferenceLine y={0}` para destacar break-even
- Tooltip rico usa `ChartRichTooltip` já existente (variante nova: `lines`)

## 3. Seletor de séries (densidade configurável)

Pequeno botão `⚙ Séries` no header abre `Popover` com checkboxes:

```text
Custos:        ☑ CAC  ☑ Comissões  ☑ Bônus  ☑ Infra  ☑ Operadores  ☑ Participações
Indicadores:   ☑ Fluxo Líquido   ☑ Margem %
Lucro:         ☑ Lucro Operacional   ☑ Resultado Líquido   ☐ Acumulado
```

Estado persistido em `localStorage` por modo (`labbet:grafico-mensal:visible-series:v1`).

Defaults:
- Custos×Fluxo: tudo ON exceto nada novo.
- Lucro Op.: Lucro Op. + Resultado Líquido ON; Acumulado OFF.

Render condicional dos `<Bar>` / `<Line>` com base no set ativo. Legenda (§1) também filtra para mostrar apenas séries visíveis.

## Detalhes técnicos

**Arquivo único:** `src/components/financeiro/GraficoMensalDialog.tsx`

- Novo estado: `const [modo, setModo] = useState<'custos'|'lucro'>('custos')` + `const [visibleSeries, setVisibleSeries] = useState<Set<string>>(...)` (carrega de localStorage).
- Extrair `<ChartLegendCustom items={...} />` inline (componente local, ~40 linhas).
- Extrair `<SeriesPickerPopover />` local usando `Popover` + `Checkbox` shadcn.
- `ChartRichTooltip` atual já cobre stacked; para o modo Lucro, passar `variant="lines"` (adicionar branch simples no componente — alternativa: usar o mesmo `stackedBar` já funciona ok com linhas, então **sem mudança no tooltip**).
- Cores via tokens já presentes em `index.css` (`--status-blue`, `--status-emerald`, `--status-amber`, `--seg-particip`, `--status-rose`).
- Acumulado: pré-computar em `useMemo` adicionando `lucroOperacionalAcumulado` aos dados do chart.

## Fora de escopo

- Mudanças no hook `useFinanceiroMensal` (dados suficientes).
- Mudança no tooltip rico (`ChartRichTooltip`).
- Outras telas / análise semanal.

## Validação

1. Abrir dialog → legenda visível, tracejado da Margem % explícito.
2. Trocar modo → linhas de lucro renderizam, eixos ajustam, tooltip continua funcional.
3. Desmarcar séries → barras/linhas somem, legenda acompanha, recarregar página mantém preferência.
