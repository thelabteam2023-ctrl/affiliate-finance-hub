# Redesign: Lucro × Custo · Visão Mensal + Tooltip Rico Reutilizável

## Objetivo

Elevar o gráfico mensal ao padrão dark SaaS premium do restante do Labbet (Caixa Operacional, ValueBet) e criar um componente reutilizável de tooltip rico, aplicado também ao gráfico "Análise Financeira" (fluxo multi-moeda).

Sem mudanças em backend, queries, RPCs, ou agregações. Só camada visual e de interação. `useFinanceiroMensal.ts` e fontes de dados permanecem intactos.

## Stack confirmada

O projeto usa **Recharts**, não Chart.js (`ComposedChart`, `Bar`, `Line` em `GraficoMensalDialog.tsx`). Adaptarei o padrão de tooltip para Recharts via prop `content={<ChartRichTooltip ... />}`, mantendo 100% da especificação visual.

## Escopo de arquivos

**Novos**
- `src/components/charts/ChartRichTooltip.tsx` — componente reutilizável (variantes `stackedBar` e `donut`).
- `src/components/charts/RichTooltipMiniStack.tsx` — mini barra horizontal segmentada.
- `src/components/charts/RichTooltipMiniDonut.tsx` — mini donut com total centralizado.
- `src/components/financeiro/MonthlyKpiCard.tsx` — card de KPI padronizado (variantes neutral/positive/negative/alert).

**Alterados**
- `src/components/financeiro/GraficoMensalDialog.tsx` — repaginar KPIs, paleta, eixos, grid, brush, tabela sincronizada, integrar tooltip rico.
- `src/components/caixa/FluxoFinanceiroOperacional.tsx` — aplicar `ChartRichTooltip` variant `donut` no gráfico semanal multi-moeda (sem mexer na lógica de conversão BRL/Crypto).

**Não tocar**
- `useFinanceiroMensal.ts`, `useFinanceiroCalculations.ts`, exporters (PDF/XLSX), `useCotacoes`, qualquer RPC.

## Tokens semânticos (reutilizar do design system)

Usar exclusivamente as variáveis já definidas em `src/index.css`:
- CAC → `--status-blue`
- Comissões → `--status-emerald` (mesma família de `--success`)
- Bônus → `--status-orange`
- Infra → `--status-purple`
- Operadores → `--status-cyan`
- Participações → `--chart-4` (magenta/rosa já presente) ou `--status-purple` com hue ajustado — preferir `hsl(330 78% 58%)` mapeado em token novo `--seg-particip` adicionado às duas variantes (light+dark) seguindo o padrão da seção "CAIXA REFINEMENT PALETTE".
- Resultado/Fluxo Líquido → dinâmico por sinal: `--status-emerald` (≥0) / `--status-red` (<0).
- Linha Margem % → `--status-purple` com glow.

Adicionar **apenas** o token faltante `--seg-particip` no `:root` e `.dark` para manter a regra de não-hardcode.

## Parte 1 — Cards de KPI (topo)

Substituir os 4 cards atuais por `MonthlyKpiCard`:

```text
┌─────────────────────────┐
│ RESULTADO MÉDIO/MÊS     │  ← label uppercase 10px text-muted-foreground tracking-wide
│ R$ 12.430               │  ← 22px font-semibold, cor por sinal
│ ▔▔▔▔▔▔▔▔▔               │  ← linha sutil 1px hsl(var(--border)/0.5)
│ últimos 12 meses · 12m  │  ← caption 10px
└─────────────────────────┘
```

- Borda `1px solid hsl(var(--border))` + gradiente radial sutil no topo via `background: radial-gradient(at top, hsl(var(--status-X)/0.06), transparent 60%)`.
- "Melhor mês" → variant `positive` (glow verde 0 0 24px hsl(var(--status-emerald)/0.12)).
- "Pior mês" → variant `alert` (glow vermelho equivalente, sem virar banner).
- Transição 220ms `ease-out` em troca de janela (6/12/24m): wrap em `key={janelaMeses}` + classe `animate-in fade-in-0 duration-200`.

## Parte 2 — Gráfico principal

- **Paleta** realinhada aos tokens acima; Fluxo Líquido vira `Cell` dinâmico por sinal (Recharts permite `<Cell fill={...}/>` filho do `<Bar>`).
- **Cantos**: `radius={[6,6,0,0]}` no topo da última pilha (Participações) e no Fluxo Líquido.
- **Spacing**: `barCategoryGap="22%"`, `barGap={4}`.
- **Grid**: somente horizontais, `stroke="hsl(var(--border)/0.4)"`, `strokeDasharray="0"`; remover verticais.
- **Eixo Y direito (%)**: tick menor, opacidade 0.6 e `axisLine={false}`.
- **Linha Margem %**: `strokeWidth={2}`, dasharray `5 5`, `dot={{ r: 3, strokeWidth: 0, fill: 'hsl(var(--status-purple))' }}`, com `filter: drop-shadow(0 0 4px hsl(var(--status-purple)/0.6))` via wrapper SVG.
- **Brush**: `stroke="hsl(var(--primary)/0.4)"`, `fill="hsl(var(--card))"`, `travellerWidth={8}` para tom suave consistente com tema dark.
- **Mês de referência**: já existe ponto "•" no label; adicionar `ReferenceLine` vertical com `stroke="hsl(var(--primary)/0.35)"` strokeDasharray="2 4" no mês selecionado.
- **Legend**: legenda customizada renderizada acima do chart com dots coloridos, font 11px, gap 12px (substituir `<Legend>` padrão).

## Parte 3 — ChartRichTooltip (componente reutilizável)

```text
src/components/charts/ChartRichTooltip.tsx

Props:
  title: string                       // "Janeiro 2026"
  badge?: { label: string; tone: 'positive'|'negative'|'neutral' }
  segments: Array<{
    key: string; label: string;
    value: number; color: string;     // hsl token resolvido
    formatted: string;                // "R$ 12.340"
  }>
  totalLabel?: string                 // "Custo total"
  total?: number
  footer?: ReactNode                  // ex: "Resultado Líquido R$ X"
  variant: 'stackedBar' | 'donut'
  note?: string                       // ex: "Crypto convertido pela cotação do dia"
```

Layout:
```text
┌─────────────────────────────────┐
│ Janeiro 2026        ● +26,0%    │
│ ─────────────────────────────── │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░    │  ← mini barra OU mini donut
│ ─────────────────────────────── │
│ ● CAC          ▔▔▔▔▔  R$ 1.230 │
│ ● Comissões    ▔▔▔    R$   820 │
│ ● Bônus        ▔      R$   120 │
│ ...                             │
│ ─────────────────────────────── │
│ Fluxo Líquido        R$ 14.250 │
│ Resultado Líquido    R$ 12.430 │
└─────────────────────────────────┘
```

- Fundo `hsl(var(--popover))` (#1a1e2a equivalente no dark), borda `1px solid hsl(var(--border))`, `box-shadow: 0 10px 40px hsl(0 0% 0% / 0.35)`, raio 12px, padding 14px, min-w 280px, max-w 340px.
- Entrada: `animate-in fade-in-0 zoom-in-95 duration-150`.
- Sem seta.
- Reposicionamento via Recharts (`position` calc via `coordinate`+container bounds; usar `allowEscapeViewBox={{x:true,y:true}}` no `<Tooltip>` e clamp manual no componente).
- Barra de "peso" atrás de cada valor: `<div style="width: {pct}%; background: {color}/0.18">`.
- `variant="donut"`: SVG 64×64, stroke 10, hole grande, total centralizado em 11px font-medium.
- Memo via `React.memo` e shallow comparison no `active+label`.

## Parte 4 — Sincronização gráfico ↔ tabela

- Estado `hoveredMonth: string | null` no `GraficoMensalDialog`.
- Recharts: `onMouseMove` do `<ComposedChart>` seta `e.activeLabel`.
- Tabela: `<tr data-month={m.mesKey} className={hoveredMonth === m.mesKey ? 'bg-muted/40' : ''} onMouseEnter={() => setHovered(m.mesKey)}>`.
- Recharts não suporta highlight programático nativo de barra; renderizar `<ReferenceArea>` translúcido (`fill="hsl(var(--primary)/0.06)"`) cobrindo o mês em hover quando vier da tabela.
- Transições `transition-colors duration-150`.

## Parte 5 — Tabela

- `<thead className="sticky top-0 bg-card z-10">` para sticky ao rolar 24m.
- Linha BASELINE: `italic opacity-60` (já parcial — refinar).
- Manter colunas e formatação.

## Parte 6 — Aplicação em "Análise Financeira" (FluxoFinanceiroOperacional)

- Substituir o `<Tooltip>` padrão pelo `ChartRichTooltip` com `variant="donut"`.
- Segments: Depósitos BRL, Depósitos Crypto (R$ equiv.), Saques BRL, Saques Crypto (R$ equiv.) — cores: blue/cyan/orange/red.
- `note="Valores em crypto convertidos pela cotação de cada dia"` exibido no rodapé do tooltip.
- Sem alterar a query ou lógica de conversão.

## Detalhes técnicos

- **Recharts custom tooltip**: `<Tooltip content={<ChartRichTooltip variant="stackedBar" />}/>`. Recharts injeta `active`, `payload`, `label`, `coordinate` automaticamente.
- **Cor dinâmica do Fluxo Líquido**: usar `<Bar dataKey="Fluxo Líquido">{chartData.map(d => <Cell fill={d['Fluxo Líquido']>=0 ? emerald : red}/>)}</Bar>`.
- **Performance**: tooltip memoizado; mapa `mesKey → segmentos` pré-computado em `useMemo`.
- **Responsividade**: `ChartRichTooltip` usa `max-w-[min(340px,90vw)]` e clamp horizontal via `useEffect` lendo `getBoundingClientRect` do container do chart.
- **Workspace**: nenhum endpoint novo; toda fonte já filtra por `workspace_id` via hooks existentes.

## Fora de escopo

- Refatorar `useFinanceiroMensal`, lógica de baseline, ou agregações.
- Trocar lib de gráfico (mantém Recharts).
- Adicionar novas métricas — apenas reapresentar as existentes.
- Mexer em `exportRelatorioPDF/XLSX` (seguem capturando o mesmo `chartRef`).

## Changelog (entregar ao final)

1. Cards de KPI padronizados com variantes de tom.
2. Paleta de barras realinhada a tokens semânticos; Fluxo Líquido com cor por sinal.
3. Grid/eixos/brush refinados ao tema dark.
4. Tooltip rico reutilizável (`ChartRichTooltip`) com mini-visual proporcional.
5. Sincronização bidirecional gráfico ↔ tabela via `ReferenceArea` + highlight de linha.
6. Tabela com header sticky e BASELINE refinada.
7. Aplicação do mesmo tooltip (variant donut) em "Análise Financeira".
8. Único token novo adicionado ao design system: `--seg-particip`.
