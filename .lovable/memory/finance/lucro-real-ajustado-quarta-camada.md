---
name: lucro-real-ajustado-quarta-camada
description: 4ª perspectiva no FinancialMetricsPopover decompondo Performance × FX × Ajustes; deve convergir com Patrimônio
type: feature
---
# Lucro Real Ajustado — 4ª camada de leitura financeira

O `FinancialMetricsPopover.tsx` apresenta **4 perspectivas de lucro** dispostas em hierarquia top→bottom. A 4ª camada (Lucro Real Ajustado) decompõe explicitamente o Patrimônio em três fontes conceitualmente distintas, respondendo à pergunta crítica do operador: *"meu lucro veio de mérito ou de macroeconomia?"*

## Mapeamento canônico das 4 camadas

| # | Camada | Pergunta | Campo `metrics` | Visual |
|---|---|---|---|---|
| 1 | 🏦 **Caixa** | "O que voltou pro meu bolso?" | `fluxoCaixaLiquido` | Camada 1 |
| 2 | 💰 **Patrimônio** | "E se eu sacasse tudo agora?" | `lucroFinanceiro` | Card-resumo 1 + Camada 2 |
| 3 | 📊 **Performance Pura** | "O quanto a operação realmente performou?" | `performancePura` | Sub-bloco da Camada 3 |
| 4 | 🎯 **Real Ajustado** | "Qual o lucro real considerando câmbio e ajustes?" | `resultadoOperacionalTotal` | **Card-resumo 2** (NOVO) + Camada 3 detalhada |

## Composição da Camada 4 (Lucro Real Ajustado)

```
resultadoOperacionalTotal
  = performancePura            (📊 mérito do operador — apostas + bônus + cashback + giros + ajustes operacionais)
  + efeitosFinanceiros         (💱 FX — ganho/perda cambial + ganho de confirmação + AJUSTE_SALDO[FX])
  + ajustesExtraordinarios     (⚙️ administrativo — AJUSTE_SALDO[EXTRAORDINARIO] − perdas operacionais)
```

## Regra de convergência (obrigatória)

**Camada 4 deve convergir com Camada 2** (`|lucroFinanceiro − resultadoOperacionalTotal| < 0,01`).

Quando há divergência, o card-resumo do Lucro Real Ajustado exibe um badge `Δ {valor}` (âmbar) ao lado do número. Causas legítimas de divergência:
- Saldos ainda não realizados (em trânsito)
- FX pendente de liquidação
- Eventos recém-classificados que ainda não bateram nas views consolidadas

## Layout obrigatório do popover (top→bottom)

**Padrão atual: 2 cards de leitura imediata + accordions colapsados de auditoria.**

1. **Header educacional compacto** — 1 linha + tooltip 💡 ("2 leituras rápidas + auditoria sob demanda")
2. **Grid 2 colunas (`md:grid-cols-2`)** sempre visível:
   - **Card A** — `💰 Lucro se sacar tudo hoje` (gradiente emerald/red, ícone `PiggyBank`)
   - **Card B** — `🎯 Lucro Real Ajustado` (gradiente sky/red, ícone `Target`) com 3 chips inline (📊 Perf · 💱 FX · ⚙️ Ajustes) + badge de paridade
3. **`<Accordion type="multiple">` com 4 `AccordionItem` colapsados por padrão**:
   - 🏦 Lucro em Caixa — trigger mostra valor preview à direita
   - 📐 Composição do Patrimônio — trigger mostra `lucroFinanceiro`
   - 📊 Detalhe da Performance — trigger mostra `performancePura`
   - 🎯 Recuperação de Capital — trigger mostra `✓ Recuperado` ou `{pct}%`

## Proibido

- Adicionar quinta camada sem justificativa explícita
- Esconder o badge de paridade quando há divergência
- Misturar AJUSTE_SALDO[RECONCILIACAO_OPERACIONAL] no chip ⚙️ — ele pertence a 📊 Performance Pura
- Renomear "Lucro Real Ajustado" sem atualizar este memory
- **Abrir accordions por padrão** — o popover deve caber em uma leitura curta sem rolagem; cards no topo respondem "estou ganhando?", accordions abrem para auditar
- Reintroduzir as 3 camadas como blocos sempre expandidos (eliminado por redundância visual)

## Cross-reference

- Cálculos: `mem://finance/operational-performance-segregation-standard`
- Padrão original 3 camadas: `mem://finance/indicadores-financeiros-3-camadas-standard` (substituído por este)
- Naturezas de ajuste: `mem://finance/ajuste-saldo-natureza-classification-standard`
