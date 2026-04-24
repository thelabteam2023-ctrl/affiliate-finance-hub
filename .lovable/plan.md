## Objetivo

Criar uma **4ª camada de leitura financeira** no `FinancialMetricsPopover` que torne explícita a diferença entre:

1. **Lucro de Performance** (mérito do operador — apostas + créditos promocionais)
2. **Lucro de Câmbio** (efeito macro fora do controle — variação cambial + ganho de confirmação)
3. **Lucro de Ajustes** (eventos administrativos — ajustes manuais − perdas operacionais)
4. **Lucro Real Ajustado** = soma dos 3 = deveria convergir com Patrimônio Líquido

> **Não há novos cálculos no backend.** Todos os campos (`performancePura`, `efeitosFinanceiros`, `ajustesExtraordinarios`, `resultadoOperacionalTotal`) já existem em `metrics`. A mudança é **puramente de UI/destaque**.

## Mudanças

### 1. `src/components/projeto-detalhe/FinancialMetricsPopover.tsx`

**1.1 — Adicionar segundo card-resumo no topo (gêmeo do "Lucro se sacar tudo")**

Logo abaixo do card "💰 Lucro se sacar tudo hoje" (linha ~926), inserir um novo card-resumo:

- **Título:** `🎯 Lucro Real Ajustado`
- **Valor:** `metrics.resultadoOperacionalTotal`
- **Subtítulo:** "Performance + Câmbio + Ajustes (decomposto abaixo)"
- **Visual:** mesmo padrão do card existente (gradiente emerald/red + borda + clique abre `LucroOperacionalCollapsible` aberto)
- **Mini-decomposição inline em 3 chips:**
  - `📊 Perf: {performancePura}` (verde se positivo)
  - `💱 FX: {efeitosFinanceiros}` (âmbar se ≠ 0)
  - `⚙️ Ajustes: {ajustesExtraordinarios}` (cinza se ≠ 0)
- **Badge de paridade no canto:** mesma lógica do existente (🟢 Convergente vs 🟡 Δ vs Patrimônio)

**1.2 — Tooltip educacional**

Atualizar o tooltip do header de "3 perspectivas" (linha ~882) para "**4 perspectivas de lucro**" e adicionar bullet do Lucro Real Ajustado:

> 🎯 **Real Ajustado:** mesma resposta do Patrimônio, mas decomposta — quanto veio de operação, quanto de câmbio, quanto de ajustes.

**1.3 — Garantir separação visual de Ajustes vs FX**

A função `efeitosFinanceiros` (linha 778) hoje é: `(ganhoFx − perdaFx) + ganhoConfirmacao + ajustesFx`

→ **Manter como está** (ajustes classificados como FX seguem em FX, ajustes administrativos seguem em `ajustesExtraordinarios`). Isso já respeita "ajustes em categoria própria" porque a UI mostra os 3 blocos segregados em `LucroOperacionalCollapsible` (linhas 263-380).

**1.4 — Reordenação visual final do popover:**

```
[Header educacional 4 perspectivas]
[💰 Card-resumo: Lucro se sacar tudo hoje]   ← já existe
[🎯 Card-resumo: Lucro Real Ajustado]         ← NOVO (gêmeo)
─────────────────────────────────
[🏦 Camada 1: Lucro em Caixa]                 ← já existe
[📐 Camada 2: Composição do Patrimônio]       ← já existe
[📊 Camada 3: Performance da Operação]        ← já existe (mantém colapsável detalhado)
[Status de Recuperação de Capital]            ← já existe
```

### 2. Documentação — `mem://finance/lucro-real-ajustado-quarta-camada.md`

Novo memory documentando o padrão das 4 camadas:

- **Camada 1 (Caixa):** `saquesRecebidos − depositosEfetivos` — pergunta: *"O que voltou pro meu bolso?"*
- **Camada 2 (Patrimônio):** `saldoCasas + saquesRecebidos − depositosEfetivos` — pergunta: *"E se eu sacasse tudo agora?"*
- **Camada 3 (Performance Pura):** `lucroApostas + bônus + cashback + giros + ajustesOp` — pergunta: *"O quanto a operação realmente performou?"*
- **Camada 4 (Real Ajustado):** `performancePura + efeitosFinanceiros + ajustesExtraordinarios` — pergunta: *"Qual o lucro real considerando câmbio e ajustes?"*

Mapear cada campo ao componente UI e estabelecer a regra: **Camada 4 deve convergir com Camada 2** (delta < 0,01). Divergências indicam saldos não realizados, FX em trânsito ou eventos recém-lançados.

### 3. Atualizar `mem://index.md`

Adicionar referência ao novo memory na seção `## Memories`:
- `[Lucro Real Ajustado 4 Camadas](mem://finance/lucro-real-ajustado-quarta-camada) — 4ª perspectiva no FinancialMetricsPopover decompondo Performance × FX × Ajustes; deve convergir com Patrimônio`

## Garantias

- ✅ **Zero novos cálculos** — apenas reuso de campos já existentes em `metrics`
- ✅ **Zero migração de banco** — view de patrimônio e operacional já consolida tudo
- ✅ **Compatibilidade total** com `useKpiBreakdowns` e `fetchProjetoExtras`
- ✅ **Respeita a regra anti-double-counting** consolidada no Extrato (bônus/cashback no `saldo_atual` via triggers)
- ✅ **Respeita memória existente** "Resultado Cambial NÃO entra no Lucro Operacional da Visão Geral" — porque esse padrão é da **Visão Geral** (KPI canônico server-side), não do popover financeiro detalhado, que sempre teve a missão de mostrar reconciliação completa
