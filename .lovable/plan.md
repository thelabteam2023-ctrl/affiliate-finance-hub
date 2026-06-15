# Plano: Clareza do Período nos Indicadores do Financeiro

## Problema
O filtro global ("Mês Anterior", "Mês Atual", "Ano", "Tudo", "Personalizado") fica no topo da página, mas dentro de cards como **Composição de Custos**, **Exposição & Perdas**, **Posição de Capital** e os **KPIs do header**, não há indicação de qual janela temporal está sendo exibida. O usuário precisa rolar de volta e inferir mentalmente — e em métricas de "estoque" (Patrimônio, Posição de Capital) o período sequer se aplica.

## Princípios
1. Cada card deve declarar **explicitamente** sua janela temporal (rótulo + datas resolvidas).
2. Distinguir visualmente métricas de **fluxo** (sensíveis ao período) das de **estoque/saldo atual** (snapshot "agora").
3. Reutilizar o componente já aprovado no Caixa Operacional sempre que possível, sem reescrever lógica de cálculo.

## Etapas

### 1. Utilitário central de rótulo de período
Em `src/types/dashboardFilters.ts`, adicionar `getDashboardPeriodDescription(filter, customRange)` que devolve:
- `label` curto: "Mês Atual", "Mês Anterior", "Ano de 2026", "Tudo", "01/06 – 15/06/2026"
- `rangeLabel` formatado: "01/06/2026 → 15/06/2026" (ou "Sem limite" para `tudo`)
- `scope`: `"periodo" | "atual"` (para diferenciar fluxo de estoque)

### 2. Novo componente `PeriodScopeBadge`
`src/components/financeiro/PeriodScopeBadge.tsx` — badge compacto reutilizável:
- Pílula no canto direito do header do card, ex.: `📅 Mês Atual · 01–15/06/2026`
- Tooltip com a descrição completa ("Janela: 01/06/2026 a 15/06/2026 — alterada pelo filtro do topo")
- Variante `scope="atual"` para cards de saldo: `🕒 Posição atual` (sem datas, com tooltip "Saldo em tempo real, não afetado pelo filtro de período")

### 3. Aplicação card a card (`src/pages/Financeiro.tsx`)
| Card | Tipo | Badge |
|---|---|---|
| Patrimônio Total | estoque | "Posição atual" |
| Lucro Operacional | fluxo | período ativo |
| Margem Operacional | fluxo | período ativo |
| Posição de Capital (donut) | estoque + sobreposição | "Posição atual" + nota "Capital em disputa: tempo real" |
| Exposição & Perdas | misto | "Posição atual" para "Em Disputa" e "Saldo Irrecuperável"; "Período ativo" na seção "Perdas Confirmadas" |
| Composição de Custos | fluxo | período ativo + comparativo "vs período anterior equivalente" no subtítulo |

### 4. Banner contextual no topo da Visão Financeira
Logo abaixo do `DashboardPeriodFilterBar`, adicionar uma linha discreta:
> *"Exibindo dados de **Mês Atual** · 01/06/2026 → 15/06/2026. Cards de saldo (Patrimônio, Posição de Capital, Em Disputa) sempre refletem a posição atual."*

Isso resolve a ambiguidade global e evita repetição visual excessiva nos cards.

### 5. Ajustes pontuais nos sub-componentes
- `ComposicaoCustosCard`: trocar o atual subtítulo genérico por `<PeriodScopeBadge>` + texto "comparado a <período anterior equivalente>".
- `ExposicaoFinanceiraCard`: cada uma das 3 seções internas ganha um mini-rótulo ("Posição atual" / "No período" / "Posição atual").
- `HeaderKpiCard`: aceitar prop opcional `periodBadge?: ReactNode` renderizada ao lado do `hint`.

## Detalhes técnicos
- Sem mudanças em hooks de dados ou RPCs — apenas camada de apresentação.
- `getDashboardPeriodDescription` formata datas com `date-fns/format` (`dd/MM/yyyy`, pt-BR).
- `PeriodScopeBadge` usa shadcn `Badge` + `Tooltip`, paleta `bg-muted/40 text-muted-foreground`.
- Nenhum card de estoque deve consumir `dataInicio/dataFim` indevidamente; auditar props passadas.

## Fora de escopo
- Trocar a semântica dos KPIs (já feito em etapa anterior).
- Alterar cálculos de "período anterior" da Composição de Custos.
- Mudar o filtro global em si.

## Resultado esperado
Em qualquer card, o usuário lê em <2s qual janela temporal está sendo aplicada e entende quando uma métrica é "agora" versus "no período selecionado".
