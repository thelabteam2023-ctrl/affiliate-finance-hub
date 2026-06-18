
# Unificação do Gráfico "Lucro × Custo · Visão Mensal"

## Problema

Hoje o `GraficoMensalDialog` tem 3 modos mutuamente exclusivos (`custos` / `resultado` / `fluxo`) que mostram fatias do mesmo dado. O usuário precisa alternar abas para compor a leitura. Vamos consolidar tudo em **um único gráfico** com **camadas independentes (multi-toggle)** e adicionar uma nova série de **Resultado Acumulado** como área com fill condicional verde/vermelho.

## Escopo

Arquivo único: `src/components/financeiro/GraficoMensalDialog.tsx`. Sem mudanças em hooks/data — todas as séries já vêm de `useFinanceiroMensal` (`cac`, `comissoes`, `bonus`, `infra`, `operadores`, `participacoes`, `fluxoLiquido`, `resultadoLiquido`). `Resultado Acumulado` é derivado client-side (running sum sobre a janela visível).

Sem alterações em: `useFinanceiroMensal.ts`, KPIs do topo, exports PDF/XLSX, tabela mensal, filtros de janela (6m/12m/24m) e Mês de referência.

## Mudanças

### 1. Remover o seletor de modo exclusivo
- Apagar o `PillSwitch` de modos (`Custos × Fluxo / Resultado Líquido / Fluxo Líquido`).
- Remover `type Modo`, `modo` state, `DEFAULT_VISIBLE[modo]`, e a propriedade `modos: Modo[]` em `SeriesDef`.
- Manter o `PillSwitch` de janela (`6m / 12m / 24m`) e o Switch "Mês de referência".

### 2. Camadas unificadas (multi-toggle)
Substituir o atual `Popover` de "Séries" por uma **legenda interativa horizontal** logo abaixo do header, onde cada chip é um toggle independente (checkbox visual: ativo = preenchido com a cor da série, inativo = outline opaco). Itens, na ordem:

| Camada | Tipo | Eixo | Default |
|---|---|---|---|
| CAC | Bar (stack `custos`) | Esq | on |
| Comissões | Bar (stack `custos`) | Esq | on |
| Bônus | Bar (stack `custos`) | Esq | on |
| Infra | Bar (stack `custos`) | Esq | on |
| Operadores | Bar (stack `custos`) | Esq | on |
| Participações | Bar (stack `custos`) | Esq | off |
| Fluxo Líquido | Bar (standalone, sem stackId) | Esq | on |
| Resultado Líquido | Line branca | Esq | on |
| Resultado Acumulado | Area com fill condicional | **Dir** | on |

- Persistir seleção em `localStorage` sob nova chave `grafico-mensal-layers-v1` (descartar `v2` antiga).
- Estado vazio: se 0 camadas ativas, renderizar placeholder centralizado "Nenhuma série selecionada — ative uma camada acima" no lugar do `ComposedChart`.

### 3. Remover "Margem %"
- Tirar a `Line` `Margem %` (tracejada roxa, eixo direito) do chart.
- Remover do `ALL_SERIES`, do tooltip e da legenda.
- **Manter** o KPI "Margem média" no topo (vem de `resultadoLiquido/...`, não depende do gráfico).
- O eixo direito (`yAxisId="right"`) passa a ser **exclusivo do Resultado Acumulado**, com domain automático (`['auto','auto']`) e padding.

### 4. Nova série: Resultado Acumulado (área condicional)

Cálculo no `chartData` memo:
```
let acc = 0;
data = meses.map(m => { acc += m.resultadoLiquido; return { ...m, resultadoAcumulado: acc }; });
```
Começa do primeiro mês visível da janela (a janela já é controlada por `meses` prop / `janelaMeses`).

Renderização — usar **dois `<Area>` empilhados visualmente com clipPath via SVG `<defs>`** (técnica padrão recharts para fill condicional sem corte abrupto):

```text
<defs>
  <linearGradient id="rl-acum-fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset={zeroOffset} stopColor="hsl(var(--status-emerald))" stopOpacity="0.35"/>
    <stop offset={zeroOffset} stopColor="hsl(var(--status-red))"     stopOpacity="0.35"/>
  </linearGradient>
  <linearGradient id="rl-acum-stroke" ...mesmo padrão, opacity 1, offset igual/>
</defs>
<Area yAxisId="right" dataKey="resultadoAcumulado"
      type="monotone" fill="url(#rl-acum-fill)"
      stroke="url(#rl-acum-stroke)" strokeWidth={2}
      baseValue={0} isAnimationActive={false} />
```

`zeroOffset` calculado em função do domínio do eixo direito:
```
zeroOffset = max / (max - min)  // clamp 0..1; quando min>=0 → 0; quando max<=0 → 1
```
Isso produz a transição exatamente no cruzamento de zero (interpolação SVG nativa), efeito "lake" verde acima / vermelho abaixo.

Chip da camada exibe **swatch dividido** (mini gradiente verde/vermelho) para sinalizar a natureza condicional.

### 5. Composição final do `ComposedChart`
Ordem de render (z-index):
1. `<Bar stackId="custos">` × 6 categorias (cada uma condicional ao toggle correspondente; só agrupam quando >1 ativa — `stackId` é sempre `"custos"`).
2. `<Bar dataKey="fluxoLiquido">` standalone com `Cell` verde/vermelho (já existe).
3. `<Area dataKey="resultadoAcumulado" yAxisId="right">` com gradiente condicional.
4. `<Line dataKey="resultadoLiquido">` branca (em cima de tudo).

Tooltip rico (`ChartRichTooltip`) passa a listar somente as camadas **ativas** — montar `segments` dinamicamente a partir do set de toggles.

### 6. Header reorganizado
```text
[Título]  [janela 6/12/24] [Mês ref toggle] [Export ▼]
[ chip CAC ] [ chip Comissões ] [ chip Bônus ] [ chip Infra ] [ chip Operadores ] 
[ chip Participações ] [ chip Fluxo Líquido ] [ chip Resultado Líquido ] [ chip Resultado Acumulado ]
```

Chip component (local, sem nova lib):
- ativo: `bg-[color]/15 border border-[color] text-foreground` + swatch sólido
- inativo: `bg-transparent border border-border/50 text-muted-foreground` + swatch outline
- click: toggle no Set de camadas ativas

## Detalhes técnicos

- **Estado**: `const [active, setActive] = useState<Set<LayerId>>(...)` hidratado do `localStorage`.
- **`LayerId`** = `"cac" | "comissoes" | "bonus" | "infra" | "operadores" | "participacoes" | "fluxoLiquido" | "resultadoLiquido" | "resultadoAcumulado"`.
- **Cores**: reaproveitar `COLORS` existente; tokens `--status-emerald`/`--status-red` para a área acumulada.
- **Domínio eixo direito**: `const [accMin, accMax] = useMemo(...)` sobre `chartData.resultadoAcumulado`, com padding 10% e clamp para `zeroOffset`.
- **Workspace**: nenhum query novo é introduzido; `workspace_id` continua implícito via hooks existentes (`useFinanceiroData` → token). Nada a alterar.

## Validação

1. Abrir o dialog: ver gráfico único com defaults (todas custos exceto Participações, Fluxo, Resultado Líquido e Resultado Acumulado ativos).
2. Desligar todas as barras de custo: stack some, Fluxo/Resultado/Acumulado permanecem.
3. Desligar tudo: placeholder "Nenhuma série selecionada".
4. Alternar janela 6/12/24: Resultado Acumulado recalcula sobre a janela visível.
5. Forçar período negativo: área fica vermelha abaixo de zero, verde acima, com transição exatamente no zero.
6. Reload da página: seleção de camadas persiste (localStorage).
7. KPIs do topo e tabela mensal inalterados; export PDF/XLSX continua funcionando.

## Fora de escopo
- Não tocar em `useFinanceiroMensal.ts`, fontes de dados, ou cálculos financeiros.
- Não alterar paleta global, tema, KPIs, exports ou tabela mensal.
- Não adicionar dependências.
